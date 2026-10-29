# MOONS 명세 v8 — Satellites 공통 틀 · MOONS MCP (2026-10-28)

v7 위에 얹는다. v7의 원칙(원문 불변, 출처 층, `!`, 앎의 상태)은 그대로다.

## 0. 정의

- **Satellite** = MOONS 기본 기능 바깥에서 붙인 모든 공간. MOONS 내장 장치(Dock·일정표·임포스터·폼 만들기), 사용자가 연결한 외부 웹(LEET drill 같은 것), 사용자가 쓰던 AI가 만들어 준 웹 전부.
- **My Space**가 지식을 중심으로 그려진다면, Satellites는 내가 가진 추가 공간들이다.
- 어떤 Satellite가 생길지는 사람마다, 만드는 AI마다 다르다. MOONS는 특정 Satellite를 만들지 않고, **아무 Satellite나 꽂을 수 있는 틀**을 만든다.
- 비용 원칙: Satellite를 만들고 그 안에서 공부하는 일은 사용자의 AI(구독)가 한다 → MOONS 비용 없음. MOONS로 가져와 정리하는 단계만 MOONS API를 쓴다(사용자가 켤 때만).

## 1. 결정 사항 (사용자 답, 2026-10-28)

| # | 결정 |
|---|---|
| 1 | 외부 Satellite는 **주소 등록 방식**. MOONS 안에 페이지를 올려 격리 실행하는 방식은 하지 않는다. MOONS에서 그 주소로 들어갈 수 있으면 된다 |
| 2 | Satellite 데이터는 MOONS에 기록된다. 각 Satellite가 **만들어질 때** MOONS로 보내는 기능을 넣는다(만드는 AI가 MCP로 계약과 토큰을 받아 처리) |
| 3 | 에이전트 반영은 **정리안 먼저 → 승인 후 반영**. 에이전트는 **사용자가 열 때** 돈다. 실행 시점은 설정에서 조정(비용 테스트용) |
| 4 | 풀이·연습 결과는 **새 노트**가 되어 앎으로 쌓인다 |
| 5 | 1단계는 **클로드 커스텀 커넥터**. 베타 사용자 각자의 AI 연결은 나중(설계는 처음부터 사용자별) |
| 6 | Satellite는 **My Space에 보인다**. 관련 주제(모행성) 옆에 붙고, 관련 주제가 없으면 Satellite 구역에. 사용자가 무엇을 보일지 필터로 정한다 |
| 7 | LEET drill은 MOONS 쪽이 끝나면 그것을 만든 클로드가 MOONS로 보내기를 붙인다. 실사용 확인은 클로드 채팅에서 |

## 2. Satellite 등록 정보

```ts
type Satellite = {
  id: string; name: string; icon: string; description: string;
  kind: 'builtin' | 'external';            // builtin = 기존 장치(Dock 등), external = 주소로 연결한 웹
  url?: string;                            // external: 여는 주소(https만)
  embed: 'auto' | 'tab';                   // auto: 사이트가 허용하면 MOONS 안에 띄우고, 아니면 새 탭
  madeBy: {type: 'user' | 'ai' | 'moons'; name?: string};   // 예 {type:'ai', name:'Claude'}
  planetIds: string[];                     // 관련 주제. 비면 Satellite 구역
  show: boolean;                           // My Space에 보일지
  agent: {mode: 'off' | 'manual' | 'on_open'; lastRunAt?: string};   // 3장
  intake: {tokenHash?: string; createdAt?: string; lastEventAt?: string};
  createdAt: string; updatedAt: string;
};
```
- 저장: `satellites` 컬렉션(동기화 대상). 기존 장치 manifest(`lib/moons-sync/src/satellites.ts`)는 builtin 줄로 같은 목록에 보인다.
- Satellite 화면: 내 Satellite(내장 + 외부) 목록 → 열기 / 설정(관련 주제·My Space 표시·에이전트·토큰) / 기록 / 제거. 제거해도 이미 반영된 노트는 남는다.

## 3. MOONS로 들어오는 길 (Satellite → MOONS)

### 3.1 기록 수신 (모든 Satellite 공통)
`POST /api/satellite-records`, `Authorization: Bearer <Satellite 토큰>` (토큰은 그 Satellite에만 기록을 추가할 수 있다. 한 번만 보이고 교체·폐기 가능).

