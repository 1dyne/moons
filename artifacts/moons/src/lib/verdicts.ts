import type {Verdict} from './model.ts';
import {tr} from './i18n.ts';

// Comparison tags as symbols. Colour and symbol always come with a text label for screen readers.
export const verdictOrder: Verdict[] = ['kept', 'shifted', 'added', 'missed'];
export const verdictTag: Record<Verdict, {symbol: string; label: string; term: string; say: string; look: string}> = {
  kept: {symbol: '✓', label: tr('Confirmed'), term: tr('Retention'),
    say: tr('You took this the way the original said it.'),
    look: tr('To make it firmer, check once more under which conditions it was said.')},
  shifted: {symbol: '≈', label: tr('Shifted'), term: tr('Transformation'),
    say: tr('This came from the original, but the meaning moved a little on the way.'),
    look: tr('Put the original sentence next to yours and find what changed.')},
  added: {symbol: '+', label: tr('Added'), term: tr('Addition'),
    say: tr('This was not in the original. It may come from your own experience, reasoning or assumptions.'),
    look: tr('Nothing is wrong with it. Just mark whether it came from the original or from you.')},
  missed: {symbol: '○', label: tr('Missed'), term: tr('Omission'),
    say: tr('The original put weight here, and it is not in what you took away.'),
    look: tr('Read this part of the original again and note why it dropped out — you did not know it, or it did not seem important.')},
};

export const shiftTag: Record<string, {label: string; say: string}> = {
  condition_dropped: {label: tr('Condition dropped'),
    say: tr('The original attached a condition like “only when…” or “if…”, and it is gone from your sentence. Find when the original said this applies.')},
  certainty_raised: {label: tr('Stated more firmly'),
    say: tr('The original left room with words like “maybe” or “can”, but your sentence says “always” or “must”. Check how sure the original really was.')},
  referent_shifted: {label: tr('Subject changed'),
    say: tr('Who or what the original was talking about differs from yours. Find who the subject was in the original.')},
  cause_added: {label: tr('Reason added'),
    say: tr('A “because” appeared in your sentence that the original did not give. Check whether the original said why, or whether you filled it in.')},
  emotion_added: {label: tr('Feeling added'),
    say: tr('The original said it plainly, and your sentence carries a feeling. Tell apart whose feeling it is — the original’s or yours.')},
  premise_inserted: {label: tr('Assumption slipped in'),
    say: tr('An assumption the original never stated sits under your sentence. Find where you thought “of course…” and see if the original said it.')},
};
