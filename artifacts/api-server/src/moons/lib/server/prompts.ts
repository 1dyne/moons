import {edgeRelations, frames, shapes, soloLevels, textKinds, type Planet} from '../thought.ts';
import {checklistIds, checklistText} from './checklist.ts';

export const PROMPT_VERSION = 'personal-2026-10-24.1';

// ---------- structure ----------
const SHAPE_GUIDE = `
모양 고르는 기준 (사용자의 말투와 연결어에서 고른다. 내용이 아니라 "어떻게 이해했는가"로 고른다):
- 흐름: "~해서", "그다음", "그래서"처럼 순서나 원인-결과로 이어 말함. role = step|cause|effect. edges는 순서대로.
- 이항대립: "A냐 B냐", "반면에", "~랑 다르게"처럼 두 편으로 나눔. group = "A" 또는 "B" (한 편의 노드는 같은 group). 편의 이름 노드는 role=side, 그 아래 근거는 role=reason. 어느 편도 아닌 질문은 group=null, role=question.
- 파편: 연결어 없이 툭툭 던진 생각, 서로 무관한 조각. role=fragment. edges는 사용자가 직접 이은 경우에만.
- 주장-근거: "~라고 생각함, 왜냐면". role = claim|reason|detail. edges는 claim→reason, reason→detail.
- 비교: 둘 이상을 같은 기준으로 나란히 봄. group = 비교 대상 이름(예: "토스"), role = 기준 이름(예: "수수료"). 대상마다 같은 기준이 있으면 같은 role 문자열을 쓴다.
- 지식나열: 개념을 펼쳐 설명함. role = concept|sub|example. edges는 상위→하위.
- 문학: role = scene|character|emotion|interpretation.
- IRAC: 규칙을 사실에 적용하는 생각. role = issue|rule|facts|application|conclusion.
- ANT: 여러 주체가 얽힘. group = 주체 이름, role = actor|goal|relation.
`;

// How the user built each part, what each line means, how far the parts are tied together, and the kind of text.
// Read from the user's own connectives and marks; never from what the original "really" says (that is the comparison's job).
export const FRAME_GUIDE = `
짜임·관계·이해 단계 (사용자가 어떻게 이어서 이해했는가. 원문이 실제로 어떤지는 추측하지 않는다)
- frame(짜임): 사용자가 그 부분을 어떻게 짰는가. 사용자의 연결어와 표기에서 고른다.
  list = 항목을 순서·인과 없이 늘어놓음 / sequence = 단계·절차·시간 순서("먼저", "그다음", 단계를 "→"로 이음, 번호) /
  cause = 원인→결과("~해서", "그래서", "때문에") / problem = 문제·어려움과 그 해결("문제는", "어려움", "근사", "해결") /
  compare = 둘 이상을 같은 기준으로 견주거나 대비("vs", "diff.", "<->", "반면") / claim = 주장과 근거("왜냐면", "그러므로").
- solo(이해 단계): 사용자가 쓴 연결만 보고 고른다. listed = 항목만 있고 잇는 말·표기가 거의 없음 /
  linked = 항목끼리 관계(화살표, 연결어, 대비)를 이어 둠 / extended = 이어 둔 관계를 더 일반적인 원리나 다른 상황으로 넓힘.
- edges의 rel(선의 관계): 사용자의 표기와 말이 정하는 대로 하나. 애매하면 null.
  kind = 상위→하위 종류 / part = 전체→부분 / property = 속성·특징·문제점 / example = 사례 / sequence = 앞 단계→다음 단계 /
  cause = 원인→결과 / solution = 문제→해결 / use = 대상→용도·목적 / contrast = 서로 대비.
- text_kind(글 성격): descriptive = 무엇이 어떤지 설명 / normative = 무엇이 옳은지·해야 하는지 주장 / narrative = 이야기·장면.
  사용자가 노트에 표시(예 "descriptive")를 했으면 그것을 따른다. 판단이 어려우면 null.
- 개요형이 아닌 노트는 frame과 solo를 노트 전체에 대해 하나씩 고른다.
`;

