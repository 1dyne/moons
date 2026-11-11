import {Flow, LogicBlock, MadeOptions, TypeDef, newLogicId, type Logic} from '@workspace/planner-spec';

// Starting points in the studio. Each is only blocks + a type (+ automations) — the same pieces the user can change,
// so a preset is a filled-in example, never a separate feature.
export type Preset = {id: string; name: string; icon: string; desc: string; make: (logic: Logic) => {title: string; types: TypeDef[]; options: MadeOptions; flows: Flow[]}};
const B = (kind: LogicBlock['kind'], x: Partial<LogicBlock> = {}) => LogicBlock.parse({id: newLogicId(), kind, ...x});
const T = (x: {id: string; name: string; fields?: Record<string, unknown>[]} & Record<string, unknown>) => TypeDef.parse(x);
const F = (x: Omit<Partial<Flow>, 'do'> & {on: Flow['on']; do: Flow['do']}) => Flow.parse({id: newLogicId(), ...x});
const opts = (type: string, blocks: LogicBlock[]) => MadeOptions.parse({type, blocks});
/** A type id not used yet, starting from the preset's own. */
const freeId = (logic: Logic, base: string) => { let id = base, n = 2; while (logic.types.some(t => t.id === id)) id = `${base}${n++}`; return id; };

