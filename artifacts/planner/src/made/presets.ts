import {Flow, LogicBlock, MadeOptions, Signal, TypeDef, newLogicId, type Logic} from '@workspace/planner-spec';

// Starting points in the studio. Each is only blocks + a type (+ automations) — the same pieces the user can change,
// so a preset is a filled-in example, never a separate feature.
/** What the user already has, so a block version starts with their own subjects and routines (nothing invented). */
export type Seed = {subjects: string[]; routines: string[]};
export type Preset = {id: string; name: string; icon: string; desc: string; group: 'old' | 'new'; make: (logic: Logic, seed: Seed) => {title: string; types: TypeDef[]; options: MadeOptions; flows: Flow[]}};
// Input parts answer a tap with a small movement (the new editor's 움직임); shown parts stay still.
const TAP: Partial<Record<LogicBlock['kind'], LogicBlock['anim']>> = {button: 'pop', toggle: 'pop', counter: 'bounce', check: 'pop', score: 'pop', timer: 'pulse', stopwatch: 'pop'};
const B = (kind: LogicBlock['kind'], x: Partial<LogicBlock> = {}) => LogicBlock.parse({id: newLogicId(), kind, ...(TAP[kind] ? {anim: TAP[kind], animWhen: 'tap'} : {}), ...x});
const T = (x: {id: string; name: string; fields?: Record<string, unknown>[]} & Record<string, unknown>) => TypeDef.parse(x);
const F = (x: Omit<Partial<Flow>, 'do' | 'on'> & {on: Partial<Flow['on']> & {type: string}; do: Flow['do']}) => Flow.parse({id: newLogicId(), ...x});
const opts = (type: string, blocks: LogicBlock[]) => MadeOptions.parse({type, blocks});
/** A type id not used yet, starting from the preset's own. */
const freeId = (logic: Logic, base: string) => { let id = base, n = 2; while (logic.types.some(t => t.id === id)) id = `${base}${n++}`; return id; };

/** The type that holds focus time: the one already marked as focus, or a new 집중 type (with the user's own subjects). */
function focusType(logic: Logic, seed: Seed) {
  const have = logic.types.find(t => t.focus);
  if (have) return {t: have, add: [] as TypeDef[]};
  const id = freeId(logic, 'focus');
  const t = T({id, name: '집중', icon: 'timer', unit: '분', focus: true, from: 'session', desc: '집중한 시간. 시작부터 끝까지 한 줄',
    fields: [{id: 'subject', name: '과목', kind: 'choice', options: seed.subjects, desc: '무엇에 집중했나'}, {id: 'cond', name: '컨디션', kind: 'score', max: 10, desc: '멈출 때 남기는 그때 컨디션'}, {id: 'note', name: '메모', kind: 'text'}]});
  return {t, add: [t]};
}
const choiceOf = (t: TypeDef) => t.fields.find(f => f.kind === 'choice')?.id ?? '';
const scoreOf = (t: TypeDef) => t.fields.find(f => f.kind === 'score')?.id ?? '';
const SCALE: Record<string, string> = {1: '최악: 움직임 불가능, 극심한 통증이나 무력감.', 2: '최악: 움직임 불가능, 극심한 통증이나 무력감.', 3: '저조: 피로 누적, 최소한의 일과만 겨우 수행.', 4: '저조: 피로 누적, 최소한의 일과만 겨우 수행.',
  5: '보통: 평범한 컨디션, 일상적인 활동 가능.', 6: '보통: 평범한 컨디션, 일상적인 활동 가능.', 7: '양호: 몸이 가볍고 긍정적, 추가 활동 가능.', 8: '양호: 몸이 가볍고 긍정적, 추가 활동 가능.', 9: '최상: 최상의 에너지와 몰입, 자신감 넘침.', 10: '최상: 최상의 에너지와 몰입, 자신감 넘침.'};

