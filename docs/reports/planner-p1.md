# Planner Satellite P1 보고서 — 저장소 · 기본 화면 · 만들기 대화(AI 없음) (2026-10-31)

기준: [PLANNER_SPEC_v1](../PLANNER_SPEC_v1.md), [LIFE_DATA_CONTRACT_v0](../LIFE_DATA_CONTRACT_v0.md).

## 1. 만든 것
- **생활 데이터 허브** `/api/life/v1` (api-server `src/life/`, 테이블 `life_*`·`planner_specs`, MOONS 노트 테이블과 분리)
  - 기록 쓰기·고치기·지우기. 허브가 ULID와 계정 단위 revision을 매긴다. 오래된 revision으로 쓰면 409, 종류 변경·지운 기록 수정 거절.
  - 지우기는 tombstone. `GET /changes?since=`에 그대로 나온다. 모든 revision은 `life_revisions`에 남고 `GET /items/:id/history`로 본다.
  - `GET /items`(기간·basis·kinds·cursor), `GET /now`(ETag, 바뀐 게 없으면 304), `GET /connection`, 설정, Spec 버전 저장.
- **`lib/life-contract`**: 계약 타입·검증, 논리 하루(타임존+하루 경계), ISO 주, 목표 사다리 진행률(아래 목표의 할 일까지 위로 집계), 루틴 달성률(`pick_daily`는 그날 고른 것만), `now` 스냅샷, 공유 범위 필터(사적 필드 제거), 합성 예시 `fixtures/week-basic.json`.
- **`lib/planner-spec`**: PlannerSpec 스키마, 모듈 카탈로그(구체화 질문·변형·함께 쓰면 좋은 모듈과 이유), 템플릿 3개(하루 정리·오늘의 루틴·목표 사다리), AI 없는 만들기(`propose`→`compose`).
- **플래너 앱** `artifacts/planner` (독립 주소, PWA)
  - 만들기 대화: 베이지 달 + 말풍선 → 말하기 또는 템플릿 칩 → 구체화 질문(칩) → MOONS 제안(이유, 켜고 끄기) → 이름 → **목업**(오른쪽, 모바일은 아래. 실제 렌더러 + 예시 기록, 눌러 볼 수 있음) → 이대로 쓰기.
  - 매일 쓰기: 오늘(할 일: 꼭·하고 싶은·여가, 분량, 목표 연결, 완료·일부·못 함·내일로·취소·되돌리기 / 루틴: 고르기→체크, 못 한 이유 / 이어진 목표 / 컨디션 / 수면 / 하루 돌아보기 + 나만 보기), 목표(연간→월간→주간 사다리, 목표 대시보드: 진행률·위아래 목표·이어진 하루들), 달력(날마다 완료/계획), 설정(플래너 고치기, 하루 경계, 로그인).
  - "플래너 고치기"는 Spec 새 버전만 만든다. 기록은 그대로.

## 2. 확인
- [x] 단위: life-contract 8, planner-spec 5. 통합(PGlite): 허브 3(설정·Spec 버전 / revision·409·이력·`now` 진행률 / tombstone·changes·계정 격리).
- [x] 타입 검사: libs·api-server·planner. 빌드: planner·api-server.
- [x] 브라우저(Playwright, 실제 서버+PGlite): "루틴 트래커 만들고 싶어" → 질문 3개 → 제안(목표·수면) → 목업에서 루틴 고르고 체크 → 이대로 쓰기 → 루틴 추가·고르기·체크, 할 일 추가, 컨디션, 목표 추가, 목표에 이은 할 일 완료 → `/now`가 `40/600 단어`, 루틴 1/1(`committed_today`)을 돌려줌, 같은 ETag 재조회 304. 새로고침 후 유지. 390px 폭 가로 스크롤 없음. 콘솔 오류 0.
- [ ] 소비자 OAuth(`life.*` 범위, 허락 화면) — P3. 지금 `/api/life/v1`은 플래너 자신의 세션(게스트 쿠키 또는 Clerk)으로만 읽힌다.
- [ ] 실제 모의 우주 연결 검증 — P3.

## 3. 배포 (Railway, 같은 이미지로 서비스 하나 더)
1. 같은 저장소·같은 Dockerfile로 새 서비스 `planner`를 만든다.
2. 변수: `WEB_DIST_DIR=/app/artifacts/planner/dist/public`, `MOONS_DATABASE_URL`(MOONS와 **같은** DB — 허브가 하나여야 한다), `MOONS_PROJECT_WORKER=off`, Clerk를 쓰면 `CLERK_PUBLISHABLE_KEY`·`CLERK_SECRET_KEY`.
3. 도메인을 붙인다. 플래너 도메인이 MOONS와 다르면 Clerk 대시보드에서 그 도메인을 추가해야 MOONS 계정 로그인이 된다.
4. 로컬: `pnpm --filter @workspace/api-server run dev`(8080) + `pnpm --filter @workspace/planner run dev`(5174, `/api` 프록시).

## 4. 알아 둘 것
- 로그인 전에 게스트로 쓴 플래너 기록은 그 브라우저의 게스트 공간에 있다. 로그인한 계정에 옮기는 기능은 아직 없다(MOONS의 게스트 → 계정 옮기기는 노트용). 처음부터 로그인하고 쓰는 것을 권한다.
- 만들기 대화는 아직 카탈로그 규칙만 쓴다(AI 호출 0). 카탈로그에 없는 말은 기본 틀로 시작한다. 자유 대화·패치·종이 사진은 P2.
- 그리지 않는 모듈(시간표·프로젝트·지표·메모)은 Spec에는 들어가고 화면에는 "곧"으로 보인다.
- 계약 변경: 결과 값에 `missed`(사용자가 "못 했다"고 보고) 추가. 소비자에게 결과 공유 범위가 없으면 `outcome`은 `null`.

## 5. P1.1 — 종이 플래너형 데일리 · 타임 트래커 (같은 날 추가)
- 데일리를 카드 나열에서 **종이 플래너 구조**로 바꿈: 위 집중 바, 왼쪽 할 일(○△× 동그라미), 오른쪽 10분 타임테이블, 아래 하루 영수증. 어제 못 끝낸 일 옮기기. 분량은 제목에서 바로 읽음("수학 20문제" → 20문제).
- **타임 트래커**: 할 일의 ▶로 시작, 한 번에 하나(다른 걸 시작하면 앞의 것이 멈춤), 1분 미만은 잘못 누른 것으로 보고 버림. 실행 중인 기록은 서버에 있어 새로고침·다른 기기에서도 이어짐. 빈 칸을 눌러 직접 칠하기.
- 계약: `session` 종류 추가, `now.focus`(지금 집중 중인 일·경과 분·오늘 순집중·할 일별). 변경 알림 후보에 `focus.started`·`focus.stopped`.
- 카탈로그: `timer` 모듈(트리거: 열품타·순공·타이머·타임테이블…), 할 일·루틴의 제안에 타이머 추가. "하루 정리"·"목표 사다리" 템플릿에 타임테이블 기본 포함. 질문은 모듈마다 돌아가며 최대 3개.
- 달 색: 노랑(`#fbe4b0`).
- 확인: 브라우저에서 "열품타처럼 집중 시간 재는 데일리 플래너" → 질문 → 목업(타이머가 흐름) → 이대로 쓰기 → 할 일 3개 → 07:00·07:10 칸 칠하기(한 블록 20분으로 합쳐짐) → ▶ 시작 → `/now`의 `focus.active`가 그 할 일, 오늘 순집중 20분. 390px 가로 스크롤 없음, 콘솔 오류 0.