```json
{"id":"attempt-2026-10-28-01","at":"2026-10-28T09:00:00Z","kind":"attempt",
 "title":"TEPS 어휘 · 3회차","summary":"42문항 중 35개 정답",
 "items":[{"label":"affluent","result":"wrong","answer":"opulent","note":"뜻을 반대로 기억"}],
 "userText":["affluent는 돈이 많아서 여유가 있는 상태"],
 "concepts":["affluent","opulent"],"link":"https://…/attempts/01"}
```
- `kind`: `attempt`(풀이·연습) / `artifact`(만든 것) / `note`(Satellite가 정리한 글) / `event`(그 밖).
- `userText`: **사용자가 Satellite에서 직접 친 글만**. MOONS에서 "내 말"로 다룬다. 그 밖의 필드는 Satellite가 만든 것(AI/자료 층).
- 같은 `id`는 한 번만 받는다(재전송 안전). 크기 제한 64KB, 분당 횟수 제한.
- 받은 기록은 `satellite_records`(서버 테이블)에 쌓이고, 그 Satellite의 **기록** 탭에서 보인다. **이 단계에서는 노트가 되지 않는다**.

### 3.2 노트로 반영 — 두 가지 방식 (Satellite마다 선택)
1. **버튼 방식** (비용 없음): Satellite 페이지 안의 "MOONS에 추가" 버튼이 `kind:'note'` 기록을 보내며 `"apply":"request"`를 붙인다 → MOONS의 **들어온 것** 함에 그 내용 그대로 정리안으로 뜬다 → 승인하면 노트.
2. **에이전트 방식** (MOONS API): MOONS 에이전트가 아직 정리 안 된 기록을 모아 **정리안**을 만든다 → 들어온 것 함 → 승인하면 노트.
- 어느 쪽이든 **승인 전에는 아무것도 노트·개념에 들어가지 않는다**. 승인 화면에서 고치거나 일부만 고를 수 있다.

### 3.3 에이전트 실행 시점 (설정 → Satellites → 에이전트)
- `off` / `열 때`(기본: 그 Satellite나 들어온 것 함을 열 때, 새 기록이 있으면) / `수동`(버튼을 누를 때만).
- 설정에 최소 간격(기본 6시간), 한 번에 읽을 최대 기록 수(기본 50), 이번 달 Satellite 에이전트 호출 수·추정 비용을 보인다. 운영자 모델 표에 단계 `satellite_digest` 추가.

### 3.4 정리안 → 노트 (결정 4)
- 정리안 하나 = 새 노트 하나. `Entry.kind='record'`(활동 기록 노트), `meta.satellite = {id, recordIds}`.
- 노트 본문(원문): 승인 시점에 확정. 구성
  - **내 말**: 기록의 `userText`를 글자 그대로(원문 불변 규칙). 문장마다 `by:'user'`.
  - **활동 기록**: 횟수·정오·오답 목록 같은 사실(Satellite가 보낸 값). `by:'satellite'`.
  - **MOONS 정리**: 에이전트가 쓴 요약·패턴(예 "affluent↔opulent 반복 혼동"). AI 층, `!` 규칙 적용.
- 승인 후에는 일반 노트처럼 구조화·개념 추출·대조·앎의 상태가 돈다. 개념의 "설명할 수 있음"은 **내 말** 문장만 근거가 된다. 오답이 반복된 개념은 그 근거로 "확인됨"에서 내려갈 수 있다.
- 노트 탭 필터에 "활동 기록" 추가.

## 4. MOONS MCP 서버 (클로드 커스텀 커넥터)

