# __NAME__ (lit 위젯)

- `manifest.json` 이름·권한·열(데이터)·크기
- `index.html` `style.css` `widget.ts` 화면과 동작 (import 없이 전역 `lit` 사용)
- `lit-widget dev` 예시 데이터로 미리보기 → `lit-widget publish --url <lit 주소> --token <개발자 토큰>`

TypeScript는 타입만 지워서 실행해요(enum·namespace처럼 변환이 필요한 문법은 쓰지 않아요). API는 `lit-widget.d.ts`를 보세요.
