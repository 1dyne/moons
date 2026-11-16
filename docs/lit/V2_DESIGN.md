# lit v2 데이터 구조 설계 · 작업 순서 (초안, 2026-11-16)

> 기준: [STRUCTURE_v1](STRUCTURE_v1.md). 승인 전 초안이다. 코드는 아직 없다.
> 결정: 기존 플래너의 기록(할 일 69개 등)은 지워도 된다 → **옮기기(마이그레이션) 없이 빈 상태에서 시작**한다.

---

## 1. 큰 그림

```
┌──────────────── 데이터 층 (Workspace) ── 화면과 따로, 버전 없이 항상 최신 ────────────────┐
│  Database 정의   Item(항목)   Rule(규칙)   Signal(상황)                                    │
│  └ Property(속성) · Property role(속성 역할) · Relation(연결) · Formula(계산 속성)          │
└───────────────────────────────────────────────────────────────────────────────────────┘
          ▲ 읽기·쓰기 (같은 엔진: 화면 · 서버 · Claude)
┌──────────────── 화면 층 (Planner) ── 버전이 쌓임 ───────────────────────────────────────────┐
│  Page(페이지) → Widget(위젯) → Part(부품) · View(보기: Filter · Sort · Group · Conditional style) │
│  Design(스킨 · 위젯 꾸밈 · 코드)                                                            │
└───────────────────────────────────────────────────────────────────────────────────────┘
          ▲ 묶어서 설치
       Template(템플릿) = Database 정의 + Rule + Signal + Page 묶음
```

**원칙**
1. **데이터 정의는 화면 안에 넣지 않는다.** 지금은 DB 정의가 플래너 스펙 안(`spec.logic`)에 있어서, 화면을 고치면 DB도 새 버전이 된다. v2에서는 DB·규칙·상황이 따로 있고, 화면은 그걸 가리키기만 한다. 위젯을 지워도 DB는 남는다(노션에서 링크드 뷰를 지워도 DB가 남는 것처럼).
2. **항목은 한 가지 모양뿐이다.** 할 일·목표·운동 세트·에너지 기록이 모두 `item`이다. 지금의 전용 종류 11가지(task · goal · routine · session · sleep · condition …)는 v2에서 쓰지 않는다.
3. **lit이 뜻을 아는 것은 속성 역할 6개 + 달성 단계의 뜻 3개뿐이다.** 나머지 이름·선택지·문구는 전부 사용자 것이다.
4. **이름이 아니라 id로 잇는다.** DB·속성·선택지·항목 모두 id가 있다. 사용자가 이름을 바꿔도 연결·필터·규칙·계산이 깨지지 않는다.

---

## 2. 데이터 층

저장은 지금의 기록 저장소(`life_records`)를 그대로 쓴다. 변경 이력, 오프라인 동기화, 낙관적 잠금, 계정 분리가 공짜로 따라온다. 새 종류(kind) 4개만 더한다.

| kind | 한 줄 | 개수 (예) |
|---|---|---|
| `database` | DB 정의 하나 | 수십 개 |
| `item` | 항목 하나 | 수천 개 |
| `rule` | 규칙 하나 | 수십 개 |
| `signal` | 이름 붙인 상황 하나 | 수십 개 |

### 2-1. Database (DB)

```jsonc
{
  "kind": "database",
  "body": {
    "name": "하루 일과",            // 사용자 이름. 언제든 바꿈
    "icon": "check",
    "desc": "하루에 할 일과 고정 일정",   // 사람과 AI가 이 DB를 이해하는 한 줄
    "properties": [ /* 2-2 */ ],
    "focus": true,                  // 이 DB의 시작~끝 시간을 '순집중'에 더한다 (수면 DB는 false)
    "from": {"template": "lit.daily", "version": 1}   // 템플릿에서 왔으면 (선택)
  }
}
```

### 2-2. Property (속성)

