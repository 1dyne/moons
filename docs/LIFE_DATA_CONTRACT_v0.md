# 생활 데이터 계약 v0 (2026-10-31, 초안)

MOONS 계정의 **생활 데이터 허브**가 제공하고, 모의 우주·에너지긴축모드·MOONS가 읽는 공통 계약. 플래너(Satellite)가 쓰는 기록이 이 형식으로 저장된다. 설계 배경은 [PLANNER_SPEC_v1](PLANNER_SPEC_v1.md).

- 상태: **초안 v0.** 필드명·enum·경로는 모의 우주 담당과 첫 연결 단계에서 확정해 `v1`로 올린다.
- 모의 우주는 노션 리더와 이 계약의 수신기를 같은 공통 의미로 변환한다(모의 우주 범위 문서 4·5번).
- 서로의 DB 테이블에 직접 의존하지 않는다. 이 계약의 HTTP 응답만이 경계다.

## 1. 원칙

1. **모르는 것은 모른다고 보낸다.** 미입력·미사용·조회 실패를 미수행이나 0으로 바꾸지 않는다. 결과의 기본값은 `unknown`, 모듈 미사용은 `unset`.
2. **계획과 실적을 나눈다.** 과업의 계획(`plan`)과 결과(`outcome`)는 별도 객체다.
3. **날짜만 있는 기록에 시각을 만들지 않는다.** 정밀도(`precision`)를 함께 보낸다.
4. **입력 시각 ≠ 일어난 시각.** `recordedAt`(입력)과 `occurredAt`/`actual*`(실제)를 구분한다.
5. **논리 하루**는 사용자 타임존 + 하루 경계(기본 04:00)로 계산한 `logicalDay`(YYYY-MM-DD)다. 새벽 2시에 잔 수면은 전날에 귀속될 수 있다.
6. **지우지 않고 표시한다.** 삭제는 `deletedAt` tombstone으로 전달한다. 소비자는 과거에 관찰·판단한 근거를 조용히 지우지 않는다.
7. **공유 허용분만.** 응답에는 사용자가 그 소비자에게 허락한 kind·기간·필드만 들어간다. `private` 필드는 어떤 소비자에게도 나가지 않는다.
8. **AI 추측 없이 읽힌다.** 날짜·상태·수량은 명시적 필드다. 자연어에서 추출한 값은 사용자가 확인한 것만 저장된다(`source.confirmed`).

## 2. 공통 봉투

모든 기록은 같은 봉투를 가진다.

```ts
type LifeRecord<K extends Kind, B> = {
  id: string;                 // 허브가 발급하는 ULID. 바뀌지 않는다
  kind: K;
  revision: number;           // 계정 단위 단조 증가(서버 발급). 비교·순서·중복 판단의 기준
  createdAt: string;          // ISO-8601 UTC
  updatedAt: string;
  deletedAt: string | null;   // tombstone
  logicalDay: string | null;  // 귀속 논리 하루(해당 없으면 null)
  tz: string;                 // 기록 당시 IANA 타임존
  source: {
    type: 'planner' | 'import:notion' | 'import:paper' | 'import:csv' | 'kit';
    ref?: string;             // 원본 위치(예: 노션 page id). 복사본 판별용
    confirmed: boolean;       // 사용자가 확인한 값인가(AI 추출 미확인은 false)
  };
  body: B;
  ext?: Record<string, unknown>;  // 사용자 추가 속성. 공통 의미 아님. 소비자는 무시해도 된다
};
type Kind = 'goal' | 'project' | 'task' | 'routine' | 'sleep' | 'condition' | 'review' | 'session';
```

중복 판단 키: `(sourceKind='moons-life', connectionId, id, revision)`. 같은 키는 같은 데이터다. 같은 `id`의 더 큰 `revision`이 최신이다. 더 작은 revision이 늦게 도착하면 버린다.

## 3. 연결과 인증

- 소비자(모의 우주·에너지긴축모드)는 **MOONS OAuth 2.1 클라이언트**로 등록된다(PKCE, 코드 1회용, 액세스 1시간, 리프레시 60일·회전 — v8 MCP OAuth와 같은 서버).
- 범위(scope):

| scope | 내용 |
| --- | --- |
| `life.read.plan` | goal·project·task 계획·routine 정의 |
| `life.read.outcome` | task 결과·routine 인스턴스 결과·집중 기록(session) |
| `life.read.condition` | sleep·condition |
| `life.read.review` | review 중 공유 허용 본문 |

