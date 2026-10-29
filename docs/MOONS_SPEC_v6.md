# MOONS 명세 v6 — 개인 제품 베타 (2026-10-16)

> 대상: 구현하는 사람(Claude Code·개발자). v5(해커톤)를 대체한다.
> 기준 코드: `1dyne/moons` `main`. 이론 근거는 「MOONS 팀 공유용 — 왜 이렇게 만들었나」.
> v5에서 그대로 쓰는 것: 원문 보존 검증, Kept/Shifted/Added/Missed 대조, shift_type, 감정 태그,
> MOONS 채팅 3단 맥락(Pinned/Retrieved/Profile), 알림 감지 규칙, 우주 보기(B1·B4·B5).

---

## 0. 원칙

1. **원문을 고치지 않는다.** 노드 text는 사용자가 쓴 말의 부분 문자열. 서버에서 검증한다.
2. **층위를 섞지 않는다.** 원본 / 내가 쓴 것 / AI가 정리한 것 / 내가 확인한 것 / MOONS의 말을 데이터와 화면에서 구분한다. AI가 만든 것(문장·폼·일정 제안·시간 배정)은 사용자가 확인하기 전까지 사용자 것이 아니다.
3. **판정하지 않는다.** "틀렸어요", "당신은 ○○한 사람" 금지. 관찰과 근거만.
4. **고르는 건 사용자다.** MOONS는 일정·태그·연결을 직접 바꾸지 않는다. 제안 카드로만.
5. **임포스터는 켠 사람에게만, 반드시 공개한다.**
6. **운영자는 사용자 기록을 보지 않도록 설계한다.** 운영자 화면에 타인의 내용을 여는 기능을 만들지 않는다. 사용자가 직접 보낸 캡처·공유만 본다.
   서버에서 AI가 처리하므로 "기술적으로 불가능"이라고는 쓰지 않는다. 대외 문구는 "보지 않도록 설계했다".
7. **UI는 한국어 기본, 영어 전환.** 사용자가 쓴 내용과 AI 응답은 사용자가 쓴 언어를 따른다.

---

## 1. 결정 사항

| 항목 | 결정 |
| --- | --- |
| 형태 | 웹 우선(모든 기기에서 실시간). 로컬 설치형은 베타 이후. 데이터 구조는 지금 동기화 가능한 형태(2장)로 만든다 |
| 배포 | 웹 = Vercel, API = 장시간 실행 컨테이너(Railway 또는 Fly.io), DB = Neon(본인 계정) |
| 로그인 | Clerk. Google + 이메일 링크. **초대된 이메일만 가입**(베타) |
| AI | 공급자 추상화 유지. 베타는 운영자 키 + 1인 하루 한도. **내 키 넣기(BYOK)** 지원: OpenAI·Anthropic·Gemini |
| 결제 | 베타에는 없음. 이후 MOONS Pass(풀패키지·팀) |
| 해커톤 이벤트 | `/now`·`/live`·`/admin` 이벤트, 이벤트 스캔·데모 시드 코드 삭제. 스파이 설계는 **임포스터**로 개인 기능에 남긴다(8장) |

---

## 2. 데이터 구조 — 변경 기록 누적 (M1 구현됨)

사용자당 스냅샷(`personal_workspaces.store`)은 유지하고, **모든 변경을 항목 단위로 기록**한다.
같은 기록이 ① 과정 재생(6.4) ② 이후 로컬 앱 동기화 ③ 작업 시간 자동 기록(4장)의 근거가 된다.

- 공유 모듈 `lib/moons-sync`: 스토어의 `id` 있는 배열은 컬렉션(entries, planets, chats, views, tiles, notifications …), 나머지 최상위 키는 필드.
  `diff(base,next)` → `upsert/remove/order/set` 연산, `apply(store,ops)` → 적용 + 충돌 목록. 각 연산은 기준 값의 해시를 들고 다닌다.
- 화면: 마지막 서버 사본과 현재 사본의 차이만 `POST /api/workspace/ops {baseRevision, batchId, device, ops}`로 보낸다.
  응답(합쳐진 최신 스토어) 위에 그 사이 생긴 내 변경을 다시 얹는다.
