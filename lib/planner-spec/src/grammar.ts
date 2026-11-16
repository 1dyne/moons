// lit grammar: the words lit gives users to build their own planner (docs/lit/STRUCTURE_v1.md §D).
// English is the canonical name — used in docs, by AI and (later) in the market; Korean is the screen translation.
// Each list of parts, property kinds, rules, signals and effects carries the same pair as `en` / `name`.
export const GRAMMAR = [
  // Store
  {id: 'database', en: 'Database', name: 'DB', desc: '항목을 모으는 곳. 모든 DB는 사용자 DB다 (하루 일과·목표도 기본으로 깔려 오는 DB)'},
  {id: 'item', en: 'Item', name: '항목', desc: 'DB의 한 줄'},
  {id: 'property', en: 'Property', name: '속성', desc: '항목의 칸 (숫자·선택·날짜…)'},
  {id: 'role', en: 'Property role', name: '속성 역할', desc: 'lit이 뜻을 아는 칸: 이름 · 날짜 · 시작 · 끝 · 달성 · 고정 일정. 계산과 자동화가 이 역할을 읽는다'},
  {id: 'relation', en: 'Relation', name: '연결', desc: '항목 → 다른 DB의 항목'},
  {id: 'formula', en: 'Formula', name: '계산 속성', desc: '다른 칸으로 만드는 값 (끝 − 시작, 소요 − 예상, 연결된 것 중 끝낸 비율)'},
  // Input
  {id: 'timestamp', en: 'Timestamp', name: '타임스탬프', desc: '누르면 지금 시각을 고른 칸에 (버튼 · 시작/끝 · 타이머 · 칸 칠하기)'},
  {id: 'part', en: 'Part', name: '부품', desc: '위젯을 이루는 조각 (입력 · 시간 · 계산 · 보기 · 꾸미기)'},
  // View
  {id: 'view', en: 'View', name: '보기', desc: '목록 · 표 · 카드 · 달력 · 시간축 · 10분 칸 · 차트'},
  {id: 'filter', en: 'Filter', name: '필터', desc: '보고 싶은 것만 (정렬 · 묶기 포함)'},
  {id: 'conditionalStyle', en: 'Conditional style', name: '조건부 모양', desc: '조건이 맞으면 이렇게 보인다 (회색 · 흐리게 · 숨김…), 미리보기로 고른다'},
  {id: 'aggregate', en: 'Aggregate', name: '집계', desc: '개수 · 합계 · 평균 · 최대 · 최소 · 연속 · 기록한 날 · 마지막 값'},
  // Automation
  {id: 'signal', en: 'Signal', name: '상황', desc: '이름 붙인 조건 (에너지 6 이하, 오늘 순집중 8시간…)'},
  {id: 'rule', en: 'Rule', name: '규칙', desc: '언제(Trigger) → 하면(Action)'},
  {id: 'openForm', en: 'Open form', name: '기록지 열기', desc: '규칙이 입력 양식을 띄우고, 저장하면 한 줄'},
  {id: 'overlap', en: 'Overlap check', name: '충돌 확인', desc: '시간이 겹치는 항목 찾기'},
  {id: 'effect', en: 'Effect', name: '움직임', desc: '반짝 · 흔들기 · 축하 화면…'},
  // Screen
  {id: 'widget', en: 'Widget', name: '위젯', desc: '부품을 담는 그릇. 사용자 데이터를 받는 창구'},
  {id: 'page', en: 'Page', name: '페이지', desc: '위젯을 놓는 탭'},
  {id: 'goTo', en: 'Go to', name: '이동', desc: '누르면 다른 페이지·위젯으로, 누른 항목을 들고'},
  {id: 'design', en: 'Design', name: '디자인', desc: '색 · 글꼴 · 모서리 · 밀도 / 개발자는 HTML · CSS · JS'},
  {id: 'template', en: 'Template', name: '템플릿', desc: 'DB + 위젯 + 규칙 + 배치를 묶은 것. 저장하고 나누고 (나중에) 사고판다'},
] as const;
export type GrammarId = (typeof GRAMMAR)[number]['id'];
/** "Timestamp (타임스탬프)" — the canonical name with its translation. */
export const grammarLabel = (id: GrammarId) => { const g = GRAMMAR.find(x => x.id === id)!; return `${g.en} (${g.name})`; };
