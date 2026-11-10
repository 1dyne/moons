import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSrcdoc} from './srcdoc.ts';
import {METHODS} from './protocol.ts';

const theme = {bg: '#e6e6e1', surface: '#f5f5f1', ink: '#151515', muted: '#5d5d57', accent: '#f2c230', font: 'system-ui', radius: 0, dark: false};

test('the widget document blocks the network and cannot be broken out of with </script>', () => {
  const doc = buildSrcdoc({html: '<p>hi</p>', css: 'p{color:red}', code: 'const s = "</script><script>alert(1)</script>";'}, theme);
  assert.match(doc, /Content-Security-Policy" content="default-src 'none'; form-action 'none'/);
  assert.doesNotMatch(doc, /connect-src/, 'no connect-src: fetch/XHR/WebSocket fall back to default-src none');
  assert.equal(doc.match(/<\/script>/g)!.length, 2, 'only the client and the code tags close; the string inside code is escaped');
  assert.match(doc, /window\.lit=/);
});

test('every data method names the permission it needs; context needs none', () => {
  assert.equal(METHODS.context, null);
  assert.equal(METHODS['table.add'], 'table:write');
  assert.equal(METHODS['tasks.today'], 'tasks:read');
});