- 서버: 최신 스토어에 연산을 적용한다. **다른 항목 변경은 자동으로 합친다.** 같은 항목을 다른 기기가 먼저 바꿨으면 그쪽을 남기고,
  밀린 연산은 `conflict.kept_newer` 이벤트로 보관한다(잃지 않음). 같은 `batchId`는 다시 적용하지 않는다.
- 서버 쪽 저장(분석·비교·하루 1회 배치 등)도 같은 지점(`persistWorkspace`)에서 차이를 계산해 기록한다.
- 처음 기록되는 사용자는 기존 스토어를 `device='baseline'` 이벤트로 먼저 남기고, 항목의 `createdAt`을 시각으로 쓴다(과거는 생성 순서로만 재생).
- 파생 값(모행성 `entryCount`, `openSignalRatio`)은 변경으로 보내지 않는다.

```sql
create table if not exists workspace_events(seq bigserial primary key, owner_id text not null, at timestamptz not null default now(),
  device text, type text not null, item text, payload jsonb not null);   -- type 예: entries.created, planets.updated, settings.set
create table if not exists workspace_batches(owner_id text not null, batch_id text not null, revision integer not null,
  created_at timestamptz default now(), primary key(owner_id, batch_id));
```

---

## 3. 내 폼 — 배너를 내가 만든다

### 3.1 배너
- 홈 입력 영역의 `Sparks` · `Materials` 옆에 **내가 만든 폼 배너**가 붙는다. `+ Form`으로 추가, 순서 변경·숨기기·삭제.
- 플러그인이 아니라 앱 기능이다. YAML·코드는 화면에 나오지 않는다.

### 3.2 폼 만들기 (노션식 블록)
블록: `text`(짧은/긴) · `checklist` · `steps`(순서 있는 단계) · `estimate`(예상 시간) · `date`/`time` · `scale`(1–10) · `select`(선택지) · `planet`(붙일 모행성) · `link`.
- **모든 폼 맨 아래에 자유 서술(Sparks 입력기)이 항상 붙는다.** 끌 수 없다.
- 폼으로 쓴 글도 원문이다. text 블록의 값은 사용자 단어 그대로 엔트리 sentences에 들어가고 구조화·대조 대상이 된다.

폼은 별도 테이블 대신 공간 데이터의 `forms` 컬렉션으로 저장한다(M1 동기화·변경 기록이 그대로 적용됨). 아래는 형태 참고용.
```sql
create table if not exists form_templates (
  id text primary key, owner_id text not null, name text not null, icon text not null,
  blocks jsonb not null,            -- [{id, kind, label, required, options?}]
  position int not null default 0, source text not null default 'manual', -- manual | photo
  created_at timestamptz default now(), updated_at timestamptz default now()
);
```
엔트리: `kind='form'`, `meta.formId`, `values`(블록 id → 값), `sentences`(text 값 + 자유 서술).

### 3.3 종이 사진 → 폼
1. 사진 업로드(데일리 플래너, 노트 양식 등).
2. AI(비전)가 칸 구조를 읽어 **폼 초안**을 만든다. 사진 속 손글씨 내용은 선택적으로 첫 엔트리 초안이 된다.
3. 사용자가 블록을 고치고 `등록`해야 저장된다(원칙 2). 초안은 `source='photo'`로 표시.

### 3.4 이후(베타 범위 밖)
폼 공유·판매. 지금은 `blocks`가 기기·사용자와 독립적인 데이터가 되도록만 유지한다.

---

## 4. 플래너 — 예상 vs 실제

### 4.1 구조
```sql
create table if not exists projects (
  id text primary key, owner_id text not null, name text not null,
  planet_id text,                   -- 모행성과 연결
  pattern_form_id text,             -- "내 작업 순서" 폼에서 복사해 시작
  familiarity text,                 -- new | think_i_know | know  (시작 시 선택, 언제든 변경)
  status text not null default 'active', created_at timestamptz default now()
);
create table if not exists tasks (
  id text primary key, owner_id text not null, project_id text,
  title text not null,              -- 사용자 말 그대로
  step_key text,                    -- 패턴 폼의 단계 id (빠진 단계 감지용)
  planned_date date, planned_start time, estimate_min int,
  status text not null default 'todo', -- todo | doing | done | dropped
  created_at timestamptz default now()
);
create table if not exists time_sessions (
  id text primary key, owner_id text not null, task_id text not null,
  started_at timestamptz not null, ended_at timestamptz,
  source text not null              -- timer | manual | suggested (사용자가 수락한 제안)
);
```

