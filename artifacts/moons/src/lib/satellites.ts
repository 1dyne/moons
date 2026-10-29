import type {Store} from './model.ts';
import {DEVICE_CATALOG,deviceManifest,type DeviceInstall} from '@workspace/moons-sync/satellites';
export {DEVICE_CATALOG};

// Extensions the user switches on; each switched-on one appears in the navigation.
export const toolSatellites = ['planner', 'impostor', 'projects'] as const;
export const madeSatellites = ['forms'] as const;
export type SatelliteId = typeof toolSatellites[number] | typeof madeSatellites[number];

/** Off by default, except where the user already has data in it. */
export function enabledSatellites(store: Store): Set<SatelliteId> {
  if (store.settings?.satellites) return new Set(store.settings.satellites.filter(id=>deviceManifest(id)&&store.settings?.satelliteInstalls?.[id as SatelliteId]?.enabled!==false) as SatelliteId[]);
  const on = new Set<SatelliteId>();
  if ((store.projects?.length ?? 0) + (store.tasks?.length ?? 0) + (store.sessions?.length ?? 0) > 0) on.add('planner');
  if (store.settings?.impostor && store.settings.impostor !== 'off') on.add('impostor');
  if ((store.forms?.length ?? 0) > 0) on.add('forms');
  return on;
}

/** Switching the impostor satellite off also stops planting; switching it on starts at "rare". */
export function toggleSatellite(store: Store, id: SatelliteId, on: boolean): Store {
  const now = enabledSatellites(store);
  if (on) now.add(id); else now.delete(id);
  const settings = {...(store.settings ?? {profileContext: true, notificationKinds: {}}), satellites: [...now]};
  if(settings.satelliteInstalls?.[id])settings.satelliteInstalls={...settings.satelliteInstalls,[id]:{...settings.satelliteInstalls[id]!,enabled:on}};
  if (id === 'impostor') settings.impostor = on ? (store.settings?.impostor && store.settings.impostor !== 'off' ? store.settings.impostor : 'rare') : 'off';
  return {...store, settings};
}

export function installedDevices(store:Store):Partial<Record<SatelliteId,DeviceInstall>> {
  const installs={...store.settings?.satelliteInstalls};
  for(const id of enabledSatellites(store))if(!installs[id])installs[id]={version:'1.0.0',installedAt:'',enabled:true,permissions:deviceManifest(id)!.permissions};
  return installs;
}
export function installDevice(store:Store,id:SatelliteId):Store {
  const device=deviceManifest(id)!,installs=installedDevices(store);
  const next={...store,settings:{...store.settings!,satelliteInstalls:{...installs,[id]:{version:device.version,installedAt:installs[id]?.installedAt||new Date().toISOString(),enabled:true,permissions:[...device.permissions]}}}};
  return toggleSatellite(next,id,true);
}
export function uninstallDevice(store:Store,id:SatelliteId):Store {
  const next=toggleSatellite(store,id,false),installs=installedDevices(next);delete installs[id];
  return {...next,settings:{...next.settings!,satelliteInstalls:installs}};
}
