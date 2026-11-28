import { createVercelConfig } from './scripts/vercel-config.mjs';

// Vercel evaluates this before building; these are hosting settings, not browser secrets.
export const config = createVercelConfig(process.env);
