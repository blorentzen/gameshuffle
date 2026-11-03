/**
 * A small key-value store for short-lived notes jobs leave for their next run (a build that failed,
 * when to try it again). Upstash Redis when configured (the same env as src/lib/ratelimit.ts), else
 * memory on this server instance. Never throws: an outage reads as "nothing noted".
 */

import "server-only";

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const mem = new Map<string, { value: unknown; until: number }>();
let redis: import("@upstash/redis").Redis | null = null;

async function client() {
  if (!url || !token) return null;
  if (!redis) {
    const { Redis } = await import("@upstash/redis");
    redis = new Redis({ url, token });
  }
  return redis;
}

/** The value noted under `key`, or null when there's none (or it has expired). */
export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const r = await client();
    if (r) return ((await r.get<T>(`gskv:${key}`)) ?? null);
  } catch (err) {
    console.error("[kv] read failed:", err);
  }
  const hit = mem.get(key);
  if (!hit || hit.until < Date.now()) return null;
  return hit.value as T;
}

/** Notes `value` under `key` for `ttlSeconds`. */
export async function kvSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  mem.set(key, { value, until: Date.now() + ttlSeconds * 1000 });
  if (mem.size > 5_000) for (const [k, v] of mem) if (v.until < Date.now()) mem.delete(k);
  try {
    const r = await client();
    if (r) await r.set(`gskv:${key}`, value, { ex: ttlSeconds });
  } catch (err) {
    console.error("[kv] write failed:", err);
  }
}
