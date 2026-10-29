// Masks secrets and personal contact details before anything is stored or sent to a model.
const patterns: [RegExp, string][] = [
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, '[키 가림]'],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g, '[키 가림]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[키 가림]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[키 가림]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, '[토큰 가림]'],
  [/\b(?:test|live)_(?:sk|ck|gsk)_[A-Za-z0-9]{8,}\b/g, '[키 가림]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일 가림]'],
  [/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 가림]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[번호 가림]'],
];

export function redact(text: string): {text: string; count: number} {
  let count = 0, out = text;
  for (const [re, label] of patterns) out = out.replace(re, () => { count++; return label; });
  return {text: out, count};
}
