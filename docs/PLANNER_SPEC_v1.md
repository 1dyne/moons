# MOONS Planner Builder 명세 v1 — Satellite (2026-10-31)

사용자가 대화로 자기 플래너를 설계하고, 목업으로 확인하고, 승인하면 바로 매일 쓰는 플래너가 된다. 기록은 **생활 데이터 허브**에 쌓이고, MOONS·모의 우주·에너지긴축모드가 사용자가 허락한 만큼 읽는다.

- 기준 문서: 플래너 개발 핸드오프(2026-10-31), 모의 우주 플래너 연결 범위(2026-10-31), [MOONS 명세 v8](MOONS_SPEC_v8.md)
- 공통 데이터 계약: [LIFE_DATA_CONTRACT_v0](LIFE_DATA_CONTRACT_v0.md) — 모의 우주 담당에게 이 문서를 넘긴다.
- 이 문서는 설계다. 구현 완료를 뜻하지 않는다.

## 1. 결정 사항

| # | 결정 |
| --- | --- |
| 1 | 플래너는 MOONS 앱 안의 기능이 아니라 **Satellite 앱**이다. 새 앱 `artifacts/planner`, Railway 별도 서비스, **자기 주소를 가진 독립 웹**이다. 홈 화면에 설치해(PWA) 플래너 앱처럼 쓴다. 만들기 대화(스튜디오)도 이 앱 안에 있다. MOONS를 쓰지 않아도 플래너로 먼저 들어올 수 있다 |
| 2 | **계정 = MOONS 계정.** 구글 계정과 Gmail처럼, 계정 하나로 플래너·MOONS·모의 우주·에너지긴축모드를 각각 쓴다. 어떤 서비스를 쓰는지는 계정마다 다르다 |
| 3 | **생활 데이터 허브**는 api-server 안의 분리 모듈(`/life/v1`, 테이블 `life_*`)이다. MOONS 노트 코드·테이블과 섞지 않는다. 플래너의 저장소가 곧 허브다(플래너가 별도 DB를 두지 않는다 → 이중 저장 충돌 없음) |
| 4 | 에이전트는 **코드를 만들지 않는다.** PlannerSpec(JSON)을 만들고, 정해진 렌더러가 화면을 그린다. **목업과 실제 플래너는 같은 렌더러**다. "이대로 쓰기"를 누르면 예시 데이터만 빠진다 |
| 5 | **무코딩 경로가 먼저.** 코딩 에이전트(Claude Code·Codex) 경로는 같은 렌더러·허브 SDK를 키트로 주는 고급 옵션(P5) |
| 6 | **데일리가 입구.** 하루를 쓰고, 그 항목에서 관련 주간·월간·연간 목표와 프로젝트 대시보드로 올라간다. 노션처럼 하나의 DB를 보기로 가르지 않고, 항목이 목표·프로젝트에 **연결**되고 상위 화면이 그 연결을 집계한다 |
| 7 | 지금은 AI 사용 한도를 두지 않는다. 호출은 기존 `ai_calls` 원장에만 기록한다(수익화 때 한도 설계) |
| 8 | 종이 플래너 사진은 **구조만** 가져온다(칸·섹션·항목 종류). 적힌 내용은 옮기지 않는다 |
| 9 | 모의 우주는 플래너 데이터를 **실시간 RP 채팅의 소스**로 읽는다. 기본 연결은 `now` 조회(다음 채팅 턴에 최신 반영). 기상 감지·예약 알림처럼 채팅 없이 움직이는 기능을 위해 변경 알림을 **추가할 수 있게** 설계한다. 알림을 받았다고 매번 AI 응답을 만들지 않는다(계약 §6·§7) |
| 10 | 캐릭터: Planner Builder 화면에서 사용자와 대화하는 것은 **MOONS 달과 같은 모양의 베이지 달**이다(색만 다름, 외곽선 없음). MOONS 생태계의 Satellite라는 것이 모양으로 전해진다 (§9) |

## 2. 계정과 생태계

