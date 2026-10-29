export function kstDay(time:string|Date=new Date()) {
 const date=new Date(time);
 if(!Number.isFinite(date.valueOf()))throw new Error('Invalid notification date.');
 return new Date(date.valueOf()+9*3600000).toISOString().slice(0,10);
}
