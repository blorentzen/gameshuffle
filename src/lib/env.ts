/**
 * Environment discriminator — the ONE place the app learns which environment
 * it is running in. Use these instead of `NODE_ENV`.
 *
 * Why: on Vercel, `NODE_ENV` is "production" for BOTH preview and production
 * builds, so it cannot tell them apart. `VERCEL_ENV` can:
 *   - "production"  → deploys from `main` (gameshuffle.co)
 *   - "preview"     → every other branch, incl. the stable `dev` branch
 *   - "development" → `vercel dev`
 * Outside Vercel (local `npm run dev` / `npm start`) it is unset, which reads
 * as NOT production — the safe default.
 *
 * Client-safe: Vercel exposes `NEXT_PUBLIC_VERCEL_ENV` to the browser bundle
 * (system env vars auto-exposed for Next.js projects), so these constants work
 * in server code, client components, and the Sentry client init alike.
 *
 * See the Environment Separation Plan doc for the full topology.
 */

const vercelEnv =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? null;

/** True ONLY on the Vercel production deployment (gameshuffle.co). Anything that
 *  reaches a real user (email, analytics, live money) should key on this. */
export const isProduction = vercelEnv === "production";

/** True on Vercel preview deploys — ephemeral branches AND the stable `dev`
 *  branch (dev.gameshuffle.co). Points at the dev backend. */
export const isPreview = vercelEnv === "preview";

/** True under `npm run dev` on a laptop. Local-only dev controls key on this. */
export const isLocalDev = process.env.NODE_ENV === "development";

/** Human label for logs / Sentry tags. */
export const environmentName: "production" | "preview" | "development" =
  isProduction ? "production" : isPreview ? "preview" : "development";

/**
 * The canonical public origin for THIS deployment, for building absolute URLs
 * (OAuth callbacks, Stripe return URLs, invite links, share links).
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_BASE_URL` — pinned per Vercel scope (prod → gameshuffle.co,
 *      Preview → dev.gameshuffle.co, Development → localhost).
 *   2. `VERCEL_URL` — the auto-provided deployment host, so an ephemeral preview
 *      branch still builds links that point at itself.
 *   3. localhost.
 * Never falls back to the production domain: a non-prod deploy must not mint
 * links into prod.
 */
export function getBaseUrl(): string {
  const pinned = process.env.NEXT_PUBLIC_BASE_URL;
  if (pinned) return pinned.replace(/\/$/, "");
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
