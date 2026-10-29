// Prints the analysis reviews users chose to send. Run through Railway so ADMIN_TOKEN never leaves its env:
//   npx -y @railway/cli@4 run --service moons node scripts/read-reviews.mjs [count]
const base = process.env.MOONS_URL || 'https://moons-production-648d.up.railway.app';
if (!process.env.ADMIN_TOKEN) { console.error('ADMIN_TOKEN is not set on the Railway service.'); process.exit(1); }
const r = await fetch(`${base}/api/admin/feedback?reviews=1`, {headers: {'x-admin-token': process.env.ADMIN_TOKEN}});
if (!r.ok) { console.error(`Request failed: ${r.status}`); process.exit(1); }
const {feedback} = await r.json();
for (const f of feedback.slice(0, Number(process.argv[2]) || 5)) {
  const p = f.payload ?? {};
  const a = p.analysis ?? {};
  console.log(`\n=== ${f.created_at} · ${f.text}\n--- original (${p.sentences?.length ?? 0} sentences, ${p.body?.length ?? 0} chars)\n${p.body}`);
  console.log(`--- structure ${a.structure} · ${a.model} · ${a.promptVersion}\n${a.reason ?? ''}`);
  if (a.textKind || a.frame) console.log(`  text kind ${a.textKind ?? '-'}${a.frame ? ` · frame ${a.frame}${a.frameBy === 'user' ? ' (user)' : ''} · ${a.solo}` : ''}`);
  for (const sec of a.sections ?? []) console.log(`  § ${sec.headingText || '(no title)'} · ${sec.frame}${sec.frameBy === 'user' ? ' (user)' : ''} · ${sec.solo} · ${sec.nodeIds.length} nodes`);
  for (const n of a.nodes ?? []) console.log(`  [${n.role}] ${n.empty ? '(empty)' : n.text}  ← ${JSON.stringify(n.source)}`);
  const text = id => (a.nodes ?? []).find(n => n.id === id)?.text ?? id;
  for (const e of a.edges ?? []) console.log(`  ${text(e.from)} → ${text(e.to)}${e.rel ? ` (${e.rel}${e.relBy === 'user' ? ', user' : ''})` : ''}`);
  for (const s of a.signals ?? []) console.log(`  ! ${s.kind}: ${s.reason}`);
  const covered = new Set((a.nodes ?? []).flatMap(n => n.source ?? []));
  const missed = (p.sentences ?? []).filter((_, i) => !covered.has(i));
  if (missed.length) console.log(`--- lines in no node (${missed.length}):\n  ${missed.join('\n  ')}`);
  const c = p.comparison;
  if (c) {
    const count = v => (c.items ?? []).filter(i => i.verdict === v).length;
    console.log(`--- sentence layer vs "${c.materialTitle}": kept ${count('kept')} · shifted ${count('shifted')} · added ${count('added')} · missed ${count('missed')}`);
    for (const i of (c.items ?? []).filter(i => i.verdict !== 'kept')) console.log(`  ${i.verdict}${i.shiftType ? `/${i.shiftType}` : ''}: ${i.note}`);
    const st = c.structure;
    if (!st) console.log('--- structure layer: none');
    else {
      console.log(`--- structure layer (original text kind ${st.textKind ?? '-'})`);
      for (const s of st.sections) console.log(`  § ${s.heading || s.section}: original ${s.origFrame ?? '(no signal)'} ← ${JSON.stringify(s.original)} ${s.signals.map(g => `"${g.words}"`).join(' ')} ${s.note}`);
      for (const m of st.missed) console.log(`  missed ${m.frame ?? ''} ← ${JSON.stringify(m.original)} ${m.note}`);
      for (const r of st.relations) console.log(`  line ${text(r.from)} → ${text(r.to)}: original ${r.origRel} ${r.note}`);
    }
  }
  if (p.notation?.length) console.log(`--- symbols: ${p.notation.map(n => `${n.symbol}=${n.role}`).join(', ')}`);
}
