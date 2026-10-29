#!/usr/bin/env node
// v7 9.2: scores structuring against the golden set, per model, with cost.
// node --experimental-strip-types scripts/eval-structure.mjs [--model provider:model] [--runs 3] [--out file.md] docs/golden/G*.json
// Keys come from the environment (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY). Nothing is written to a database.
import {readFileSync,writeFileSync} from 'node:fs';
import {basename} from 'node:path';
const src='../artifacts/api-server/src/moons/lib';
const {structureMaterial}=await import(new URL(`${src}/server/structure-v3.ts`,import.meta.url));
const {extractConcepts,fillConceptPages,pageComplete,orphansOf,nameKey}=await import(new URL(`${src}/server/v5/concepts.ts`,import.meta.url));
const {aiScope}=await import(new URL(`${src}/server/v5/ai-access.ts`,import.meta.url));
const {STEPS}=await import(new URL(`${src}/server/ai/catalog.ts`,import.meta.url));
const {splitSentences}=await import(new URL(`${src}/thought.ts`,import.meta.url));

const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf(k);if(i<0)return d;const v=args[i+1];args.splice(i,2);return v};
const model=opt('--model',''),runs=Number(opt('--runs','1')),out=opt('--out','');
const files=args.filter(a=>a.endsWith('.json'));
if(!files.length){console.error('Give golden files, e.g. docs/golden/G*.json');process.exit(1)}
const models=model?Object.fromEntries([...STEPS.map(s=>s.id),'other'].map(s=>[s,model])):{};

const same=(a,b)=>{const x=nameKey(a),y=nameKey(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x))};
const ratio=(n,d)=>d?n/d:null;

async function once(g){
  const calls=[];const sentences=g.sentences??splitSentences(g.text);
  return aiScope.run({operator:true,models,onUsage:r=>calls.push(r)},async()=>{
    const started=Date.now();
    const a=await structureMaterial({sentences,title:g.title});
    const entry={id:g.id,kind:'media',body:sentences.join('\n'),sentences,planetIds:[],createdAt:'',locked:true,status:'done',analysis:a};
    const store={version:1,entries:[entry],planets:[]};
    const touched=await extractConcepts(store,entry);await fillConceptPages(store,touched);orphansOf(store,entry);
    const text=id=>a.nodes.find(n=>n.id===id)?.text??'';
    const golden=g.claims??[];
    const hit=e=>golden.find(c=>(same(text(e.from),c.subj)&&same(text(e.to),c.obj))||(same(text(e.from),c.obj)&&same(text(e.to),c.subj)));
    const matched=a.edges.map(e=>({e,c:hit(e)})).filter(x=>x.c);
    const covered=golden.filter(c=>a.edges.some(e=>hit(e)===c));
    const frames=(g.frames??[]).map(f=>{const s=a.sections.find(x=>x.heading===f.heading);return {f,got:s?.frame??null}});
    const concepts=store.concepts??[],want=g.concepts??[];
    const found=concepts.filter(c=>want.some(w=>[c.name,...c.aliases].some(n=>same(n,w))));
    const recalled=want.filter(w=>concepts.some(c=>[c.name,...c.aliases].some(n=>same(n,w))));
    const valid=i=>Number.isInteger(i)&&i>=0&&i<sentences.length;
    return {
      ungrounded:a.edges.filter(e=>!e.claimIds?.length||e.claimIds.some(id=>!a.claims.find(c=>c.id===id)?.sentences.every(valid))).length,
      coverage:ratio(covered.length,golden.length),fidelity:ratio(matched.length,a.edges.length),
      relAccuracy:ratio(matched.filter(x=>!x.c.rel||x.e.rel===x.c.rel).length,matched.length),
      frameMatch:ratio(frames.filter(x=>x.got===x.f.frame).length,frames.length),
      conceptPrecision:ratio(found.length,concepts.length),conceptRecall:ratio(recalled.length,want.length),
      orphans:a.quality.orphans?.length??0,pagesFilled:ratio(concepts.filter(pageComplete).length,concepts.length),
      sentenceCoverage:a.quality.coverage,
      misses:golden.filter(c=>!covered.includes(c)).map(c=>`${c.subj} —${c.rel??''}→ ${c.obj} [${(c.sentences??[]).join(',')}]`),
      wrongFrames:frames.filter(x=>x.got!==x.f.frame).map(x=>`heading ${x.f.heading}: want ${x.f.frame} got ${x.got}`),
      calls:calls.length,failed:calls.filter(c=>!c.ok).length,input:calls.reduce((n,c)=>n+c.input,0),output:calls.reduce((n,c)=>n+c.output,0),
      cost:calls.some(c=>c.cost===null)?null:calls.reduce((n,c)=>n+c.cost,0),ms:Date.now()-started,models:[...new Set(calls.map(c=>c.model))],
    };
  });
}
const bar={ungrounded:[0,'='],coverage:[0.85,'>='],fidelity:[0.85,'>='],relAccuracy:[0.75,'>='],frameMatch:[0.8,'>='],conceptPrecision:[0.8,'>='],conceptRecall:[0.8,'>='],orphans:[0,'='],pagesFilled:[1,'>=']};
const fmt=v=>v===null||v===undefined?'—':typeof v==='number'&&!Number.isInteger(v)?v.toFixed(2):String(v);
const lines=[`# 구조화 평가 — ${model||'기본 모델'} · ${new Date().toISOString().slice(0,16)} · ${runs}회`,''];
for(const f of files){
  const g=JSON.parse(readFileSync(f,'utf8'));
  if(g.kind&&g.kind!=='material'){lines.push(`## ${basename(f)} — 건너뜀 (kind=${g.kind}, M4 덤프 평가에서)`,'');continue}
  const results=[];
  for(let i=0;i<runs;i++){try{results.push(await once(g))}catch(e){results.push({error:String(e?.message??e)})}}
  const ok=results.filter(r=>!r.error);
  lines.push(`## ${basename(f)} ${g.title??''}`,'');
  if(!ok.length){lines.push(`실패: ${results.map(r=>r.error).join(' / ')}`,'');continue}
  lines.push('| 지표 | 값 | 흔들림 | 기준 | 통과 |','|---|---|---|---|---|');
  for(const [k,[want,op]] of Object.entries(bar)){
    const vals=ok.map(r=>r[k]).filter(v=>v!==null);const v=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    const spread=vals.length>1?Math.max(...vals)-Math.min(...vals):0;
    const pass=v===null?'—':(op==='='?v===want:v>=want)&&spread<=0.1?'✓':'✗';
    lines.push(`| ${k} | ${fmt(v)} | ${fmt(spread)} | ${op} ${want} | ${pass} |`);
  }
  const r=ok[0];
  lines.push('',`호출 ${r.calls}(실패 ${r.failed}) · 토큰 ${r.input}/${r.output} · 비용 ${r.cost===null?'가격 미상':'$'+r.cost.toFixed(4)} · ${(r.ms/1000).toFixed(1)}s · ${r.models.join(', ')}`);
  if(r.misses.length)lines.push('','빠진 정답 명제',...r.misses.map(m=>`- ${m}`));
  if(r.wrongFrames.length)lines.push('','짜임 불일치',...r.wrongFrames.map(m=>`- ${m}`));
  lines.push('');
}
const report=lines.join('\n');console.log(report);if(out)writeFileSync(out,report);
