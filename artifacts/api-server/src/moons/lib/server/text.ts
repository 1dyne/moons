import {splitSentences} from '../thought.ts';

// Limits shared by typed and spoken answers.
export const MAX_TEXT = 3000;
export const MAX_AUDIO = 6 * 1024 * 1024;

// Keep a spoken answer within MAX_TEXT, ending on a sentence when one ends late enough.
export function trimSpoken(text: string) {
  if (text.length <= MAX_TEXT) return text;
  const cut = text.slice(0, MAX_TEXT);
  const end = Math.max(...['.', '!', '?', '。', '\n'].map(c => cut.lastIndexOf(c)));
  return end >= MAX_TEXT * 0.6 ? cut.slice(0, end + 1) : cut;
}

// Speech models sometimes loop: the same phrase or sentence over and over. Keep one of each run.
export function cleanTranscript(text: string) {
  const unlooped = text.replace(/(\S.{1,40}?)(?:[\s,.]*\1){2,}/gu, '$1');
  const out: string[] = [];
  const key = (s: string) => s.replace(/[\s.,!?。！？]+/g, '');
  for (const s of splitSentences(unlooped)) {
    if (out.length && key(out[out.length - 1]) === key(s)) continue;
    out.push(s);
  }
  return out.join(' ').trim();
}
