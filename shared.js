export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const daysOnMarket = (start, end=today()) => Math.max(0,Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000));
export const nextCheckpoint = items => [...items].filter(x=>x.status!=='Complete'&&x.date).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))[0] || null;
export const priceSummary = data => {const original=[...data.priceHistory].sort((a,b)=>a.date.localeCompare(b.date))[0]?.price;return original ? {reduction:original-data.property.current_list_price,percent:(original-data.property.current_list_price)/original*100}:null;};
