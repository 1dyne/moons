import {fontInfo} from '@workspace/planner-spec';

// Web fonts are fetched only when a skin or widget uses them (Google Fonts, Korean subsets).
const loaded = new Set<string>();
export function useFontFamily(id: string | undefined) {
  const f = fontInfo(id);
  if (f.css && !loaded.has(f.id) && typeof document !== 'undefined') {
    loaded.add(f.id);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${f.css}&display=swap`;
    document.head.appendChild(link);
  }
  return `'${f.family}',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif`;
}
