/// <reference path="./lit-widget.d.ts" />
// A lit code widget: plain TypeScript, no imports. `lit` is provided inside the widget frame.
// Runs sandboxed (no network). Rows are this widget's own data; keys are the column keys in manifest.json.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function render(): Promise<void> {
  const [rows, tasks] = await Promise.all([lit.table.rows(), lit.tasks.today()]);
  $('done').textContent = `${tasks.filter(t => t.result === 'done').length}/${tasks.length}`;
  const best = Math.max(...rows.map(r => Number(r.cells.score) || 0));
  $('rows').replaceChildren(...rows.map(r => {
    const li = document.createElement('li');
    li.textContent = `${r.cells.label ?? ''} · ${r.cells.score ?? '–'}점`;
    if (Number(r.cells.score) === best && best > 0) li.className = 'best';
    li.ondblclick = () => void lit.table.remove(r.id);
    return li;
  }));
}

$<HTMLFormElement>('add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  await lit.table.add({label: String(f.get('label')), score: Number(f.get('score'))});
  (e.target as HTMLFormElement).reset();
});

lit.on('change', () => void render());
void render();
