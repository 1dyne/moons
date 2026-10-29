export type DeviceId = 'projects' | 'planner' | 'impostor' | 'forms';
export type DeviceManifest = {id:DeviceId; name:string; description:string; version:string; publisher:string; route:string; category:string; permissions:string[]};
// Curated first-party packages. A manifest is metadata, never executable user input.
export const DEVICE_CATALOG: DeviceManifest[] = [
  {id:'projects',name:'Dock',description:'Your projects, next steps and connected services in one place.',version:'1.1.0',publisher:'MOONS',route:'/projects',category:'Projects',permissions:['Read selected ideas and context','Use AI to prepare project reviews','Manage project schedules','Read connected service status']},
  {id:'planner',name:'Schedule',description:'Plan your day and track time spent on your work.',version:'1.0.0',publisher:'MOONS',route:'/planner',category:'Schedule',permissions:['Manage project schedules']},
  {id:'impostor',name:'Impostor',description:'Practice checking ideas and questioning assumptions.',version:'1.0.0',publisher:'MOONS',route:'/satellite',category:'Learning',permissions:['Add learning prompts to your space']},
  {id:'forms',name:'Form builder',description:'Build your own repeatable ways to capture thoughts.',version:'1.0.0',publisher:'MOONS',route:'/forms/new',category:'Capture',permissions:['Create forms and notes']},
];
export type DeviceInstall = {version:string;installedAt:string;enabled:boolean;permissions:string[]};
export type DeviceSettings = {satellites?:string[];satelliteInstalls?:Partial<Record<DeviceId,DeviceInstall>>};
export const deviceManifest = (id:string) => DEVICE_CATALOG.find(d=>d.id===id);
export function deviceEnabled(settings:DeviceSettings|undefined,id:DeviceId) {
  return !!settings?.satellites?.includes(id) && settings.satelliteInstalls?.[id]?.enabled!==false;
}