```jsonc
{
  "id": "p_7k2",                    // 바뀌지 않음
  "name": "상태",                    // 사용자 이름
  "kind": "select",                 // 아래 종류 표
  "role": "done",                   // 속성 역할 (선택, 2-3)
  "desc": "체크 칸으로 바뀌는 결과",
  "options": [                      // select · multi 일 때
    {"id": "o_1", "name": "할 일", "color": "gray",  "meaning": "open"},
    {"id": "o_2", "name": "한 일", "color": "green", "meaning": "done"},
    {"id": "o_3", "name": "일부", "color": "amber", "meaning": "open"},
    {"id": "o_4", "name": "취소", "color": "red",   "meaning": "skip"}
  ],
  "unit": "",
  "relation": null,                 // relation 일 때 {"db": "<DB id>", "many": true}
  "formula": null                   // formula 일 때 (2-5)
}
```

**속성 종류 (Property kind)**

| kind | English | 한국어 | 값 |
|---|---|---|---|
| `title` | Title | 이름 | 글 (DB마다 하나, 항상 있음) |
| `text` · `longtext` | Text · Long text | 짧은 글 · 긴 글 | 글 |
| `number` · `rating` | Number · Rating | 숫자 · 점수 | 숫자 (점수는 1~N) |
| `select` · `multi` | Select · Multi-select | 선택 · 여러 개 선택 | 선택지 id / id 목록 |
| `checkbox` | Checkbox | 체크 | 참·거짓 |
| `date` | Date | 날짜 | `YYYY-MM-DD` (하루 경계 기준 하루) |
| `datetime` | Date & time | 시각 | 시간대가 있는 순간 |
| `duration` | Duration | 걸린 시간 | 분 |
| `relation` | Relation | 연결 | 항목 id 목록 |
| `signal` | Signal | 상황 | 상황 하나 (소원의 여는 조건처럼) |
| `formula` | Formula | 계산 속성 | 저장 안 함, 계산 |

### 2-3. Property role (속성 역할) — lit이 뜻을 아는 칸

| role | English | 붙일 수 있는 종류 | lit이 이걸로 하는 것 |
|---|---|---|---|
| `title` | Title | title | 목록·카드·알림의 `{이름}` |
| `day` | Date | date | 이 항목이 **어느 날**의 것인지: 오늘 보기, 미루기, 달력 |
| `start` | Start | datetime | Timestamp가 쓰는 곳, 타임테이블·시간축, 충돌 확인 |
| `end` | End | datetime | 〃 |
| `done` | Done | select · checkbox | 체크 목록의 체크, 진행률·달성률, "다 끝내기" 상황 |
| `fixed` | Fixed | checkbox | 가용 시간에서 빼는 고정 일정, 충돌 확인 |

- 한 DB에 역할마다 속성 하나까지. 역할은 **어느 DB에나** 붙일 수 있다(운동 세트에 start·end를 붙이면 타임테이블에 칠해진다).
- **달성 단계의 뜻(meaning):** `done` 역할이 select면 선택지마다 `done`(끝냄) · `open`(안 끝냄) · `skip`(세지 않음) 중 하나. 단계 이름·개수·색은 사용자 것이다. checkbox면 체크 = done.
- 역할이 없는 DB도 된다(독서 목록, 지출 등). 그 DB에서는 시간·달성 계산이 돌지 않을 뿐이다.

### 2-4. Item (항목)

```jsonc
{
  "kind": "item",
  "logicalDay": "2026-11-17",       // day 역할 값 (없으면 만든 날). 서버 색인용
  "body": {
    "db": "<DB id>",
    "values": {                     // 속성 id → 값. 이름이 아니라 id
      "p_title": "LEET 기출 2회",
      "p_day": "2026-11-17",
      "p_start": "2026-11-17T09:00:00+09:00",
      "p_end": null,
      "p_7k2": "o_1",
      "p_goal": ["<목표 항목 id>"],
      "p_est": 90
    },
    "order": 3                      // 목록에서 끌어 옮긴 순서
  }
}
```

- **Relation은 한쪽에만 저장**하고, 반대쪽(목표 → 이어진 하루 일과)은 계산으로 보여 준다. 두 번 저장해서 어긋나는 일이 없다.
- 지우면 `deletedAt`만 찍힌다(되돌리기 가능, 이력 남음). 지금과 같다.

### 2-5. Formula (계산 속성)

비개발자는 **고르는 식**, 개발자는 **식을 직접** 쓴다. 둘은 같은 데이터다.

