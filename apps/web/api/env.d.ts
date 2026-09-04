/** Vercel's edge runtime exposes environment variables on `process.env`; keep the web package free of Node types. */
declare const process: { env: Record<string, string | undefined> };
