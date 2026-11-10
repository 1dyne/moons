# lit 구조

## 1. 화면

```
┌ 머리: 달 · lit · 플래너 이름 ············ [꾸미기] [≡] ┐
│ 탭: 오늘 · 주간 · 월·년 · 목표 · 분석 · (내 페이지…) · ＋ │
│                                                     │
│   오늘 페이지 = 사용자가 놓은 위젯들                     │
│   (쓰는 화면에서는 위젯이 내용만큼 자라고 접기 토글 가능)   │
└─────────────────────────────────────────────────────┘
≡ 메뉴(오른쪽 서랍): 내 라이브러리 · 위젯 만들기 · 설치한 위젯 · 개발자 · 설정
```

| 화면 | 파일 |
| --- | --- |
| 첫 시작(빈 노트 / 예시 플래너), 예시 틀 고르기 | `screens/Builder.tsx` |
| 탭과 탭 관리(추가·이름·순서·복제·삭제) | `screens/PlannerView.tsx` |
| 하루 페이지, 위젯 배치·자동 맞춤·접기 | `screens/DayPage.tsx`, `screens/Canvas.tsx` |
| 꾸미기(3단: 위젯 목록 · 페이지 · 설정) | `screens/Editor.tsx` |
| 할 일·루틴·수면·회고·속성 | `screens/Today.tsx`, `screens/Table.tsx` |
| 집중 타이머(멈출 때 컨디션 1~10 + 메모) | `screens/Focus.tsx` |
| 주간 / 월·년 / 목표 / 분석 | `Week.tsx`, `Month.tsx`, `Goals.tsx`·`GoalPlan.tsx`, `Insights.tsx` |
| 메뉴 서랍 | `screens/Menu.tsx` |
| 내 위젯(블록·코드) | `screens/CustomWidget.tsx` |
| 진행률 계기판(6가지 모양) | `Gauge.tsx` |
| 안내 문구(기본 숨김) | `Tip.tsx` |

## 2. 데이터는 세 갈래

| 무엇 | 저장 | 바뀔 때 |
| --- | --- | --- |
| **기록** (할 일, 목표, 루틴, 세션, 수면, 컨디션, 회고, 페르소나, 메모·표의 줄) | `life_records` + `life_revisions` (계정별 revision, 지워도 흔적) | 체크·입력할 때마다 |
| **플래너 스펙** (위젯 배치, 스킨, 탭, 할 일 속성, 레이아웃) | `planner_specs` (버전이 쌓임) | 꾸미기·탭·속성을 바꿀 때 새 버전. 기록은 그대로 |
| **내 라이브러리** (저장한 위젯, 페이지 틀, 스킨, 내 위젯 설명서) | `lit_library` | 저장·승인·켜고 끌 때. 플래너 버전과 무관 |

- 진행률·월·년 요약은 저장하지 않고 화면을 열 때 기록으로 계산한다(`life-contract/insights.ts`). 체크를 고치면 바로 반영된다.
- 표 위젯과 내 위젯의 줄은 `note` 기록(`signifier: 'row'`, `table` = 위젯 id, `cells`).
- 할 일 속성 값은 `task.props[속성 id]`, 형광펜은 `task.highlight`.
- **자동 기록 표:** 표 위젯 `options.autoLog` = `sessions`(타이머를 멈추면 한 줄, 컨디션을 매기면 같은 줄 갱신) · `achievements`(목표 이룸 → 성취 기록지) · `adjustments`(포기 → 조정 기록지). 서버가 기록을 쓸 때 채운다(`life/autolog.ts`). 열은 이름으로 맞춘다(날짜·할 일·페르소나·시작·끝·분·시간·컨디션·메모·목표 / 목표·완료일·실제 시간(분)·임팩트·ROI·다음엔 누가 / 목표·날짜·메모·상태) + 할 일 속성 이름(Role 등). 숨은 칸 `__src`로 같은 원본의 줄을 갱신한다.
- **집중 가능 시간:** `life_accounts.availability` (요일별 분 + 날짜 예외). `goalSchedule(records, today, weekly, perDay)`가 하루 용량으로 쓴다.
- **목표 회고:** `goal.retro` {kind achieved/dropped, actualMin(집중 합산), impact 1~10, roi = impact ÷ 시간, nextOwner 나/AI/외주, note}, `goal.personaIds`.
- **페르소나:** `persona.roles`(페르소나 → 역할 2단), `persona.months['YYYY-MM']` {status deployed/attached/standby, priority}. 할 일 속성 type `role`은 페르소나별 역할에서 고른다(선택지 100개까지).
- **하고 싶은 일(want):** 회색, 달성률·미션의 "일정 전부"에서 빠진다.

