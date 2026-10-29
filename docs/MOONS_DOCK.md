# Satellite 광장과 Dock

2026-10-26 · 프로젝트 장치 재설계. 이전 `MOONS_PROJECTS_PHASE1.md`의 검토·승인·지시서 규칙을 유지하면서, 장치 설치와 프로젝트 관리 화면을 이 문서의 구조로 교체한다.

## 제품 구조

Satellite은 사용자가 장치를 찾아 설치하는 광장이다. Dock(도크)은 그 안에서 선택하는 **프로젝트 관리 장치 하나**다. Schedule, Impostor, Form builder도 같은 장치 목록에 놓인다.

```text
MOONS 공간
├─ 생각·대화·노트·알림
└─ Satellite: 장치 둘러보기 / 내 장치
   ├─ Dock: 프로젝트 총괄
   │  ├─ 프로젝트 A: 목표·일정·검토함·맥락·사용량
   │  │  └─ GitHub + Railway + Cloudflare + Neon + 기타 바로가기
   │  └─ 프로젝트 B: 필요한 서비스만 별도로 연결
   ├─ Schedule
   ├─ Impostor
   └─ Form builder
```

현재 설치 대상은 MOONS가 제공하는 내장 장치다. 공통 manifest에 이름·버전·경로·사용 기능을 정의하고, 공간 설정에 설치 버전·활성 상태·설치 시각을 저장한다. Dock 화면 코드는 접근할 때 별도 번들로 로드한다. 임의 개발자가 코드를 업로드하는 외부 플러그인 배포망이나 샌드박스까지 구현된 것은 아니다. 이를 열 때는 패키지 검증, 서명, 실행 격리, 권한별 API, 호환성·롤백 정책이 추가로 필요하다.

장치 일시정지/제거는 Dock의 변경 API, 이벤트 수신, 검토 작업을 막는다. 기존 노트·일정·프로젝트·연결 자격증명은 보관하므로 다시 설치하면 이어 쓸 수 있다. 자격증명도 삭제하려면 해당 서비스의 **연결 해제**를 먼저 누른다. 연결 해제는 MOONS의 저장 키만 삭제하며 공급자 측 토큰 자체는 공급자에서 폐기한다.

## 사용자 흐름

1. **Satellite → Dock → 장치 소개 → 장치 설치 → 열기.** 기존 프로젝트 장치를 켰던 공간은 설치 목록으로 호환되며 새 버전으로 업데이트할 수 있다.
2. **새 프로젝트**에서 이름·목표를 입력한다. 목표일과 진행 단계는 선택 사항이다. 기존 플래너 프로젝트를 선택하면 같은 ID를 사용한다. 저장소 없이도 시작할 수 있다.
3. 프로젝트 **개요**에는 오늘 할 일, 기한 지난 작업, 검토 대기, 목표일과 다음 할 일이 보인다. 이정표로 첫 공개·테스트 완료 같은 체크포인트를 기록한다. 전체 개요의 프로젝트 카드에는 완료 비율·다음 작업·검토 수·연결 수가 표시된다. 완료 비율은 등록된 작업 중 완료한 비율이다.
4. **일정**에서 이번 주의 날짜를 고르고 작업·시작 시간·예상 시간을 입력한다. 기한 지남/미정 필터로 일정 누락을 정리한다. 같은 작업이 기존 Schedule 플래너에도 나타난다. Schedule 장치 설치는 Dock 사용의 필수 조건이 아니다.
5. **연결**에서 실제 쓰는 서비스만 추가한다. 계정/토큰 입력 → 접근 가능한 리소스 조회 → 대상 선택 → 연결 순서다. 코드 저장소는 GitHub 설정에서 별도로 연결한다.
6. **맥락**에서 사용할 노트를 선택하고 다른 AI와의 대화를 출처와 함께 붙여넣는다. 자동 대화 수집 확장 프로그램은 후속 범위다.
7. 생각을 덤프할 때 프로젝트를 태그한다. 태그가 없으면 관찰 중인 프로젝트에 적용 가능한지 매칭한다. API 서버가 켜져 있으면 브라우저를 닫아도 작업자가 검토안을 준비한다.
8. **알림/검토함 → MOONS와 논의 → 미결정 질문 해소 → 안건 확정.** 확정 버전을 Markdown으로 복사/다운로드해 Claude Code/Codex에 직접 전달한다. **일정에 추가**로 실행 날짜를 정한다. 같은 지시서 버전은 중복 등록되지 않는다.
9. 전달 완료와 PR·작업 결과를 기록한다. 결과 보고는 일정 자동 완료를 뜻하지 않는다. 작업 완료는 일정에서 직접 표시한다.

