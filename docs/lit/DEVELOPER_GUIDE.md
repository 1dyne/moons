# lit 위젯 개발 가이드

HTML·CSS·TypeScript(또는 JavaScript)로 lit 위젯을 만든다. 위젯은 lit 안의 격리된 칸에서 돌고, 인터넷 없이 전역 `lit` API로만 기록을 읽고 쓴다.

## 준비

- Node 22.13 이상 (TypeScript는 타입만 지워서 실행. 다른 의존성 없음)
- lit 계정 → 메뉴(≡) → 개발자 → **개발자 토큰 만들기** (한 번만 보여요. 복사해 두기)

CLI 위치: `lib/lit-widget-sdk/bin/lit-widget.mjs` (아래에서는 `lit-widget`으로 줄여 씀)

```bash
alias lit-widget="node /path/to/repo/lib/lit-widget-sdk/bin/lit-widget.mjs"
```

## 1. 만들기

```bash
lit-widget create score-board
cd score-board
```

생기는 파일:

| 파일 | 내용 |
| --- | --- |
| `manifest.json` | id, 이름, 버전, 권한, 열(데이터), 크기 |
| `index.html` | 위젯 화면 마크업 |
| `style.css` | 스타일 (`--lit-bg --lit-surface --lit-ink --lit-muted --lit-accent --lit-radius` 사용) |
| `widget.ts` | 동작. import 없이 전역 `lit` 사용 |
| `lit-widget.d.ts`, `tsconfig.json` | 편집기 자동완성·타입 검사 |

## 2. 미리보기

```bash
lit-widget dev            # http://localhost:5300 (--port로 바꿈)
```

lit과 **같은 격리 문서와 호스트**로 돌린다. 예시 할 일·목표·컨디션이 들어 있고, 표의 줄은 브라우저에 남는다. 파일을 고치면 자동으로 다시 그린다. 오른쪽에 API 호출 기록, 어두운 스킨 전환, 표 비우기가 있다.

## 3. 올리기

```bash
lit-widget publish --url https://planner-production-1394.up.railway.app --token litdev_…
# 또는 LIT_URL, LIT_TOKEN 환경 변수
```

→ 내 라이브러리에 들어간다. lit 메뉴 → **설치한 위젯**에서 권한을 보고 **승인**하면 실행된다(코드나 권한을 바꿔 다시 올리면 다시 승인).

토큰 없이 넣기: `lit-widget build` → `dist/widget.json`을 lit 메뉴 → 위젯 만들기 → **설명서 붙여넣기**.

## 4. 예제

```ts
/// <reference path="./lit-widget.d.ts" />
const $ = (id: string) => document.getElementById(id)!;

async function render() {
  const [rows, tasks] = await Promise.all([lit.table.rows(), lit.tasks.today()]);
  $('done').textContent = `${tasks.filter(t => t.result === 'done').length}/${tasks.length}`;
  $('rows').replaceChildren(...rows.map(r => Object.assign(document.createElement('li'), {textContent: `${r.cells.label} · ${r.cells.score}점`})));
}
document.querySelector('form')!.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  await lit.table.add({label: String(f.get('label')), score: Number(f.get('score'))});
});
lit.on('change', render);
render();
```

`manifest.json`:

```json
{"id": "score-board", "name": "기출 점수판", "version": "1.0.0",
 "permissions": ["table:read", "table:write", "tasks:read"],
 "data": {"columns": [{"key": "label", "name": "회차"}, {"key": "score", "name": "점수", "type": "number"}]},
 "size": {"w": 6, "h": 8}}
```

## 5. API

전체 타입: `lit-widget.d.ts`. 요약은 [WIDGET_PLATFORM.md §5](WIDGET_PLATFORM.md#5-위젯-api-요약).

- 권한 없는 기능을 부르면 거절 오류가 난다(`권한이 없어요: tasks:read`). 설명서 `permissions`에 넣고 다시 올려 승인받는다.
- `table.*`는 그 위젯 칸의 줄만 다룬다. 값은 문자열(500자)·숫자·참거짓·null, 한 줄에 키 30개까지.
- 처리 안 된 오류는 위젯 칸 아래에 "위젯 오류: …"로 보인다.

## 6. 규칙과 제한

- **한 파일:** `widget.ts`에 import/export를 쓰지 않는다. 라이브러리가 필요하면 직접 번들한 `widget.js`를 쓰고 `manifest.json`에 `"codeFile": "widget.js"`.
- **TypeScript:** 타입 지우기만 하므로 enum·namespace·매개변수 속성처럼 변환이 필요한 문법은 쓰지 않는다(`tsconfig`의 `erasableSyntaxOnly`가 잡아 줌).
- **네트워크 없음:** fetch·외부 이미지·외부 폰트는 막힌다. 이미지는 data: URL로.
- **크기:** 코드 300KB, html·css 각 100KB.
- **파일 이름 바꾸기:** `manifest.json`의 `htmlFile`, `cssFile`, `codeFile`.

## 7. 블록만으로 될 때

코드 없이 `view`에 블록을 쓰면 승인 없이 바로 쓰인다. lit 메뉴 → 위젯 만들기 → 블록으로, 또는 설명서에 직접:

```json
{"id": "water", "name": "물 마시기", "data": {"columns": [{"name": "잔", "type": "number"}], "scope": "day"},
 "view": [{"block": "form"}, {"block": "gauge", "value": "잔", "target": 8, "label": "오늘"}]}
```