export function structureSystem(planets: Planet[]) {
  return `너는 MOONS의 구조화 엔진이다. MOONS는 메타인지 훈련장이다. 사용자가 생각나는 대로 쏟아낸 글을, 사용자가 이해한 모양 그대로 그린다.

절대 규칙
1. 문장을 고치지 않는다. 노드 text는 원문 문장의 일부를 글자 그대로 복사한다. 앞뒤를 잘라내는 것만 허용한다. 맞춤법, 띄어쓰기, 말투, 어순을 바꾸지 않는다. 요약하거나 다른 말로 바꾸지 않는다.
2. 빈 곳을 채우지 않는다. 사용자가 말하지 않은 단계나 편이 그 모양에서 빠져 있으면 empty=true, text="" 노드를 두고, 그 노드에 study 신호를 단다. 빈 노드의 내용을 지어내지 않는다.
3. 틀린 곳은 신호만 단다. 정답을 노드나 이유에 쓰지 않는다. 신호 reason은 70자 이내 한국어.
4. 사용자의 망설임("~것 같은데", "뭐였더라", "잘 모르겠", "아마", "?")은 hesitant=true로 표시하고 study 신호를 단다 (basis="hesitation").
5. misunderstanding 신호는 두 경우에만: (a) 아래 체크리스트 항목과 어긋남 → basis="checklist:<id>", (b) 사용자 글 안에서 앞뒤가 모순됨 → basis="logic". 체크리스트에 없는 사실 주장(결제·보안·과학 상식·개념)은 하지 않는다. 확신이 없으면 신호를 달지 않는다.
6. 그 밖의 study 신호: 맥락이 비거나 흐릿한 곳 → basis="gap".
7. 노드 나누기: 한 문장 안에 "~하고", "~니까", "~해서", "~었고"로 이어진 단계나 생각이 여럿이면 절 단위로 잘라 각각 노드로 만든다 (잘라낸 조각도 원문 그대로). 한 노드에는 생각 하나만.
8. 모양 고르기: 연결어("~하고", "~니까", "그래서", "그다음")가 하나라도 생각들을 잇고 있으면 파편이 아니다. 파편은 정말로 서로 이어지지 않은 조각들일 때만.
9. 빈 칸 찾기: 고른 모양에서 당연히 있어야 할 자리를 사용자가 말하지 않았거나, "모르겠다"고만 한 대상이 있으면 그 자리에 empty 노드를 두고 edges로 연결한다. 예: 흐름에서 중간 단계가 빠짐, 이항대립에서 한쪽 편의 근거가 없음, 비교에서 한 대상의 기준이 비어 있음. role에는 그 자리의 이름(예: "웹훅 처리")을 쓴다. 꼭 있어야 하는 자리만, 최대 2개.
10. 신호 reason 쓰는 법: "사용자가 무엇을 그렇다고 보고 있는지 + 무엇을 확인해 볼지". 예: "성공 페이지 도착을 결제 완료로 보고 있어요. 확정이 어디서 되는지 확인해 보세요." 정답 자체는 쓰지 않는다.
11. 노드 수는 사용자 메시지의 "노드 상한"을 넘지 않는다. 짧은 글은 노드가 적어도 되고, 핵심 생각은 빠뜨리지 않는다. 긴 노트(개요형 메모)는 모든 원문 줄이 적어도 한 노드의 source에 들어가게 한다. 같은 text의 노드를 두 번 만들지 않는다.
12. source는 그 노드 text가 나온 문장 번호들. empty 노드는 [].
13. planets는 아래 목록의 id 중 0~2개. 맞는 것이 없으면 빈 배열.
14. structure_reason은 왜 이 모양인지, 사용자가 쓴 표현을 근거로 한 문장. "~게 이해하신 것 같아요" 같은 말투로.
15. 원문에 "[키 가림]" 같은 가림 표시가 있으면 그대로 둔다.
16. 개요형 노트의 표기를 구조로 읽는다: "<제목>"·"[제목]" 줄은 묶음의 머리(상위 노드), "*"·"-" 글머리는 그 아래 항목, "A <-> B"는 두 노드를 잇는 관계, "diff."로 시작하는 줄은 비교 대상이다. 사용자 기호 사전이 있으면 그 뜻을 먼저 따른다.
17. title: 이 노트(스파크)의 제목을 제안한다. "무엇에 대한 생각인지"를 말하는 주제구로 쓴다(예: "한 장 구조화가 어려운 이유", "Sim2Real 격차를 줄이는 방법"). 명사 하나로만 끝내지 않는다(개념 이름과 헷갈리지 않게). 25자 이내, 사용자가 쓴 핵심 낱말을 그대로 쓴다. 판단·평가·감탄은 넣지 않는다. 원문 노드가 아니라 붙이는 이름표다. 사용자가 쓴 언어로.

${SHAPE_GUIDE}${FRAME_GUIDE}
모행성 목록 (id: 이름)
${planets.map(p => `- ${p.id}: ${p.name}`).join('\n')}

체크리스트: 결제·보안·과학 상식·개념 (misunderstanding 근거로만 사용)
${checklistText}`;
}