### 4.2 시간 기록 — 다른 DB에서 골라 넣지 않는다
- 작업 카드의 **▶ 시작 / ■ 종료**. 다른 작업을 시작하면 이전 작업은 자동 종료(동시에 하나).
- 하루에 여러 번 나눠 해도 같은 작업의 세션이 자동 합산된다.
- **놓친 시간 제안**: 그 시간대에 MOONS에 생긴 기록(엔트리·자료·노드, `workspace_events.at`)이 특정 프로젝트에 몰려 있고 실행 중 타이머가 없으면,
  "14:10–15:20에 ○○ 기록이 있어요. 이 작업에 넣을까요?" 카드. 수락해야 `source='suggested'` 세션이 생긴다.
- 작업 카드·프로젝트에 **예상 / 실제 / 차이**가 바로 보인다.

### 4.3 화면
- 베타: **데일리 플래너**(오늘 작업, 시간 블록, 타이머) + **프로젝트**(단계 보드, 예상 vs 실제).
- 이후: 월간·연간(같은 데이터의 다른 보기), Google Calendar 가져오기.

---

## 5. 내 패턴과 조정 제안

### 5.1 패턴 넣기
- "내 작업 순서"는 사용자가 만든 폼(3장, `steps` 블록)이다. 기본 패턴 하나 + 프로젝트별 복사본.
- 자유 서술로 쓴 "나는 보통 이렇게 한다"도 패턴 근거로 쓰인다(원문 그대로).

### 5.2 확신도 — 1–10을 한 번 고르지 않는다
- 대상은 **분야 전체가 아니라 개념·작업·노드 단위**. 언제든 다시 고르고, 매번 기록된다.
- 질문 문구: "지금 이걸 남에게 설명할 수 있다고 얼마나 확신해요?" (지식의 끝을 가정하지 않는다)

```sql
create table if not exists confidence_ratings (
  id text primary key, owner_id text not null,
  target_type text not null, target_id text not null,  -- concept | task | node | project
  value int not null check (value between 1 and 10), note text,
  at timestamptz default now()
);
```

- **근거와 나란히** 보여준다: 같은 대상의 대조 결과(Missed·Shifted 비율), 예상 vs 실제 시간 차이.
  - 확신 높음 + 근거 약함 → "안다고 생각한 곳일 수 있어요" (관찰)
  - 확신 낮음 + 근거 좋음 → "생각보다 잘 잡고 있어요" (관찰)
- **나선 보기**: 같은 대상을 다시 다룰 때마다 한 바퀴씩 올라가는 나선으로 확신도·근거를 그린다.
  확신도와 근거가 일정 기간 평평하면 "고원 구간으로 보여요"라고 관찰만 표시한다. 비교 대상은 과거의 나뿐이다.

### 5.3 조정 제안 (SQL 집계 + AI는 문장만)
| 종류 | 조건(기본값) | 예시 |
| --- | --- | --- |
| `step_missing` | 같은 패턴 단계가 최근 프로젝트 3개 중 2개 이상에서 task 없음 또는 dropped | "개념 정리 단계가 최근 3개 중 2개 프로젝트에서 빠졌어요" |
| `estimate_drift` | 같은 단계의 실제/예상 비율 중앙값이 1.5 이상 또는 0.6 이하(최소 5개) | "실습 단계는 예상보다 평균 1.8배 걸렸어요" |
| `familiarity_gap` | familiarity가 know/think_i_know인데 해당 모행성 Missed+Shifted 비율이 사용자 평균보다 높음 | "안다고 표시한 분야에서 놓친 부분이 평균보다 많아요" |
| `schedule_pattern` | 계획 시각과 실제 시작 시각 차이가 같은 요일·시간대에 반복 | "월요일 오전 작업은 평균 50분 늦게 시작했어요" |

- 하루 1회 배치(KST)로 계산. 하루 최대 2건, 같은 패턴 7일 중복 금지(v5 알림 규칙 재사용).
- **제안 카드 → 누르면 분할 화면(7장)**: 근거 노드·작업·시간 기록이 나란히 열리고, 오른쪽에 MOONS 채팅이 그 근거를 Pinned로 붙인 채 열린다.
- `Apply`는 제안된 변경(단계 추가, 예상 시간 조정)을 **사용자가 확인한 뒤** 이벤트로 기록. `Dismiss`도 기록(재제안 억제).

