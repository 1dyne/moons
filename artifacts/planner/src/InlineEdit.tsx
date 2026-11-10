import {useState} from 'react';

// Double-click to edit in place (planner title, widget titles, tasks). Enter or leaving the box saves; Esc cancels.
export function InlineEdit({value, onSave, className, placeholder, max = 200, as = 'span', disabled}: {value: string; onSave: (v: string) => unknown; className?: string; placeholder?: string; max?: number; as?: 'span' | 'h1' | 'h3'; disabled?: boolean}) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value);
  const Tag = as;
  if (editing) return <input className={`inline-edit ${className ?? ''}`} value={draft} autoFocus maxLength={max} placeholder={placeholder} aria-label={placeholder ?? '고치기'}
    onChange={e => setDraft(e.target.value)} onFocus={e => e.currentTarget.select()}
    onBlur={() => { setEditing(false); if (draft.trim() && draft.trim() !== value) void onSave(draft.trim()); }}
    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }} />;
  return <Tag className={`${className ?? ''} ${disabled ? '' : 'editable'}`} title={disabled ? undefined : '두 번 눌러 고치기'} onDoubleClick={disabled ? undefined : () => { setDraft(value); setEditing(true); }}>{value || placeholder}</Tag>;
}
