import {usePathname} from '@/lib/navigation';
import Moons from './Moons';

// Sign-in screens render on their own; everything else is personal MOONS.
const STANDALONE_ROUTES = /^\/(sign-in|sign-up|auth|s)(\/|$)/;

export default function AppShell() {
  const path = usePathname();
  return STANDALONE_ROUTES.test(path) ? null : <Moons/>;
}
