// The API server injects window.__MOONS__ into index.html at request time, so one
// built image can run with or without Clerk. Vite env is the dev-server fallback.
type RuntimeConfig = {clerkPublishableKey?: string; clerkProxyUrl?: string; analysisReview?: boolean};
const injected = (window as unknown as {__MOONS__?: RuntimeConfig}).__MOONS__ ?? {};
export const clerkPublishableKey = injected.clerkPublishableKey || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
export const clerkProxyUrl = injected.clerkProxyUrl || import.meta.env.VITE_CLERK_PROXY_URL || undefined;
export const authEnabled = clerkPublishableKey !== '';

// Temporary "Send for review" on structures, while analysis quality is tuned.
export const analysisReviewEnabled = injected.analysisReview === true || import.meta.env.DEV;
