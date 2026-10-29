// Server-side connector example. Never expose MOONS_PROJECT_TOKEN in browser code.
export async function sendProjectEvent(event, {baseUrl=process.env.MOONS_URL, token=process.env.MOONS_PROJECT_TOKEN}={}) {
  if (!baseUrl || !token) throw new Error('Set MOONS_URL and MOONS_PROJECT_TOKEN');
  const endpoint=new URL('/api/project-events',baseUrl);
  if(endpoint.protocol!=='https:' && !['localhost','127.0.0.1'].includes(endpoint.hostname)) throw new Error('Use HTTPS');
  const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(event)});
  if(!response.ok) throw new Error(`MOONS event rejected (${response.status})`);
  return response.json();
}

// One event per completed request. Reuse id when retrying; MOONS deduplicates it.
// await sendProjectEvent({id: requestId, kind:'cost', name:'LLM request', value:0.0012,
//   unit:'USD', at:new Date().toISOString(), source:'my-app/openai', basis:'estimated', aggregation:'sum'});
// A provider's cumulative invoice/billing snapshot must use aggregation:'latest'.
