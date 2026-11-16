// Ready-made movements (CSS keyframes in the planner): for parts (when tapped, when shown, always) and for rules (반짝 when a wish opens).
export const EFFECTS = [
  {id: 'sparkle', en: 'Sparkle', name: '반짝'}, {id: 'bounce', en: 'Bounce', name: '통통'}, {id: 'shake', en: 'Shake', name: '흔들기'}, {id: 'float', en: 'Float', name: '둥실'},
  {id: 'pulse', en: 'Pulse', name: '두근'}, {id: 'spin', en: 'Spin', name: '빙글'}, {id: 'pop', en: 'Pop', name: '톡'}, {id: 'glow', en: 'Glow', name: '빛나기'}, {id: 'confetti', en: 'Confetti', name: '빵빠레'},
  // A whole-screen moment (trophy sticker, confetti, the item's name): for a goal reached, not for parts.
  {id: 'celebrate', en: 'Celebrate', name: '축하 화면'},
] as const;
export const EFFECT_IDS = EFFECTS.map(e => e.id) as unknown as readonly ['sparkle', 'bounce', 'shake', 'float', 'pulse', 'spin', 'pop', 'glow', 'confetti', 'celebrate'];
export type EffectId = (typeof EFFECTS)[number]['id'];
export const EFFECT_NAME: Record<string, string> = Object.fromEntries(EFFECTS.map(e => [e.id, e.name]));
