// v9 4.7 창고: folders and files kept as they are.
import {v9Api} from './pages.ts';

export type Folder = {id: string; name: string; parentId: string | null};
export type Asset = {id: string; folderId: string | null; name: string; mime: string; size: number; url?: string; stored: boolean; createdAt: string};
const base = () => `${(import.meta as {env?: {BASE_URL?: string}}).env?.BASE_URL ?? '/'}api`;
export const assetUrl = (id: string) => `${base()}/assets/${id}/file`;

export const storageApi = {
  list: () => v9Api.call<{folders: Folder[]; assets: Asset[]}>('/folders'),
  saveFolder: (f: Folder) => v9Api.call(`/folders/${f.id}`, {method: 'PUT', body: JSON.stringify(f)}),
  removeFolder: (id: string) => v9Api.call(`/folders/${id}`, {method: 'DELETE'}),
  upload: (file: File, folderId?: string | null) => { const form = new FormData(); form.append('file', file); if (folderId) form.append('folderId', folderId); return v9Api.call<{id: string}>('/assets', {method: 'POST', body: form}); },
  addLink: (url: string, name?: string, folderId?: string | null) => v9Api.call<{id: string}>('/assets', {method: 'POST', body: JSON.stringify({url, name, folderId})}),
  update: (id: string, patch: {name?: string; folderId?: string | null}) => v9Api.call(`/assets/${id}`, {method: 'PATCH', body: JSON.stringify(patch)}),
  remove: (id: string) => v9Api.call(`/assets/${id}`, {method: 'DELETE'}),
};

/** Folders as a tree, in display order with depth. */
export function folderTree(folders: Folder[]) {
  const out: (Folder & {depth: number})[] = [];
  const walk = (parent: string | null, depth: number) => { for (const f of folders.filter(x => x.parentId === parent).sort((a, b) => a.name.localeCompare(b.name))) { out.push({...f, depth}); if (depth < 8) walk(f.id, depth + 1); } };
  walk(null, 0);
  return out;
}
export const isImage = (mime: string) => mime.startsWith('image/');
export const isAudio = (mime: string) => mime.startsWith('audio/') || mime === 'video/webm';
