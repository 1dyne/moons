import {createContext, useContext} from 'react';

// Words on a widget's buttons the user renamed in the editor (widget.options.labels). Empty = the default.
const LabelCtx = createContext<Record<string, unknown>>({});
export const LabelProvider = LabelCtx.Provider;
export function useL() {
  const labels = useContext(LabelCtx);
  return (key: string, def: string) => { const v = labels[key]; return typeof v === 'string' && v.trim() ? v : def; };
}
