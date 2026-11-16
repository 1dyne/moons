// How a set of entries becomes one number (shared by blocks, automations and 상황).
export const AGGS = [{id: 'count', en: 'Count', name: '개수'}, {id: 'sum', en: 'Sum', name: '합계'}, {id: 'avg', en: 'Average', name: '평균'}, {id: 'max', en: 'Max', name: '최대'}, {id: 'min', en: 'Min', name: '최소'}, {id: 'streak', en: 'Streak', name: '연속 일수'}, {id: 'days', en: 'Days logged', name: '기록한 날 수'}, {id: 'last', en: 'Latest', name: '마지막 값'}] as const;
export type Agg = (typeof AGGS)[number]['id'];
