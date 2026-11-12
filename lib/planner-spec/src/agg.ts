// How a set of entries becomes one number (shared by blocks, automations and 상황).
export const AGGS = [{id: 'count', name: '개수'}, {id: 'sum', name: '합계'}, {id: 'avg', name: '평균'}, {id: 'max', name: '최대'}, {id: 'min', name: '최소'}, {id: 'streak', name: '연속 일수'}, {id: 'days', name: '기록한 날 수'}, {id: 'last', name: '마지막 값'}] as const;
export type Agg = (typeof AGGS)[number]['id'];
