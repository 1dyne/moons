export const clerkEnabled = () => !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY;
// The FAPI proxy is only for Clerk production instances without a custom domain.
export const clerkProxyEnabled = () => clerkEnabled() && process.env.CLERK_USE_PROXY === 'true';
