import {PlannerSpec, type ModuleSpec, type ModuleType} from './spec.ts';

// Module catalog (PLANNER_SPEC_v1 §5.2): what MOONS asks and suggests is written here, not improvised.
// The studio picks from it; an AI step (later) only chooses entries and words them for the user.
type Effect =
  | {kind: 'option'; module: ModuleType; key: string; value: unknown}
  | {kind: 'rule'; rule: PlannerSpec['rules'][number]}
  | {kind: 'add'; module: ModuleType};
export type Question = {id: string; module: ModuleType; text: string; choices: {id: string; label: string; effects: Effect[]}[]};
export type Companion = {module: ModuleType; why: string};
export type CatalogEntry = {module: ModuleType; label: string; triggers: string[]; questions: Question[]; companions: Companion[]};

export const CATALOG: CatalogEntry[] = [
  {module: 'routine', label: '루틴', triggers: ['루틴', '습관', '매일', '반복', 'routine', 'habit', '체크리스트', '트래커', 'tracker'],
    questions: [
      {id: 'routine.purpose', module: 'routine', text: '루틴을 기록하는 목적이 어디에 가까워요?', choices: [
        {id: 'habit', label: '습관 만들기', effects: [{kind: 'add', module: 'goals'}]},
        {id: 'condition', label: '컨디션 관리', effects: [{kind: 'add', module: 'condition'}, {kind: 'add', module: 'sleep'}]},
        {id: 'time', label: '시간 확보', effects: [{kind: 'option', module: 'routine', key: 'showTarget', value: true}]},
      ]},
      {id: 'routine.mode', module: 'routine', text: '매일 같은 루틴을 다 하나요, 그날 할 것을 고르나요?', choices: [
        {id: 'pick', label: '그날 고른 것만', effects: [{kind: 'option', module: 'routine', key: 'mode', value: 'pick_daily'}, {kind: 'rule', rule: {kind: 'achievement_basis', moduleId: 'routine', basis: 'committed_today'}}]},
        {id: 'all', label: '정해 둔 것 전부', effects: [{kind: 'option', module: 'routine', key: 'mode', value: 'fixed_all'}, {kind: 'rule', rule: {kind: 'achievement_basis', moduleId: 'routine', basis: 'all_defined'}}]},
      ]},
      {id: 'routine.miss', module: 'routine', text: '못 한 날은 이유를 남길까요?', choices: [
        {id: 'reason', label: '이유를 남길래요', effects: [{kind: 'option', module: 'routine', key: 'askReason', value: true}]},
        {id: 'none', label: '체크만', effects: []},
      ]},
    ],
    companions: [
      {module: 'review', why: '못 한 이유가 쌓이면 루틴을 고칠 근거가 돼요.'},
      {module: 'goals', why: '루틴이 어떤 목표를 위한 건지 이어 두면 월간 달성률로 볼 수 있어요.'},
    ]},
  {module: 'tasks', label: '할 일', triggers: ['할 일', '할일', '투두', 'todo', 'to-do', '과업', '데일리', '일정', '하루', 'daily', '플래너'],
    questions: [
      {id: 'tasks.category', module: 'tasks', text: '할 일을 꼭 할 것·하고 싶은 것·여가로 나눠 볼까요?', choices: [
        {id: 'yes', label: '나눌래요', effects: [{kind: 'option', module: 'tasks', key: 'categories', value: true}]},
        {id: 'no', label: '한 목록이면 돼요', effects: [{kind: 'option', module: 'tasks', key: 'categories', value: false}]},
      ]},
      {id: 'tasks.amount', module: 'tasks', text: '분량(30분, 20문제처럼)도 적을까요?', choices: [
        {id: 'yes', label: '분량도 적을래요', effects: [{kind: 'option', module: 'tasks', key: 'amounts', value: true}]},
        {id: 'no', label: '완료만 체크', effects: [{kind: 'option', module: 'tasks', key: 'amounts', value: false}]},
      ]},
    ],
    companions: [
      {module: 'goals', why: '오늘 할 일을 월간·연간 목표에 이어 두면, 하루를 쓰는 것만으로 목표 진행이 쌓여요.'},
      {module: 'review', why: '하루 끝에 한 줄을 남기면 다음 날 계획이 쉬워져요.'},
    ]},
  {module: 'goals', label: '목표', triggers: ['목표', '연간', '월간', '주간', 'goal', '계획', '프로젝트', '대시보드'],
    questions: [
      {id: 'goals.levels', module: 'goals', text: '목표를 어디까지 나눌까요?', choices: [
        {id: 'ymw', label: '연간 → 월간 → 주간', effects: [{kind: 'option', module: 'goals', key: 'levels', value: ['year', 'month', 'week']}]},
        {id: 'ym', label: '연간 → 월간', effects: [{kind: 'option', module: 'goals', key: 'levels', value: ['year', 'month']}]},
        {id: 'm', label: '월간만', effects: [{kind: 'option', module: 'goals', key: 'levels', value: ['month']}]},
      ]},
    ],
    companions: [{module: 'tasks', why: '목표는 하루의 할 일과 이어질 때 진행률이 저절로 계산돼요.'}]},
  {module: 'condition', label: '컨디션', triggers: ['컨디션', '기분', '에너지', '감정', 'mood', 'energy', '상태'],
    questions: [],
    companions: [{module: 'sleep', why: '컨디션은 수면과 같이 보면 이유가 보여요.'}]},
  {module: 'sleep', label: '수면', triggers: ['수면', '잠', '기상', '취침', 'sleep'],
    questions: [],
    companions: [{module: 'condition', why: '잘 잔 날과 컨디션을 이어서 볼 수 있어요.'}]},
  {module: 'review', label: '회고', triggers: ['회고', '일기', '저널', '돌아보기', 'review', 'journal', '메모'],
    questions: [],
    companions: []},
];
export const entry = (module: ModuleType) => CATALOG.find(c => c.module === module);

