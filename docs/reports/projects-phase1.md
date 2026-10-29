# Project Satellite 1단계 구현 보고

> 최신 화면·장치 구조와 연결 사용법은 [Dock 재설계](../MOONS_DOCK.md)를 따릅니다. 아래는 최초 1단계 구현의 기록입니다.

기준 커밋: `9db6161` (v7 briefing). 기존 v7 스펙에 프로젝트 검토·지시서·연결 대시보드를 추가했다. 사용법과 운영 경계는 `docs/MOONS_PROJECTS_PHASE1.md`에 있다.

## 구현 위치

| 영역 | 파일 |
|---|---|
| 공통 데이터 / Markdown 지시서 | `lib/moons-sync/src/projects.ts` |
| 소유 공간별 프로젝트·제안·측정값 | `artifacts/api-server/src/moons/lib/server/projects/schema.ts`, `service.ts` |
| 새 덤프 감지 / 작업 임대·재시도 | `projects/queue.ts`, `worker.ts`, 기존 `v5/workspace-store.ts` |
| 매칭·검토안 생성·대화 | `projects/review.ts`, 기존 `ai/catalog.ts` |
| SHA에 고정한 GitHub 맥락 수집 | `projects/github.ts` |
| 세션 인증 관리 API / 토큰 수신 API | `artifacts/api-server/src/moons/projects-router.ts` |
| 익명 → 계정 이동 | 기존 `v5/claim.ts` |
| Satellite·덤프 태그·알림 연결 | 기존 `Moons.tsx`, `Satellite.tsx`, `NotificationCenter.tsx` |
| 프로젝트 화면 / 검토 및 확정 | `artifacts/moons/src/components/ProjectSatellite.tsx` |
| 갱신·충돌·오류 표시 / 한국어 / 스타일 | `project-client.ts`, `projects-i18n.ts`, `styles/projects.css` |
| 앱 서버 측정값 전송 예제 | `examples/project-events.mjs` |

## 검증

- 클라이언트 단위 테스트 65개 통과.
- 서버 단위 테스트 50개 통과. 기존 공급자 테스트에 외부 주소 차단을 추가했으며 더미 키와 로컬 서버만 사용한다.
- 신규 DB 통합 테스트 10개 통과: 소유권, 원문 보존, 큐 중복 방지, 태그/자동 매칭, 대화/확정 분리, 승인본 불변성, 버전별 결과, 토큰 재전송/폐기, 진행 중 중지, 비용 증분/최신값 집계, 계정 병합.
- 기존 동기화 통합 테스트와 서버/클라이언트 타입 검사 및 빌드 확인.
- 브라우저에서 실제 화면과 API를 연결해 프로젝트 등록 → 저장소 스냅샷 → 대화 맥락 추가 → 태그 덤프 → 검토안 논의 → 확정 → 다운로드 → 전달/결과 → 비용 수신 → 별도 사용자 격리를 검증한다. 390px 모바일 화면도 확인한다.
- 브라우저 테스트는 메모리 DB와 고정 AI/GitHub 응답이다. 실제 모델의 제안 품질, 실제 비공개 저장소 권한, 실서비스 배포 환경은 별도 QA 대상이다. 유료 AI 호출은 하지 않았다.

## 재현 명령

저장소 루트에서 의존성을 설치한 뒤 공통 타입을 빌드한다.

```sh
node node_modules/typescript/bin/tsc -b lib/moons-sync lib/db lib/api-zod lib/api-client-react
node node_modules/typescript/bin/tsc --noEmit -p artifacts/api-server/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p artifacts/moons/tsconfig.json
```

`artifacts/api-server`에서:

```sh
node --experimental-strip-types --test src/moons/tests/*.test.ts
node scripts/run-integration.mjs src/moons/tests/projects.integration.ts
node scripts/run-integration.mjs src/moons/tests/sync.integration.ts
node build.mjs
```

`artifacts/moons`에서:

```sh
node --experimental-strip-types --test src/tests/*.test.ts
node node_modules/vite/bin/vite.js build
node node_modules/@playwright/test/cli.js test --config playwright.projects.config.ts
```

Windows의 기본 Chrome 경로를 사용한다. 다른 환경은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`을 지정하거나 Playwright Chromium을 설치한다. 테스트 서버는 `127.0.0.1:4317`에만 바인딩한다. `project-preview.ts`는 실제 자격 증명·외부 네트워크·영구 DB를 사용하지 않는다. 산출 이미지는 git에서 제외한 `generated-artifacts/projects-*.png`에 저장한다.

## 사용자가 확인할 QA

1. 본인 프로젝트 하나를 연결하고 실제 README/스펙 경로를 지정한다.
2. AI 설정을 연결한 뒤 태그 덤프 하나와 태그 없는 덤프 하나를 넣는다. 근거 없는 제안이나 과도한 미결정 질문이 나오는지 평가한다.
3. 논의 후 확정한 지시서를 Codex/Claude Code에 전달하고, 추가 설명 없이 적절한 범위로 구현하는지 확인한다. 결과를 해당 버전에 붙인다.
4. 앱 서버에서 측정 이벤트를 보내고 추정값/청구 스냅샷이 의도대로 표시되는지 확인한다.

## 아직 하지 않은 연결

OS 푸시, 대화 자동 수집 플러그인/MCP, 공급자별 청구 API 자동 수집, 자동 코딩 실행·병합·배포. 현재 GitHub 갱신은 사용자가 실행하며, 화면에는 마지막 확인 시각을 표시한다. 배포 전에는 지속 DB, 상시 실행 작업자, 암호화 키 및 실제 사용자 인증 설정을 확인해야 한다.
