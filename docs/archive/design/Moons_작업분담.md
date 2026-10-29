# Moons 웹 — 작업 분담 & 인터페이스 v0.1

> 함께 보는 문서: `Moons_UI_spec.md`(화면), `Moons_기능정리.md`(기능·구조화 규칙)
> 분담: **Codex = 프론트엔드**, **Claude Code = 백엔드**
> 두 쪽이 동시에 작업하려면 **§2 인터페이스(데이터 타입 + API)** 를 먼저 고정해야 한다. 이 문서는 양쪽에 똑같이 넘긴다.

---

## 0. 먼저 정해야 하는 것 (둘 다 막힘)

| 항목 | 선택지 / 권장 | 상태 |
|---|---|---|
| 프론트 프레임워크 | Next.js(React) 권장 — 라우팅·SSR·API 라우트 겸용 | [ ] |
| 백엔드 형태 | Next.js API 라우트 / 별도 서버(FastAPI 등) | [ ] |
| DB·인증 | Supabase(Postgres + Auth + Storage) 권장 — 혼자 운영하기 쉬움 | [ ] |
| 호스팅 | Vercel + Supabase | [ ] |
| 계정 | 1차는 **다인 1인 사용**(로그인 1개) → 이후 멀티유저 | [ ] |
| 1차 범위 | §5 MVP 범위 확정 | [ ] |

---

## 1. 1차(MVP) 범위

**포함**
- S1 진입-덤프, S2 매체 타일, S3 매체 페이지(책·논문·기사·유튜브), S4 접수 연출
- **S6 구조 화면** + 신호 2종 + 신호 반박 + 업데이트 루프
- S5 우주 뷰 정적 버전(모행성 생성·삭제·드래그 배치, 크기 = 노드 수)
- 노드 태그(모행성) 제안 → 사용자 확정
- 크림 테마, 데스크톱 + **모바일 반응형**

**2차 이후 (지금은 자리만 비워둠)**
- 달 에이전트 대화, 대화 → 노드 넣기
- 음성 덤프, 이미지·파일 첨부
- 영역 표시, 근접도 기준값·알림
- Satellites(외부 앱 가져오기·이동), AI 타일(대화 가져오기)
- 검색(망원경), 다크 모드, 내보내기

---

## 2. 공통 인터페이스 (양쪽 고정)

### 2-1. 데이터 타입

```ts
type MediaType = "book" | "paper" | "article" | "video" | "custom";

type Entry = {                       // 사용자가 보낸 한 번의 기록
  id: string;
  kind: "dump" | "media";            // dump = 진입화면 생각 메모, media = 매체 페이지
  mediaType?: MediaType;
  title?: string;
  meta?: {                           // 전부 선택
    author?: string; publishedAt?: string; readAt?: string;
    url?: string; source?: string; doi?: string;
  };
  body: string;                      // 원본 메모 — 접수 후 잠김(수정 불가)
  sentences: string[];               // 서버가 나눈 문장 배열 (GNode.source 인덱스 기준)
  locked: boolean;
  createdAt: string;
  analysis?: Analysis;               // 최신 구조화 결과 (비동기로 채워짐)
  analyses?: Analysis[];             // 재분석 이력
  status: "saved" | "analyzing" | "done" | "failed";   // saved = 메모로만 저장됨(구조화 요청 전)
};

type Analysis = {
  structure: "지식나열" | "인과구조" | "비교구조" | "주장-근거" | "이항대립" | "문학" | "IRAC" | "ANT";
  nodes: GNode[];
  edges: { from: string; to: string }[];
  signals: Signal[];
  suggestedPlanets: string[];        // 태그 제안 (사용자 확정 전)
  model: string; promptVersion: string; createdAt: string;
};

type GNode = {
  id: string;
  text: string;                      // 사용자 문장 그대로
  role: string;                      // 레이아웃 슬롯 (cause, claim, actor, issue ...)
  source: number[];                  // 원문 문장 인덱스
  empty: boolean;                    // 사용자가 안 쓴 빈 자리
  updates: Update[];
};

type Signal = {
  id: string;
  nodeId: string;
  kind: "misunderstanding" | "study"; // 잘못 알았을 수 있어요 / 더 공부해 볼 곳
  reason: string;                     // 왜 그런지 한 줄
  state: "open" | "resolved" | "dismissed"; // dismissed = 사용자가 "이건 맞아요"
};

type Update = {                      // 공부한 뒤 덧붙인 내용 (원본은 안 건드림)
  id: string;
  text: string;
  createdAt: string;
  recheck?: { resolved: boolean; reason: string };
};

type Planet = {                      // 모행성
  id: string; name: string;
  position: { x: number; y: number };
  entryCount: number;                // 서버 계산 → 크기
  openSignalRatio: number;           // 서버 계산 → 색 진하기(제안, 결정 필요)
};

type EntryTag = { entryId: string; planetId: string };
```

### 2-2. API