---

## 6. 결과물 내보내기

### 6.1 노드 (기본)
- PDF · MD. 포함 항목을 체크로 고른다: 원문, 원본 인용(+시각/위치), 대조 결과, 감정 태그, 고친 기록(처음→고친 것), 확신도 기록, 관련 MOONS 대화(기본 꺼짐).
- MD는 옵시디언에서 바로 열리게: frontmatter(title, planets, created), 연결은 `[[노드 제목]]`.

### 6.2 묶음
- 여러 노드 선택 → **한 PDF, 표지 + 목차 + 노드당 한 장**. 모행성·저장한 View를 고르면 "학습 리포트"(모행성 요약, 대조 통계, 확신도 나선 포함).
- MD 묶음은 zip(노드당 파일 1개 + index.md).

### 6.3 공유 링크
- 노드·묶음을 읽기 전용 웹 페이지로. 사용자가 끄면 즉시 무효. 포함 항목은 6.1과 같은 체크.

### 6.4 과정 재생 (앱 안에서만)
- `workspace_events`를 처음부터 재생: 노드가 생기고, 연결되고, 고쳐지고, 모행성이 커지는 과정을 우주 화면에서.
- 재생 바(처음/끝, 속도 1×·4×·16×, 날짜 표시), 범위: 전체 / 모행성 / View.
- 2장 이전 이전의 과거 기록은 생성 순서로만 재생.

### 6.5 우주 캡처
- 현재 화면(저장한 View 포함)을 **투명 배경 PNG**로. 모서리에 View 이름·날짜(끌 수 있음). 배율 1×/2×.

### 6.6 이후
복습 카드(Missed·Shifted → Anki), 노션·옵시디언 가져오기(원본 자료로).

---

## 7. 분할 비교 + MOONS 대화

- 노드·원본·작업을 **최대 3개** 패널로 나란히. 경계 드래그로 너비 조절. 우주 `Shift+클릭`/길게 누르기(B4), 노드 목록, 검색, 제안 카드에서 연다.
- 오른쪽 MOONS 채팅: **열린 패널이 자동으로 Pinned**. 패널을 닫으면 Pinned에서 빠진다.
- 패널 안: 원문 수정 불가. 메모 추가(`entry.annotated`), 하이라이트, 연결 만들기 가능.
- "이 노드와 저 노드가 관련 있나?" 대화 후 사용자가 `연결하기` → 관계(`updates`/`contradicts`/`extends`/`related`) + 이유 한 줄(사용자 문장)로 `node.linked`. MOONS 문장은 사용자 노드·이유가 되지 않는다.

---

## 8. 임포스터 (구 스파이)

- `설정 → Impostor` 토글. 빈도: 가끔(10%) / 종종(25%) / 자주(50%). 기본 꺼짐.
- **재료는 사용자 자신의 기록**이다: 사용자의 과거 엔트리·패턴 폼·확신도 기록에서 그럴듯하게 이어지는 문장을 만든다
  (`overreach`: 내 말보다 한 걸음 더 나간 결론 / `phantom_premise`: 내가 말한 적 없는 전제 / `self_drift`: 예전의 내 말을 살짝 바꾼 것).
- 생성 규칙(v5 6.6 유지): 원문 부분 문자열이면 거부, 사용자 말과 정면 모순 금지, 개인정보·혐오·정치·건강 금지. 서버만 임포스터 여부를 안다.
- 출발 코드: 해커톤 스파이 구현은 M0에서 삭제했다. 커밋 `438fbf6`의 `artifacts/api-server/src/moons/lib/server/v5/event-scan.ts`(생성·안전성 검사·공개 전 비노출)와 `components/event/CheckPanel.tsx`, `ThoughtPage.tsx`(확인·공개 화면)에서 가져와 개인 공간용으로 옮긴다.
- 구조화 결과에 섞여 나오고, 사용자가 의도 확인에서 `맞아`를 누르면 **다음 접속 때** "임포스터가 있었어요"로 공개.
- 공개 화면: `내 거 맞아`(채택, `adopted_from_impostor` 표시 유지) / `내 거 아니야`(보관) / `아직 모르겠어`(안개 노드) + **코멘트 필수**.
- 설정 화면 고지 한 줄: 바뀐 선택을 받아들인 뒤 실제 태도가 이동한 연구가 있다(Strandberg 외, 2018). 그래서 동의·공개·재확인이 필수다.
- UI 표현은 우주 테마에 맞춰 "임포스터". 문구 톤: "이 우주에 임포스터가 한 명 숨어 있었어요."

