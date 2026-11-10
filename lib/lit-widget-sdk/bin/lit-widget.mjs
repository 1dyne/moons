#!/usr/bin/env node
// lit-widget: make, preview, build and publish lit code widgets (docs/lit/DEVELOPER_GUIDE.md).
// No dependencies: Node 22.13+ (TypeScript is read by stripping types; no bundler, no imports in widget code).
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, stat, copyFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, dirname, basename, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Node marks type stripping experimental; keep the CLI output clean.
const emit = process.emitWarning;
process.emitWarning = (w, ...a) => (String(a[0]?.type ?? a[0]) === 'ExperimentalWarning' ? undefined : emit.call(process, w, ...a));
const {stripTypeScriptTypes} = await import('node:module');
if (typeof stripTypeScriptTypes !== 'function') { console.error('✕ Node 22.13 이상이 필요해요.'); process.exit(1); }

const SDK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [, , cmd, ...rest] = process.argv;
const flag = (name, def) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : process.env[`LIT_${name.toUpperCase()}`] ?? def; };
const fail = msg => { console.error(`✕ ${msg}`); process.exit(1); };
const PERMS = ['table:read', 'table:write', 'tasks:read', 'goals:read', 'condition:read'];

async function read(dir, file) { const p = join(dir, file); return existsSync(p) ? readFile(p, 'utf8') : undefined; }
const js = (src, file) => file.endsWith('.ts') ? stripTypeScriptTypes(src, {mode: 'strip'}) : src;

/** manifest.json + index.html + style.css + widget.ts|js → one manifest lit accepts. */
async function build(dir) {
  const raw = await read(dir, 'manifest.json'); if (!raw) fail(`${dir}/manifest.json이 없어요. lit-widget create로 시작해요.`);
  let m; try { m = JSON.parse(raw); } catch (e) { fail(`manifest.json을 읽지 못했어요: ${e.message}`); }
  const codeFile = m.codeFile ?? (existsSync(join(dir, 'widget.ts')) ? 'widget.ts' : existsSync(join(dir, 'widget.js')) ? 'widget.js' : undefined);
  const html = await read(dir, m.htmlFile ?? 'index.html'), css = await read(dir, m.cssFile ?? 'style.css');
  let code = codeFile ? await read(dir, codeFile) : undefined;
  if (code !== undefined) { try { code = js(code, codeFile); } catch (e) { fail(`${codeFile}: ${e.message}`); } }
  if (code && /^\s*import\s|^\s*export\s/m.test(code)) fail(`${codeFile}: import/export 없이 한 파일로 써요(전역 lit을 써요). 라이브러리가 필요하면 미리 번들한 widget.js를 쓰세요.`);
  const {codeFile: _a, htmlFile: _b, cssFile: _c, ...rest} = m;
  const out = {...rest, ...(html ? {html} : {}), ...(css ? {css} : {}), ...(code ? {code} : {})};
  const problems = [];
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(out.id ?? '')) problems.push('id: 영문 소문자·숫자·- 2~40자');
  if (!out.name) problems.push('name이 필요해요');
  if (out.version && !/^\d+\.\d+\.\d+$/.test(out.version)) problems.push('version: 1.0.0 형식');
  for (const p of out.permissions ?? []) if (!PERMS.includes(p)) problems.push(`permissions: 알 수 없는 권한 ${p}`);
  if (!out.view?.length && !out.code && !out.html) problems.push('view(블록)나 코드가 하나는 있어야 해요');
  if ((out.code?.length ?? 0) > 300_000) problems.push('code가 300KB를 넘어요');
  if (problems.length) fail(`설명서를 고쳐요:\n  - ${problems.join('\n  - ')}`);
  return out;
}

