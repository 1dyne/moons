// Ready-made movements (CSS keyframes in the planner): for parts (when tapped, when shown, always) and for rules (반짝 when a wish opens).
export const EFFECTS = [
  {id: 'sparkle', name: '반짝'}, {id: 'bounce', name: '통통'}, {id: 'shake', name: '흔들기'}, {id: 'float', name: '둥실'},
  {id: 'pulse', name: '두근'}, {id: 'spin', name: '빙글'}, {id: 'pop', name: '톡'}, {id: 'glow', name: '빛나기'}, {id: 'confetti', name: '빵빠레'},
] as const;
export const EFFECT_IDS = EFFECTS.map(e => e.id) as unknown as readonly ['sparkle', 'bounce', 'shake', 'float', 'pulse', 'spin', 'pop', 'glow', 'confetti'];
export type EffectId = (typeof EFFECTS)[number]['id'];
export const EFFECT_NAME: Record<string, string> = Object.fromEntries(EFFECTS.map(e => [e.id, e.name]));
