// The API server injects window.__MOONS__ into index.html, so one build runs with or without Clerk.
type RuntimeConfig = {clerkPublishableKey?: string; clerkProxyUrl?: string};
const injected = (window as unknown as {__MOONS__?: RuntimeConfig}).__MOONS__ ?? {};
export const clerkPublishableKey = injected.clerkPublishableKey || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
export const clerkProxyUrl = injected.clerkProxyUrl || import.meta.env.VITE_CLERK_PROXY_URL || undefined;
export const authEnabled = clerkPublishableKey !== '';