```
                 MOONS 계정 (Clerk, 하나의 인스턴스)
        ┌──────────────┬──────────────┬──────────────┐
     플래너(Satellite)   MOONS(지식)     모의 우주      에너지긴축모드
        │ 쓴다             │ 읽는다(선택)   │ 읽는다(선택)   │ 읽는다(선택)
        └──────────► 생활 데이터 허브 ◄──────┴──────────────┘
```

- **플래너만 쓰는 사람:** 플래너 주소로 들어와 "MOONS 계정으로 시작" → 계정이 생기고 플래너만 보인다. MOONS 지식 공간은 켜지 않으면 비어 있다.
- **MOONS도 쓰는 사람:** 같은 계정으로 MOONS에 들어가면 플래너가 Satellite 목록과 My Space에 위성으로 보인다.
- **모의 우주·에너지긴축모드:** "MOONS 계정으로 연결" → MOONS OAuth 2.1 허락 화면에서 읽을 항목·기간을 고른다(계약 §3). 각 서비스는 자기 계정을 따로 가져도 되고, MOONS 계정과는 OAuth로 연결한다. 클라이언트가 보낸 userId로 연결하지 않는다.
- 로그인: 플래너는 독립 주소라 MOONS와 세션을 공유하지 않아도 된다. 같은 Clerk 인스턴스로 MOONS 계정 또는 구글로 로그인한다(구글로 만들어도 MOONS 계정이다). 한 번 로그인하면 설치한 앱에서 계속 유지된다.
- 모의 우주는 MOONS·구글 로그인을 모두 받는다. 구글로 들어온 사용자도 플래너 데이터를 읽으려면 "MOONS 계정 연결"(OAuth 허락)을 한 번 거친다. MOONS로 로그인한 사용자는 로그인과 연결 허락을 한 화면에서 끝낸다.

## 3. 사용자 흐름

1. **시작** — 플래너 첫 화면. 베이지 달과 말풍선("어떤 하루를 관리하고 싶어요?"), Dump와 같은 입력칸. 아래에 첨부(종이 사진·노션)와 빠른 칩(데일리·주간·월간·연간·루틴·시간표·프로젝트).
2. **구체화** — 한 번에 질문 2~3개, 답은 칩 또는 직접 입력. 예: 루틴 → "목적이 습관 만들기 / 컨디션 관리 / 시간 확보 중 어디에 가까워요?"
3. **제안 카드** — "이렇게 만들어 볼게요". 모듈 목록에서 사용자가 말한 것과 **MOONS 제안**을 구분하고, 제안마다 이유 한 줄과 켜기/끄기.
4. **목업** — 데스크톱은 오른쪽 패널, 모바일은 아래 시트. 예시 데이터가 들어간 실제 렌더러 화면. 일·주·월·연 탭, 데일리 항목에서 목표·프로젝트로 들어가 보기. 요소를 누르고 "이거 빼 줘"라고 말하면 그 부분만 패치.
5. **승인** — "이대로 쓰기" → 시작 설정: 시작 날짜, 타임존·하루 경계(기본 04:00), 첫 목표 입력(선택), 공유 대상(MOONS·모의 우주·에너지긴축모드, 기본 꺼짐).
6. **매일 사용** — 데일리 화면이 첫 화면. 홈 화면 추가(PWA). 이 단계에서는 AI 호출 0.
7. **고치기** — "플래너 고치기" → 지금 Spec으로 대화를 이어간다. Spec에 버전이 붙고 기록은 그대로다.
8. **(P5) 코딩 에이전트로 꾸미기** — 키트·MCP로 Claude Code·Codex에 넘긴다. 데이터는 같은 허브.

## 4. 세 층

| 층 | 누가 만드나 | 바뀌면 |
| --- | --- | --- |
| 데이터(허브) | 고정 계약 | 계약 버전으로만 |
| PlannerSpec | 스튜디오 에이전트 + 사용자 | 버전이 오른다. 데이터는 그대로 |
| 렌더러 | 고정 코드(검증된 컴포넌트) | 앱 배포 |

