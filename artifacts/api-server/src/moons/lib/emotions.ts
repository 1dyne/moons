// MOONS emotion data — Geneva Emotion Wheel (Scherer, 2005) 20 families.
// Korean words: seed dictionary, to be checked against 박인조·민경환 (2005) 한국어 감정단어 목록.
// valence: +1 pleasant / -1 unpleasant. control: +1 high / -1 low.
// x, y: emotion-planet position on the My Space canvas (0..1), laid out on the valence × control quadrants.
// TODO(after event): verify GEW version, family placement and Korean word mapping against the source papers.

export type EmotionFamily = {
  id: string;
  en: string;
  ko: string;
  valence: 1 | -1;
  control: 1 | -1;
  x: number;
  y: number;
  color: string;
  words: string[];
};

export const emotionFamilies: EmotionFamily[] = [
  // pleasant · high control (top right)
  {id: 'interest',       en: 'Interest',       ko: '흥미',   valence: 1,  control: 1,  x: 0.62, y: 0.12, color: '#7BA4F8', words: ['흥미로움', '궁금함', '호기심', '기대됨']},
  {id: 'amusement',      en: 'Amusement',      ko: '즐거움', valence: 1,  control: 1,  x: 0.76, y: 0.16, color: '#8FB6FA', words: ['재미있음', '웃김', '신남']},
  {id: 'pride',          en: 'Pride',          ko: '자부심', valence: 1,  control: 1,  x: 0.88, y: 0.26, color: '#6C93E8', words: ['뿌듯함', '자랑스러움']},
  {id: 'joy',            en: 'Joy',            ko: '기쁨',   valence: 1,  control: 1,  x: 0.94, y: 0.40, color: '#A3C2FB', words: ['기쁨', '반가움', '설렘']},
  {id: 'pleasure',       en: 'Pleasure',       ko: '쾌감',   valence: 1,  control: 1,  x: 0.80, y: 0.36, color: '#5D84D8', words: ['짜릿함', '후련함']},
  // pleasant · low control (bottom right)
  {id: 'contentment',    en: 'Contentment',    ko: '만족',   valence: 1,  control: -1, x: 0.94, y: 0.60, color: '#5DB89B', words: ['만족스러움', '편안함']},
  {id: 'love',           en: 'Love',           ko: '사랑',   valence: 1,  control: -1, x: 0.88, y: 0.74, color: '#6CC5A8', words: ['애정', '따뜻함']},
  {id: 'admiration',     en: 'Admiration',     ko: '감탄',   valence: 1,  control: -1, x: 0.76, y: 0.84, color: '#4FA88B', words: ['감탄', '존경스러움', '대단함']},
  {id: 'relief',         en: 'Relief',         ko: '안도',   valence: 1,  control: -1, x: 0.62, y: 0.88, color: '#7FD1B5', words: ['안심됨', '다행스러움']},
  {id: 'compassion',     en: 'Compassion',     ko: '연민',   valence: 1,  control: -1, x: 0.80, y: 0.64, color: '#3F9A7D', words: ['안쓰러움', '공감됨']},
  // unpleasant · low control (bottom left)
  {id: 'sadness',        en: 'Sadness',        ko: '슬픔',   valence: -1, control: -1, x: 0.38, y: 0.88, color: '#9AA3B5', words: ['슬픔', '서운함', '허전함']},
  {id: 'guilt',          en: 'Guilt',          ko: '죄책감', valence: -1, control: -1, x: 0.24, y: 0.84, color: '#A58BE8', words: ['미안함', '죄책감']},
  {id: 'regret',         en: 'Regret',         ko: '후회',   valence: -1, control: -1, x: 0.12, y: 0.74, color: '#B39DEE', words: ['아쉬움', '후회됨']},
  {id: 'shame',          en: 'Shame',          ko: '수치심', valence: -1, control: -1, x: 0.06, y: 0.60, color: '#9479DB', words: ['부끄러움', '민망함']},
  {id: 'disappointment', en: 'Disappointment', ko: '실망',   valence: -1, control: -1, x: 0.20, y: 0.64, color: '#8C95A8', words: ['실망스러움', '허탈함']},
  // unpleasant · high control (top left)
  {id: 'fear',           en: 'Fear',           ko: '두려움', valence: -1, control: -1, x: 0.30, y: 0.74, color: '#E0A84F', words: ['불안함', '초조함', '막막함', '두려움', '걱정됨']},
  {id: 'disgust',        en: 'Disgust',        ko: '혐오',   valence: -1, control: 1,  x: 0.12, y: 0.26, color: '#C9A15A', words: ['거부감', '불쾌함']},
  {id: 'contempt',       en: 'Contempt',       ko: '경멸',   valence: -1, control: 1,  x: 0.24, y: 0.16, color: '#D98E6E', words: ['어이없음', '한심함']},
  {id: 'hate',           en: 'Hate',           ko: '증오',   valence: -1, control: 1,  x: 0.38, y: 0.12, color: '#E07A6A', words: ['미움', '싫음']},
  {id: 'anger',          en: 'Anger',          ko: '분노',   valence: -1, control: 1,  x: 0.20, y: 0.36, color: '#E58A7A', words: ['화남', '답답함', '억울함', '짜증남']},
];

export const emotionFamilyIds = emotionFamilies.map(f => f.id);
export const emotionWords = emotionFamilies.flatMap(f => f.words.map(word => ({word, family: f.id})));
export const familyOfWord = (word: string) => emotionWords.find(w => w.word === word)?.family ?? null;

// Note on 'fear' placement: in GEW, fear sits on the low-control side. It is placed here with the
// high-arousal unpleasant group so the four quadrants stay balanced at 5 each. If you follow GEW strictly,
// set fear.control = -1 and move it to x 0.30, y 0.74.