| 메서드 · 경로 | 하는 일 | 비고 |
|---|---|---|
| `POST /entries` | 덤프/매체 기록 저장 → `status: saved`. **분석은 시작하지 않음** | 즉시 응답 |
| `GET /entries/:id` | 기록 + 최신 분석 결과 | 분석 요청 후 `status`가 done 될 때까지 폴링(또는 SSE) |
| `GET /entries/:id/original` | 원본 메모 + 문장 배열 (하이라이트용) | 구조화 실패해도 항상 열림 |
| `GET /entries?planet=&kind=&cursor=` | 목록 (메모 모아보기, 모행성별) | |
| `POST /entries/:id/analyze` | **사용자가 구조화를 맡길 때만** 호출. 첫 분석·재분석·구조 바꾸기 공용 | body: `{ structure? }`. 응답 즉시 `status: analyzing` |
| `POST /analyze` (2차) | 메모 여러 개를 골라 하나로 묶어 구조화 | body: `{ entryIds: [] }` — §2-4 결정 필요 |
| `POST /entries/:id/nodes/:nodeId/updates` | 업데이트 추가 → 서버가 재확인 | 응답에 `recheck` 포함 |
| `PATCH /signals/:id` | `{ state: "dismissed" }` 반박 | 해제해도 기록은 남김 |
| `GET /planets` · `POST /planets` · `PATCH /planets/:id` · `DELETE /planets/:id` | 모행성 CRUD, 위치 저장 | |
| `PUT /entries/:id/tags` | 태그 확정 `{ planetIds: [] }` | |

### 2-3. 원본 메모 ↔ 구조화 연결 (확정)

- 모든 기록(진입화면 덤프 포함)은 **원본 메모 그대로 저장 + 구조화** 두 가지가 같이 생긴다.
- 원본(`Entry.body`)은 접수 즉시 잠기고, 구조화(`Entry.analysis`)는 그 위에 따로 붙는다. 구조화가 원본을 대체하지 않는다.
- **구조가 잘못됐을 때 원본으로 바로 갈 수 있어야 한다.**
  - 구조 화면(S6) 상단에 항상 **"원본 메모 보기"** 링크
  - 노드마다 `source` 문장 인덱스로 **"원문에서 보기"** → 원본 메모가 열리고 해당 문장으로 스크롤·하이라이트
  - 원본 메모 화면에서도 반대로 **"구조로 보기"** 링크
- 원본 메모는 고유 주소를 가진다: `/entries/:id/original` (공유·북마크 가능)
- 구조가 마음에 안 들면 `POST /entries/:id/analyze`로 다시 만들 수 있고, 이전 구조화 결과는 버리지 않고 이력으로 남긴다(`Entry.analyses[]`, 최신 1개가 기본 표시).

### 2-4. 구조화는 사용자가 맡길 때만 (확정)

- 덤프·기록을 보내면 **원본 메모로 저장만** 된다. AI는 돌지 않는다.
- 사용자가 **구조화를 맡긴 메모만** AI가 처리한다 → 쓸데없는 호출 없음, 짧은 생각은 메모로만 둬도 됨.
- 맡기는 방법 (둘 다 같은 `POST /entries/:id/analyze`):
  1. **Moons 캐릭터(달 에이전트) 누르기** → 현재 보고 있는 메모를 맡길지 묻는 짧은 메뉴: "이 메모 구조화 맡기기"
  2. 메모 옆 **"구조화 맡기기" 버튼** (메모 목록·원본 메모 화면)
- 메모 상태 표시: `저장됨` / `구조화 중` / `구조화됨` / `실패(다시 맡기기)`
- 구조화가 끝나면 알림(캐릭터 말풍선 등) → 누르면 S6 구조 화면.

**에러 공통 형식**: `{ error: { code, message } }`
- `ANALYSIS_FAILED`, `PARSE_FAILED`, `RATE_LIMITED`, `UNAUTHORIZED`

---

## 3. Codex (프론트엔드) 할 일

1. 디자인 토큰 → CSS 변수 (`Moons_UI_spec.md` §2)
2. 에셋: 로고 원본 투명 처리, 달 에이전트 원형 크롭, 아이콘 3종, RECEIVED 도장 (**로고·캐릭터 재작도 금지**)
3. S1 진입-덤프 → `POST /entries` (kind: dump) → "저장됐어요" 짧은 피드백만 (구조화 안 함)
   - **메모 목록 화면(신규)**: 저장된 메모 모아보기, 상태 배지, 메모별 "구조화 맡기기" 버튼
4. S2 매체 타일 → S3 매체 페이지(제목만 필수, 나머지 접힘) → `POST /entries` (kind: media)
5. S4 도장 연출(저장 완료) → 구조화 맡기기는 캐릭터 또는 버튼으로 (§2-4) → `POST /entries/:id/analyze` → `GET /entries/:id` 폴링
   - **달 에이전트 버튼 1차 기능**: 누르면 "이 메모 구조화 맡기기" 메뉴 (대화 기능은 2차)