이름을 바꿔도 연결이 끊기지 않는 이유: Spec의 필드는 사용자 이름(`label`) 아래에 **고정 의미(`semantic`)**를 가진다. "마친 날" → `outcome.completedAt`, "집중량" → `outcome.amount`+`unit`. 사용자 추가 속성은 `ext.<fieldId>`에 저장되고, 공통 의미에는 들어가지 않는다.

### 4.1 PlannerSpec (초안)

```ts
type PlannerSpec = {
  specVersion: 1;
  id: string; version: number; name: string;
  theme: {accent: ChipColor; density: 'comfortable' | 'compact'};
  entry: 'day';                                    // 결정 6: 데일리가 입구
  periods: ('day' | 'week' | 'month' | 'year')[];
  modules: ModuleSpec[];
  dashboards: DashboardSpec[];                     // 목표·프로젝트·기간 대시보드
  rules: RuleSpec[];                               // 하루 경계, 달성률 기준 등 사용자 규칙
  source?: {kind: 'chat' | 'paper' | 'notion' | 'template'; ref?: string};
};
type ModuleSpec = {
  id: string; type: ModuleType; label: string;
  placement: {period: 'day' | 'week' | 'month' | 'year'; section: string; order: number};
  view: 'list' | 'checklist' | 'timeline' | 'calendar' | 'kanban' | 'grid' | 'meter';
  options: Record<string, unknown>;                // 모듈별 스키마로 검증
  fields: {fieldId: string; label: string; semantic?: SemanticField; type: FieldType; hidden?: boolean; private?: boolean}[];
};
type ModuleType = 'tasks' | 'routine' | 'timeblock' | 'goals' | 'projects' | 'sleep' | 'condition' | 'review' | 'metric' | 'memo';
type DashboardSpec = {id: string; kind: 'goal' | 'project' | 'period'; widgets: ('progress' | 'linked_items' | 'streak' | 'trend' | 'history')[]};
type RuleSpec =
  | {kind: 'day_boundary'; at: string}                                   // '04:00'
  | {kind: 'achievement_basis'; moduleId: string; basis: 'all_defined' | 'committed_today'}
  | {kind: 'carry_over'; moduleId: string; mode: 'ask' | 'auto' | 'never'};
```

- Spec은 zod 스키마로 검증한다. 렌더러가 모르는 모듈·옵션은 거절한다(임의 코드·수식 실행 없음).
- 공통 의미 필드 목록은 계약 §4를 따른다.

### 4.2 렌더러 모듈

| 모듈 | 데일리에서 | 상위로 |
| --- | --- | --- |
| tasks | 오늘 할 일, 필수·희망·여가, 계획/결과 분리 | 연결된 목표·프로젝트 대시보드 |
| routine | 반복 정의 + 오늘 인스턴스. `committed_today`면 오늘 고른 것만 달성률 분모 | 주·월 달성률, 사유 모음 |
| timeblock | 시간표(계획 블록·실제 블록) | 주간 시간 사용 |
| goals | 오늘 항목에 연결된 목표 칩 | 연간→월간→주간 목표 트리, 누적 실적 |
| projects | 프로젝트 칩 | 프로젝트 대시보드(진행·관련 항목·이력) |
| sleep / condition | 선택 모듈. 미사용은 `unset` | 추이 |
| review | 하루 마무리(공유 가능/사적 구분) | 월간 검토 묶음 |
| metric | 목표량·실제량·단위(30분, 3세트, 20문제) | 집계 |
| memo | 자유 메모(기본 사적) | — |

## 5. 스튜디오 에이전트

### 5.1 흐름

```
입력(말·첨부) → intake: 의도 분류·템플릿 매칭 → clarify: 카탈로그 질문 고르기
→ propose: 요청 모듈 + 제안 모듈(이유) → compose: Spec 초안 → 목업(렌더러, AI 0회)
→ 수정 요청 → patch: JSON Patch → 검증 → 다시 그림 → 승인 → 게시(버전)
```

### 5.2 모듈 카탈로그 — "생각 못 한 기능"을 제안하는 근거