| 고르는 식 (English / 한국어) | 예 | 결과 |
|---|---|---|
| `diff` A − B (Difference / 차이) | 끝 − 시작 | 소요 시간(분) |
| `diff` A − B | 소요 − 예상 | 예상 대비 |
| `rollup` (Rollup / 모아 계산) 연결 → 속성 → 집계 | 목표 ← 하루 일과: **끝낸 비율** | 진행률 % |
| `rollup` | 운동 종목 ← 세트: 무게 최대 | 최고 무게 |
| `latest` (Latest / 지난번 값) | 같은 종목의 지난 세트 무게 | 미리 채움 |
| `ifThen` (If / 조건) | 분류 = 희망사항 이면 "회색" | 조건부 모양에 씀 |
| `expr` (Expression / 직접 식) | `(end - start) / 60` | 개발자용 |

- 집계는 지금 있는 8개(Count · Sum · Average · Max · Min · Streak · Days logged · Latest) + **Done ratio(끝낸 비율)** 를 더한다. 끝낸 비율은 `done` 역할의 뜻을 읽는다(skip은 빼고 센다).
- **목표 진행률도 이 Formula 하나다.** 지금의 lit 전용 진행률 코드(`goalPercent`)는 쓰지 않는다. "목표 → 하위 목표 → 하루 일과"처럼 여러 층이면 rollup이 rollup을 읽는다.
- 계산은 저장하지 않는다. 화면·서버·Claude가 같은 엔진으로 그때 계산한다.

### 2-6. Signal (상황)

이름 붙인 조건. 지금의 고정 10종 대신 **사용자가 만든다.**

```jsonc
{
  "kind": "signal",
  "body": {
    "name": "오늘은 무리",
    "measure": {                    // 무엇을 잴지 (셋 중 하나)
      "aggregate": {"db": "<하루 일과>", "filter": [/* 오늘 · fixed 아님 */], "of": "p_est", "agg": "sum", "period": "today"}
      // 또는 "formula": "<항목 하나의 계산 속성>", 또는 "time": "21:00"
    },
    "op": "gt",
    "compare": {"signal": "<가용 시간 상황>"}   // 숫자 하나 또는 다른 측정값
  }
}
```

- 지금의 상황(오늘 순집중 · 할 일 다 끝내기 · 목표 진행률 · 에너지 이상/이하 …)은 이 문법으로 만든 **(예) 상황**이 되어 기본 템플릿에 들어간다.

### 2-7. Rule (규칙)

지금의 규칙(언제 → 만약 → 하면)을 거의 그대로 쓰되, 위젯이 아니라 데이터 층에 저장한다.

| | 지금 | v2 |
|---|---|---|
| Trigger (언제) | 항목 생김/바뀜 · 항목마다 상황 · 상황 · 시각 · 하루 시작 · 기상 | 같음. "기상"은 (예) 기상 DB에 항목이 생기면으로 바뀜 |
| If (만약) | 속성 조건, 집계 조건, 상황 | 같음 (id로) |
| Action (하면) | Create · Update · Update matching · Notify · Open · Effect | 같음 + **Open form**(입력 양식 띄우기) + **Go to**(이동) + **Repeat**(반복 만들기: 루틴) |

- 규칙은 서버가 돈다(앱·Claude·다른 기기 어디서 써도 같게). 화면 움직임(Effect)·이동(Go to)은 열려 있는 화면이 받는다. 지금과 같다.
- **루틴 = 규칙.** (예) "하루 시작 → 루틴 DB에서 오늘 요일인 항목마다 → 하루 일과에 항목 만들기(루틴 연결 포함)". 반복 전용 기능은 두지 않는다.

---

## 3. 화면 층

플래너 스펙(버전이 쌓임)에는 **화면만** 남는다.

```jsonc
{
  "pages": [{"id": "today", "name": "오늘", "widgets": [ /* … */ ]}],
  "skin": { /* 지금과 같음 */ },
  "settings": {"tz": "Asia/Seoul", "dayBoundary": "04:00"}
}
```

**Widget (위젯)** = 위치·크기 + 부품 목록 + 디자인 + 붙이는 방식(카드/스티커)
**Part (부품)** 중 보기 부품은 **View** 설정을 가진다:

