# lit 위젯 플랫폼

목표: lit이 주는 위젯은 기본 재료이고, 사용자는 필요한 위젯을 만들어 넣어 쓴다. 비개발자는 블록이나 AI로, 개발자는 코드로. **형식은 하나(위젯 설명서)**, 들어가는 길만 다르다.

## 1. 단계 (이번 빌드: 1~4)

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 내 라이브러리: 저장한 위젯·페이지 틀·스킨 | 완료 |
| 2 | 위젯 설명서 + 블록 7종, 커넥터 `create_widget` | 완료 |
| 3 | 코드 위젯: 격리 실행, 위젯 API, 권한 승인 | 완료 |
| 4 | 개발자 도구: `lit-widget` CLI(create·dev·build·publish), 타입, 개발자 토큰 | 완료 |
| 5 | 공유·마켓플레이스(심사, 작가, 결제) | 추후 설계 (`../LIT_MARKETPLACE.md`) |

## 2. 메뉴 UI/UX

**원칙:** 메인 화면은 매일 쓰는 플래너다. 만드는 도구는 머리의 ≡ 버튼 → 오른쪽 서랍 안에만 둔다. 꾸미기 화면에는 "내 위젯" 묶음과 "틀로 저장·내 위젯으로 저장·지금 스킨 저장"만 더한다.

