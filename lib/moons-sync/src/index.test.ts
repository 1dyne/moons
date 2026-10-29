import test from 'node:test';
import assert from 'node:assert/strict';
import {apply, diff, eventType, hash, rebase} from './index.ts';

const base = () => ({
  version: 1,
  entries: [{id: 'e1', body: 'first', planetIds: []}, {id: 'e2', body: 'second', planetIds: []}],
  planets: [{id: 'p1', name: 'Learning', color: '#000', entryCount: 0}],
  settings: {profileContext: true},
});

test('diff → apply reproduces the edited store', () => {
  const a = base();
  const b = {...a, entries: [...a.entries, {id: 'e3', body: 'third', planetIds: ['p1']}], settings: {profileContext: false}};
  const result = apply(a, diff(a, b));
  assert.equal(result.conflicts.length, 0);
  assert.equal(hash(result.store), hash(b));
});

test('derived planet counts never produce changes or conflicts', () => {
  const a = base();
  const b = {...a, planets: [{...a.planets[0], entryCount: 7}]};
  assert.deepEqual(diff(a, b), []);
});

test('two devices editing different items merge without loss', () => {
  const server = base();
  const phone = {...server, entries: [...server.entries, {id: 'e-phone', body: 'from phone', planetIds: []}]};
  const laptop = {...server, entries: [{...server.entries[0], planetIds: ['p1']}, server.entries[1]]};
  const afterPhone = apply(server, diff(server, phone)).store;
  const merged = apply(afterPhone, diff(server, laptop));
  assert.equal(merged.conflicts.length, 0);
  const ids = (merged.store.entries as {id: string}[]).map(e => e.id);
  assert.deepEqual(ids, ['e1', 'e2', 'e-phone']);
  assert.deepEqual((merged.store.entries as {planetIds: string[]}[])[0].planetIds, ['p1']);
});

test('the same item edited on two devices conflicts and keeps the newer server value', () => {
  const server = base();
  const phone = {...server, planets: [{...server.planets[0], name: 'Study'}]};
  const laptop = {...server, planets: [{...server.planets[0], name: 'School'}]};
  const afterPhone = apply(server, diff(server, phone)).store;
  const second = apply(afterPhone, diff(server, laptop));
  assert.equal(second.conflicts.length, 1);
  assert.equal((second.store.planets as {name: string}[])[0].name, 'Study');
});

test('identical concurrent edits are not conflicts', () => {
  const server = base();
  const edit = {...server, planets: [{...server.planets[0], name: 'Study'}]};
  const once = apply(server, diff(server, edit)).store;
  const twice = apply(once, diff(server, edit));
  assert.equal(twice.conflicts.length, 0);
});

test('removing an item another device changed is a conflict; the change survives', () => {
  const server = base();
  const edited = {...server, entries: [{...server.entries[0], planetIds: ['p1']}, server.entries[1]]};
  const removed = {...server, entries: [server.entries[1]]};
  const afterEdit = apply(server, diff(server, edited)).store;
  const result = apply(afterEdit, diff(server, removed));
  assert.equal(result.conflicts.length, 1);
  assert.equal((result.store.entries as unknown[]).length, 2);
});

test('reordering keeps items added elsewhere', () => {
  const server = base();
  const reordered = {...server, entries: [server.entries[1], server.entries[0]]};
  const added = {...server, entries: [...server.entries, {id: 'e9', body: 'new', planetIds: []}]};
  const afterAdd = apply(server, diff(server, added)).store;
  const result = apply(afterAdd, diff(server, reordered));
  assert.deepEqual((result.store.entries as {id: string}[]).map(e => e.id), ['e2', 'e1', 'e9']);
});

test('event types name what happened', () => {
  const a = base();
  const b = {...a, entries: [a.entries[0], {...a.entries[1], planetIds: ['p1']}, {id: 'e3', body: 'x', planetIds: []}]};
  assert.deepEqual(diff(a, b).map(eventType).sort(), ['entries.created', 'entries.updated']);
});

test('a client that fills in defaults still edits settings without a false conflict', () => {
  const server = {...base(), settings: {profileContext: true}};
  const normalise = (d: typeof server) => ({...d, settings: {profileContext: true, notificationKinds: {a: true}, ...d.settings}});
  const local = normalise(server), edited = {...local, settings: {...local.settings, language: 'ko'}};
  const naive = apply(server, diff(local, edited));
  assert.equal(naive.conflicts.length, 1, 'without rebase the normalised base never matches');
  const fixed = apply(server, rebase(diff(local, edited), server));
  assert.equal(fixed.conflicts.length, 0);
  assert.equal((fixed.store.settings as {language: string}).language, 'ko');
});