```jsonc
{
  "kind": "checklist",              // List · Table · Gallery · Calendar · Timeline · Time grid · Chart · Metric …
  "db": "<하루 일과>",
  "filter": [{"prop": "p_day", "op": "is", "value": "@today"}],   // 고정 필터
  "chips": ["p_cat", "p_persona"],   // 화면 위 필터 칩: 보는 사람이 눌러 켬/끔
  "sort": [{"prop": "p_start", "dir": "asc"}],
  "group": "p_cat",
  "show": ["p_start", "p_est", "p_goal"],      // 줄에 보일 속성
  "edit": ["p_7k2", "p_day", "p_reason"],      // ⋯에서 바로 고칠 속성
  "styles": [                       // Conditional style (조건부 모양)
    {"when": [{"prop": "p_cat", "op": "is", "value": "o_want"}], "look": "gray"}
  ]
}
```

- **Conditional style의 모양(look)은 lit이 목록으로 준다:** gray · faded · strike · hidden · color(색) · icon(아이콘) · bottom(아래로). 에디터에서 **미리보기 카드**를 보고 고른다(상황 3).
- **Go to (이동):** 부품·줄에 `"tap": {"goTo": {"page": "workout", "carry": true}}`. carry면 누른 항목이 그 페이지의 위젯에 "들고 온 항목"으로 들어간다(`@carried`로 필터·규칙에서 씀).
- **Timestamp:** 입력 부품이 `"write": {"db": …, "start": "p_start", "end": "p_end"}`. 줄 옆 ▶/■이면 그 항목에 직접 쓴다.

---

## 4. Template (템플릿)

```jsonc
{
  "id": "lit.daily", "name": "하루 일과", "version": 1,
  "databases": [ /* 정의 */ ], "signals": [], "rules": [], "pages": [ /* 위젯 */ ],
  "sample": [ /* 예시 항목 (설치할 때 고를 수 있음) */ ]
}
```

- 설치하면 **복사**한다(새 id). 설치 뒤에는 사용자 것이라 마음대로 고친다. 원본 템플릿이 바뀌어도 내 것은 그대로.
- 설치할 때 "이미 있는 DB에 붙이기"를 고를 수 있다(예: 운동 템플릿을 깔면서 내 하루 일과 DB에 잇기). 속성 역할로 짝을 맞춘다.
- 첫 시작 = 빈 lit 또는 **플래너 기본 템플릿**(하루 일과 + 목표 + 오늘 페이지).

---

## 5. Claude 커넥터 (v2 도구)

| 도구 | 하는 일 |
|---|---|
| `lit_guide` | 문법 사전(English/한국어), 만드는 순서 |
| `get_workspace` | DB 정의 · 규칙 · 상황 · 페이지 요약 |
| `save_database` | DB 만들기/고치기 (속성·역할·선택지) |
| `query_items` | DB에서 필터·기간으로 읽기 (계산 속성 포함) |
| `save_items` · `delete_items` | 항목 여러 개 쓰기/지우기 |
| `save_rule` · `save_signal` | 규칙·상황 |
| `save_pages` | 페이지·위젯 배치 (새 버전) |
| `install_template` | 템플릿 설치 |

지금의 도구(할 일 전용 `list_tasks` 등)는 v2에서 쓰지 않는다. 항목은 모두 `query_items` / `save_items`로.

---

## 6. 지금 코드에서 가져가는 것 / 새로 쓰는 것

| 가져감 | 고쳐서 가져감 | 새로 씀 |
|---|---|---|
| 기록 저장소·이력·동기화·오프라인 큐 (`life_records`, `offline.ts`) | 규칙 엔진 (`logic.ts` Flow: id 기반으로) | 데이터 계약 (`database` · `item` · `rule` · `signal`) |
| 로그인·커넥터 OAuth·배포 | 부품 렌더러 (`made/parts.tsx`, `checklist.tsx`: View 설정 읽게) | Formula 엔진 · Role 계산 (진행률·순집중·달성률) |
| 위젯 배치 캔버스·스킨·글꼴·폰 화면 | 위젯 에디터 (`Studio.tsx`: DB 편집은 따로) | DB 편집기 (노션식 표) · 필터 칩 · 조건부 모양 미리보기 |
| 움직임(Effect) CSS | 상황 평가 (`signals.ts`: 사용자 상황으로) | Open form · Go to · 템플릿 설치 · v2 커넥터 도구 |

