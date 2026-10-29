import type {ReactNode} from 'react';
import {ClerkProvider} from '@clerk/react';
import {authEnabled, clerkProxyUrl, clerkPublishableKey} from '@/lib/runtime-config';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// Children render immediately: the guest app never waits on the Clerk SDK.
// Without a publishable key MOONS runs guest-only and no Clerk hook is mounted.
export default function AuthRoot({children}: {children: ReactNode}) {
  if (!authEnabled) return <>{children}</>;
  return <ClerkProvider publishableKey={clerkPublishableKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}>{children}</ClerkProvider>;
}
