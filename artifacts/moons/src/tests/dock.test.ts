import test from 'node:test';
import assert from 'node:assert/strict';
import {installDevice,uninstallDevice,toggleSatellite,installedDevices,enabledSatellites} from '../lib/satellites.ts';
import {scheduleBrief,scheduleStats,tasksFor,weekDays} from '../lib/dock.ts';
import type {Store} from '../lib/model.ts';
import type {ConnectedProject,ProjectProposal} from '@workspace/moons-sync/projects';
import {newTask} from '../lib/planner.ts';
const blank=()=>({entries:[],projects:[],tasks:[],settings:{satellites:[]}} as unknown as Store);
test('device lifecycle keeps project data and migrates existing enabled devices',()=>{
 let s=blank();s.settings!.satellites=['projects'];s=installDevice(s,'projects');
 assert.equal(installedDevices(s).projects?.version,'1.1.0');
 s=toggleSatellite(s,'projects',false);assert.equal(enabledSatellites(s).has('projects'),false);assert.ok(installedDevices(s).projects);
 s=toggleSatellite(s,'projects',true);assert.equal(enabledSatellites(s).has('projects'),true);
 s.tasks=[newTask('Retained')];s=uninstallDevice(s,'projects');assert.equal(installedDevices(s).projects,undefined);assert.equal(s.tasks?.length,1);
 s=installDevice(s,'projects');assert.equal(s.tasks?.length,1);
});
test('approved version is scheduled once using shared planner identity and immutable title',()=>{
 const p={id:'dock-id',plannerProjectId:'existing-id',name:'My app'} as ConnectedProject;
 const proposal={id:'proposal',draft:{title:'Changed draft'},briefs:[{id:'brief-1',version:1,markdown:'# Approved title\n...'}]} as ProjectProposal;
 let s=scheduleBrief(blank(),p,proposal,'2026-10-27');
 assert.equal(s.projects?.[0]?.id,'existing-id');assert.equal(tasksFor(s,p)[0]?.title,'Approved title');
 assert.equal(tasksFor(s,p)[0]?.plannedDate,'2026-10-27');
 assert.equal(scheduleBrief(s,p,proposal,'2026-10-28'),s);
 proposal.briefs.push({...proposal.briefs[0]!,id:'brief-2',version:2});s=scheduleBrief(s,p,proposal,'2026-10-28');assert.equal(s.tasks?.length,2);assert.equal(s.projects?.length,1);
});
test('schedule separates overdue, unscheduled, done and dropped tasks across month boundaries',()=>{
 const stats=scheduleStats([newTask('late',{plannedDate:'2026-09-30'}),newTask('today',{plannedDate:'2026-10-01'}),newTask('unknown'),newTask('done',{status:'done',plannedDate:'2026-09-30'}),newTask('dropped',{status:'dropped'})],'2026-10-01');
 assert.equal(stats.overdue.length,1);assert.equal(stats.today.length,1);assert.equal(stats.unscheduled.length,1);assert.equal(stats.done,1);assert.equal(stats.total,4);
 assert.deepEqual(weekDays('2026-10-01'),['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
});