제안은 LLM이 즉흥으로 떠올리지 않고, 카탈로그에 미리 쓴다. 모듈마다:

```ts
type CatalogEntry = {
  type: ModuleType;
  triggers: string[];                       // '루틴', '습관', 'routine', '체크' …
  deepen: {id: string; question: string; choices: string[]}[];   // 구체화 질문
  variants: {id: string; when: string; options: Record<string, unknown>; rules?: RuleSpec[]}[];
  companions: {type: ModuleType; why: string}[];                 // 함께 쓰면 좋은 것
};
```

예 — `routine`:
- deepen: 목적(습관 만들기·컨디션·시간 확보), 매일 같은가(고정/날마다 고름), 못 했을 때 기록할 것(사유/없음).
- variants: `fixed_all`(정의된 루틴 전부 체크), **`pick_daily`(오늘 할 루틴을 먼저 고르고, 고른 것만 달성률)** → `achievement_basis: committed_today`.
- companions: 못 한 사유(review), 주간 달성률(dashboard), 수면·컨디션(목적이 컨디션일 때).

LLM의 역할은 카탈로그에서 **고르고**, 사용자 말에 맞게 **문장을 다듬고**, 옵션 값을 **채우는** 것이다.

### 5.3 모델 단계 (기존 `catalog.ts`·운영자 모델 표에 추가)

| 단계 | 작업 | tier |
| --- | --- | --- |
| `planner_intake` | 의도 분류·질문 선택·문장 | fast |
| `planner_compose` | Spec 초안·패치 | 기본(필요 시 상위) |
| `planner_import` | 종이 사진 구조 추출(이미지 1회), 애매한 노션 속성 매핑 | 기본 |

### 5.4 비용 설계

1. 출력은 Spec JSON, 수정은 JSON Patch(RFC 6902) — 출력 토큰 최소.
2. 흔한 요청은 템플릿 매칭으로 시작 → intake 1회로 끝나는 경우가 많다.
3. 카탈로그·스키마·규칙은 고정 앞부분 → 프롬프트 캐싱.
4. 구조화 출력(JSON schema) + 검증기, 실패 시 1회만 수리 → 재시도 낭비 방지.
5. 목업·게시·매일 사용·허브·스냅샷은 AI 0회.
6. 종이 사진은 축소 후 1회, 구조만. 노션은 속성 스키마를 규칙으로 매핑하고 애매한 것만 AI.
7. 빠른 입력("내일 3시 운동 30분")은 로컬 파서 먼저, 실패할 때만 AI + 사용자 확인.
8. 모의 우주 쪽 모델 입력을 줄이도록 허브가 `now` 스냅샷을 짧고 결정적으로 만든다(계약 §6).

## 6. 가져오기

| 출처 | 단계 | 방식 |
| --- | --- | --- |
| 종이 사진 | P4 | 이미지 1회 → 섹션·칸·항목 종류 → Spec 초안 → 사용자 확인 |
| 노션 | P4 | 플래너 앱의 노션 OAuth → DB 속성 스키마 읽기 → 공통 의미 매핑(규칙 먼저) → 미리보기 → (선택) 기간 지정 기록 가져오기 |
| 옵시디언 | 이후 | frontmatter·Tasks 문법(`📅` `✅`)·Dataview 필드 규칙 파서 |
| CSV·시트 | 이후 | 헤더 → 의미 매핑(노션과 같은 경로) |

가져온 기록은 `source.kind='import:notion'` 등으로 출처를 남긴다. 다른 원본에서 복사된 같은 과업은 자동 병합하지 않고 사용자 확인으로 연결한다.

## 7. MOONS 연동

- MOONS를 켠 사용자에게 플래너는 Satellite 목록·My Space의 위성으로 보인다(v8 §2·§5).
- 플래너 → MOONS 노트는 v8 버튼 방식: 하루 회고 등에서 "MOONS에 추가" → `satellite-records` `apply:"request"` → 들어온 것 함 → 승인. 일정·체크 자체는 노트가 되지 않는다.
- MOONS는 허브의 소비자 중 하나다. 기존 Schedule 장치(`lib/planner.ts`)는 그대로 두고, 이관 여부는 P4 이후 정한다.

