/** Vercel functions run on Node and expose environment variables on `process.env`; the browser side of
 * this package deliberately has no Node types, so the ambient declaration is scoped to api/ instead. */
declare const process: { env: Record<string, string | undefined> };
