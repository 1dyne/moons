import {useEffect, useState} from 'react';
import {accountStatus, type AccountStatus} from '@/lib/account';
export function useAccountStatus() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => {let alive = true; accountStatus().then(s => {if (alive) setStatus(s);}).catch(() => undefined); return () => {alive = false;};}, []);
  return status;
}