async function create(name) {
  if (!name) fail('이름을 주세요: lit-widget create my-widget');
  const dir = resolve(name), id = basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-widget';
  if (existsSync(dir) && (await readdir(dir)).length) fail(`${dir}가 비어 있지 않아요.`);
  await mkdir(dir, {recursive: true});
  for (const f of await readdir(join(SDK, 'template'))) {
    const src = await readFile(join(SDK, 'template', f), 'utf8');
    await writeFile(join(dir, f), src.replaceAll('__ID__', id).replaceAll('__NAME__', name));
  }
  await copyFile(join(SDK, 'src', 'lit-widget.d.ts'), join(dir, 'lit-widget.d.ts'));
  console.log(`✓ ${dir}\n  다음: cd ${name} && lit-widget dev`);
}

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ts': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8'};

async function dev(dir) {
  const port = Number(flag('port', 5300));
  const stamp = async () => { let t = 0; for (const f of await readdir(dir)) { try { t = Math.max(t, (await stat(join(dir, f))).mtimeMs); } catch {} } return String(t); };
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/') { res.writeHead(200, {'content-type': MIME['.html']}); res.end(await readFile(join(SDK, 'bin', 'harness.html'))); return; }
      if (url.pathname === '/__widget') { const m = await build(dir).catch(e => ({error: e.message})); res.writeHead(200, {'content-type': MIME['.json'], 'cache-control': 'no-store'}); res.end(JSON.stringify(m)); return; }
      if (url.pathname === '/__stamp') { res.writeHead(200, {'cache-control': 'no-store'}); res.end(await stamp()); return; }
      // The harness runs the same sandbox document and host as lit: serve the SDK sources as JS.
      const m = /^\/sdk\/([a-z]+\.ts)$/.exec(url.pathname);
      if (m) { res.writeHead(200, {'content-type': MIME['.js']}); res.end(stripTypeScriptTypes(await readFile(join(SDK, 'src', m[1]), 'utf8'), {mode: 'strip'})); return; }
      res.writeHead(404); res.end();
    } catch (e) { res.writeHead(500); res.end(String(e.message ?? e)); }
  }).listen(port, () => console.log(`✓ 미리보기: http://localhost:${port}  (파일을 고치면 자동으로 다시 그려요)`));
}

async function publish(dir) {
  const url = flag('url'), token = flag('token');
  if (!url || !token) fail('주소와 토큰이 필요해요: lit-widget publish --url https://내-lit-주소 --token litdev_… (토큰은 lit 메뉴 → 개발자)');
  const manifest = await build(dir);
  const res = await fetch(`${url.replace(/\/$/, '')}/api/life/v1/dev/widgets`, {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${token}`}, body: JSON.stringify({manifest})});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data?.error?.message ?? `올리지 못했어요 (${res.status})`);
  console.log(`✓ ${data.item.name} ${manifest.version ?? '1.0.0'} → 내 라이브러리\n  lit 메뉴 → 설치한 위젯에서 권한을 확인하고 승인하면 실행돼요.`);
}

const dir = resolve(flag('dir', '.'));
switch (cmd) {
  case 'create': await create(rest.find(a => !a.startsWith('--'))); break;
  case 'dev': await dev(dir); break;
  case 'build': { const m = await build(dir); await mkdir(join(dir, 'dist'), {recursive: true}); await writeFile(join(dir, 'dist', 'widget.json'), JSON.stringify(m, null, 2)); console.log(`✓ dist/widget.json (${Math.round(JSON.stringify(m).length / 1024)}KB) — lit 메뉴 → 위젯 만들기 → 설명서 붙여넣기로도 넣을 수 있어요.`); break; }
  case 'publish': await publish(dir); break;
  default: console.log(`lit-widget — lit 코드 위젯 도구
  create <이름>   새 위젯 폴더 (manifest.json, index.html, style.css, widget.ts, 타입)
  dev             예시 데이터로 미리보기 (--port 5300)
  build           dist/widget.json 만들기 (설명서 붙여넣기용)
  publish         내 lit 라이브러리에 올리기 (--url, --token 또는 LIT_URL, LIT_TOKEN)`);
}
