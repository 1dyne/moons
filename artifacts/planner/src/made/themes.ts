import type {LogicBlock} from '@workspace/planner-spec';

// Starting points for HTML designs. All of them use the widget's design tokens (--accent, --ink…) so a page skin still applies.
const views = ['list', 'table', 'gallery', 'timeline'];
/** A template that shows every block where it is, so the user starts from something that already works. */
export function starterHtml(blocks: LogicBlock[]) {
  const parts = blocks.map(b => b.kind === 'stat' ? `  <div class="stat"><span>${b.label || '합계'}</span><b>{{blocks.${b.id}.text}}</b></div>`
    : views.includes(b.kind) ? `  <ul class="rows">{{#each blocks.${b.id}}}<li><time>{{time}}</time> {{duration}}{{value}}{{unit}}</li>{{else}}<li class="none">–</li>{{/each}}</ul>`
    : `  <lit-block ref="${b.id}"></lit-block>`);
  return `<div class="card">\n  <h3>{{icon "sparkles"}} {{title}}</h3>\n${parts.join('\n')}\n</div>`;
}
export const THEMES: {id: string; name: string; css: string; html?: (b: LogicBlock[]) => string}[] = [
  {id: 'card', name: '깔끔한 카드', css: `.card{display:grid;gap:10px}
h3{margin:0;display:flex;gap:6px;align-items:center;font-size:15px}
.stat{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent);padding-top:8px}
.stat b{font-size:22px;font-family:var(--mono)}
.rows{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.rows time{font-family:var(--mono);color:var(--muted)}`},
  {id: 'paper', name: '종이 다이어리', css: `.card{background:repeating-linear-gradient(#fffdf6 0 27px,#e8e1cf 27px 28px);padding:14px 16px;border-radius:4px;box-shadow:0 2px 0 #d9d1bd;color:#3b352a;display:grid;gap:8px}
h3{margin:0;font-size:17px;letter-spacing:.02em;border-bottom:2px dashed #c9b98f;padding-bottom:6px}
.stat{display:flex;justify-content:space-between}.stat b{font-size:20px;color:#b0552f}
.rows{margin:0;padding-left:18px}.rows li::marker{content:'✎ '}`},
  {id: 'pixel', name: '도트 미니룸', css: `.card{background:#cfe8ff;border:3px solid #24324a;box-shadow:4px 4px 0 #24324a;padding:12px;display:grid;gap:8px;font-family:var(--mono);image-rendering:pixelated}
h3{margin:0;background:#24324a;color:#fff7c2;padding:4px 8px;font-size:14px;display:flex;gap:6px;align-items:center}
.stat{display:flex;justify-content:space-between;background:#fff7c2;border:2px solid #24324a;padding:4px 8px}
.rows{list-style:square;margin:0;padding-left:20px;color:#24324a}`},
  {id: 'night', name: '밤하늘', css: `.card{background:radial-gradient(circle at 80% 10%,#3b4a7a,#141a2e 70%);color:#eef1ff;border-radius:18px;padding:16px;display:grid;gap:10px}
h3{margin:0;font-size:16px;display:flex;gap:6px;align-items:center;color:#ffe9a8}
.stat{display:flex;justify-content:space-between;align-items:baseline}.stat b{font-size:26px;font-family:var(--mono)}
.rows{list-style:none;margin:0;padding:0;display:grid;gap:4px;opacity:.9}`},
];