---

## 9. 베타 운영

### 9.1 초대와 로그인
- Clerk allowlist(초대 이메일). Google + 이메일 링크. 게스트 → 계정 이전(claim)은 v5 구현 유지.
- 베타 대상: 운영자 + 피지컬 AI 3D 에셋 프로젝트 팀원 등 10명 이내.

### 9.2 팀 공간 (베타 포함)
같은 원본을 각자 어떻게 이해했는지 확인하는 공간. 학습뿐 아니라 프로젝트 논의 확인용.
```sql
create table if not exists teams (id text primary key, name text not null, created_by text not null, created_at timestamptz default now());
create table if not exists team_members (team_id text not null, user_id text not null, role text not null default 'member', primary key(team_id,user_id));
create table if not exists team_originals (id text primary key, team_id text not null, added_by text not null, entry_snapshot jsonb not null, created_at timestamptz default now());
create table if not exists team_shares (
  id text primary key, team_id text not null, original_id text not null,
  owner_id text not null, entry_id text not null, comparison jsonb,  -- 공유 시점 사본
  created_at timestamptz default now(), revoked_at timestamptz
);
```
- 팀원 누구나 원본(회의록, 논의 녹음, 문서)을 팀에 올린다. 각자 자기 공간에서 비공개로 이해를 쓴다.
- **본인이 `팀에 공유`를 눌러야만** 팀 비교 화면에 올라간다. 공유 취소 가능(사본 삭제).
- 팀 비교 화면: 원본 문장별로 팀원들의 Kept/Shifted/Added/Missed를 나란히. 여러 명이 같은 전제를 Added 했으면 "팀이 함께 더한 전제"로 표시(판정 아님).

### 9.3 비공개
- 운영자 UI에 타인 내용 열람 기능 없음. 운영 지표는 숫자만(가입 수, 하루 AI 호출 수).
- 엔트리 본문·채팅·BYOK 키는 DB 열 단위 암호화(서버 보관 키). 버그 신고는 사용자가 보낸 캡처·설명만.

### 9.4 AI 비용
- 운영자 키: 1인 하루 한도(호출 수 기준, 설정값). 초과 시 "오늘 한도에 도달했어요. 내 키를 연결하면 계속 쓸 수 있어요."
- BYOK: `ai_keys(owner_id, provider, encrypted_key, model, created_at)`. 키는 서버 응답·로그에 절대 나오지 않는다.

### 9.5 피드백
화면 구석 `피드백` → 텍스트 + 선택적 캡처. 운영자만 본다.

---

## 10. 정리할 것 (삭제)

- 이벤트: `components/event/*`, `/now`·`/live`·`/t/:id`·`/admin` 라우트, `event-v5-router`, `spaces/entries/materials/transcribe/admin/signals` 이벤트 API, `event_scans`, `demo_guests`·`demo_access_tokens`(데모 링크), `EVENT_MODE` 플래그, 이벤트 데모 시드.
- 스파이 코드는 지우되 생성·검증 로직(부분 문자열 거부, 안전성 검사, 공개 전 비노출)은 임포스터(8장)로 옮긴다.
- 해커톤 문서(`attached_assets/HACKATHON_*`, `docs/V5_*`, `.migration-backup`)는 `docs/archive/`로.
- Replit 전용 설정(`.replit`, `@replit/*` vite 플러그인)은 Vercel 이전 시 제거.

---

## 11. 구현 순서