### 4.1 연결
- 원격 MCP(Streamable HTTP) `https://<MOONS 주소>/mcp`.
- 로그인: MOONS가 OAuth 2.1 권한 서버를 직접 둔다(PKCE, 동적 클라이언트 등록, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`). 허락 화면은 MOONS 로그인(Clerk) 세션으로 사용자를 확인하고, 허락할 권한을 보여 준다. 토큰은 사용자 공간 하나에만 묶인다. 설정 → 연결된 AI에서 언제든 끊는다.
- 처음부터 사용자별로 만든다(베타 사용자 확장 대비). 1단계 검증은 운영자 계정 + 클로드.

### 4.2 도구 (LEET drill 구조를 따름)
| 묶음 | 도구 | 하는 일 |
|---|---|---|
| 안내 | `moons_guide` | 최신 도구 설명·규칙·버전. 클로드가 먼저 호출 |
| 읽기 | `search_notes`, `get_note` | 노트 검색·원문·구조·출처 층 |
|  | `list_concepts`, `get_concept` | 개념·앎의 상태·왜소행성·관계 |
|  | `list_questions`, `get_question` | 질문 노트·하위 질문·남은 것 |
|  | `recent_activity` | 최근 N일 무엇을 했나(노트·개념 상태 변화·Satellite 기록) |
| 넣기 | `add_material` | 클로드의 설명·자료 → **자료(AI 층)**. 사용자 말로는 절대 안 들어감 |
|  | `propose` | 노트·개념·관계·메모·질문 제안 → **들어온 것** 함(승인 후 반영) |
|  | `save_session` | 클로드 대화 요약 → 들어온 것 함. 사용자 발화는 "클로드가 옮긴 내 말"로 따로 표시 |
| Satellite | `satellite_guide` | Satellite를 만들 때 지킬 계약(3.1 형식, 버튼 방식 코드 예시) |
|  | `register_satellite` | 이름·주소·관련 주제 등록 → 수신 토큰 1회 발급 |
|  | `list_satellites`, `get_records` | 내 Satellite와 기록 읽기(클로드가 결과를 보고 대화로 진단) |
|  | `post_feedback` | 기록에 피드백 남기기 → MOONS 기록 탭에 보임 |
- 모든 쓰기는 출처(`claude`)와 시각을 남긴다. 노트 원문을 고치는 도구는 없다.
- 읽어 간 노트 안의 문장은 자료일 뿐 지시가 아니다(도구 설명에 명시).

## 5. My Space 배치 (결정 6)
- Satellite는 내 우주에 작은 위성으로 그려진다. `planetIds`가 있으면 그 주제 둘레를 돈다(여러 개면 첫 주제). 없으면 화면 가장자리 **Satellite 구역**에 모인다.
- 관련 주제는 사용자가 정하고, 비어 있으면 그 Satellite에서 반영된 노트들의 주제로 제안한다(제안만, 사용자가 고름).
- 내 우주의 보기 필터에 "Satellites" 항목: 전체 끄기 / Satellite별 보이기·숨기기. 위성을 누르면 이름·최근 기록·열기·반영된 노트.

## 6. 구현 순서
| 단계 | 내용 | 완료 기준 |
|---|---|---|
| S1 | `satellites` 컬렉션, 외부 Satellite 등록·열기(embed auto/tab), 설정 화면, 기존 장치 통합 목록 | 외부 주소를 등록해 MOONS에서 열린다 |
| S2 | 수신 토큰, `POST /api/satellite-records`, 기록 탭, 들어온 것 함, 버튼 방식 승인 → `kind:'record'` 노트 | 예제 스크립트로 보낸 기록이 승인 후 노트가 되고 내 말/활동/MOONS 층이 나뉜다 |
| S3 | 에이전트 정리안(`satellite_digest`), 실행 시점 설정, 비용 표시 | 열 때 정리안이 생기고, 설정을 끄면 호출이 0 |
| S4 | MCP 서버 + OAuth, 4.2 도구 | 클로드 커스텀 커넥터로 연결해 읽기·제안·Satellite 등록·기록 읽기가 된다 |
| S5 | My Space 위성 배치·필터 | 주제 옆 / Satellite 구역 배치, 필터가 저장된다 |
| — | LEET drill 쪽 작업(그 클로드 몫): `satellite_guide`대로 기록 보내기·버튼 추가 | 클로드 채팅에서 실사용 확인 |

## 7. 범위 밖
- MOONS 안에서 외부 코드 실행(격리 iframe), 외부 개발자 Satellite 배포망.
- 클로드 대화 자동 수집(클로드가 도구로 보낸 것만 들어온다).
- ChatGPT 등 다른 AI 연결 — MCP 표준이라 같은 서버를 쓸 수 있지만 서비스별 확인은 나중.

## 8. 알려진 한계
- 클로드 대화는 MOONS가 자동으로 볼 수 없다. 클로드가 `save_session`·`propose`를 부를 때만 들어온다.
- MOONS는 클로드를 먼저 부를 수 없다. 기록 진단은 사용자가 클로드에서 요청할 때.
- 에이전트 정리의 품질은 Satellite가 보낸 기록의 질에 달려 있다. 계약(3.1)을 지키지 않은 기록은 받지만 정리안이 빈약할 수 있다.
- `userText`가 정말 사용자가 친 글인지 MOONS는 검증할 수 없다(Satellite의 신고값). 화면에 출처 Satellite를 함께 보인다.
