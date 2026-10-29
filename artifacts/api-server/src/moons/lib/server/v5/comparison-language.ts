export type ComparisonLanguage='English'|'Korean'|'Japanese'|'Chinese'|'source language';
export function comparisonLanguage(text:string):ComparisonLanguage {
 const count=(r:RegExp)=>(text.match(r)??[]).length;
 const latin=count(/[A-Za-z]/g),ko=count(/\p{Script=Hangul}/gu),ja=count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu),han=count(/\p{Script=Han}/gu);
 if(ko>Math.max(1,latin*.3))return 'Korean';
 if(ja>Math.max(1,latin*.2))return 'Japanese';
 if(han>Math.max(1,latin*.3))return 'Chinese';
 return latin>=3?'English':'source language';
}
export function followsComparisonLanguage(text:string,language:ComparisonLanguage) {
 if(!text.trim())return false;
 if(language==='English')return !/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)&&/[A-Za-z]/.test(text);
 if(language==='Korean')return /\p{Script=Hangul}/u.test(text);
 if(language==='Japanese')return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
 if(language==='Chinese')return /\p{Script=Han}/u.test(text);
 return true;
}
export const missedNote=(language:ComparisonLanguage)=>({
 English:'The original emphasized this point; it is not covered in your answer.',
 Korean:'원문이 강조한 이 부분은 답변에서 다루지 않았습니다.',
 Japanese:'原文で強調されたこの点は、回答では触れられていません。',
 Chinese:'原文强调的这一点未在你的回答中涉及。',
 'source language':'Not covered in the answer.',
})[language];