| 단계 | 내용 | 완료 기준 |
| --- | --- | --- |
| M0 (배포 제외 ✅) | 10장 정리, i18n(ko 기본/en), Railway 단일 컨테이너 배포 | 새 주소에서 개인 기능 전부 동작, 이벤트 라우트 404 |
| M1 ✅ | 2장 변경 기록 누적 | `test:sync` 6개 + `lib/moons-sync` 8개 통과 (다른 항목 자동 병합, 같은 항목 충돌 보관, 중복 배치 무시, 원문 잠금, baseline) |
| M2 ✅ | 3장 폼(블록·배너·사진→폼) | 홈 배너에 폼 탭, 블록 11종 편집기, 폼 엔트리 본문 = 사용자가 친 말만(라벨·숫자는 meta), 사진 초안은 `POST /api/forms/from-photo`가 돌려주기만 하고 저장은 사용자가 함. 폼 테스트 4개 |
| M3 ✅ | 4장 플래너 + 5장 확신도·제안 | `/planner` 데일리(▶/■ 타이머, 예상/실제, 놓친 시간 제안) + 프로젝트(작업 순서 폼의 단계 보드, 익숙함, 확신도 나선). 조정 제안 4종(`adjustment`)은 알림으로, 빠진 단계는 Apply로 할 일 추가. 플래너 테스트 4개 + 제안 규칙 테스트 5개. 데이터는 공간 컬렉션(projects/tasks/sessions/confidence). 월간·연간·구글 캘린더는 이후 |
| M4 ✅ | 7장 분할 3개 + 채팅 자동 Pinned | `/compare?ids=` 작업대: 노트 3개까지, 경계 드래그(키보드 ←/→도), 문장 하이라이트(문장 번호만 저장), 내 말 메모(자식 노트), 연결(관계 + 내 말 이유, `links` 컬렉션). 오른쪽 MOONS 대화는 열린 패널이 곧 Pinned. 진입: 우주 비교 트레이, 노드 화면, 알림 근거 |
| M5 ✅ | 6장 내보내기·공유 링크·재생·투명 캡처 | 내보내기 창(포함 항목 8종 체크): PDF는 `/print` 인쇄 화면(표지·목차·노드당 한 장), MD는 옵시디언용(frontmatter, 같이 내보낸 노트끼리 `[[링크]]`, 여러 개면 zip+index). 읽기 전용 공유 링크 `/s/:token`(고른 노트·항목만, 끄면 즉시 404, 게스트 쿠키 안 만듦). 우주 화면 기록 재생(이벤트 로그를 시간순 재적용, 1×/4×/16×). 투명 PNG 캡처(성운·배경 별 제외, 모행성 이름·보기 이름·날짜 포함). 테스트: 공유·이벤트 2개, MD·재생 3개 |
| M6 ✅ | 9장 초대·팀 공간·BYOK·한도·피드백, 8장 임포스터 | 팀 공간(`/teams`, 계정 필요, 일회용 초대 링크 14일, 원본 → 내 공간으로 복사 → 비교 → 원할 때만 공유, 문장별 팀원 그대로/바뀜/놓침), AI 하루 한도(`MOONS_DAILY_AI_LIMIT`, 기본 60) + 내 OpenAI 키(AES-256-GCM, 응답에 안 나옴), 피드백(글+페이지 경로만), Google 로그인 버튼, 임포스터(설정·생성·숨김·지연 공개·채택/제거/안개). 통합 테스트: AI 접근 1, 임포스터 1, 팀 1 |


### M6 이후 남은 것 (결정 필요 / 다음 순서)
- **DB 열 단위 암호화(9.3)**: 공간 데이터가 jsonb 하나라 내용을 암호화하면 알림 SQL 집계가 막힌다. 베타는 Neon의 저장 시 암호화 + 운영자 화면 없음으로 가고, 앱 단 암호화는 로컬 앱 단계에서 다시 설계한다.
- **내 키 쓰기**: OpenAI만 구현. Anthropic·Gemini는 공급자(`ai/provider.ts`) 구현이 필요하다.
- **Clerk 초대제(allowlist)**: 코드가 아니라 Clerk 대시보드 설정(Restrictions → Allowlist).
- 월간·연간 플래너, Google Calendar, 복습 카드(Anki), 노션·옵시디언 가져오기, 로컬 앱.

## 12. 테스트 (v5 11장 + 추가)
- 원문 불변: 어떤 이벤트로도 `entry.created`의 sentences가 바뀌지 않음.
- 이벤트: 같은 id 재전송 무시, seq 순서 보장, 스냅샷 = 이벤트 재생 결과.
- 플래너: 동시에 타이머 2개 불가, 제안 세션은 수락 전 없음, 예상/실제 합산.
- 제안: 각 감지 규칙의 경계값, 하루 2건, 7일 중복 금지.
- 팀: 공유 전 다른 팀원 조회 403, 공유 취소 후 사본 없음.
- 비공개: 운영자 API로 타인 엔트리 본문 조회 경로 없음, BYOK 키가 어떤 응답에도 없음.
- 임포스터: 꺼진 사용자에게 0개, 원문 부분 문자열 거부, 공개 전 응답에 필드 없음.