진행 단계의 `일시정지`는 프로젝트 분류다. 자동 아이디어 검토의 중단은 개요의 **아이디어 검토 일시정지**, 전체 Dock 중단은 Satellite의 **장치 일시정지**로 구분한다.

## 서비스별 역할과 현재 지원

GitHub, Railway, Cloudflare, Neon은 서로 대체하는 저장소가 아니다. 한 프로젝트가 여러 서비스를 사용하므로 프로젝트 아래에 여러 연결을 두었다.

| 연결 | 입력·권한 | 현재 표시하는 정보 |
|---|---|---|
| GitHub | 저장소 주소, 비공개 저장소 읽기 토큰 | 기본 브랜치 커밋·SHA·checks·선택 파일의 맥락 |
| Railway | 해당 환경의 프로젝트 토큰, 서비스 선택 | 환경·서비스·최근 배포 상태 |
| Cloudflare Pages | 계정 ID, Pages Read 토큰 | 운영 브랜치·운영 배포 상태. 최신 preview를 운영 상태로 표시하지 않음 |
| Cloudflare Workers | 계정 ID, Workers Scripts Read 토큰 | 스크립트 메타데이터·호환성 날짜. 요청 분석/가동률 측정은 아님 |
| Neon | API 키, 필요 시 조직/프로젝트 ID | 프로젝트·지역·컴퓨트 수·active/idle 등 상태. idle은 scale-to-zero일 수 있음 |
| 다른 서비스 | HTTPS 대시보드 주소 | 바로가기. 자동 상태·비용 수집 없음 |

조회 결과는 **마지막 확인 시점의 스냅샷**이다. 새로 확인 버튼으로 갱신하며 주기적 공급자 폴링은 아직 없다. 실패하면 이전 스냅샷과 확인 필요 상태를 함께 유지한다. 목록 조회는 첫 페이지까지이며 제한을 표시한다. Neon은 프로젝트 ID 직접 조회도 지원한다.

모든 공급자 호출은 고정 호스트와 고정 읽기 작업만 사용한다. Railway는 GraphQL query만 호출하며 `Project-Access-Token` 헤더를 쓴다. Cloudflare가 반환하는 환경변수·비밀 설정은 저장/응답/AI 맥락에서 제외한다. Neon은 DB 접속 문자열을 받거나 SQL을 실행하지 않는다. Railway/Neon 키 자체에는 수정 권한이 있을 수 있으므로 Dock의 읽기 동작과 토큰 권한을 동일하다고 설명하지 않는다. OAuth 계정 연결은 아직 구현하지 않았으며 현재는 사용자별 토큰 방식이다.

## 사용량과 비용

**Dock → 사용량·비용**은 여러 프로젝트를 모아서, 프로젝트 내부 탭은 해당 프로젝트만 표시한다. 앱의 사용량·오류·배포·비용은 발급한 수신 토큰으로 앱 서버가 `/api/project-events`에 전송한다. 사용 예제는 `examples/project-events.mjs`, 이벤트 형식은 `MOONS_PROJECTS_PHASE1.md`에 있다.