// Block versions of lit's earlier widgets: the same jobs, made only of blocks the user can open and change.
const OLD: Preset[] = [
  {id: 'focus', group: 'old', name: '집중 타이머 (과목별)', icon: 'timer', desc: '과목마다 ▶/■, 멈추면 컨디션, 오늘 순집중과 과목별 시간 — 10분 타임테이블에 저절로 칠해져요', make: (logic, seed) => {
    const {t, add} = focusType(logic, seed), c = choiceOf(t);
    return {title: '집중 타이머', types: add, flows: [], options: opts(t.id, [B('toggle', {label: '오늘 순집중', field: c, ask: scoreOf(t)}), B('breakdown', {label: '과목별', field: c, agg: 'sum', of: 'duration', period: 'day', show: 'list'})])};
  }},
  {id: 'grid', group: 'old', name: '10분 타임테이블', icon: 'calendar', desc: '잰 시간(타이머·다른 위젯·수면)이 10분 칸에 저절로 칠해져요. 빈 칸은 눌러서 칠해요', make: (logic, seed) => {
    const {t, add} = focusType(logic, seed);
    return {title: '10분 타임테이블', types: add, flows: [], options: opts(t.id, [B('grid10', {scope: 'all'})])};
  }},
  {id: 'receipt', group: 'old', name: '하루 영수증', icon: 'list', desc: '오늘 순집중 합계, 과목별 시간, 시간 순서', make: (logic, seed) => {
    const {t, add} = focusType(logic, seed);
    return {title: '하루 영수증', types: add, flows: [], options: opts(t.id, [B('stat', {label: '순집중 합계', agg: 'sum', of: 'duration', period: 'day'}), B('breakdown', {field: choiceOf(t), agg: 'sum', of: 'duration', period: 'day'}), B('timeline', {period: 'day'})])};
  }},
  {id: 'mission', group: 'old', name: '오늘의 미션', icon: 'target', desc: '순집중 8시간 또는 할 일 전부, 먼저 찬 쪽에서 축하와 알림 (자유시간)', make: (logic, seed) => {
    const {t, add} = focusType(logic, seed);
    return {title: '오늘의 미션', types: add, options: opts(t.id, [B('stat', {label: '순집중', agg: 'sum', of: 'duration', period: 'day', target: 480, show: 'ring'})]),
      flows: [F({name: '미션 달성', on: {kind: 'signal', type: t.id, signal: Signal.parse({kind: 'mission', n: 8})}, do: [{do: 'notify', text: '오늘 미션 달성! 지금부터 자유시간이에요'}, {do: 'effect', name: 'confetti', target: 'widget'}]})]};
  }},
  {id: 'me', group: 'old', name: '오늘의 나', icon: 'user', desc: '오늘 시간을 어디에 썼는지 원형으로', make: (logic, seed) => {
    const {t, add} = focusType(logic, seed);
    return {title: '오늘의 나', types: add, flows: [], options: opts(t.id, [B('breakdown', {field: choiceOf(t), agg: 'sum', of: 'duration', period: 'day', show: 'donut'})])};
  }},
  {id: 'energy', group: 'old', name: '에너지 신호등', icon: 'pulse', desc: '점수 → 신호등과 점수별 메시지, 이유·저하 요인·메모, 낮으면 알림', make: logic => {
    const id = freeId(logic, 'cond');
    return {title: '에너지 신호등', types: [T({id, name: '컨디션', icon: 'pulse', from: 'condition', desc: '지금 몸과 마음 상태를 점수로', fields: [
      {id: 'score', name: '점수', kind: 'score', max: 10, desc: '1~2 최악 · 3~4 저조 · 5~6 보통 · 7~8 양호 · 9~10 최상'},
      {id: 'reason', name: '이유', kind: 'text'},
      {id: 'why', name: '저하 요인', kind: 'multi', options: ['신체 통증', '심리 트리거', '수면 불량', '호르몬 영향', '에너지 고갈']},
      {id: 'deep', name: '심층 분석', kind: 'multi', options: ['통제 요인', '상수 요인'], desc: '통제: 관리로 조절할 수 있음 · 상수: 불가역적'},
      {id: 'event', name: '사건', kind: 'longtext'}, {id: 'body', name: '몸의 신호', kind: 'longtext'}, {id: 'thought', name: '생각·감정', kind: 'longtext'}]})],
      options: opts(id, [B('stat', {label: '지금', agg: 'last', of: 'score', period: 'day', show: 'light', msgs: SCALE}), B('score', {field: 'score', verb: 'felt'}),
        B('form', {fields: ['reason', 'why', 'deep', 'event', 'body', 'thought'], verb: 'noted'}), B('list', {period: 'day', fields: ['score', 'reason', 'why']})]),
      flows: [F({name: '낮은 점수', on: {type: id, event: 'created', verbs: []}, if: [{field: 'score', op: 'lt', value: 5}], do: [{do: 'notify', text: '점수가 낮아요. 이유를 남겨 둘까요?'}, {do: 'effect', name: 'shake', target: 'widget'}]})]};
  }},
  {id: 'routine', group: 'old', name: '오늘의 루틴', icon: 'list', desc: '루틴 항목마다 체크, 오늘 한 개수, 한 달 달력', make: (logic, seed) => {
    const id = freeId(logic, 'routine');
    return {title: '오늘의 루틴', types: [T({id, name: '루틴', icon: 'check', fields: [{id: 'item', name: '항목', kind: 'choice', options: seed.routines}]})],
      options: opts(id, [B('check', {field: 'item'}), B('stat', {label: '오늘', agg: 'count', period: 'day', target: seed.routines.length || null, show: 'gauge'}), B('calendar', {agg: 'count'})]),
      flows: seed.routines.length ? [F({name: '루틴 다 했어요', on: {type: id}, ifAgg: [{type: id, agg: 'count', of: '', period: 'today', op: 'eq', value: seed.routines.length}], do: [{do: 'notify', text: '오늘 루틴 끝!'}, {do: 'effect', name: 'confetti', target: 'widget'}]})] : []};
  }},
  {id: 'review', group: 'old', name: '하루 돌아보기', icon: 'notebook', desc: '하루 한 줄, 지난 7일', make: logic => {
    const id = freeId(logic, 'diary');
    return {title: '하루 돌아보기', types: [T({id, name: '돌아보기', icon: 'notebook', fields: [{id: 'text', name: '한 줄', kind: 'longtext'}]})],
      options: opts(id, [B('form', {fields: ['text'], verb: 'noted'}), B('list', {period: 'last7', fields: ['text']})]), flows: []};
  }},
];