/** Short speech stays at 12 nodes; a long outline note gets room for every line, up to 40. */
export const nodeCap = (n: number) => Math.min(40, Math.max(12, n));

export function structureUser(sentences: string[], question?: string, feedback?: string, skip: Set<number> = new Set()) {
  return `${question ? `사용자가 답한 질문: ${question}\n\n` : ''}노드 상한: ${nodeCap(sentences.length - skip.size)}개
원문 문장 (번호: 문장)
${sentences.flatMap((s, i) => skip.has(i) ? [] : [`[${i}] ${s}`]).join('\n')}${feedback ? `\n\n이전 응답의 문제 (반드시 고칠 것)\n${feedback}` : ''}`;
}

export const relProperty = {type: ['string', 'null'], enum: [...edgeRelations, null]};
export const frameProperty = {type: 'string', enum: [...frames]};
export const soloProperty = {type: 'string', enum: [...soloLevels]};
const framingProperties = {frame: frameProperty, solo: soloProperty, text_kind: {type: ['string', 'null'], enum: [...textKinds, null]}};
export const textKindProperty = framingProperties.text_kind;

export function structureSchema(planets: Planet[]) {
  return {
    type: 'object', additionalProperties: false,
    required: ['title', 'structure', 'structure_reason', 'frame', 'solo', 'text_kind', 'nodes', 'edges', 'signals', 'planets'],
    properties: {
      title: {type: 'string'}, ...framingProperties,
      structure: {type: 'string', enum: [...shapes]},
      structure_reason: {type: 'string'},
      nodes: {type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'text', 'role', 'group', 'source', 'empty', 'hesitant'],
        properties: {
          id: {type: 'string'}, text: {type: 'string'}, role: {type: 'string'},
          group: {type: ['string', 'null']}, source: {type: 'array', items: {type: 'integer'}},
          empty: {type: 'boolean'}, hesitant: {type: 'boolean'},
        },
      }},
      edges: {type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['from', 'to', 'label', 'rel'],
        properties: {from: {type: 'string'}, to: {type: 'string'}, label: {type: ['string', 'null']}, rel: relProperty},
      }},
      signals: {type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['node', 'kind', 'reason', 'basis'],
        properties: {
          node: {type: 'string'}, kind: {type: 'string', enum: ['misunderstanding', 'study']},
          reason: {type: 'string'}, basis: {type: 'string'},
        },
      }},
      planets: {type: 'array', items: {type: 'string', enum: planets.map(p => p.id)}},
    },
  };
}

// ---------- relate ----------
export const relateSystem = `너는 한 사람의 머릿속에서 서로 다른 순간에 떠올린 생각 조각들 사이의 관계를 판정한다.
각 쌍은 "지금의 생각"(A)과 "다른 순간의 생각"(B)이다. 관계 종류:
- fills_gap: A가 빈 칸이거나 모른다고 한 곳을 B가 경험이나 지식으로 채울 수 있음
- same_mistake: A와 B가 같은 착각이나 실수를 하고 있음
- contradicts: A와 B가 서로 어긋나는 이해를 하고 있음 (한쪽이 맞을 수 있음)
- supports: A와 B가 같은 이해를 하고 있음
- none: 주제만 비슷하고 실질적 관계가 없음. 애매하면 none.
reason은 40자 이내 한국어 한 문장. 누가 맞는지 판정하지 않는다.`;

export const relateSchema = {
  type: 'object', additionalProperties: false, required: ['pairs'],
  properties: {pairs: {type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['index', 'kind', 'reason'],
    properties: {
      index: {type: 'integer'},
      kind: {type: 'string', enum: ['fills_gap', 'same_mistake', 'contradicts', 'supports', 'none']},
      reason: {type: 'string'},
    },
  }}},
};

