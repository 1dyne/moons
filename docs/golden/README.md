# 골든 세트 형식 (v7 9.0)

골든 세트는 사용자가 만든다. 파일 하나에 자료 하나. `scripts/eval-structure.mjs`가 읽는다.

```json
{
  "id": "G2",
  "kind": "material",
  "title": "자료 제목",
  "text": "원문 전체 (또는 sentences 배열)",
  "claims": [{"subj": "원문 속 항", "rel": "cause", "obj": "원문 속 항", "sentences": [3]}],
  "frames": [{"heading": 0, "frame": "sequence"}, {"heading": 7, "frame": null}],
  "concepts": ["승격돼야 할 개념 이름"]
}
```

- `rel`은 kind · part · property · example · sequence · cause · solution · use · contrast 중 하나(비우면 관계어 채점에서 제외).
- `frames.heading`은 그 섹션 제목 문장 번호(0부터, 원문을 MOONS 문장 나누기로 자른 번호). 신호 없는 섹션은 `frame: null`.
- 문장 번호 확인: MOONS 원문 보기의 문장 순서와 같다.
- 덤프 골든(G1, `kind: "dump"`)은 M4 덤프 평가에서 쓴다.

실행

```
OPENAI_API_KEY=… ANTHROPIC_API_KEY=… GEMINI_API_KEY=… \
node --experimental-strip-types scripts/eval-structure.mjs --model anthropic:claude-opus-5-5 --runs 3 --out docs/reports/eval-opus.md docs/golden/G*.json
```

`--model`을 빼면 기본(OpenAI) 모델. `example.json`은 형식 예시일 뿐 골든이 아니다.