## 13. 구조화 v2 — 문장과 구조, 두 층을 다 정확하게 (2026-10-17 설계)

> 목업: 「MOONS 노트 정리 목업」 (노트 · 구조도 · 원본과 비교 + MOONS 코멘트).
> 범위: dump/material 노트 **한 개**의 구조도 품질. 노트 사이 연결은 다음 단계.

### 13.1 목표
사용자가 이해한 구도와 원문 발화자가 의도한 구도를 **문장 층**과 **구조 층** 둘 다에서 비교하고 채워 가게 한다.
두 층 모두 정확해야 하고, 둘 다 평가(리뷰)한다. 문장 층은 지금의 Kept/Shifted/Added/Missed 그대로 둔다.

### 13.2 이론 틀 — 독해의 층마다 하나씩 겹쳐 쓴다
Kintsch 구성-통합 모델의 층(표면 / 텍스트 기반 / 상황 모델)을 바탕 틀로 삼고, 층마다 주인 이론을 하나씩 둔다. 겹치는 칸은 이름 하나로 합친다(Meyer "인과" = RST "원인").

| 층 | 묻는 것 | 이론 | 사용자에게 보이는 말 |
|---|---|---|---|
| 표면 | 무슨 말을 했나 | 원문 보존 검증 | (기존) |
| 글 전체 | 어떤 글인가 | Hume 사실/당위 + 이야기 | 글 성격: 설명하는 글 · 주장하는 글 · 이야기 |
| 섹션 | 어떻게 짜여 있나 | Meyer 설명문 5구조, 주장이면 Toulmin | 짜임: 나열 · 순서 · 원인→결과 · 문제→해결 · 비교 · (주장→근거) |
| 선 | 조각끼리 어떤 관계인가 | RST 관계 + 개념도 관계어 | 종류 · 부분 · 속성 · 사례 · 순서 · 원인 · 해결 · 용도 · 대비 · 나열 |
| 상황 모델 | 얼마나 이어서 이해했나 | SOLO | 이해 단계: 나열해 둠 → 서로 이음 → 원리로 넓힘 |

- 근거: Meyer의 구조 전략 연구 — 저자의 최상위 구조를 따라 읽는 독자가 이해·기억 모두 앞선다. 구조 비교 자체가 학습 장치다.
- 원문 짜임은 **신호(signaling, Lorch)**에서 읽는다: 접속어(먼저/그다음, 그러나, 그래서), 예고 문장("문제는 ~"), 열거 표지, 제목.
  신호가 없으면 원문 짜임은 `null`로 두고 판정하지 않는다(원칙 3).
- 이론 이름은 화면에 쓰지 않는다. 구조도 아래 "MOONS는 구조를 이렇게 봐요"를 펼칠 때만 보인다.
- 기존 6구조(지식나열·인과·비교·주장-근거·이항대립·문학)는 짜임에 흡수한다: 지식나열→나열, 인과→원인→결과, 이항대립→비교. 빠져 있던 **순서**, **문제→해결**을 더한다. IRAC·ANT·문학 관점은 MOONS 대화의 질문 틀로 남긴다.

### 13.3 데이터 (outline 섹션 확장, `lib/server/outline.ts`)
- `entry.meta.textKind`: `'descriptive' | 'normative' | 'narrative' | null` — 사용자가 쓰거나 고른 값이 우선, 없으면 AI 제안(제안 표시).
- `Section`에 추가: `frame` (짜임, 위 6개 중 하나), `frameBy: 'moons' | 'user'`, `solo: 'listed' | 'linked' | 'extended'`.
- edge에 추가: `rel` (위 관계어 중 하나), `relBy: 'moons' | 'user'`. 지금의 `label`(사용자 표기 그대로, 예 "<->")은 그대로 둔다.
- 사용자가 바꾼 짜임·관계는 `*By: 'user'`가 되고, 다시 구조화해도 덮어쓰지 않는다(원칙 2).