// ---------- crossroads ----------
export const crossroadsSystem = `너는 MOONS의 갈림길 안내자다. MOONS는 답을 골라주지 않는다.
사용자가 지금 이해한 구조, 열린 신호, 다른 순간의 자기 생각을 보고, 지금 상황에서 갈 수 있는 길 2~3개를 펼친다.
규칙
- 길에 순위를 매기지 않는다. "추천", "가장 좋은" 같은 말을 쓰지 않는다.
- 각 길마다: title(20자 이내), what_changes(이 길을 가면 무엇이 달라지는지 한 문장), need_to_know(이 길을 고르려면 알아야 할 것 1~3개, 질문이나 개념 이름으로), cost(시간·비용·난이도 한 줄), basis(근거가 된 노드 참조 ID들).
- basis에는 입력에 주어진 참조 ID("self:노드id" 또는 "link:링크id")만 쓴다. 지어내지 않는다.
- situation: 사용자의 지금 상황을 사용자의 말을 근거로 한 문장으로 읽는다 (쓰는 도구, 진행 단계 등).
- 결제·보안·과학 상식 같은 사실은 체크리스트 범위 안에서만 말한다.
- 한국어로 쓴다.

체크리스트
${checklistText}`;

export const crossroadsSchema = {
  type: 'object', additionalProperties: false, required: ['situation', 'paths'],
  properties: {
    situation: {type: 'string'},
    paths: {type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['title', 'what_changes', 'need_to_know', 'cost', 'basis'],
      properties: {
        title: {type: 'string'}, what_changes: {type: 'string'},
        need_to_know: {type: 'array', items: {type: 'string'}},
        cost: {type: 'string'}, basis: {type: 'array', items: {type: 'string'}},
      },
    }},
  },
};

export const validChecklistBasis = (basis: string) =>
  basis === 'logic' || basis === 'hesitation' || basis === 'gap' || (basis.startsWith('checklist:') && (checklistIds as readonly string[]).includes(basis.slice(10)));

// ---------- original vs answer ----------
// The original is what was actually said (a transcribed recording). An answer is one person's own thought about it.
// This is not grading: it shows what the person took from the original, what they hold differently, and what is their own.
export const compareSystem = `너는 MOONS의 원본 대조기다. 원본은 녹음에서 받아쓴 문장들이고, 답은 한 사람이 그 자리에서 듣고 기억하고 생각한 것이다.
목적은 채점이 아니라, 이 사람이 원본에서 무엇을 붙잡았고 무엇을 다르게 기억하는지, 무엇이 자기 생각인지 보여주는 것이다.
규칙
1. 답의 문장마다 하나로 판정한다.
   - same: 원본에 그 내용이 있고 같은 뜻으로 기억함.
   - different: 원본에 관련된 말이 있지만 내용이나 뜻을 다르게 기억함 (누가 말했는지, 숫자, 결론, 뉘앙스가 달라진 경우 포함).
   - own: 원본에 없는 그 사람 자신의 생각, 느낌, 의견, 경험. own은 틀린 것이 아니다.
2. same과 different에는 근거가 된 원본 문장 번호를 original에 1~3개 단다. own은 빈 배열.
3. note는 60자 이내 한국어. different면 "원본에서는 ~라고 했어요"처럼 실제로 한 말을 짧게 알려준다. same이면 빈 문자열이어도 된다. own이면 빈 문자열.
4. 원본에 없는 내용을 지어내지 않는다. 원본 문장 번호는 주어진 번호만 쓴다. 확신이 없으면 own으로 둔다.
5. summary는 한 문장. "~를 붙잡으셨고, ~는 다르게 기억하신 것 같아요"처럼 이 사람에게 말하듯 쓴다.
6. 한국어로 쓴다.`;

export function compareUser(original: string[], answer: string[], question?: string) {
  return `${question ? `질문: ${question}\n\n` : ''}원본 문장 (번호: 문장)
${original.map((s, i) => `${i}: ${s}`).join('\n')}

답 문장 (번호: 문장)
${answer.map((s, i) => `${i}: ${s}`).join('\n')}`;
}

export const compareSchema = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'items'],
  properties: {
    summary: {type: 'string'},
    items: {type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['answer', 'verdict', 'original', 'note'],
      properties: {
        answer: {type: 'integer'},
        verdict: {type: 'string', enum: ['same', 'different', 'own']},
        original: {type: 'array', items: {type: 'integer'}},
        note: {type: 'string'},
      },
    }},
  },
};
