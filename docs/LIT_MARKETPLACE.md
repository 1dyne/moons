# lit 마켓플레이스 설계 (초안, 2026-11-09)

lit은 대화로 만들고 마음대로 꾸미는 다이어리다. 마켓플레이스는 **꾸미는 재료**(스티커·테이프·글꼴·배경)와 **다이어리 틀**(위젯 배치 + 스킨 템플릿)을 사고팔고 나누는 곳이다. 나중에 MOONS Satellite 안에서도 같은 상점을 연다.

레퍼런스: 자꾸다꾸(작가 브랜드 다이어리·스티커 500개 이상 스토어, 내가 만든 스티커 판매), Zinnia(스티커·마스킹테이프 컬렉션이 가장 호평), 굿노트 속지 마켓(하이퍼링크 속지, 라이트·다크 판).

## 1. 무엇을 파나

| 종류 | 내용 | lit에서 쓰는 곳 |
| --- | --- | --- |
| 스티커 팩 | SVG·PNG 스티커 묶음(20~60개), 계절·문구류·동물·공부 | 꾸미기 위젯 `sticker`의 그림 |
| 테이프 팩 | 반복 무늬 이미지(가로로 이어지는 타일) | `tape`의 무늬 |
| 배경·종이 | 종이 질감, 모눈·도트 변형, 계절 배경 | 스킨 `paper` / 위젯 배경 |
| 글꼴 | 상업 이용이 가능한 손글씨 폰트(라이선스 확인된 것만) | 스킨·위젯 글꼴 |
| 다이어리 틀 | `canvas.day`(위젯 배치) + `skin` + 기본 루틴·목표 예시 | "이 틀로 시작하기"(기록은 사용자 것 그대로) |
| 플래너 문 프롬프트 팩 | Claude·플래너 문이 쓰는 "시험 기간 페이지", "육아 다이어리" 대화 시나리오 | `build_planner`의 출발점 |

틀(템플릿)에는 **사용자 기록이 들어가지 않는다**: 배치·스킨·예시 문구만 담는다.

## 2. 누가 올리나

1. **lit 공식 팩**: 첫 출시용 무료 기본 팩(스티커 200개, 테이프 20개, 틀 10개).
2. **작가**: 작가 신청 → 샘플 심사 → 판매. 작가 페이지, 팔로우, 신작 알림.
3. **사용자 공유**: 내 다이어리 틀을 "공유" → 링크로 무료 배포(판매는 작가만).

## 3. 데이터 모델 (Satellite 공통으로 쓸 수 있게 분리)

```ts
type Item = {
  id: string; kind: 'sticker_pack' | 'tape_pack' | 'paper' | 'font' | 'template' | 'prompt';
  creatorId: string; title: string; description: string; tags: string[];
  price: {krw: number} | 'free'; license: 'personal' | 'personal+commercial';
  assets: {id: string; url: string; w?: number; h?: number}[];   // CDN, 이미지·폰트 파일
  template?: {canvas: Widget[]; mode: 'free' | 'grid'; skin: Skin};   // kind=template
  version: number; status: 'draft' | 'review' | 'live' | 'hidden'; createdAt: string;
};
type Purchase = {userId: string; itemId: string; version: number; at: string; receipt: string};
type Library = {userId: string; items: {itemId: string; version: number; addedAt: string}[]};
```
- 위젯은 자산을 **id로 참조**한다(`sticker.options.asset = 'pack123/heart'`). 구매하지 않은 자산은 미리보기만 된다.
- 판매가 끝나도 이미 산 사람의 다이어리에서는 계속 보인다(자산 버전 고정).

## 4. 흐름

- **찾기**: 편집기 왼쪽 "＋ 위젯" 옆에 "상점" 탭. 지금 스킨·분위기에 맞는 팩을 먼저 보여 준다.
- **미리 붙여 보기**: 사기 전에 내 페이지에 반투명으로 붙여 보기.
- **사기**: 앱 안 결제(웹: 토스페이먼츠·스트라이프 후보, 앱 포장 시 스토어 인앱결제 정책 확인).
- **내 서랍**: 산 것과 무료로 받은 것. 편집기의 스티커·테이프 선택 창에 바로 나온다.
- **틀로 시작하기**: 지금 기록은 그대로 두고 배치·스킨만 바꾼다(spec 새 버전).

## 5. 심사와 권리

- 업로드 때 저작권·상표 확인 항목, 신고 버튼, 문제 시 숨김.
- 폰트는 라이선스 문서 첨부 필수. 상업 폰트 재배포 금지 확인.
- 수수료(안): 작가 70 / lit 30. 무료 공유는 수수료 없음.

## 6. 단계

| 단계 | 내용 |
| --- | --- |
| M0 | 공식 무료 팩(스티커·테이프 SVG)을 앱에 내장, 자산 참조 방식으로 위젯 옵션 전환 |
| M1 | 틀 공유(링크, 무료) — 내 배치·스킨을 남에게 |
| M2 | 상점 화면, 작가 신청·심사, 무료 배포 |
| M3 | 결제·정산, 작가 페이지 |
| M4 | MOONS Satellite 안에서 같은 상점 |

## 7. 정할 것

1. 결제 수단(웹 결제 먼저 vs 앱 스토어 먼저)
2. 첫 공식 팩을 직접 그릴지, 작가 3~5명과 출시 협업할지
3. 자산 저장소(지금 Railway 볼륨 / 객체 저장소+CDN)
