import {ko} from './i18n-ko.ts';

// UI language: Korean by default, English on request. Stored per device;
// switching reloads so every module reads one fixed value.
export type Lang = 'ko' | 'en';
const KEY = 'moons.lang';

function readLang(): Lang {
  try {const v = localStorage.getItem(KEY); if (v === 'en' || v === 'ko') return v;} catch {/* private mode */}
  return 'ko';
}
// Outside a browser (unit tests) strings stay in their English source form.
export const lang: Lang = typeof window === 'undefined' ? 'en' : readLang();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function setLang(next: Lang) {
  try {localStorage.setItem(KEY, next);} catch {/* private mode */}
  window.location.reload();
}

// English source text is the key. {name} placeholders are filled from vars.
export function tr(en: string, vars?: Record<string, string | number>): string {
  let s = lang === 'ko' ? ko[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
