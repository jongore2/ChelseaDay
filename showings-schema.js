import {z} from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;});
const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const showingReportSchema=z.object({
 from:date,through:date,reportedTotal:z.number().int().min(0).max(300),
 appointments:z.array(z.object({date,start:time,end:time,status:z.enum(['Completed','Canceled','Scheduled','Requested'])}).strict()).max(300)
}).strict().refine(r=>r.from<=r.through&&r.appointments.every(a=>a.date>=r.from&&a.end>a.start&&(a.status!=='Completed'||a.date<=r.through))&&r.appointments.filter(a=>a.status!=='Canceled').length===r.reportedTotal&&new Set(r.appointments.map(a=>a.date+'/'+a.start+'/'+a.end)).size===r.appointments.length,'Invalid report coverage, total or duplicate appointments');
