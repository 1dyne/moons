import type {ModuleType} from './spec.ts';

// Reference library: planner layouts and moods drawn from well-reviewed paper and digital planners.
// These are layout patterns (what goes where, how the day is read), not copies of any product's design.
// `status` says whether the renderer draws it today; the studio only offers 'ready' ones as samples.
export type Reference = {
  id: string; name: string; inspiredBy: string;
  period: 'day' | 'week' | 'month' | 'year' | 'any';
  pattern: string[];               // what the page holds, in reading order
  modules: ModuleType[];           // modules that realise it
  goodFor: string[];               // words that suggest it (matched like catalog triggers)
  status: 'ready' | 'planned';
};
export const REFERENCES: Reference[] = [
  {id: 'study-timetable', name: '스터디 타임테이블', inspiredBy: '한국형 스터디 플래너 · 열품타식 기록', period: 'day', status: 'ready',
    pattern: ['위: 집중 타이머와 오늘 순집중', '왼쪽: 할 일 ○△×', '오른쪽: 10분 = 한 칸 타임테이블', '아래: 하루 영수증'],
    modules: ['tasks', 'timer', 'review'], goodFor: ['공부', '순공', '열품타', '수험', '집중', '타임테이블']},
  {id: 'realistic-day', name: '현실 플래너', inspiredBy: 'Sunsama의 아침 계획·하루 마감 의식, 에너지 기반 계획', period: 'day', status: 'ready',
    pattern: ['아침 점검: 기상 에너지 1~10, 고정 일정', '가용 시간과 계획량 비교', '할 일·루틴', '집중 후 컨디션', '저녁 컨디션·돌아보기'],
    modules: ['checkin', 'tasks', 'timer', 'routine', 'condition', 'review'], goodFor: ['에너지', '현실적', '가용', '컨디션', '번아웃', '무리']},
  {id: 'hourly', name: '시간대별 데일리', inspiredBy: 'Structured식 세로 타임라인 · 호평받은 시간 블록 플래너', period: 'day', status: 'planned',
    pattern: ['세로 타임라인에 계획 블록', '옆에 실제(타이머) 블록', '빈 시간은 회색으로'],
    modules: ['timeblock', 'tasks', 'timer'], goodFor: ['시간대', '시간 블록', '타임블로킹', '일정', '스케줄', 'hourly']},
  {id: 'bullet', name: '불렛저널 빠른 기록', inspiredBy: '불렛저널 래피드 로깅', period: 'day', status: 'planned',
    pattern: ['한 줄씩 적기', '기호: • 할 일 ○ 일정 – 메모, × 끝냄 › 미룸', '하루 끝에 미룬 것 옮기기'],
    modules: ['tasks', 'memo'], goodFor: ['불렛', '불렛저널', '빠르게', '메모', '기록', 'bujo']},
  {id: 'one-page', name: '한 장 자유 데일리', inspiredBy: '호보니치식 하루 한 페이지 · 모눈 종이', period: 'day', status: 'planned',
    pattern: ['날짜와 작은 시간 눈금', '모눈 위 자유 칸(글·체크 섞어 쓰기)', '오늘의 한 줄'],
    modules: ['memo', 'tasks', 'review'], goodFor: ['자유', '일기', '다꾸', '호보니치', '저널', '한 장']},
  {id: 'weekly-h', name: '위클리 가로형', inspiredBy: '굿노트 인기 가로형 위클리 속지', period: 'week', status: 'planned',
    pattern: ['7일이 가로로 나란히', '날마다 할 일 칸', '주간 목표·습관 줄'], modules: ['tasks', 'goals', 'routine'], goodFor: ['위클리', '주간', '일주일', '가로']},
  {id: 'weekly-v', name: '위클리 세로형', inspiredBy: '시간 눈금이 있는 세로형 위클리(버티컬)', period: 'week', status: 'planned',
    pattern: ['7일 기둥에 시간 눈금', '고정 일정과 계획 블록', '아래 주간 메모'], modules: ['timeblock', 'tasks'], goodFor: ['버티컬', '세로', '주간 일정', '시간표']},
  {id: 'habit-grid', name: '습관 트래커 격자', inspiredBy: '먼슬리 해빗 트래커', period: 'month', status: 'planned',
    pattern: ['루틴 × 날짜 격자', '고른 날만 칸이 열림(그날 할 루틴)', '연속 기록과 달성률'], modules: ['routine'], goodFor: ['습관', '해빗', '트래커', '루틴', '연속']},
  {id: 'year-roadmap', name: '연간 목표 로드맵', inspiredBy: '연간 로드맵 · 이얼리(yearly) 속지', period: 'year', status: 'ready',
    pattern: ['목표마다 한 줄', '12개월 칸에 마일스톤 ◆', '전체 진행률'], modules: ['goals'], goodFor: ['연간', '로드맵', '장기', '마일스톤', '1년']},
];

// Moods: colour, paper and type, independent of structure. Applied as theme tokens.
export type Mood = {id: string; name: string; feel: string; accent: string; paper: 'white' | 'ivory' | 'grid' | 'dot' | 'lined'; font: 'sans' | 'serif' | 'hand'; dark?: boolean};
export const MOODS: Mood[] = [
  {id: 'calm', name: '차분한 미니멀', feel: '흰 종이, 얇은 선, 여백 많게', accent: 'blue', paper: 'white', font: 'sans'},
  {id: 'ivory', name: '아이보리 종이', feel: '따뜻한 아이보리 바탕(굿노트 속지에서 호평), 명조 제목', accent: 'beige', paper: 'ivory', font: 'serif'},
  {id: 'study', name: '스터디 집중', feel: '모눈 종이, 진한 선, 숫자가 잘 보이게', accent: 'teal', paper: 'grid', font: 'sans'},
  {id: 'deco', name: '다꾸 감성', feel: '도트 종이, 손글씨풍 제목, 파스텔 칩', accent: 'yellow', paper: 'dot', font: 'hand'},
  {id: 'night', name: '다크', feel: '어두운 바탕, 밤에 쓰기 편하게(라이트·다크 함께 파는 속지 흐름)', accent: 'sky', paper: 'white', font: 'sans', dark: true},
];

/** References whose words appear in what the user said, ready ones first. */
export function matchReferences(text: string) {
  const t = text.toLowerCase();
  return REFERENCES.map(r => ({r, hits: r.goodFor.filter(w => t.includes(w.toLowerCase())).length}))
    .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits || (a.r.status === 'ready' ? -1 : 1)).map(x => x.r);
}
