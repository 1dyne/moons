import {CATALOG, TEMPLATES, defaultModule, entry, type Question, type Template} from './catalog.ts';
import {PlannerSpec, type ModuleType} from './spec.ts';
import {MOODS, REFERENCES, matchReferences} from './references.ts';

// The studio without AI: match words to the catalog, ask its questions, and compose a spec.
// Most requests end here at zero model cost; an AI step can later refine the same Proposal.
export type Proposal = {
  template: Template;
  requested: ModuleType[];                                 // what the user asked for
  suggested: {module: ModuleType; why: string}[];          // what MOONS adds, with a reason
  questions: Question[];
};

export function matchModules(text: string): ModuleType[] {
  const t = text.toLowerCase();
  return CATALOG.filter(c => c.triggers.some(w => t.includes(w.toLowerCase()))).map(c => c.module);
}

/** templateId: the user picked a template chip instead of (or along with) describing their day. */
export function propose(text: string, templateId?: string): Proposal {
  const requested = matchModules(text);
  const score = (tpl: Template) => tpl.spec.modules.filter(m => requested.includes(m.type)).length * 2 - tpl.spec.modules.length * .1 + (requested[0] && tpl.spec.modules[0]!.type === requested[0] ? 1 : 0);
  const template = TEMPLATES.find(t => t.id === templateId) ?? [...TEMPLATES].sort((a, b) => score(b) - score(a))[0]!;
  const base = new Set<ModuleType>([...template.spec.modules.map(m => m.type), ...requested]);
  const suggested: Proposal['suggested'] = [];
  for (const m of requested.length ? requested : template.spec.modules.map(m => m.type))
    for (const c of entry(m)?.companions ?? [])
      if (!base.has(c.module) && !suggested.some(s => s.module === c.module)) suggested.push(c);
  // Up to three questions, taking turns across the modules asked about so each gets its most important one first.
  const pools = [...base].filter(m => requested.length === 0 || requested.includes(m)).map(m => [...(entry(m)?.questions ?? [])]);
  const questions: Question[] = [];
  for (let round = 0; questions.length < 3 && pools.some(q => q.length > round); round++) for (const pool of pools) if (pool[round] && questions.length < 3) questions.push(pool[round]!);
  return {template, requested, suggested, questions};
}

/** Builds the spec: template, plus requested and accepted modules, then the answers' effects. */
export function compose(p: Proposal, accepted: ModuleType[], answers: Record<string, string>, name?: string): PlannerSpec {
  const spec = structuredClone(p.template.spec);
  const add = (type: ModuleType) => { if (!spec.modules.some(m => m.type === type)) spec.modules.push(defaultModule(type, spec.modules.length)); };
  for (const m of [...p.requested, ...accepted]) add(m);
  for (const q of p.questions) {
    const choice = q.choices.find(c => c.id === answers[q.id]);
    for (const e of choice?.effects ?? []) {
      if (e.kind === 'add') add(e.module);
      else if (e.kind === 'option') { const m = spec.modules.find(x => x.type === e.module); if (m) m.options[e.key] = e.value; }
      else spec.rules = [...spec.rules.filter(r => !(r.kind === e.rule.kind && 'moduleId' in r && 'moduleId' in e.rule && r.moduleId === e.rule.moduleId)), e.rule];
    }
  }
  const routine = spec.modules.find(m => m.type === 'routine');
  if (routine && !spec.rules.some(r => r.kind === 'achievement_basis')) spec.rules.push({kind: 'achievement_basis', moduleId: routine.id, basis: routine.options.mode === 'fixed_all' ? 'all_defined' : 'committed_today'});
  if (name?.trim()) spec.name = name.trim().slice(0, 40);
  spec.source = {kind: 'chat'};
  return PlannerSpec.parse(spec);
}

/** Two or three different planners for the same request, drawn from the reference library:
 *  the references the user's words point to first, then contrasting day layouts. Same modules, different pages. */
export function candidates(p: Proposal, text: string, accepted: ModuleType[], answers: Record<string, string>, name?: string) {
  const base = compose(p, accepted, answers, name);
  const order: string[] = [];
  for (const r of matchReferences(text)) if (r.layout?.day && !order.includes(r.layout.day)) order.push(r.layout.day);
  for (const d of ['sheet', 'hourly', 'bullet', 'onepage']) if (!order.includes(d)) order.push(d);
  return order.slice(0, 3).map(day => {
    const spec = structuredClone(base);
    spec.layout = {...spec.layout, day: day as PlannerSpec['layout']['day']};
    // The timetable page needs the timer; the others show tasks their own way.
    if (day === 'sheet' && !spec.modules.some(m => m.type === 'timer')) spec.modules.push(defaultModule('timer', spec.modules.length));
    const ref = REFERENCES.find(r => r.layout?.day === day && (day !== 'sheet' || r.id === (base.modules.some(m => m.type === 'checkin') ? 'realistic-day' : 'study-timetable')))!;
    return {reference: ref, spec: PlannerSpec.parse(spec)};
  });
}

/** Apply a mood: its accent colour and id. Structure and records are untouched. */
export function withMood(spec: PlannerSpec, moodId: string): PlannerSpec {
  const mood = MOODS.find(m => m.id === moodId) ?? MOODS[0]!;
  return PlannerSpec.parse({...spec, mood: mood.id, theme: {...spec.theme, accent: mood.accent}});
}