- 허락 화면에서 사용자가 범위·시작 기간을 고른다. 허락 결과는 `connectionId`로 저장되고, 사용자는 언제든 범위를 줄이거나 끊을 수 있다.
- 토큰의 주체가 계정이다. 요청 본문의 userId는 쓰지 않는다.
- 소비자 쪽 로그인은 자유다(모의 우주는 MOONS·구글 모두). 구글로 로그인한 사용자도 이 OAuth 연결을 한 번 거쳐야 허브를 읽는다.
- 끊어도 허브의 원본은 남는다. 재연결하면 같은 계정이면 `revision` 커서부터 이어 받을 수 있다.

## 4. 본문(body)

### goal — 연간·월간·주간 목표

```ts
type GoalBody = {
  title: string;
  horizon: 'year' | 'quarter' | 'month' | 'week';
  period: string;                     // '2026' | '2026-Q4' | '2026-11' | '2026-W45'(ISO 주)
  parentGoalId: string | null;        // 연간 → 월간 → 주간
  projectId: string | null;
  criterion: string | null;           // 목표 기준(사용자 문장)
  target: {amount: number; unit: string; aggregation: 'count' | 'sum' | 'rate'} | null;
  status: 'active' | 'achieved' | 'dropped' | 'paused';
  progress: {amount: number; unit: string; asOf: string; basis: 'linked_outcomes'} | null;  // 서버 계산, 계산 기준 명시
};
```
변경 이력은 revision으로 남고 `GET /items/:id/history`로 조회한다.

### project

```ts
type ProjectBody = {title: string; status: 'active' | 'done' | 'paused' | 'dropped'; goalIds: string[]};
```

### task — 계획과 결과

```ts
type TaskBody = {
  title: string;
  category: 'must' | 'want' | 'leisure' | null;   // 필수·희망·여가. 사용자 분류 이름은 ext
  priority: 1 | 2 | 3 | null;
  goalIds: string[]; projectId: string | null;
  routineId: string | null;                        // 루틴 인스턴스면 정의 id
  plan: {
    state: 'planned' | 'committed' | 'dropped';   // committed = 오늘 하기로 고름(pick_daily)
    due: {value: string; precision: 'day' | 'minute'} | null;
    start: {value: string; precision: 'day' | 'minute'} | null;
    end:   {value: string; precision: 'day' | 'minute'} | null;
    target: {amount: number; unit: string} | null;   // 30 '분', 3 '세트', 20 '문제'
  };
  outcome: {
    result: 'done' | 'partial' | 'in_progress' | 'missed' | 'postponed' | 'cancelled' | 'unknown';  // missed = 사용자가 '못 했다'고 보고
    actualStart: string | null; actualEnd: string | null; completedAt: string | null;
    amount: number | null; unit: string | null;
    reason: string | null;                          // 사용자가 쓴 사유
    reportedAt: string | null;                      // 결과를 입력한 시각
    basis: 'self_report' | 'timer' | 'import';      // 자가 보고·측정·가져옴
    postponedTo: string | null;                     // 연기된 새 task id
  };
};
```
- `outcome.result='unknown'`이 기본이다. 하루가 지나도 자동으로 미수행이 되지 않는다.
- `missed`는 사용자가 직접 "못 했다"고 남긴 경우만. `cancelled`(계획 취소)·`unknown`(보고 없음)과 다르다.
- 소비자에게 `life.read.outcome` 범위가 없으면 `outcome`은 `null`로 온다("모름"이 아니라 "공유 안 됨").
- 연기는 원래 task에 `postponed`+`postponedTo`, 새 날짜에 새 task가 생긴다(이력 보존).

### routine — 반복 정의

```ts
type RoutineBody = {
  title: string;
  recurrence: {freq: 'daily' | 'weekly' | 'monthly'; byWeekday?: number[]; byMonthDay?: number[]; interval?: number};
  mode: 'fixed_all' | 'pick_daily';     // pick_daily: 날마다 고른 것만 인스턴스가 생긴다
  target: {amount: number; unit: string} | null;
  goalIds: string[];
  active: boolean;
};
```
날짜별 실제 수행은 `task`(`routineId` 연결)다. 정의와 인스턴스가 섞이지 않는다. 달성률 분모는 사용자 규칙(`all_defined` / `committed_today`)을 `now` 스냅샷이 명시한다.

### sleep / condition — 선택 모듈

```ts
type SleepBody = {start: string | null; end: string | null; naps: {start: string; end: string}[]; quality: 1 | 2 | 3 | 4 | 5 | null};
type ConditionBody = {at: string; energy: 1 | 2 | 3 | 4 | 5 | null; mood: string | null; tags: string[]};
```
모듈을 쓰지 않으면 기록이 없고, `now`에 `state:'unset'`으로 나온다. 쓰지만 그날 입력이 없으면 `state:'empty'`.