## 8. 앱 구성

| 위치 | 내용 |
| --- | --- |
| `artifacts/planner` | 새 Vite 앱: 스튜디오, 렌더러, 데일리·상위 화면, 설정. Railway 별도 서비스 |
| `lib/planner-spec` | PlannerSpec 타입·zod·카탈로그·패치 적용(앱·서버 공용, 키트로도 배포) |
| `lib/life-contract` | 계약 타입·zod·합성 예시(모의 우주에 넘길 수 있게 독립) |
| `artifacts/api-server/src/life/` | 허브 API `/life/v1`, 스튜디오 API `/planner/v1`, 테이블 `life_*`. MOONS 노트 코드와 분리 |
| MOONS OAuth | 기존 OAuth 2.1 서버에 `life.*` 범위와 서비스별 허락 화면 추가 |

## 9. 화면과 캐릭터

컬러칩: 하늘 `#8aaaf8` · 파랑 `#3a66b8` · 베이지 `#efe2d6` · 청록 `#00838f` · 초록 `#2f9585` · `#3f9a8a` · 노랑 `#fbe4b0` · 빨강 `#b05a57`.

- **대화 캐릭터 = 베이지 달.** Planner Builder 화면에서 질문하고 제안하는 캐릭터. `MoonCharacter`(`Brand.tsx`)와 같은 원형·눈·시선·깜빡임에 색만 바꾼다(`artifacts/planner/src/Moon.tsx`). 몸 `#efe2d6`(컬러칩 베이지), 그림자 초승달 `#d8c3aa`.
- **외곽선 없음.** 흰 바탕에서 옅은 베이지의 형태는 그림자 초승달이 잡아 준다.
- 말풍선·입력칸은 MOONS Dump(`Speech`)와 같은 형태. 대화가 시작되면 Claude 채팅처럼 대화(왼쪽)·목업(오른쪽, 모바일은 아래 시트)으로 나뉜다.
- 바탕은 흰색. 플래너 강조색은 Spec `theme.accent`로 컬러칩 중에서 고른다.

## 10. 단계와 완료 기준

| 단계 | 범위 | 완료 기준 |
| --- | --- | --- |
| P0 | 이 문서, 계약 v0, 합성 예시 | 모의 우주 담당이 계약으로 수신 경로를 병렬 구현할 수 있다 |
| P1 | 허브(쓰기·조회·변경·삭제 표시·revision), 데일리·월간·목표 연결, 렌더러 기본 모듈, 템플릿 Spec 2~3개 | 계약 없이 쓰던 사람처럼 데일리를 쓰고 목표 대시보드로 올라간다. 기록이 안정 ID·revision으로 쌓인다 |
| P2 | 스튜디오 AI 단계(자유 대화·패치·종이 사진), 베이지 달 | 대화만으로 루틴 `pick_daily` 플래너를 만들어 그날부터 쓴다 |
| P3 | `life.*` OAuth 범위·허락 화면, `now`, `changes`, 연결 상태. 변경 알림은 모의 우주가 이벤트를 정한 뒤 추가 | **실제 모의 우주와 연결 검증**(합성 예시만으로는 완료 아님). 끊기·재연결·삭제·정정이 중복 반영되지 않는다 |
| P4 | 주간·연간·프로젝트 대시보드, 종이 사진·노션 가져오기 | 노션 ↔ 플래너 같은 합성 기록이 같은 의미로 변환된다 |
| P5 | 코딩 에이전트 경로: 키트(npm), MCP `planner_guide`·`get_planner_spec`·`save_planner_spec` | Claude Code에서 키트로 꾸민 플래너가 같은 허브에 쓴다 |

## 11. 열린 질문

- (해결) 도메인: 독립 주소 + PWA. 로그인: MOONS·구글. 최신성: `now` 기본, 변경 알림은 확장. 캐릭터: 대화하는 베이지 달.
- 계약 §9의 항목은 모의 우주 담당과 확정한다.
