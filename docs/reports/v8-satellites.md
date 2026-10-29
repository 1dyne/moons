# v8 보고서 — Satellites 공통 틀 · MOONS MCP (S1~S5)

## 1. 바뀐 것
- **S1 내 공간**: Satellite 화면 아래 "내 공간"(외부 Satellite 목록 + 공간 연결: 이름·주소(https)·용도). `/satellite/:id` 공간 화면: 열기(새 탭) / MOONS에서 보기(사이트가 허용할 때 안에 띄움) / 기록 / 설정(My Space 표시·관련 주제·들어오는 방법·기록 토큰·제거). 내장 장치(Dock·일정표 등)는 위의 장치 목록 그대로.
- **S2 기록과 들어온 것**:
  - `POST /api/satellite-records` + Satellite별 토큰(한 번만 보임, 교체·끊기). 같은 id는 한 번만, 64KB, 분당 120회, 계약 밖 필드는 버림.
  - "MOONS에 추가" 버튼(`apply:"request"`)은 그 기록을 그대로 정리안으로 → **들어온 것**(헤더 받은편지함 아이콘, 숫자).
  - 승인 화면: 내 말 / 활동 기록 / MOONS 정리가 칸으로 나뉘고, 줄마다 빼기, 제목 고치기. 승인하면 `kind:'record'` **활동 기록 노트** — 원문은 내 말 + 활동 기록만, MOONS 정리는 원문 밖(AI 층). Satellite의 관련 주제로 분류됨. 노트 탭 필터 "활동 기록".
  - 기록에 이름이 나온 개념은 AI 없이 이어짐(내 말 줄의 언급만 "내 말"). 반복 오답 개념은 "확인됨" 이상으로 올라가지 않음.
- **S3 에이전트**: 공간마다 버튼으로만 / 열 때 에이전트 / 요청할 때 에이전트. 열 때 = 그 공간이나 들어온 것을 열 때 새 기록이 있으면. 설정 → Satellite 에이전트: 최소 간격(기본 6시간)·한 번에 읽을 기록 수(기본 50)·이번 달 호출 수와 추정 비용. 모델 단계 `satellite_digest`. 에이전트가 붙이는 개념은 기록에 실제로 나온 말만.
- **S4 MOONS MCP**:
  - 원격 MCP `https://<MOONS 주소>/mcp` (Streamable HTTP). MOONS가 OAuth 2.1 서버(동적 클라이언트 등록, PKCE, 코드 1회용, 액세스 1시간·리프레시 60일·회전).
  - 연결 허락 화면 `/connect/:id`는 MOONS 로그인으로 확인 → 토큰은 그 공간에만 묶임. 설정 → 연결된 AI에서 끊기.
  - 도구 16개: `moons_guide`, `search_notes`, `get_note`, `list_concepts`, `get_concept`, `list_questions`, `get_question`, `recent_activity`, `add_material`, `propose`, `save_session`, `satellite_guide`, `register_satellite`, `list_satellites`, `get_records`, `post_feedback`.
  - 사용자 지식으로 들어가는 것(propose·save_session)은 전부 들어온 것 함을 거침. `add_material`은 AI 자료로만. 클로드가 옮긴 사용자 말은 "클로드가 옮긴 내 말"로 표시.
- **S5 My Space**: Satellite가 관련 주제(첫 번째) 옆에 위성으로 뜸(3D·평면 지도 둘 다). 관련 주제가 없으면 왼쪽 아래 Satellite 구역. 누르면 설명·기록·열기. 툴바의 위성 아이콘으로 전체 보이기/숨기기, 공간별로는 설정에서. 관련 주제가 비면 그 공간에서 들어온 노트들의 주제를 제안만 함.

## 2. 체크리스트
- [x] 서버 단위 55, 통합 18(새 2: 토큰이 자기 공간에만·버튼 → 승인 → 활동 기록 노트·중복·끊은 토큰 거절 / OAuth 코드 1회용·리프레시 회전·끊으면 토큰 무효·만료 요청 거절), 클라이언트 70 통과. 타입체크·빌드 통과.
- [x] 실제 MCP 클라이언트(SDK)로 전체 흐름: 메타데이터 → 401 안내 → 등록 → 허락 화면 → 코드 → 토큰 → 도구 16개 호출(Satellite 등록·제안·대화 저장·자료·잘못된 주소 거절) → 리프레시.
- [x] 브라우저: 공간 목록·기록 3·받은편지함 숫자, 열 때 에이전트로 정리안 생성, 승인 → 활동 기록 노트(내 말 먼저, MOONS 정리는 원문 밖), 개념 연결, 내 우주에서 "공부" 옆 위성, 설정의 연결된 AI 1, 허락 화면 → 코드와 함께 돌아감. 콘솔 오류 없음.
- [ ] 실제 claude.ai 커스텀 커넥터 연결 — 배포 주소로 사용자가 확인.

## 3. 클로드에 연결하는 법
1. claude.ai → 설정 → 커넥터 → 커스텀 커넥터 추가 → URL: `https://<MOONS 주소>/mcp` (설정 → 연결된 AI에 정확한 주소가 보임).
2. 연결 누르면 MOONS 허락 화면이 열림 → MOONS 로그인 상태에서 "연결하기".
3. 클로드에게: "MOONS 도구 안내 먼저 읽어 줘" → 이후 노트 읽기·제안·Satellite 만들기.
- 주소: 기본은 Railway 공개 도메인. 다른 도메인을 쓰면 Railway 변수 `MOONS_PUBLIC_URL=https://…`를 넣어야 OAuth 주소가 맞음.

## 4. LEET drill 쪽에 할 일 (그 클로드에게 전달)
- MOONS MCP의 `satellite_guide`를 읽고, `register_satellite`(이름·LEET drill 주소)로 토큰을 받는다.
- LEET drill 서버가 풀이 제출·채점 때 `POST /api/satellite-records`로 기록을 보낸다(문항별 정오는 items, 사용자가 친 풀이 흔적은 userText).
- 결과 화면에 "MOONS에 추가" 버튼(`apply:"request"`).

## 6. 물을 것
- 에이전트 정리안은 지금 공간당 한 번에 하나(새 기록 전부를 묶음). 기록마다 따로 원하면 바꿀 수 있음.
- 활동 기록 노트의 내 말 줄이 개념을 "설명"하는지는 AI 없이 판단하지 않음(구조화하면 판단). 승인할 때 자동으로 개념 추출까지 돌릴지(비용 발생).