### session — 실제 집중 시간 (타임 트래커)

```ts
type SessionBody = {
  taskId: string | null;      // 어떤 할 일에 썼나(없으면 label만)
  label: string;
  start: string;              // ISO-8601
  end: string | null;         // null = 지금 집중 중(한 번에 하나)
  source: 'timer' | 'manual'; // 스톱워치 / 타임테이블에 직접 칠함
};
```
- `logicalDay`는 시작 시각의 논리 하루. 계획(`task.plan`)이 아니라 **측정값**이다.
- 버디 피드백의 "실제 집중 시간"은 이 기록에서 나온다. `task.outcome`의 완료 보고와는 별개다.

### review — 하루·주·월 회고

```ts
type ReviewBody = {horizon: 'day' | 'week' | 'month'; period: string; text: string | null};  // text는 공유 허용분만
```

## 5. 조회 API

기본 주소 `https://<플래너 또는 MOONS 주소>/api/life/v1`. (현재 구현: 플래너 자신의 세션으로만 읽고 쓴다. 소비자 OAuth 범위는 P3.) 모든 응답에 `contractVersion: "0"`과 `asOf`(서버 시각).

| 메서드·경로 | 용도 |
| --- | --- |
| `GET /connection` | 연결 상태: `ok` / `syncing` / `setup_incomplete` / `revoked`, 허락 범위, 마지막 기록 시각 |
| `GET /now` | RP·대화용 현재 상태 스냅샷(§6). ETag 지원 |
| `GET /items?from=&to=&basis=&kinds=&cursor=` | 기간 조회. `basis`: `logical_day`(기본) / `due` / `occurred` — 무엇을 기준으로 범위를 자르는지 명시 |
| `GET /changes?since=<revision>&limit=` | 증분. tombstone·정정 포함, revision 오름차순. `nextSince`, `hasMore` |
| `GET /items/:id/history` | 한 기록의 revision 이력 |

- 결과 없음은 `200` + 빈 배열. 권한 없음 `403 {reason:'scope'|'revoked'}`, 미인증 `401`, 서버 문제 `5xx`. 소비자는 이 셋을 빈 결과와 다르게 다룬다.
- 페이지네이션은 불투명 `cursor`.

## 6. `now` 스냅샷 — 실시간 RP용

모의 우주가 매 채팅마다 전체를 다시 읽거나 AI로 플래너를 재해석하지 않도록, 허브가 **작고 결정적인** 현재 상태를 만든다(AI 호출 없음).

```jsonc
{
  "contractVersion": "0",
  "asOf": "2026-10-31T13:05:00Z",
  "revision": 1842,                       // 이 스냅샷이 반영한 최신 revision
  "user": {"tz": "Asia/Seoul", "dayBoundary": "04:00", "logicalDay": "2026-10-31", "localTime": "22:05"},
  "lastActivityAt": "2026-10-31T12:58:00Z",
  "today": {
    "tasks": [
      {"id": "01J…", "title": "영어 단어 50개", "category": "must", "plan": "committed",
       "target": "50 단어", "result": "done", "amount": "50 단어", "goalIds": ["01J…G1"]},
      {"id": "01J…", "title": "운동", "category": "want", "plan": "committed", "target": "30 분",
       "result": "unknown", "goalIds": []}
    ],
    "counts": {"planned": 6, "committed": 5, "done": 3, "partial": 0, "missed": 0, "postponed": 1, "cancelled": 0, "unknown": 1},
    "routineRate": {"basis": "committed_today", "done": 2, "of": 3}
  },
  "goals": [
    {"id": "01J…G1", "horizon": "month", "period": "2026-10", "title": "TEPS 단어 1000개",
     "progress": "820/1000 단어", "parentId": "01J…Y1"},
    {"id": "01J…Y1", "horizon": "year", "period": "2026", "title": "TEPS 600", "progress": null}
  ],
  "condition": {"state": "ok", "energy": 3, "mood": "피곤", "at": "2026-10-31T11:00:00Z"},
  "sleep": {"state": "unset"},
  "focus": {
    "state": "ok",
    "active": {"sessionId": "01J…", "taskId": "01J…", "title": "수학 20문제", "startedAt": "2026-10-31T12:40:00Z", "minutes": 25},
    "todayMinutes": 135, "firstStart": "2026-10-30T22:00:00Z", "lastEnd": "2026-10-31T13:05:00Z",
    "byTask": [{"taskId": "01J…", "title": "보고서 초안", "minutes": 85}, {"taskId": "01J…", "title": "수학 20문제", "minutes": 50}]
  },
  "freshness": {"todayUpdatedAt": "2026-10-31T12:58:00Z", "stale": false}
}
```