새 앱은 `artifacts/lit`(새 서비스, 새 주소). 같은 저장소·같은 로그인. 다 되면 지금 주소를 새 앱으로 돌리고 옛 앱과 옛 기록을 지운다.

---

## 7. 작업 순서

각 단계는 **확인 문장**이 통과하면 끝이다. 단계마다 보여 드리고 피드백을 받는다.

| 단계 | 만드는 것 | 확인 문장 |
|---|---|---|
| **P1 데이터 코어** | 계약 4종 + API(`/life/v2`: DB · 항목 · 규칙 · 상황 읽기/쓰기/필터 조회) + Formula·Role 엔진 + 테스트 | (테스트로) 하루 일과 항목의 상태를 "한 일"로 바꾸면 이어진 목표의 진행률 Formula가 오른다 / 속성·선택지 이름을 바꿔도 필터와 진행률이 그대로다 |
| **P2 앱 뼈대 + DB 편집기** | 새 앱, 로그인, 페이지·위젯 캔버스(가져옴), DB 편집기(속성·역할·선택지·뜻), Table·List·Checklist 보기, 필터 칩, 빠른 추가·삭제·끌어 옮기기·미루기 | 빈 lit에서 DB를 만들고 이름·속성·선택지를 화면에서 다 고칠 수 있다 / 오늘 일정에서 칩을 눌러 보고 싶은 것만 본다 |
| **P3 시간과 계산** | Timestamp(▶/■, 버튼, 타이머), Time grid·Timeline, Formula 고르는 식 UI, Rollup, 조건부 모양 + 미리보기 | 줄 옆 ▶/■로 소요 시간이 찍히고 10분 칸이 칠해진다 / 예상 대비 소요가 줄에 보인다 / 희망사항이 고른 모양(회색 등)으로 보인다 |
| **P4 자동화** | 사용자 상황, 규칙(id 기반), Open form, Go to(항목 들고), Repeat(루틴), Effect·Notify | 목표를 "이룸"으로 바꾸면 내가 쓴 축하 문구와 기록지가 뜨고, 저장하면 회고 DB에 한 줄 / 루틴 "운동"을 누르면 운동 페이지로 그 항목을 들고 간다 |
| **P5 기본 템플릿** | 하루 일과 · 목표(달성/포기 기록) · 루틴 트래커 · 에너지 신호등 · 가용 시간 · 운동 (STRUCTURE E-1~E-6) | 빈 lit에 플래너 템플릿을 깔면 지금 "무명성 플래너"의 오늘 화면과 같은 일을 한다 / 운동 끝 → 루틴 트래커 칠함 → 목표 진행률 오름 |
| **P6 커넥터 + 전환** | v2 커넥터 도구, 주소 전환, 옛 앱·옛 기록 삭제, 옛 코드 정리 | Claude가 v2 도구만으로 DB를 만들고 항목을 채운다 / 지금 주소로 들어가면 새 lit이 열린다 |
| 나중 | Overlap check(충돌 확인), 마켓 | — |

---

## 8. 피드백이 필요한 것

| # | 질문 | 제안 |
|---|---|---|
| 1 | 개발 중에는 새 주소, 전환 때 지금 주소로. 괜찮나 | 그렇게 |
| 2 | Formula: 비개발자는 고르는 식, 개발자는 직접 식. 괜찮나 | 그렇게 |
| 3 | 루틴(반복)을 전용 기능 없이 규칙(Repeat)으로만 | 그렇게. 템플릿이 규칙을 미리 깔아 준다 |
| 4 | 템플릿은 설치할 때 복사(내 것이 됨) | 그렇게 |
| 5 | 페르소나·Role은 새 lit에서 직접 다시 만들기 (기록 삭제와 같이) | P5 끝나고 직접 만들거나, 원하면 템플릿으로 |
| 6 | MOONS·모의 우주가 플래너 데이터를 읽는 연결(`/life/v1/now`)은 v2에서 잠시 끊겨도 되나 | P6에서 v2로 다시 잇기 |
