/**
 * Shared rate limiting — Upstash Redis when configured, in-memory otherwise.
 *
 * The in-memory fallback is per warm serverless instance (fine for a single
 * instance / low traffic), so this module is safe to ship BEFORE Upstash is
 * provisioned: it transparently upgrades to a distributed sliding window the
 * moment `UPSTASH_REDIS_REST_URL`/`_TOKEN` (or Vercel KV's
 * `KV_REST_API_URL`/`_TOKEN`) exist in the environment — no code change.
 *
 * Usage:
 *   const { ok } = await rateLimit(`pollvote:${ip}`, { max: 15, windowMs: 10_000 });
 *   if (!ok) return tooMany();
 */

import "server-only";

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const useUpstash = !!(url && token);

// --- In-memory fallback (per instance) ------------------------------------
const mem = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, max: number, windowMs: number, now: number): boolean {
  // Opportunistic prune so the map can't grow unbounded.
  if (mem.size > 10_000) {
    for (const [k, v] of mem) if (now > v.resetAt) mem.delete(k);
  }
  const e = mem.get(key);
  if (!e || now > e.resetAt) {
    mem.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  e.count += 1;
  return e.count <= max;
}

// --- Upstash (distributed) ------------------------------------------------
let redis: import("@upstash/redis").Redis | null = null;
const limiters = new Map<string, import("@upstash/ratelimit").Ratelimit>();

async function upstashLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  redis ??= new Redis({ url: url as string, token: token as string });
  const cfg = `${max}:${windowMs}`;
  let rl = limiters.get(cfg);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${Math.max(1, Math.ceil(windowMs / 1000))} s`),
      prefix: "gsrl",
      analytics: false,
    });
    limiters.set(cfg, rl);
  }
  const { success } = await rl.limit(key);
  return success;
}

/**
 * Returns `{ ok: false }` when the caller has exceeded `max` events within
 * `windowMs` for `key`. Never throws — an Upstash outage falls back to the
 * in-memory limiter so a limiter failure can't take down the request path.
 */
export async function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): Promise<{ ok: boolean }> {
  if (useUpstash) {
    try {
      return { ok: await upstashLimit(key, opts.max, opts.windowMs) };
    } catch (err) {
      console.error("[ratelimit] Upstash failed, using in-memory fallback:", err);
    }
  }
  return { ok: memoryLimit(key, opts.max, opts.windowMs, Date.now()) };
}

/** True when a distributed backend is active (for diagnostics). */
export const rateLimitIsDistributed = useUpstash;