### 13.4 화면
- **노트**: 섹션 제목 옆에 짜임 태그, 열린 코멘트 수가 달린 달 아이콘.
- **구조도**: 섹션마다 짜임 태그(눌러서 바꿈) + 이해 단계 태그. 선은 모양으로만 그린다:
  화살표 = 순서·원인·해결·용도, 실선 = 종류·부분, 점선 = 속성·사례, 이중선 = 대비, 점 = 그냥 나열.
  선을 누르면 관계 이름이 보이고 바꿀 수 있다("관계 이름 모두 보기"로 한꺼번에). 노드 글자는 바로 고치고, 노트에도 반영된다.
  사용자가 바꾼 선은 다른 색으로 남는다.
- **원본과 비교**(기존 버튼 `Moons.tsx` Compare 탭): 위에 `문장 | 구조` 전환.
  - 문장: 지금 그대로(Kept/Shifted/Added/Missed + shift_type).
  - 구조: 섹션마다 내 짜임 · 원문 짜임 · 원문이 남긴 신호(원문 문장 인용, 신호 단어 표시) · 결과(Kept/Shifted, 원문에 없는 섹션은 Added, 노트에 없는 원문 단락은 Missed).
  - 두 층 요약 수치를 위에 같이 보인다.
- 원본 없이 들어온 dump는 비교 탭 없이 내 짜임과 이해 단계만 보인다.

### 13.5 MOONS 코멘트
- 모든 MOONS 피드백(구조 · 문장 · 관계 · 빠진 것)은 코멘트로 **한 화면 목록**에 모인다(데스크톱 오른쪽, 휴대폰 아래).
- 코멘트의 달 아이콘: 한 번 누르면 그 부분으로 이동·강조, **한 번 더 누르면 그 부분에 대한 채팅**이 열린다.
- 코멘트에 고칠 제안이 있으면 채팅 안에 `이대로 고치기` / `그대로 두기`. 고치기는 노트 · 구조도 · 비교 결과에 한 번에 반영한다.
- "빠진 것" 코멘트에는 고치기 버튼이 없다. 빈칸은 MOONS가 채우지 않고 사용자가 쓴다.
- 데이터: `comment {id, entryId, anchor: {section, node?, edge?, sentence?}, kind: 'structure'|'sentence'|'relation'|'missing', text, evidence: number[] (원문 문장), proposal: ops | null, status: 'open'|'applied'|'kept'}`. 채팅은 기존 스레드에 `kind:'comment', ref: comment.id`로 붙인다.

### 13.6 평가
- 리뷰(`Send for review`, `scripts/read-reviews.mjs`)에 두 층을 다 싣는다: 섹션별 짜임 · 관계어 · 원문 신호 근거, 문장 판정.
- 구조 층 점검 항목: 원문 짜임이 신호 문장으로 뒷받침되는가, 신호 없는 판정이 있는가, 관계어가 원문 문장과 맞는가, 사용자가 바꾼 값을 재구조화가 덮었는가.

### 13.7 구현 메모 (2026-10-17)
- 서버: `prompts.ts` FRAME_GUIDE · 스키마(frame/solo/text_kind, edge rel), `outline.ts` 섹션 frame/solo,
  `v5/structure-compare.ts` 구조 층(신호 단어가 원문 문장에 글자 그대로 있어야 원문 짜임 인정), `v5/user-choices.ts` 재구조화 때 사용자 선택 유지.
- 클라이언트: `lib/structure.ts`(라벨, 판정, 코멘트 모으기, 제안 적용), `Outline.tsx` 짜임·이해 단계 태그와 선 관계 버튼,
  `CommentsPanel.tsx`(코멘트 목록 + 코멘트별 대화, 대화는 채팅 목록에도 남음), `StructureComparisonView.tsx`(비교 탭 `문장 | 구조`).
- 노드 글자는 원문 그대로라 구조도에서 고치지 않는다. 구조도에서 고치는 것은 짜임, 선의 관계, 글 성격.
- 문장 코멘트(Shifted)에는 `이대로 고치기`가 없다. 내 말은 대화에서 고치고, 대화의 노드 초안(draftNode)으로 남긴다.
- 구조 층은 비교할 때 한 번 만든다. 비교 뒤 재구조화하면 "예전 구조 기준" 안내와 `다시 비교`가 뜬다.
