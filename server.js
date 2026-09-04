import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import seed from './seed.js';
import {today} from './shared.js';
import {showingReportSchema} from './showings-schema.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const production=process.env.NODE_ENV==='production';
const {VIEWER_PASSWORD,ADMIN_PASSWORD,SESSION_SECRET}=process.env;
const configurationErrors = [];
for (const [name, value, minimum] of [
  ['VIEWER_PASSWORD', VIEWER_PASSWORD, 16],
  ['ADMIN_PASSWORD', ADMIN_PASSWORD, 16],
  ['SESSION_SECRET', SESSION_SECRET, 32],
]) {
  if (!value) configurationErrors.push(name + ' is missing or empty');
  else if (value.length < minimum) configurationErrors.push(name + ' is too short (minimum ' + minimum + ' characters)');
}
if (VIEWER_PASSWORD && ADMIN_PASSWORD && VIEWER_PASSWORD === ADMIN_PASSWORD) {
  configurationErrors.push('VIEWER_PASSWORD and ADMIN_PASSWORD are identical; use different passwords');
}
if (configurationErrors.length) throw Error('Environment configuration: ' + configurationErrors.join('; ') + '. Update these values in this Render service Environment settings and save/deploy.');
if(production&&!process.env.APP_ORIGIN?.startsWith('https://')) throw Error('Production requires an HTTPS APP_ORIGIN.');
const dir=path.resolve(process.env.DATA_DIR||'./data'); fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'dashboard.json');
function persist(value){const temp=file+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
if(!fs.existsSync(file)) persist(seed);
let data=JSON.parse(fs.readFileSync(file,'utf8'));
if((data.data_version||1)<2){
 const additions=seed.checkpoints.filter(item=>item.id.startsWith('conditional-')&&!data.checkpoints.some(existing=>existing.id===item.id));
 data={...data,data_version:2,checkpoints:[...data.checkpoints,...additions]};
 persist(data);
}
const app=express();app.set('trust proxy',1);app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'64kb'}));
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const sign=s=>createHmac('sha256',SESSION_SECRET).update(s).digest('base64url');
const equal=(a,b)=>{const x=Buffer.from(sign(a)),y=Buffer.from(sign(b));return timingSafeEqual(x,y);};
const revoked=new Map();
setInterval(()=>{for(const [key,expiry] of revoked) if(expiry<Date.now()) revoked.delete(key);},60000).unref();
function session(req){try{const token=req.headers.cookie?.split('; ').find(s=>s.startsWith('chelsea_session='))?.slice(16);if(!token||revoked.has(token))return null;const [body,sig]=token.split('.');if(!sig||!equal(sig,sign(body)))return null;const s=JSON.parse(Buffer.from(body,'base64url'));return s.exp>Date.now()&&['viewer','admin'].includes(s.role)?{...s,token}:null;}catch{return null;}}
const cookie=(value,maxAge)=>`chelsea_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${production?'; Secure':''}`;
app.use('/api',(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.headers.origin;const expected=process.env.APP_ORIGIN||'http://localhost:3000';if(origin!==expected)return res.status(403).json({error:'Request origin is not permitted.'});}next();});
app.post('/api/login',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many attempts. Please try again in 15 minutes.'}}),(req,res)=>{const {role,password}=req.body||{};if(!['viewer','admin'].includes(role)||typeof password!=='string'||!equal(password,role==='admin'?ADMIN_PASSWORD:VIEWER_PASSWORD))return res.status(401).json({error:'The password is incorrect.'});const s={role,exp:Date.now()+8*3600000,nonce:randomBytes(24).toString('hex')};const body=Buffer.from(JSON.stringify(s)).toString('base64url');res.setHeader('Set-Cookie',cookie(body+'.'+sign(body),28800));res.json({role});});
app.get('/api/session',(req,res)=>{const s=session(req);res.json({role:s?.role||null});});
app.post('/api/logout',(req,res)=>{const s=session(req);if(s)revoked.set(s.token,s.exp);res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true});});
app.use('/api',(req,res,next)=>{req.session=session(req);if(!req.session)return res.status(401).json({error:'Please sign in again.'});next();});
app.get('/api/dashboard',(_req,res)=>res.json({data,revision:sign(JSON.stringify(data))}));
app.use('/api',(req,res,next)=>req.session.role==='admin'?next():res.status(403).json({error:'Administrator access required.'}));
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;});
const text=z.string().trim().min(1).max(2000);const money=z.number().int().positive().max(100000000);
const schema=z.object({data_version:z.literal(2),showingReport:showingReportSchema.nullable().optional(),property:z.object({address:z.literal(seed.property.address),original_list_date:z.literal('2026-05-02'),current_list_price:money,listing_status:z.enum(['Active','Under Contract','Pending','Closed','Temporarily Off Market']),last_reviewed:date,current_objective:text,current_action:text}).strict(),priceHistory:z.array(z.object({id:text,date,event_type:text,price:money}).strict()).min(1).max(200),checkpoints:z.array(z.object({id:text,date:date.nullable(),title:text,description:text,status:z.enum(['Upcoming','Complete']),outcome:z.string().max(2000)}).strict()).max(200)}).strict().refine(d=>[d.priceHistory,d.checkpoints].every(rows=>new Set(rows.map(r=>r.id)).size===rows.length),'Duplicate record IDs');
app.put('/api/dashboard',(req,res)=>{if(req.body.revision!==sign(JSON.stringify(data)))return res.status(409).json({error:'Another update was saved. Reload the page before editing again.'});const parsed=schema.safeParse(req.body.data);if(!parsed.success)return res.status(400).json({error:'Check all fields: valid dates, positive whole-dollar prices, and required text are needed.'});persist(parsed.data);data=parsed.data;res.json({data,revision:sign(JSON.stringify(data))});});
app.post('/api/review',(_req,res)=>{const updated={...data,property:{...data.property,last_reviewed:today()}};persist(updated);data=updated;res.json({data,revision:sign(JSON.stringify(data))});});
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found.'}));
app.get('/health',(_req,res)=>res.json({ok:true}));
app.use(express.static(path.join(root,'dist')));app.get(['/', '/admin'],(_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
app.use((err,_req,res,_next)=>{console.error(err.message);res.status(500).json({error:'Unable to save or load the dashboard. Please try again.'});});
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Chelsea Day ready on port ${process.env.PORT||3000}`));
