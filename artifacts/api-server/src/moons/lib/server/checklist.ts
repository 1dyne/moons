// Grounding for payment/security comments. The model may only raise a payment or
// security "misunderstanding" that maps to one of these ids. Needs review by a teammate
// who has shipped payments before the event.
export const checklist = [
  {id: 'confirm', title: '결제 완료는 서버에서 확정', note: '성공 페이지로 돌아왔다고 결제가 끝난 것이 아니다. 토스페이먼츠 등은 서버에서 승인 API를 호출해야 결제가 확정된다.'},
  {id: 'amount', title: '금액은 서버가 검증', note: '프론트가 보낸 금액을 믿지 않고, 서버의 주문 금액과 대조해야 한다.'},
  {id: 'secret', title: '시크릿 키 위치', note: 'env에 넣어도 NEXT_PUBLIC_ 같은 공개 접두사가 붙거나 프론트 코드에서 읽으면 브라우저에 노출된다. 시크릿 키는 서버에서만.'},
  {id: 'webhook', title: '웹훅', note: '사용자가 창을 닫거나 가상계좌 입금처럼 페이지 밖에서 결제 상태가 바뀔 때 웹훅으로 받는다. 출처 검증이 필요하다.'},
  {id: 'idempotent', title: '중복 처리', note: '같은 주문이 두 번 처리될 수 있다. 고유 주문번호와 상태 확인으로 막는다.'},
  {id: 'live', title: '테스트 키와 라이브 키', note: '테스트에서 된다고 실결제가 되는 것이 아니다. 라이브 결제는 PG 계약과 심사가 필요하다.'},
  {id: 'card', title: '카드 정보', note: '카드 정보를 직접 받거나 저장하지 않고 PG 결제창을 쓴다.'},
  {id: 'refund', title: '취소와 환불', note: '결제만 만들고 취소 흐름이 없으면 운영에서 막힌다. 주문 상태에 취소를 포함한다.'},
  {id: 'rls', title: 'Supabase anon key와 RLS', note: 'anon key는 공개돼도 되도록 설계됐지만, RLS가 꺼져 있으면 누구나 테이블을 읽고 쓸 수 있다.'},
  {id: 'service-key', title: '서버 전용 키', note: 'service role key 같은 관리자 키는 RLS를 무시하므로 절대 프론트에 두지 않는다.'},
  // Brain-scan questions (concept and trivia). Common misconceptions the scan may point at.
  {id: 'sky', title: '하늘이 파란 이유', note: '햇빛이 공기 분자에 부딪히면 파장이 짧은 파란빛이 더 많이 흩어진다(레일리 산란). 바다를 비춰서 파란 것이 아니다.'},
  {id: 'season', title: '계절이 바뀌는 이유', note: '지구 자전축이 약 23.5도 기울어 있어 햇빛이 드는 각도와 낮의 길이가 달라진다. 태양과의 거리 때문이 아니다. 북반구 여름에 지구는 오히려 태양에서 조금 더 멀다.'},
  {id: 'lift', title: '비행기가 뜨는 이유', note: '날개가 공기를 아래로 밀어내고 날개 위아래에 압력 차가 생겨 양력이 생긴다. 엔진이 위로 밀어 올리는 것이 아니다. 위아래 공기가 끝에서 동시에 만나야 해서 위쪽이 빨라진다는 설명은 흔한 오해다.'},
  {id: 'moon-face', title: '달이 같은 면만 보이는 이유', note: '달의 자전 주기와 공전 주기가 같아서다(조석 고정). 달이 자전하지 않아서가 아니다.'},
  {id: 'llm', title: 'LLM이 다음 말을 고르는 방식', note: '학습한 패턴으로 다음 토큰이 올 확률을 계산해 고른다. 정답이 저장된 데이터베이스에서 꺼내오거나 매번 인터넷을 검색하는 것이 기본 동작은 아니다.'},
  {id: 'api', title: 'API', note: '프로그램끼리 정해진 약속(요청과 응답의 형식)으로 기능이나 데이터를 주고받는 창구다. 웹 서버만 API인 것은 아니다.'},
] as const;

export const checklistIds = checklist.map(c => c.id);
export const checklistText = checklist.map(c => `- ${c.id}: ${c.title}. ${c.note}`).join('\n');