## 3. 목표와 데일리 연결

1. 할 일을 추가할 때 목표를 고른다(제목으로 자동 추천). 목표는 연간 → 마일스톤(끝낼 달) → 할 일.
2. 진행률 `goalPercent`: 이뤘어요=100% → 목표량이 있으면 양 기준 → 아래 마일스톤이 있으면 무게 평균 → 이어진 할 일 끝낸 비율(이뤘어요 전 최대 90%).
3. 마일스톤 예상 시간 + 최근 4주 실제 집중 시간 → 가능한 날짜와 병목 달(`goalSchedule`).

## 4. API (`/api/life/v1`, 같은 출처 세션)

| 메서드·경로 | 용도 |
| --- | --- |
| `GET/PUT /settings` | 시간대, 하루 경계 |
| `GET/PUT /spec` | 플래너 스펙 (PUT = 새 버전) |
| `GET/POST /items`, `PUT/DELETE /items/:id`, `GET /items/:id/history`, `GET /changes` | 기록 읽기·쓰기 (낙관적 잠금 `baseRevision`, 오프라인 큐) |
| `GET /now` | 지금 상태 요약 (ETag) |
| `POST /ai/goal` | 목표 구체화 질문 → 마일스톤 (AI 키 없으면 503) |
| `GET/POST /library`, `PATCH/DELETE /library/:id` | 내 라이브러리 (PATCH: `enabled`, `approve`, `name`) |
| `GET/POST /dev/tokens`, `DELETE /dev/tokens/:id` | 개발자 토큰 (만들 때 한 번만 보여 줌) |
| `POST /dev/widgets` | CLI가 위젯 올리기 (`Authorization: Bearer litdev_…`). 자동 승인 없음 |

## 5. 계정

- 로그인은 Clerk(MOONS 계정, 구글 가능). 로그인하지 않으면 그 브라우저 쿠키의 손님 공간을 쓴다(기기 사이에 안 이어짐).
- 계정과 기록은 MOONS와 같은 Postgres(`MOONS_DATABASE_URL`)에 있지만 테이블은 따로다.
- 커넥터(OAuth)로 Claude가 쓰는 공간 = 로그인한 계정의 공간. 브라우저에서 같은 계정으로 로그인해야 같은 플래너를 본다.

## 6. 커넥터 (Claude)

`/lit/mcp`(lit 전용, 다이어리 도구만) · `/mcp`(MOONS 통합). 같은 OAuth.

| 도구 | 하는 일 |
| --- | --- |
| `planner_guide` | 만드는 순서, 위젯·스킨·글꼴·블록 목록, 규칙 |
| `get_planner` | 지금 플래너(위젯, 스킨, 탭, 속성, 표) |
| `build_planner` | 위젯 배치·스킨·탭·할 일 속성으로 새 버전 |
| `add_goal_plan` | 큰 목표 + 마일스톤 + 첫 할 일, 가능한 날짜·병목 |
| `add_items` | 할 일(속성 포함)·루틴·페르소나·표의 줄 |
| `get_today` | 오늘 상태 |
| `create_widget` | 위젯 설명서를 라이브러리에 (원하면 오늘 페이지에 붙임). 코드는 사용자 승인 후 실행 |
| `list_widgets` | 라이브러리 목록 |
| `set_availability` | 요일별 집중 가능 시간 + 날짜 예외. 목표 일정·병목 계산이 이 값을 씀 |
| `list_tasks` · `update_task` · `delete_task` | 할 일 읽기, 고치기(날짜 옮기기·결과·속성), 지우기 |
| `list_rows` · `update_row` · `delete_row` | 표의 줄 읽기(열 값 조건·날짜), 고치기(열 이름으로), 지우기 |
| `list_sessions` | 집중 세션(시작·끝·분·컨디션·메모·할 일 속성) |
| `update_goal` | 목표 이룸(성취 기록지: 실제 시간·임팩트·ROI·다음엔 누가)·포기(조정 기록지)·다시 목표로 |
| `set_persona` | 페르소나 월별 상태(Deployed/Attached/Standby)·우선순위·역할, 한도 경고 |
| `get_insights` | 분석 요약: 달성률, 순집중, 컨디션·수면, 시간대별 에너지, 페르소나 비중·배치, 목표 가능 날짜·병목 |

## 7. 스타일 (계기판)

회색 판, 검정 선, IBM Plex Sans KR + Plex Mono 숫자, 모서리 0, 신호색은 달 노랑 하나. 스킨이 CSS 변수(`--bg --surface --ink --accent --radius --font`)로 덮어쓴다. 코드 위젯에는 같은 값이 `--lit-*` 변수로 들어간다.
