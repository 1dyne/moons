// Scheduled Deployment: node scripts/run-daily.mjs
// Schedule 0 0 * * * in UTC = 09:00 Asia/Seoul.
const args=process.argv.slice(2);
const production='https://moons-1dyne.replit.app';
const supplied=args.includes('--url')?args[args.indexOf('--url')+1]:production;
const url=new URL('/api/cron/daily',supplied);
const development=args.includes('--allow-development')&&['127.0.0.1','localhost'].includes(url.hostname);
if(url.username||url.password||url.origin!==production&&!development)throw new Error('Only the verified production origin or explicit local testing is allowed.');
if(!process.env.ADMIN_TOKEN)throw new Error('ADMIN_TOKEN is required.');
const response=await fetch(url,{method:'POST',redirect:'error',headers:{'x-admin-token':process.env.ADMIN_TOKEN},signal:AbortSignal.timeout(600000)});
if(!response.ok)throw new Error(`Daily run failed with HTTP ${response.status}; no credential values are logged.`);
console.log(JSON.stringify({job:'moons-daily',target:development?'workspace-api':'production-api',ranAt:new Date().toISOString(),...await response.json()}));
