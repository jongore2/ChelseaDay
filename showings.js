// The parser intentionally retains only dates, times and appointment status.
const months={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
function validDate(value){const d=new Date(value+'T00:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==value)throw Error('The report contains an invalid date.');return value;}
function reportDate(value){const m=value.match(/^(\w{3}) (\d{1,2}), (\d{4})$/);if(!m||!months[m[1]])throw Error('Report period could not be read.');return validDate(`${m[3]}-${months[m[1]]}-${m[2].padStart(2,'0')}`);}
function clock(value){const m=value.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);if(!m||+m[1]<1||+m[1]>12||+m[2]>59)throw Error('Appointment time could not be read.');return `${String(+m[1]%12+(m[3]==='PM'?12:0)).padStart(2,'0')}:${m[2]}`;}
export function parseShowingReport(raw){
 const source=raw.replace(/\s+/g,' ').trim();
 const marker=source.indexOf('Listing Activity Details');
 const header=source.slice(0,source.indexOf('Feedback')<0?marker:source.indexOf('Feedback'));
 if(!/7015 Chelsea Day (?:Lane|Ln)\b/i.test(header)||!header.includes('4372291'))throw Error('Choose the Listing Activity Report for Chelsea Day (listing 4372291).');
 const period=header.match(/Snapshot for (\w{3} \d{1,2}, \d{4})\s*[-–]\s*(\w{3} \d{1,2}, \d{4})/);
 const total=header.match(/Total number of appointments:\s*(\d+)/i);
 if(marker<0||!period||!total)throw Error('This PDF needs the Snapshot and Listing Activity Details sections. Request the complete text-based report.');
 const from=reportDate(period[1]),through=reportDate(period[2]);
 if(from>through)throw Error('The report date range is invalid.');
 const details=source.slice(marker+'Listing Activity Details'.length);
 const pattern=/(Past|Canceled|Cancelled|Confirmed|Upcoming|Requested|Unconfirmed)\s+(2nd\s+)?Showing\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}:\d{2}\s+[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s+[AP]M)/g;
 const appointments=[];
 for(const m of details.matchAll(pattern)){
   const date=validDate(`${m[5]}-${m[3]}-${m[4]}`),start=clock(m[6]),end=clock(m[7]);
   const status=m[1]==='Past'?'Completed':/^Cancel/.test(m[1])?'Canceled':['Requested','Unconfirmed'].includes(m[1])?'Requested':'Scheduled';
   if(date<from||(status==='Completed'&&date>through)||end<=start)throw Error('An appointment falls outside the report period or has an unsupported time range.');
   appointments.push({date,start,end,status});
 }
 // Never silently accept an unsupported or unreadable showing row.
 const rowCount=(details.match(/\bShowing\s+\d{2}\/\d{2}\/\d{4}/g)||[]).length;
 if(rowCount!==appointments.length)throw Error('Some showing rows could not be read. Request the standard Listing Activity Report.');
 if(new Set(appointments.map(a=>`${a.date}/${a.start}/${a.end}`)).size!==appointments.length)throw Error('Duplicate appointment times found. Review the source report before importing.');
 const reportedTotal=Number(total[1]);
 if(appointments.filter(a=>a.status!=='Canceled').length!==reportedTotal)throw Error('The extracted appointments do not match the report total. Nothing was imported; request a complete report.');
 return {from,through,reportedTotal,appointments:appointments.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))};
}
export function showingSummary(report,priceHistory,day){
 const prices=[...priceHistory].sort((a,b)=>a.date.localeCompare(b.date));
 const latest=prices.filter((p,i)=>i>0&&p.price!==prices[i-1].price&&p.date<=day).at(-1)?.date||null;
 if(!report)return {completed:null,since:null,latest,upcoming:[]};
 const completed=report.appointments.filter(a=>a.status==='Completed');
 return {completed:completed.length,latest,since:latest&&latest>=report.from&&latest<=report.through?completed.filter(a=>a.date>=latest).length:null,upcoming:report.appointments.filter(a=>a.status==='Scheduled'&&a.date>=day).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))};
}