| 레퍼런스 | 가져온 것 |
| --- | --- |
| Obsidian 커뮤니티 플러그인 ([도움말](https://obsidian.md/help/community-plugins)) | 설치와 켜기를 나눔, 설치한 목록의 켜고 끄기 스위치, 제3자 코드는 사용자가 열기 전에는 실행하지 않음 |
| Figma 플러그인 ([manifest](https://developers.figma.com/docs/plugins/manifest), [실행 방식](https://developers.figma.com/docs/plugins/how-plugins-run), [네트워크](https://developers.figma.com/docs/plugins/making-network-requests)) | 설명서에 권한을 적음, UI는 iframe에서 postMessage로만 통신, 네트워크는 기본 차단 |
| Notion 사이드바 ([가이드](https://www.notion.com/help/guides/the-best-way-to-set-up-your-teams-sidebar-for-clear-organization)) | 템플릿·설정은 옆으로 치우고 본문을 넓게, 최상위 항목은 적게 |

서랍 구성 (`screens/Menu.tsx`):

1. **내 라이브러리** — 페이지 틀(이 틀 쓰기: 확인 후 오늘 페이지 교체, 기록은 그대로) · 스킨(이 스킨 쓰기) · 저장한 위젯(꾸미기에서 꺼냄) · 내 위젯(오늘 페이지에 넣기). 이름 바꾸기·지우기.
2. **위젯 만들기** — "블록으로": 이름 → 열(이름·종류) → 블록 쌓기(순서·지우기) → 저장. "설명서 붙여넣기": Claude나 개발자가 만든 JSON.
3. **설치한 위젯** — 위젯마다 켜기 스위치, 버전·출처(직접/Claude/개발자 도구), 권한 목록, 코드 승인/거두기, 오늘 페이지에 넣기.
4. **개발자** — 빠른 시작 명령, 문서 위치, 개발자 토큰 만들기(한 번만 보임)·취소.
5. **설정** — 기존 설정 화면.

승인 안 된 코드 위젯을 페이지에 두면 그 칸에 권한 확인 카드가 뜬다("승인하고 켜기"). 승인 전에는 코드가 한 줄도 실행되지 않는다.

## 3. 위젯 설명서 (manifest)

스키마: `lib/planner-spec/src/widgets.ts` (`WidgetManifest`).

```json
{
  "id": "leet-score",                 // 영문 소문자·숫자·- 2~40자. 라이브러리 id = "w-" + id (같은 id면 새 버전)
  "name": "기출 점수",
  "description": "회차별 점수와 평균",
  "version": "1.0.0",
  "permissions": ["table:read", "table:write"],
  "data": {"columns": [{"key": "label", "name": "회차", "type": "text"}, {"key": "score", "name": "점수", "type": "number"}], "scope": "all"},
  "view": [{"block": "form"}, {"block": "chart", "x": "label", "y": "score"}, {"block": "stat", "value": "score", "agg": "avg", "label": "평균"}],
  "size": {"w": 6, "h": 8}             // 12칸 기준 너비, 30px 줄 수
}
```

- **열:** `type` = text·number·select·check·date. `key`를 생략하면 이름이 key. 줄의 값은 key로 저장되므로 이름을 바꿔도 key를 유지하면 데이터가 남는다.
- **scope:** `all` 모든 날의 줄을 함께, `day` 화면에 보이는 날의 줄만.
- **블록:** `text`(글) · `form`(입력 칸, fields·button) · `table`(표) · `list`(체크리스트: title, check) · `chart`(x, y, kind bar/line, last) · `gauge`(value, target, agg → 스킨의 진행률 모양) · `stat`(value, agg sum/avg/last/max/count, label, unit).
- **코드:** `html`, `css`, `code`(JavaScript). 블록과 함께 써도 된다(블록 아래에 코드 칸).
- 같은 위젯을 여러 페이지에 놓으면 칸마다 자기 줄을 갖는다(`table` = 놓인 위젯 id).

## 4. 코드 위젯 실행과 보안

| 장치 | 내용 |
| --- | --- |
| 격리 | `<iframe sandbox="allow-scripts allow-forms">` + `srcdoc`. same-origin 없음 → lit 페이지·쿠키·저장소·로그인 정보 접근 불가 |
| 네트워크 차단 | 문서 CSP `default-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:` → fetch·XHR·WebSocket·외부 이미지·폰트·폼 전송 모두 막힘 |
| 유일한 통로 | `window.lit` → `postMessage` → 호스트(`lib/lit-widget-sdk/src/host.ts`)가 보낸 칸을 확인하고 권한을 검사한 뒤 처리 |
| 권한 | `table:read` `table:write` `tasks:read` `goals:read` `condition:read`. 설명서에 없는 기능은 거절 |
| 승인 | 코드+권한의 지문(`codeHash`)에 묶임. 코드나 권한이 바뀌면 다시 승인. 버전 숫자만 바뀌면 유지 |
| 비공개 | 사용자가 "나만 보기"로 표시한 필드는 `shareable()`로 지운 뒤 넘김 |
| 범위 | 표 API는 그 위젯의 줄만 고치고 지울 수 있음 |
| 출처 | Claude(`create_widget`)·개발자 도구(`/dev/widgets`)로 들어온 코드도 자동 승인 없음 |

주의: 승인한 코드는 허락한 범위에서 기록을 읽고 고칠 수 있다(예: 표를 지움). 공개 공유(5단계)에는 심사가 필요하다.

## 5. 위젯 API (요약)

| 호출 | 권한 | 돌려줌 |
| --- | --- | --- |
| `lit.context()` | – | 보이는 날, 오늘, 위젯 id, 칸 id, 테마, 권한, 프로토콜 버전 |
| `lit.table.rows()` | table:read | `{id, day, name, cells, createdAt}[]` |
| `lit.table.add(cells, name?)` / `update(id, cells, name?)` / `remove(id)` | table:write | 저장된 줄 |
| `lit.tasks.today()` | tasks:read | 보이는 날의 할 일 `{id, title, result, goalIds, estimateMin, props}` |
| `lit.goals.list()` | goals:read | 진행 중 목표 `{id, title, horizon, period, percent, parentId, deadline}` |
| `lit.condition.today()` | condition:read | `{day, score, sleepMinutes}` |
| `lit.on('change' \| 'theme', fn)` | – | 기록이 바뀌거나 스킨이 바뀔 때 |

높이는 SDK가 문서 높이를 재서 자동으로 맞춘다. 프로토콜 상세: `lib/lit-widget-sdk/src/protocol.ts`.

## 6. 라이브러리 항목

```ts
type LibraryItem = {id; kind: 'widget' | 'template' | 'skin' | 'custom'; name; data; enabled; approved: string | null; source: 'user' | 'claude' | 'developer'; createdAt; updatedAt}
```

- `widget`: 꾸민 기본 위젯 하나(`{widget}`) → 꾸미기에서 복사본으로 꺼냄.
- `template`: 페이지 위젯 배치 + 스킨(`{widgets, skin?}`).
- `skin`: 스킨 하나.
- `custom`: 위젯 설명서(`{manifest}`). 페이지에는 `{type: 'custom', options: {ref: 라이브러리 id}}`로 놓인다.
- 계정당 300개까지.

## 7. 다음에 할 일

- 공유 링크로 틀·위젯 나누기, 마켓플레이스 심사·작가·결제(5단계).
- 코드 위젯 네트워크 허용(설명서에 도메인을 적고 사용자 승인, Figma `networkAccess`처럼).
- 위젯 설정 값(칸별 옵션) API, 위젯끼리 데이터 공유 권한.
- 개발자 토큰 범위 나누기(올리기 전용 / 읽기).
