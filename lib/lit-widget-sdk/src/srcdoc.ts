import type {Theme} from './protocol.ts';

// The document a code widget runs in. A strict CSP blocks every network request (fetch, images, fonts,
// scripts from elsewhere); the iframe is sandboxed without same-origin, so the widget cannot read lit's
// page, cookies or storage. The only door is window.lit (postMessage to the host).
export type WidgetSource = {html?: string; css?: string; code?: string};

const CSP = "default-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

/** The in-frame client: window.lit. Kept in one string so lit and the dev harness serve the same thing. */
export const CLIENT = `(function(){
  var seq=0,pending=new Map(),listeners={};
  function call(method,params){return new Promise(function(res,rej){var id=++seq;pending.set(id,{res:res,rej:rej});parent.postMessage({lit:1,id:id,method:method,params:params||{}},'*');});}
  addEventListener('message',function(e){
    if(e.source!==parent)return;var m=e.data;if(!m||m.lit!==1)return;
    if(typeof m.id==='number'&&pending.has(m.id)){var p=pending.get(m.id);pending.delete(m.id);if(m.error)p.rej(new Error(m.error));else p.res(m.result);}
    else if(m.event){if(m.event==='theme')applyTheme(m.data);(listeners[m.event]||[]).forEach(function(f){try{f(m.data)}catch(err){console.error(err)}});}
  });
  function applyTheme(t){if(!t)return;var s=document.documentElement.style;s.setProperty('--lit-bg',t.bg);s.setProperty('--lit-surface',t.surface);s.setProperty('--lit-ink',t.ink);s.setProperty('--lit-muted',t.muted);s.setProperty('--lit-accent',t.accent);s.setProperty('--lit-radius',t.radius+'px');document.documentElement.dataset.dark=t.dark?'1':'';}
  window.lit={
    context:function(){return call('context')},
    table:{rows:function(){return call('table.rows')},add:function(cells,name){return call('table.add',{cells:cells||{},name:name||''})},update:function(id,cells,name){return call('table.update',{id:id,cells:cells||{},name:name})},remove:function(id){return call('table.remove',{id:id})}},
    tasks:{today:function(){return call('tasks.today')}},
    goals:{list:function(){return call('goals.list')}},
    condition:{today:function(){return call('condition.today')}},
    on:function(ev,f){(listeners[ev]=listeners[ev]||[]).push(f);return function(){listeners[ev]=(listeners[ev]||[]).filter(function(x){return x!==f})}}
  };
  var last=0;function size(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(Math.abs(h-last)>1){last=h;parent.postMessage({lit:1,resize:h},'*');}}
  new ResizeObserver(size).observe(document.documentElement);addEventListener('load',size);
  window.addEventListener('error',function(e){var el=document.getElementById('lit-error');if(el){el.textContent='위젯 오류: '+e.message;el.hidden=false;}});
  window.addEventListener('unhandledrejection',function(e){var el=document.getElementById('lit-error');if(el){el.textContent='위젯 오류: '+((e.reason&&e.reason.message)||e.reason);el.hidden=false;}});
})();`;

const esc = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');

export function buildSrcdoc(src: WidgetSource, theme: Theme): string {
  const vars = `--lit-bg:${theme.bg};--lit-surface:${theme.surface};--lit-ink:${theme.ink};--lit-muted:${theme.muted};--lit-accent:${theme.accent};--lit-radius:${theme.radius}px`;
  return `<!doctype html><html${theme.dark ? ' data-dark="1"' : ''}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>:root{${vars}}html,body{margin:0;background:transparent;color:var(--lit-ink);font:14px/1.5 ${theme.font.replace(/"/g, "'")};}
*{box-sizing:border-box}button,input,select,textarea{font:inherit;color:inherit}#lit-error{color:#b8412f;font-size:12px;padding:4px 0}
${esc(src.css ?? '')}</style>
<script>${CLIENT}</script></head><body>${src.html ?? ''}<p id="lit-error" hidden></p>
<script>${esc(src.code ?? '')}</script></body></html>`;
}