- 사람이 읽는 짧은 값(`"50 단어"`)을 함께 주어 소비자의 모델 입력이 작아진다. 정확한 값은 `/items`로.
- `If-None-Match`로 재조회하면 바뀐 게 없을 때 `304` — 채팅 턴마다 확인해도 싸다.
- 범위 밖 kind는 빠지고 `"state": "not_shared"`로 표시한다.
- `focus`는 타임 트래커를 쓰는 플래너만 `ok`, 아니면 `unset`. 분은 `asOf` 시각 기준으로 계산된다. **ETag는 기록이 바뀔 때만 바뀌므로**, 304를 받은 소비자는 `active.startedAt`부터 직접 세면 된다(집중 중인 동안 매 턴 다시 받을 필요 없음).

## 7. 변경 알림 (확장, 선택)

**기본 연결은 `now` 조회다.** 일반 과업 체크는 다음 채팅 턴에 `now`(+ETag)로 반영되면 충분하다. 변경 알림은 채팅 없이 움직여야 하는 기능(기상 감지·예약 알림 등)을 위해 **나중에 켤 수 있게** 설계해 둔다.

- 소비자가 웹훅 주소와 받을 이벤트 종류를 등록한다. 등록하지 않으면 알림은 없다.
- 허브는 **신호만** 보낸다: `POST {connectionId, revision, events:[{type, recordId, at}]}` + `X-Life-Signature`(HMAC-SHA256). 본문 데이터는 넣지 않는다.
- 받은 쪽은 필요할 때만 `/changes?since=` 또는 `/now`로 가져간다. 알림을 놓쳐도 `changes`로 복구되고, 중복·순서 뒤바뀜은 revision으로 판단한다.
- **알림 = AI 호출이 아니다.** 소비자는 이벤트 종류별 규칙으로 무엇을 할지 정한다(대부분 캐시 갱신만). AI 응답 생성 여부는 소비자의 비용 제어(A)가 결정한다.

| 이벤트 | 언제 | 예상 용도 |
| --- | --- | --- |
| `changed` | 공유 범위의 기록이 바뀜(묶어서 최대 1회/분) | 캐시 갱신 |
| `sleep.ended` | 수면 기록에 종료 시각이 입력됨 | 기상 감지 |
| `day.planned` | 그날 첫 `committed` 과업이 생김 | 하루 시작 감지 |
| `plan.starting` | 과업 `plan.start`(분 단위)의 N분 전, 허브 예약 | 예약 알림 |
| `focus.started` | 타이머 시작(세션 생성, `end` 없음) | 버디가 집중 시작을 알아챔 |
| `focus.stopped` | 타이머 멈춤 또는 칸 칠하기 | 집중 끝 피드백 |
| `day.closed` | 하루 회고 입력 또는 논리 하루 경계 통과 | 하루 결산 |

이벤트 목록은 v0 제안이다. 구현 순서: P3는 `now`·`changes`만, 알림은 모의 우주가 필요한 이벤트를 정한 뒤 추가한다.

## 8. 합성 예시

`lib/life-contract/fixtures/week-basic.json`(생성: `lib/life-contract/src/fixtures.ts`, 실제 개인 데이터 없음). 파일에는 `records`(최신 상태), `history`(모든 revision), `nowExample`(마지막 날 `now` 응답)이 들어 있다. 아래 중 첫 항목은 완료, 나머지는 다음 단계:
- [x] `week-basic.json` — 7일 데일리, 월간 목표 1·연간 1, `pick_daily` 루틴(못 함·미보고 포함), 연기 1건, 정정 1건, 삭제 1건, 미입력일 1일, 사적 회고 1건, 수면·컨디션 미사용.
- [ ] `condition-unset.json` — 수면·컨디션 모듈 미사용 계정.
- [ ] `changes-out-of-order.json` — 순서가 뒤바뀐 revision·중복 수신.
- [ ] 같은 내용을 노션 DB로 옮긴 형태(모의 우주의 노션 변환기와 비교용).

## 9. 확정할 것 (모의 우주 담당과)

1. 첫 변경 알림으로 필요한 이벤트(§7 표 중).
2. `category` enum이 기존 노션 쪽 분류(필수·희망·여가)와 1:1인지.
3. 수면의 논리 하루 귀속 규칙(시작 기준 / 종료 기준).
4. `now`에 넣을 최근 기간(오늘만 / 최근 3일 요약).
5. 비교 QA용 읽기 전용 모드: 소비자 쪽 플래그로 충분한지, 허브에 별도 범위가 필요한지.