6. **S6 구조 화면 (신규, 설계 포함)**
   - 구조 8종별 레이아웃 (기존 Canvas 템플릿 배치 참고: `templates/*.canvas`)
   - `empty: true` 노드는 점선 빈 칸으로
   - 신호 노드: 색 + 라벨(색만으로 구분 금지), 이유 한 줄 표시
   - 노드 클릭 → 원문의 `source` 문장 하이라이트 + 업데이트 입력칸
   - 신호 "이건 맞아요" 버튼, 해결된 신호는 꺼짐, 노드에 "업데이트됨"
   - 상단/측면 요약: "잘못 알았을 수 있어요 N · 더 공부해 볼 곳 N"
   - 원본 메모 보기 링크(상단 고정) + 노드별 "원문에서 보기" → 원본 화면에서 해당 문장 하이라이트 (§2-3)
   - 원본 메모 화면 `/entries/:id/original`: 잠김 표시, "구조로 보기" 링크
7. S5 우주 뷰 정적: 모행성 원(크기 √entryCount), 드래그 배치 저장, 추가·삭제. **연속 물리 시뮬레이션 금지**
8. 태그 확정 UI(분석 후 제안 모행성 칩 → 탭으로 확정)
9. 상태 화면: 분석 중, 실패(다시 시도), 빈 상태(첫 사용자)
10. 모바일 레이아웃: 타일 가로 스크롤 또는 2열, 종이 카드 전체 폭, 우주 뷰 핀치 줌

## 4. Claude Code (백엔드) 할 일

1. DB 스키마 (§2-1) + 인증(1인)
2. API (§2-2)
3. **분석 파이프라인**
   - 분석은 `POST /entries/:id/analyze` 요청이 왔을 때만 시작 (저장 ≠ 분석). 덤프·매체 기록 모두 같은 파이프라인
   - 분석은 비동기 작업(큐)으로: 요청 즉시 응답, 끝나면 `status` 갱신
   - 덤프 문장 분리 → 인덱스 부여 (`source` 용). 분리 결과(문장 배열)도 저장해서 프론트가 같은 인덱스로 하이라이트하게
   - 재분석 시 이전 `Analysis`를 덮지 말고 이력으로 보관
   - LLM 호출: 서버에서 키 보관, 모델은 환경변수
   - 프롬프트: `Moons_기능정리.md` §5 규칙 — **보정 없는 구조화**(사용자 문장 그대로, 빈 곳은 empty, 틀린 곳은 신호만), 자연어 망설임 감지, 신호 2종 + 이유
   - JSON 스키마 검증 → 실패 시 1회 재시도 → `PARSE_FAILED`
   - `promptVersion` 기록
4. 업데이트 재확인: 노드 원문 + 신호 이유 + 업데이트 텍스트 → resolved 여부·이유
5. 모행성 태그 제안: 기존 모행성 목록을 넣고 그중에서 고르게(새 이름 남발 방지)
6. Planet 통계 계산(`entryCount`, `openSignalRatio`)
7. 비용·안전: 사용자별 호출 제한, 입력 길이 상한, 로그에 덤프 원문 남기지 않기
8. **평가 세트**: 실제 덤프 10–20개로 "보정 없는 구조화"가 지켜지는지 확인하는 테스트 (AI가 문장을 고치거나 빈 곳을 채우면 실패)

---

## 5. 서로 기다려야 하는 지점

| 프론트가 기다림 | 백엔드가 기다림 |
|---|---|
| `Analysis` 실제 응답 예시 → 처음엔 **목 데이터 JSON**(구조 8종 각 1개)으로 먼저 개발 | 없음 (인터페이스만 고정되면 독립) |
| 재확인 응답 시간 → 로딩 UX 결정 | |

→ **백엔드가 첫 작업으로 구조 8종의 목 `Analysis` JSON을 만들어 프론트에 넘기기** 권장.

---

## 6. 아직 결정 안 된 것 (작업 중 막힐 수 있음)

- [x] ~~진입화면 덤프도 구조화?~~ → **확정: 원본 메모는 항상 저장, 구조화는 사용자가 맡긴 것만** (§2-3, §2-4)
- [ ] 매체 페이지의 SEND도 저장만 할지, 매체 페이지는 SEND = 구조화 맡기기까지 포함할지
- [ ] 메모 여러 개를 골라 한 번에 묶어 구조화하는 기능을 넣을지 (1차/2차)
- [ ] 구조화 안 맡긴 메모도 우주 뷰에 보일지 (태그를 어떻게 붙일지 — 사용자가 직접? 태그 제안만 가볍게?)
- [ ] 진입 화면 ↔ 우주 뷰 이동 방법
- [ ] 우주 뷰 회색 작은 원의 의미, 모행성 색 진하기 의미
- [ ] 입력창 베이지 칩의 용도
- [ ] 타일 색 세트(블루/웜)
- [ ] 노드 개수·글자 제한
- [ ] 별점·한 줄 소감 유지 여부
- [ ] 말풍선 문구 언어, 서비스 전체 UI 언어(한/영)

---

## 7. 보안 체크 (작업 전)

- [ ] 기존 `moons-lofi`의 `data.json` API 키 폐기 (공개됐던 적이 있으면 필수)
- [ ] 새 프로젝트: 키는 서버 환경변수로만, `.env`는 `.gitignore`, 프론트 번들에 키가 들어가지 않는지 확인