export const PRESETS: Preset[] = [
  {id: 'blank', name: '빈 위젯', icon: 'plus', desc: '기록 묶음과 블록을 처음부터', make: logic => { const id = freeId(logic, 'mine'); return {title: '새 위젯', types: [T({id, name: '새 기록'})], options: opts(id, []), flows: []}; }},
  {id: 'sleep', name: '기상·취침', icon: 'moon', desc: '시작·끝 버튼 + 평균 + 7일 막대', make: logic => {
    const id = freeId(logic, 'sleep');
    return {title: '수면', types: [T({id, name: '수면', desc: '잠든 시각부터 일어난 시각까지 한 줄', icon: 'moon', fields: [{id: 'q', name: '잠의 질', kind: 'score', max: 5, desc: '1 나쁨 ~ 5 개운함'}]})],
      options: opts(id, [B('toggle', {startLabel: '취침', endLabel: '기상', icon: 'moon'}), B('stat', {label: '7일 평균', agg: 'avg', of: 'duration', period: 'last7'}), B('chart', {label: '최근 7일', agg: 'sum', of: 'duration', period: 'last7'}), B('list', {period: 'last7', limit: 7})]), flows: []};
  }},
  {id: 'pomo', name: '뽀모도로', icon: 'timer', desc: '집중 25분 → 휴식 5분 × 4, 오늘 몇 번', make: logic => {
    const id = logic.types.some(t => t.id === 'pomo') ? freeId(logic, 'pomo') : 'pomo';
    return {title: '뽀모도로', types: [T({id, name: '뽀모도로', desc: '타이머 한 단계가 끝날 때마다 한 줄', icon: 'timer', unit: '분', fields: [{id: 'step', name: '단계', kind: 'choice', options: ['집중', '휴식']}]})],
      options: opts(id, [B('timer', {steps: [{name: '집중', min: 25}, {name: '휴식', min: 5}], loop: 4, field: 'step'}), B('stat', {label: '오늘 뽀모도로', agg: 'count', period: 'day', conds: [{field: 'step', op: 'eq', value: '집중'}], target: 8, show: 'ring'}),
        B('chart', {label: '최근 7일', agg: 'count', period: 'last7', conds: [{field: 'step', op: 'eq', value: '집중'}]})]), flows: []};
  }},
  {id: 'water', name: '물 마시기', icon: 'water', desc: '+1 카운터와 하루 목표', make: logic => {
    const id = freeId(logic, 'water');
    return {title: '물', types: [T({id, name: '물', unit: '잔', icon: 'water', desc: '한 잔 마실 때마다 한 줄'})], options: opts(id, [B('counter', {label: '오늘', icon: 'water', target: 8}), B('chart', {agg: 'sum', period: 'last7', target: 8})]), flows: []};
  }},
  {id: 'mood', name: '기분·컨디션', icon: 'smile', desc: '점수 + 이유 + 메모, 낮으면 알림', make: logic => {
    const id = freeId(logic, 'mood');
    return {title: '컨디션', types: [T({id, name: '컨디션', icon: 'pulse', desc: '지금 몸과 마음 상태를 점수로', fields: [
      {id: 'score', name: '점수', kind: 'score', max: 10, desc: '1~2 최악 · 3~4 저조 · 5~6 보통 · 7~8 양호 · 9~10 최상'},
      {id: 'why', name: '저하 요인', kind: 'multi', options: ['신체 통증', '심리 트리거', '수면 불량', '호르몬 영향', '에너지 고갈']},
      {id: 'memo', name: '메모', kind: 'longtext', desc: '사건 · 몸의 신호 · 생각·감정'}]})],
      options: opts(id, [B('score', {field: 'score'}), B('form', {fields: ['why', 'memo'], verb: 'noted'}), B('stat', {label: '오늘 평균', agg: 'avg', of: 'score', period: 'day'}), B('list', {period: 'day', fields: ['score', 'why']})]),
      flows: [F({name: '낮은 점수', on: {type: id, event: 'created', verbs: []}, if: [{field: 'score', op: 'lt', value: 5}], do: [{do: 'notify', text: '점수가 낮아요. 이유를 남겨 둘까요?'}]})]};
  }},
  {id: 'read', name: '독서 기록', icon: 'read', desc: '책·쪽수·목표 연결, 이달 합계, 카드', make: logic => {
    const id = freeId(logic, 'read');
    return {title: '독서', types: [T({id, name: '독서', icon: 'read', fields: [{id: 'book', name: '책', kind: 'text'}, {id: 'pages', name: '쪽', kind: 'number', unit: '쪽'}, {id: 'goal', name: '목표', kind: 'link', to: 'goal', desc: '이 독서가 올리는 목표'}, {id: 'note', name: '감상', kind: 'longtext'}]})],
      options: opts(id, [B('form', {fields: ['book', 'pages', 'goal', 'note']}), B('stat', {label: '이달 읽은 쪽', agg: 'sum', of: 'pages', period: 'month'}), B('gallery', {period: 'month'})]), flows: []};
  }},
  {id: 'habit', name: '습관 체크', icon: 'check', desc: '오늘 체크 + 연속 일수 + 달력', make: logic => {
    const id = freeId(logic, 'habit');
    return {title: '습관', types: [T({id, name: '습관', icon: 'check'})], options: opts(id, [B('check', {label: '오늘 했어요'}), B('stat', {label: '연속', agg: 'streak'}), B('calendar', {agg: 'count'})]), flows: []};
  }},
  {id: 'spend', name: '지출', icon: 'wallet', desc: '항목·금액·분류, 이달 합계, 필터 칩', make: logic => {
    const id = freeId(logic, 'spend');
    return {title: '지출', types: [T({id, name: '지출', icon: 'wallet', fields: [{id: 'item', name: '항목', kind: 'text'}, {id: 'won', name: '금액', kind: 'number', unit: '원'}, {id: 'cat', name: '분류', kind: 'choice', options: ['식비', '카페', '교통', '쇼핑', '기타']}]})],
      options: opts(id, [B('form', {fields: ['item', 'won', 'cat']}), B('stat', {label: '이달 합계', agg: 'sum', of: 'won', period: 'month'}),
        B('list', {period: 'month', filters: [{id: 'f1', name: '식비', conds: [{field: 'cat', op: 'eq', value: '식비'}]}, {id: 'f2', name: '카페', conds: [{field: 'cat', op: 'eq', value: '카페'}]}]})]), flows: []};
  }},
  {id: 'wish', name: '소원 해금', icon: 'gift', desc: '뽀모도로 8번이면 잠긴 소원 하나가 열려요', make: logic => {
    const id = freeId(logic, 'wish'), pomo = logic.types.find(t => t.id === 'pomo');
    const extra = pomo ? [] : [T({id: 'pomo', name: '뽀모도로', unit: '분', fields: [{id: 'step', name: '단계', kind: 'choice', options: ['집중', '휴식']}]})];
    return {title: '소원', types: [T({id, name: '소원', icon: 'gift', fields: [{id: 'wish', name: '소원', kind: 'text'}, {id: 'state', name: '상태', kind: 'choice', options: ['잠김', '해금', '사용함']}]}), ...extra],
      options: opts(id, [B('form', {fields: ['wish'], verb: 'wished'}), B('gallery', {period: 'all', filters: [{id: 'f1', name: '잠김', conds: [{field: 'state', op: 'ne', value: '해금'}]}, {id: 'f2', name: '해금', conds: [{field: 'state', op: 'eq', value: '해금'}]}]})]),
      flows: [F({name: '소원 기본 상태', on: {type: id, event: 'created', verbs: []}, if: [{field: 'state', op: 'empty', value: ''}], do: [{do: 'update', fields: {state: {set: '잠김'}}}]}),
        F({name: '뽀모도로로 해금', on: {type: 'pomo', event: 'created', verbs: []}, if: [{field: 'step', op: 'eq', value: '집중'}], ifAgg: [{type: 'pomo', agg: 'count', of: '', period: 'today', op: 'gte', value: 8}],
          do: [{do: 'updateWhere', type: id, conds: [{field: 'state', op: 'eq', value: '잠김'}], fields: {state: {set: '해금'}}, limit: 1}, {do: 'notify', text: '소원 하나가 열렸어요'}]})]};
  }},
];
