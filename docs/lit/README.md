# lit

lit은 사용자가 직접 만들고 꾸미는 다이어리·플래너 앱이다. 매일 쓰는 플래너가 메인 화면이고, 위젯·틀·코드 위젯 같은 만드는 도구는 메뉴(≡) 안에 둔다.
MOONS 저장소 안에서 개발했지만 **MOONS와 별개인 앱**이다. 이 폴더(`docs/lit/`)가 lit의 문서 묶음이다.

| 문서 | 내용 |
| --- | --- |
| [README.md](README.md) | 이 문서. lit이 무엇인지, 코드가 어디 있는지, 돌리고 배포하는 법, MOONS에서 떼어 내는 법 |
| [BLOCKS.md](BLOCKS.md) | **블록 구조**: 데이터 문법(entry), 로직 블록, 위젯 연결·자동화, 필터, 스튜디오 UX, 디자인 층(HTML·CSS), AI 도구, 마켓 연결 |
| [AUTOMATION.md](AUTOMATION.md) | lit의 자동화 구조: 기록 하나, 위젯은 필터 보기, 무엇이 무엇을 바꾸는지 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 화면 구조, 데이터(기록·플래너 스펙·라이브러리), API, 계정, 커넥터 |
| [WIDGET_PLATFORM.md](WIDGET_PLATFORM.md) | 내 라이브러리, 위젯 설명서, 블록, 코드 위젯, 보안, 메뉴 UI/UX 설계와 레퍼런스 |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | 개발자용: `lit-widget` CLI, 위젯 API, 예제, 올리기 |
| [REQUESTS_2026-11-10.md](REQUESTS_2026-11-10.md) | 울림 세션 기능 요청(Ante's Orbit)에 대한 답과 쓰는 법 |
| [../PLANNER_SPEC_v1.md](../PLANNER_SPEC_v1.md) | 플래너 스펙(위젯 배치·스킨·탭·속성) 상세 |
| [../LIFE_DATA_CONTRACT_v0.md](../LIFE_DATA_CONTRACT_v0.md) | 기록 계약(할 일·목표·세션·수면…), 다른 서비스와 나누는 규칙 |
| [../LIT_MARKETPLACE.md](../LIT_MARKETPLACE.md) | 마켓플레이스 초안 (추후 설계) |
| [../PLANNER_PROPOSAL_2026-11-09.md](../PLANNER_PROPOSAL_2026-11-09.md) | 조사·결정 기록 (유사 서비스, 다꾸 레퍼런스, 진행률 연결) |

## 한눈에

- **메인:** 오늘 페이지(내가 놓은 위젯) + 탭(주간·월·년·목표·분석·내 페이지). 체크하면 목표·월·년 진행률이 저절로 올라간다.
- **꾸미기:** 위젯을 끌어 놓고 크기·색·글꼴·문구를 바꾼다. 스킨은 기본이 "계기판"이고, 진행률 모양·체크 모양·완료 표시를 고를 수 있다.
- **내가 만드는 구조:** 할 일 속성, 표(DB) 위젯, 탭, 버튼 문구를 그 자리에서 바꾼다.
- **위젯 만들기(블록):** 버튼·타이머·점수·숫자·목록 같은 로직 블록을 골라 조립하고, 기록 묶음·자동화·디자인(HTML·CSS 포함)을 스튜디오에서 정한다. 만든 위젯은 두 번 눌러 다시 연다. 자세히: [BLOCKS.md](BLOCKS.md)
- **메뉴(≡):** 위젯 만들기, 로직(기록 묶음·자동화·내보내기), 내 라이브러리, 설치한 위젯, 개발자, 설정.
- **AI:** Claude의 lit 커넥터(`/lit/mcp`)로 대화하면서 플래너를 만들고, 기록을 넣고, 위젯을 만든다.
- **개발자:** HTML·CSS·TypeScript로 코드 위젯을 만들고 `lit-widget` CLI로 미리 보고 올린다.

## 코드 위치

| 경로 | 무엇 |
| --- | --- |
| `artifacts/planner/` | lit 웹 앱 (Vite + React). `src/screens/`에 화면, `src/styles.css`에 계기판 스타일 |
| `lib/planner-spec/` | 플래너 스펙 스키마(zod): 위젯·스킨·탭·속성, 위젯 설명서(`widgets.ts`) |
| `lib/life-contract/` | 기록 계약: 기록 종류, 하루 경계, 진행률·요약 계산 |
| `lib/lit-widget-sdk/` | 위젯 API 프로토콜, 격리 문서, 호스트, 타입, `lit-widget` CLI |
| `artifacts/api-server/src/life/` | lit 서버: 기록 허브(`store.ts`), 라이브러리(`library.ts`), API(`router.ts`), 커넥터 도구(`mcp-tools.ts`), 목표 AI(`milestones.ts`) |
| `artifacts/api-server/src/moons/` | MOONS 서버 (lit이 같이 쓰는 것: 로그인·OAuth·DB 연결·AI 한도) |

## 로컬에서 돌리기

```bash
pnpm install
pnpm run typecheck:libs
pnpm --filter ./artifacts/planner run build          # artifacts/planner/dist/public
cd artifacts/api-server && pnpm run build
PORT=8091 PGLITE_DIR=./.pg MOONS_PROJECT_WORKER=off \
  WEB_DIST_DIR=$PWD/../planner/dist/public node dist/index.mjs
# http://localhost:8091  (DATABASE_URL이 없으면 PGlite 파일 DB)
```

테스트:

```bash
(cd lib/planner-spec && pnpm test); (cd lib/life-contract && pnpm test); (cd lib/lit-widget-sdk && pnpm test)
(cd artifacts/planner && pnpm test)
(cd artifacts/api-server && pnpm run test:life)        # 기록·커넥터·라이브러리 통합 테스트
```

## 배포 (지금)

- Railway 프로젝트의 서비스 `planner` (`https://planner-production-1394.up.railway.app`). 브랜치에 푸시하면 자동 배포된다.
- 환경 변수: `MOONS_DATABASE_URL`(MOONS와 같은 Postgres), `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`(로그인), `ANTHROPIC_API_KEY` 등(목표 AI), `SESSION_SECRET`, `WEB_DIST_DIR`.
- 커넥터 주소: lit 전용 `…/lit/mcp`, MOONS 통합 `…/mcp`.

## MOONS에서 떼어 내기 (별도 저장소로 옮길 때)

lit이 MOONS에서 빌려 쓰는 것과 옮길 때 할 일:

| 빌려 쓰는 것 | 지금 위치 | 옮길 때 |
| --- | --- | --- |
| DB 연결 `q/transaction` | `api-server/src/moons/lib/server/db.ts` | 작은 pg 래퍼로 복사 |
| 손님·계정 식별 `guest()`, Clerk | `moons/lib/server/v5/workspace-store.ts`, `identity.ts` | lit 자체 세션 + Clerk(또는 MOONS 계정 OAuth)로 대체 |
| OAuth 2.1 서버 (커넥터 로그인) | `moons/lib/server/mcp/oauth.ts`, `mcp-router.ts` | 복사해 lit 이름으로 |
| AI 한도·비용 장부 `withAi` | `moons/lib/server/v5/ai-access.ts` | 복사 또는 lit 자체 한도 |
| 오류 형식 `WorkspaceError`, `limited()` | `moons/lib/server/v5/types.ts`, `http.ts` | 복사 |

옮길 패키지: `artifacts/planner`, `lib/planner-spec`, `lib/life-contract`, `lib/lit-widget-sdk`, `artifacts/api-server/src/life/*`. 테이블(`life_*`, `planner_specs`, `lit_library`, `lit_dev_tokens`)은 MOONS 테이블과 따로라 그대로 옮기면 된다.
MOONS·모의 우주·에너지긴축모드는 기록 계약(`LIFE_DATA_CONTRACT_v0.md`)의 API로 lit 기록을 읽는 소비자로 남는다.

## 이름 주의

npm의 `lit`은 Google의 웹 컴포넌트 라이브러리 이름이다. SDK를 공개할 때는 `@<조직>/lit-widget-sdk`처럼 범위를 붙인 이름을 쓴다(지금은 저장소 안의 `@workspace/lit-widget-sdk`).
