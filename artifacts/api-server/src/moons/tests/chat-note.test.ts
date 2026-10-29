import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDwarfs} from '../lib/server/v5/chat-note.ts';
import {unfamiliar, type Concept} from '../lib/server/v5/concepts.ts';
import type {Store} from '../lib/server/v5/types.ts';

test('concepts a conversation raised join the concept tab as dwarf planets, merged by name', () => {
  const store = {version: 1, entries: [], planets: [], concepts: [{id: 'x', name: 'GJK algorithm', aliases: ['GJK'], kind: 'method', definition: [], relations: [], mentions: [], state: 'seen', createdAt: 't'}]} as unknown as Store;
  const ids = registerDwarfs(store, ['gjk', '메시 단순화', ' 메시  단순화 ', ''], 'note');
  const list = store.concepts as Concept[];
  assert.equal(list.length, 2);
  assert.deepEqual(ids, ['x', list[1]!.id]);
  assert.ok(list.every(unfamiliar));
});