const mod = (id: string, type: ModuleType, label: string, order: number, options: Record<string, unknown> = {}, period: ModuleSpec['period'] = 'day'): ModuleSpec =>
  ({id, type, label, order, options, period, view: type === 'routine' ? 'checklist' : 'list', fields: []});
export const defaultModule = (type: ModuleType, order: number): ModuleSpec => {
  const label = entry(type)?.label ?? type;
  if (type === 'routine') return mod('routine', 'routine', '오늘의 루틴', order, {mode: 'pick_daily'});
  if (type === 'tasks') return mod('tasks', 'tasks', '할 일', order, {categories: true, amounts: true});
  if (type === 'goals') return mod('goals', 'goals', '이어진 목표', order, {levels: ['year', 'month', 'week']});
  if (type === 'review') return mod('review', 'review', '하루 돌아보기', order);
  return mod(type, type, label, order);
};

export type Template = {id: string; name: string; summary: string; spec: PlannerSpec};
const spec = (name: string, accent: PlannerSpec['theme']['accent'], modules: ModuleSpec[], rules: PlannerSpec['rules'] = []): PlannerSpec => PlannerSpec.parse({
  specVersion: 1, name, theme: {accent}, entry: 'day', periods: ['day', 'week', 'month', 'year'], modules,
  dashboards: [{id: 'goal', kind: 'goal', widgets: ['progress', 'linked_items', 'history']}],
  rules: [{kind: 'day_boundary', at: '04:00'}, ...rules], source: {kind: 'template'},
});
export const TEMPLATES: Template[] = [
  {id: 'daily', name: '하루 정리', summary: '오늘 할 일을 쓰고, 목표로 이어 보고, 하루를 한 줄로 닫아요.',
    spec: spec('하루 정리', 'blue', [defaultModule('tasks', 0), defaultModule('goals', 1), defaultModule('review', 2)])},
  {id: 'routine', name: '오늘의 루틴', summary: '그날 할 루틴을 고르고, 고른 것만으로 달성률을 봐요. 컨디션도 같이.',
    spec: spec('오늘의 루틴', 'green', [defaultModule('routine', 0), defaultModule('tasks', 1), defaultModule('condition', 2), defaultModule('review', 3)], [{kind: 'achievement_basis', moduleId: 'routine', basis: 'committed_today'}])},
  {id: 'ladder', name: '목표 사다리', summary: '연간 → 월간 → 주간 목표를 세우고, 매일 할 일이 그 사다리를 올라가요.',
    spec: spec('목표 사다리', 'teal', [defaultModule('goals', 0), defaultModule('tasks', 1), defaultModule('review', 2)])},
];
