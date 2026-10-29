// Same-origin account API. Cookies only: no bearer tokens, no owner fields in any body.
const base = () => `${import.meta.env.BASE_URL}api/`;
async function call<T>(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(base() + path, {...init, credentials: 'include', headers: {...(init.body ? {'content-type': 'application/json'} : {}), ...headers}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : data?.error?.message ?? data?.message ?? `Request failed (${response.status})`;
    throw Object.assign(new Error(message), {status: response.status});
  }
  return data as T;
}
export type AccountStatus = {signedIn: boolean; claimed: boolean};
export const accountStatus = () => call<AccountStatus>('account/status');
export const claimGuestData = () => call<unknown>('account/claim', {method: 'POST'});
export const homeUrl = () => import.meta.env.BASE_URL;