MOONS 자신의 AI 추정 비용과 외부 앱이 보고한 비용을 분리한다. 최근 30일, 통화·출처·추정/보고 기준별로 집계하며 증분 합산과 누적 스냅샷의 최신값을 구분한다. **서비스를 연결했다고 OpenAI/Anthropic/Railway 등의 실제 청구서가 자동 수집되지는 않는다.** 청구 통합은 공급자별 Billing/Usage API와 권한 검증을 별도로 추가할 범위다.

## 데이터와 구현

- 공통 장치 manifest: `lib/moons-sync/src/satellites.ts`. 공간의 `settings.satelliteInstalls` 및 기존 `satellites`로 설치/활성을 관리한다.
- 프로젝트: 기존 `connected_projects`에 목표일·진행 단계·이정표를 추가했다. 선택 맥락과 기존 검토 이력은 보존한다.
- 서비스 연결: 새 `project_connections`에 소유자·프로젝트·공급자·리소스·정제된 스냅샷·revision·암호화 키를 저장한다. 키는 API 응답에서 제외한다. 익명 공간의 계정 이동에도 포함한다.
- 일정: 기존 workspace의 `projects`/`tasks`를 공유한다. 지시서 일정에는 `sourceBriefId`, `sourceProposalId`를 저장한다.
- AI 검토: 선택한 프로젝트의 서비스 스냅샷과 일정 맥락을 함께 제공하고 확정 지시서에도 검토 당시 상태를 기록한다. 서비스 상태는 검증된 코드 품질이나 최신 운영 상태를 보장하지 않는다.
- UI: `Satellite.tsx`, `Dock.tsx`, `DockSchedule.tsx`, `DockConnections.tsx`, `DockReview.tsx`.
- 서버: `projects/connectors.ts`, `projects-router.ts`, 기존 큐/작업자/프로젝트 서비스.

API 서버의 기존 시작 초기화가 새 테이블을 생성한다. 지속 DB와 `MOONS_ENCRYPTION_KEY`가 필요하며, 운영 키가 없는 환경에서 연결 키를 저장하면 실패한다. 운영 배포/실계정 공급자 QA는 별도 진행해야 한다.

## 설계 참고

공식 자료를 바탕으로 프로젝트 중심 정보 구조와 서비스별 조회 권한을 정했다. 제품 구조는 MOONS에 맞춘 설계 판단이며 해당 제품과의 연동을 의미하지 않는다.

- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/): 프로젝트/서비스 개체를 중심으로 여러 도구의 정보를 묶는 구조.
- [Linear Projects](https://linear.app/docs/projects), [Project milestones](https://linear.app/docs/project-milestones): 프로젝트 개요·목표일·이정표·작업을 연결하는 일정 구조.
- [Railway API](https://docs.railway.com/integrations/api), [환경 조회](https://docs.railway.com/integrations/api/manage-environments): 환경 토큰과 서비스별 배포 조회.
- [Cloudflare Pages 프로젝트 조회](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/list/), [Workers 목록](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/), [API 토큰](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/): 계정 범위 권한과 응답 필드.
- [Neon API 키](https://neon.com/docs/manage/api-keys), [API 참조](https://neon.com/docs/reference/api), [Computes](https://neon.com/docs/manage/computes): 프로젝트 범위와 컴퓨트 상태.

## 다음 확장 순서

1. 실계정으로 공급자별 최소 권한·리소스 크기·실패 복구 QA, OAuth/토큰 교체 UX.
2. 비용 공급자 어댑터와 주기적 상태 동기화, 마지막 동기화 실패/예산 알림.
3. 대화 수집 확장 프로그램/MCP, 승인 지시서의 코딩 에이전트 전달 연동.
4. 외부 개발자 장치 배포·격리·권한 체계. 코딩 자동 실행은 별도 승인·실행 한도·격리 작업공간·PR 검증을 갖춘 후 확장한다.
