# Dock 재설계 구현 보고

2026-10-26 · 기존 프로젝트 1단계 구현 `6e28dc9` 위에서 수정했다. 설계·사용법·공식 참고 자료는 [MOONS_DOCK.md](../MOONS_DOCK.md)에 있다.

## 변경 사항

- Satellite을 장치 둘러보기/내 장치/소개·권한 안내/설치·업데이트·정지·제거가 있는 광장으로 변경했다. 공통 manifest와 공간별 설치 상태를 추가했고 프로젝트 장치를 **Dock**으로 명명했다.
- Dock을 전체 프로젝트 개요, 프로젝트 상세, 주간 일정, 검토함, 서비스 연결, 맥락, 사용량·비용으로 나눴다. 이름·목표만으로 시작하고 서비스는 나중에 연결한다.
- 프로젝트 목표일·단계·이정표와 기존 플래너 작업을 연결했다. 확정 지시서의 버전을 일정으로 추가하며 같은 버전의 중복 추가를 막는다.
- Railway 환경별 서비스, Cloudflare Pages 운영 배포, Workers 메타데이터, Neon 프로젝트·컴퓨트 조회, 기타 대시보드 바로가기를 추가했다. 키는 암호화하고 소유 공간별로 분리한다.
- 서비스 응답의 환경변수·비밀 설정을 제거하고 정제된 상태와 확인 시점만 저장한다. AI 검토에도 같은 상태 및 일정 맥락을 전달한다.
- Dock 정지/제거 시 서버의 변경 API, 측정값 수신 및 검토 처리를 차단한다. 계정 이동 시 서비스 연결도 함께 이동한다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 공유 라이브러리 빌드, 클라이언트·서버 TypeScript | 통과 |
| Vite 프런트엔드 / API 서버 production build | 통과 |
| 클라이언트 단위 테스트 | 68개 통과 |
| 서버 단위 테스트 | 50개 통과. AI 라우팅 2개는 loopback 접근 제한으로 별도 재실행 |
| 프로젝트 DB 통합 테스트 | 10개 통과 |
| 기존 동기화 DB 통합 테스트 | 11개 통과 |
| 새 공급자·자격증명·계정 이동 통합 테스트 | 6개 통과 |
| 브라우저 시나리오 | 2개 각각 단독 실행 통과 |

브라우저 시나리오는 (1) 장치 설치 → GitHub 없이 프로젝트 생성 → 이정표 → Railway/Cloudflare/Neon 리소스 선택 → 작업 완료·개요 반영, (2) 아이디어 → 검토·논의 → 확정 지시서 다운로드 → 일정 추가 → 전달·결과 기록 → 비용 수신·사용자 분리 → 한글 모바일 → 정지 시 API 차단을 확인했다. 데스크톱과 390px 모바일 스크린샷을 눈으로 확인했다.

테스트 중 선택 상자의 label 검사 조건을 접근성 combobox 검사로 수정했다. Windows에서 두 브라우저 시나리오를 묶어 실행할 때 추적 ZIP 쓰기 오류 및 타임아웃이 발생하여 최종 확인은 시나리오별 독립 실행으로 수행했다. 묶음 실행의 안정성은 후속 확인 항목이다. Vite의 기존 큰 청크 경고는 남아 있다. Dock 자체는 별도 지연 로딩 청크다.

모든 공급자·AI 응답은 테스트용 데이터이고 DB는 메모리 PGlite다. 실제 API 키·유료 AI 호출·실계정 공급자 QA·운영 배포는 수행하지 않았다.

## 재현 명령

저장소 루트:

```powershell
node node_modules/typescript/bin/tsc -b lib/moons-sync lib/db lib/api-zod lib/api-client-react
node node_modules/typescript/bin/tsc --noEmit -p artifacts/moons/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p artifacts/api-server/tsconfig.json
```

`artifacts/api-server`에서:

```powershell
node --experimental-strip-types --test src/moons/tests/*.test.ts
node scripts/run-integration.mjs src/moons/tests/projects.integration.ts
node scripts/run-integration.mjs src/moons/tests/connectors.integration.ts
node scripts/run-integration.mjs src/moons/tests/sync.integration.ts
node build.mjs
```

`artifacts/moons`에서:

```powershell
node --experimental-strip-types --test src/tests/*.test.ts
node node_modules/vite/bin/vite.js build
node node_modules/@playwright/test/cli.js test --config playwright.projects.config.ts --grep 'Dock onboarding'
node node_modules/@playwright/test/cli.js test --config playwright.projects.config.ts --grep 'idea to discussion'
```

## 실사용 QA 순서

1. 지속 DB·암호화 키·기존 MOONS AI 설정을 갖춘 테스트 배포에서 장치 설치와 재접속을 확인한다.
2. 본인 테스트용 서비스의 제한된 토큰으로 연결·새로 확인·권한 부족·연결 해제를 확인한다. Railway/Neon 토큰은 자체 수정 권한이 있을 수 있으므로 설정 안내를 따른다.
3. 다른 계정에서 프로젝트·연결·비용이 보이지 않는지 확인한다.
4. 실제 아이디어와 스펙으로 검토안의 품질을 평가하고 확정 지시서를 코딩 에이전트에 전달해 작업 결과까지 점검한다.
5. 앱 서버의 측정값을 수신하고 공급자 청구 화면과 비교한다. 현재 비용은 추정/보고값이며 자동 청구서 조회가 아니다.

## 남은 제품 범위

외부 개발자의 장치 업로드·배포/샌드박스, OAuth, 공급자 청구 API 자동 통합, 주기적 서비스 상태 갱신, 외부 푸시 알림, 대화 자동 수집 확장, 코딩 에이전트 자동 실행은 이번 구현에 포함되지 않는다. 기존 수동 승인·지시서 전달 단계를 유지했다.
