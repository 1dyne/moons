import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {parseHTML} from 'linkedom';
import {Readability} from '@mozilla/readability';
import {WorkspaceError} from './types.ts';

export function publicAddress(ip:string):boolean {
 const address=ip.toLowerCase();
 if(address.includes(':')) {
  if(address.startsWith('::ffff:'))return publicAddress(address.slice(7));
  // Globally routable unicast only; rejects loopback, private, link-local and multicast.
  return /^[23][0-9a-f]{3}:/.test(address)&&!address.startsWith('2001:db8:');
 }
 const [a,b]=address.split('.').map(Number);
 return isIP(address)===4 && a!==0 && a!==10 && a!==127 && !(a===169&&b===254) && !(a===172&&b>=16&&b<=31) && !(a===192&&(b===168||b===0||b===2)) && !(a===100&&b>=64&&b<=127) && !(a===198&&(b===18||b===19||b===51)) && !(a===203&&b===0) && a<224;
}
export async function extractUrl(input:string) {
 let url:URL;
 try{url=new URL(input)}catch{throw new WorkspaceError(400,'Enter a valid article URL.')}
 for(let redirect=0;redirect<4;redirect++){
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port)))throw new WorkspaceError(400,'Only public HTTP(S) article URLs are supported.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const ips=await lookup(host,{all:true});
  if(!ips.length||ips.some(v=>!publicAddress(v.address)))throw new WorkspaceError(400,'Private or reserved network addresses cannot be fetched.');
  const pinned=ips[0]!;
  const response=await new Promise<{html:string;redirect?:string}>((resolve,reject)=>{
   const request=url.protocol==='https:'?httpsRequest:httpRequest;
   const req=request(url,{headers:{'User-Agent':'MOONS-Article/1.0',Accept:'text/html'},lookup:(_name,_options,callback)=>callback(null,pinned.address,pinned.family),timeout:10000},res=>{
    if([301,302,303,307,308].includes(res.statusCode??0)&&res.headers.location){res.resume();resolve({html:'',redirect:res.headers.location});return}
    if(res.statusCode!==200||!res.headers['content-type']?.includes('text/html')){res.resume();reject(new WorkspaceError(422,'This URL did not return an accessible HTML article.'));return}
    const chunks:Buffer[]=[];let size=0;
    res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){req.destroy();reject(new WorkspaceError(413,'Article response is too large.'));}else chunks.push(chunk)});
    res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));
    res.on('error',reject);
   });
   req.on('timeout',()=>req.destroy(new WorkspaceError(504,'Article fetch timed out.')));
   req.on('error',reject);req.end();
  });
  if(response.redirect){url=new URL(response.redirect,url);continue}
  const {document}=parseHTML(response.html);
  document.querySelectorAll('script,style,nav,header,footer').forEach((el:{remove:()=>void})=>el.remove());
  const article=new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
  const text=article?.textContent?.trim();
  if(!text||text.length<30)throw new WorkspaceError(422,'Could not extract an article. Paste the text in Dump instead.');
  return {title:article?.title||url.hostname,text:text.slice(0,60000),url:url.toString()};
 }
 throw new WorkspaceError(422,'Too many redirects.');
}