const NEW: Preset[] = [
  {id: 'blank', group: 'new', name: '빈 위젯', icon: 'plus', desc: 'DB와 부품을 처음부터', make: logic => { const id = freeId(logic, 'mine'); return {title: '새 위젯', types: [T({id, name: '새 DB'})], options: opts(id, []), flows: []}; }},
  {id: 'sleep', group: 'old', name: '수면 (기상·취침)', icon: 'moon', desc: '시작·끝 버튼 + 평균 + 7일 막대', make: logic => {
    const id = freeId(logic, 'sleep');
    return {title: '수면', types: [T({id, name: '수면', desc: '잠든 시각부터 일어난 시각까지 한 줄', icon: 'moon', from: 'sleep', fields: [{id: 'q', name: '잠의 질', kind: 'score', max: 5, desc: '1 나쁨 ~ 5 개운함'}]})],
      options: opts(id, [B('toggle', {startLabel: '취침', endLabel: '기상', icon: 'moon'}), B('stat', {label: '7일 평균', agg: 'avg', of: 'duration', period: 'last7'}), B('chart', {label: '최근 7일', agg: 'sum', of: 'duration', period: 'last7'}), B('list', {period: 'last7', limit: 7})]), flows: []};
  }},
  {id: 'pomo', group: 'new', name: '뽀모도로', icon: 'timer', desc: '집중 25분 → 휴식 5분 × 4, 오늘 몇 번', make: logic => {
    const id = logic.types.some(t => t.id === 'pomo') ? freeId(logic, 'pomo') : 'pomo';
    return {title: '뽀모도로', types: [T({id, name: '뽀모도로', desc: '타이머 한 단계가 끝날 때마다 한 줄', icon: 'timer', unit: '분', fields: [{id: 'step', name: '단계', kind: 'choice', options: ['집중', '휴식']}]})],
      options: opts(id, [B('timer', {steps: [{name: '집중', min: 25}, {name: '휴식', min: 5}], loop: 4, field: 'step'}), B('stat', {label: '오늘 뽀모도로', agg: 'count', period: 'day', conds: [{field: 'step', op: 'eq', value: '집중'}], target: 8, show: 'ring'}),
        B('chart', {label: '최근 7일', agg: 'count', period: 'last7', conds: [{field: 'step', op: 'eq', value: '집중'}]})]),
      flows: [F({name: '오늘 8번', on: {type: id}, if: [{field: 'step', op: 'eq', value: '집중'}], ifAgg: [{type: id, agg: 'count', of: '', period: 'today', op: 'eq', value: 8}], do: [{do: 'notify', text: '오늘 뽀모도로 8번!'}, {do: 'effect', name: 'glow', target: 'widget'}]})]};
  }},
  {id: 'water', group: 'new', name: '물 마시기', icon: 'water', desc: '+1 카운터와 하루 목표', make: logic => {
    const id = freeId(logic, 'water');
    return {title: '물', types: [T({id, name: '물', unit: '잔', icon: 'water', desc: '한 잔 마실 때마다 한 줄'})], options: opts(id, [B('counter', {label: '오늘', icon: 'water', target: 8}), B('chart', {agg: 'sum', period: 'last7', target: 8})]),
      flows: [F({name: '오늘 8잔', on: {type: id}, ifAgg: [{type: id, agg: 'count', of: '', period: 'today', op: 'eq', value: 8}], do: [{do: 'notify', text: '오늘 물 8잔 채웠어요'}, {do: 'effect', name: 'sparkle', target: 'widget'}]})]};
  }},
  {id: 'read', group: 'new', name: '독서 기록', icon: 'read', desc: '책·쪽수·목표 연결, 이달 합계, 카드', make: logic => {
    const id = freeId(logic, 'read');
    return {title: '독서', types: [T({id, name: '독서', icon: 'read', fields: [{id: 'book', name: '책', kind: 'text'}, {id: 'pages', name: '쪽', kind: 'number', unit: '쪽'}, {id: 'goal', name: '목표', kind: 'link', to: 'goal', desc: '이 독서가 올리는 목표'}, {id: 'note', name: '감상', kind: 'longtext'}]})],
      options: opts(id, [B('form', {fields: ['book', 'pages', 'goal', 'note']}), B('stat', {label: '이달 읽은 쪽', agg: 'sum', of: 'pages', period: 'month'}), B('gallery', {period: 'month'})]), flows: []};
  }},
  {id: 'habit', group: 'new', name: '습관 체크', icon: 'check', desc: '오늘 체크 + 연속 일수 + 달력', make: logic => {
    const id = freeId(logic, 'habit');
    return {title: '습관', types: [T({id, name: '습관', icon: 'check'})], options: opts(id, [B('check', {label: '오늘 했어요'}), B('stat', {label: '연속', agg: 'streak'}), B('calendar', {agg: 'count'})]),
      flows: [F({name: '체크하면 반짝', on: {type: id}, do: [{do: 'effect', name: 'sparkle', target: 'widget'}]})]};
  }},
  {id: 'spend', group: 'new', name: '지출', icon: 'wallet', desc: '항목·금액·분류, 이달 합계, 필터 칩', make: logic => {
    const id = freeId(logic, 'spend');
    return {title: '지출', types: [T({id, name: '지출', icon: 'wallet', fields: [{id: 'item', name: '항목', kind: 'text'}, {id: 'won', name: '금액', kind: 'number', unit: '원'}, {id: 'cat', name: '분류', kind: 'choice', options: ['식비', '카페', '교통', '쇼핑', '기타']}]})],
      options: opts(id, [B('form', {fields: ['item', 'won', 'cat']}), B('stat', {label: '이달 합계', agg: 'sum', of: 'won', period: 'month'}),
        B('list', {period: 'month', filters: [{id: 'f1', name: '식비', conds: [{field: 'cat', op: 'eq', value: '식비'}]}, {id: 'f2', name: '카페', conds: [{field: 'cat', op: 'eq', value: '카페'}]}]})]), flows: []};
  }},
  {id: 'wish', group: 'new', name: '소원 상자', icon: 'gift', desc: '소원마다 여는 조건(상황)을 정해 두면, 그 상황이 되는 순간 반짝 열려요. 스티커를 누르면 상자가 열려요', make: logic => {
    const id = freeId(logic, 'wish');
    return {title: '소원 상자', types: [T({id, name: '소원', icon: 'gift', fields: [{id: 'wish', name: '소원', kind: 'text'}, {id: 'cond', name: '여는 조건', kind: 'signal', desc: '이 상황이 되면 열려요'},
      {id: 'state', name: '상태', kind: 'choice', options: ['잠김', '열림', '사용함']}]})],
      options: MadeOptions.parse({type: id, blocks: [B('form', {fields: ['wish', 'cond'], label: '소원 넣기'}), B('cards', {field: 'cond', stateField: 'state', period: 'all'})],
        launch: {mode: 'sticker', icon: 'gift', color: '#e8833a', size: 84, rotate: -6, open: 'sheet', badge: {field: 'state', value: '열림'}, label: '소원 상자'}}),
      flows: [F({name: '새 소원은 잠김', on: {type: id, event: 'created'}, if: [{field: 'state', op: 'empty', value: ''}], do: [{do: 'update', fields: {state: {set: '잠김'}}}]}),
        F({name: '조건이 되면 열기', on: {kind: 'item', type: id, field: 'cond'}, if: [{field: 'state', op: 'eq', value: '잠김'}],
          do: [{do: 'update', fields: {state: {set: '열림'}}}, {do: 'effect', name: 'sparkle', target: 'item'}, {do: 'notify', text: '{이름} 열렸어요'}]})]};
  }},
];
// The sleep preset is one of the earlier widgets too.
export const PRESETS: Preset[] = [...NEW.filter(p => p.id === 'blank'), ...OLD, ...NEW.filter(p => p.group === 'old'), ...NEW.filter(p => p.group === 'new' && p.id !== 'blank')];
