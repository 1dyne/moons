import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missedIndices,migrateVerdict,validateEmotions,verifyEntryQuotes} from '../lib/server/v5/analysis.ts';
import {limitNotifications} from '../lib/server/v5/notifications.ts';
import {publicAddress} from '../lib/server/v5/url-material.ts';
import type {Entry} from '../lib/server/v5/types.ts';

test('comparison migrations keep old meanings without rewriting originals',()=>{
 assert.equal(migrateVerdict('same'),'kept');assert.equal(migrateVerdict('different'),'shifted');assert.equal(migrateVerdict('own'),'added');assert.equal(migrateVerdict('missed'),'missed');
});
test('missed uses repeated embedding clusters and excludes covered originals',()=>{
 const vectors=[[1,0],[1,0],[1,0],[0,1],[-1,0],[0,-1],[.7,.7]];
 assert.deepEqual(missedIndices(vectors,new Set([0])),[1,2]);
 assert.deepEqual(missedIndices(vectors,new Set([0,1,2])),[]);
});
test('emotion evidence is exact source text, capped at two and intensity 1–3',()=>{
 const text='I feel anxious but also relieved.';
 const good={family:'fear',word:'불안함',evidence:'anxious',intensity:2};
 assert.equal(validateEmotions([good,good,good],text).length,2);
 assert.equal(validateEmotions([{...good,evidence:'very worried'},{...good,intensity:4},{...good,family:'diagnosis'}],text).length,0);
});
test('analysis rejects paraphrases as user-authored nodes',()=>{
 const entry={body:'I am unsure.',sentences:['I am unsure.'],analysis:{nodes:[{id:'n',text:'I am unsure.',source:[0],empty:false}]}} as Entry;
 assert.doesNotThrow(()=>verifyEntryQuotes(entry));
 entry.analysis!.nodes[0]!.text='I am terrified.';
 assert.throws(()=>verifyEntryQuotes(entry),/exact original/);
});
test('URL fetch refuses private, loopback, mapped, reserved and multicast networks',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.31.0.1','192.168.2.3','169.254.169.254','100.64.1.2','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','fe80::1','ff00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
});
test('notifications cap at two daily, honor disabled kinds and deduplicate a week',()=>{
 const time='2026-10-14T10:00:00.000Z';
 const candidates=['a','b','c'].map(key=>({key,kind:'breaking_news',headline:key,evidence:['owned']}));
 const first=limitNotifications([],candidates,undefined,time);
 assert.equal(first.length,2);
 assert.equal(limitNotifications(first,candidates,undefined,time).length,0);
 assert.equal(limitNotifications(first,candidates,undefined,'2026-10-15T10:00:00.000Z').length,1);
 assert.equal(limitNotifications([],candidates,{notificationKinds:{breaking_news:false}},time).length,0);
});
