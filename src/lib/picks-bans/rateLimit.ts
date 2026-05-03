/**
 * In-memory token-bucket rate limiter for picks/bans ballot writes.
 *
 * Per the multi-game spec: defenses against drive-by ballot stuffing
 * even when anonymous voting is allowed. Cap is 30 writes per minute
 * per IP, which comfortably covers a viewer who's actively iterating
 * before locking.
 *
 * Implementation note: this is in-memory per process. On Vercel each
 * serverless invocation may get a different cold instance — the bucket
 * resets on cold start, which is fine because the limit is per-minute
 * anyway. For sustained higher-scale traffic, swap to Vercel KV or
 * Supabase rate-limit table; the contract here stays the same.
 */

const WINDOW_MS = 60_000;
const MAX_WRITES_PER_WINDOW = 30;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check + consume one slot in the bucket for `key`. Returns
 * `{ ok: false, retryAfterMs }` when over the cap.
 */
export function checkAndConsumeRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    // Fresh bucket / window expired.
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: MAX_WRITES_PER_WINDOW - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= MAX_WRITES_PER_WINDOW) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: WINDOW_MS - (now - bucket.windowStart),
    };
  }

  bucket.count += 1;
  return {
    ok: true,
    remaining: MAX_WRITES_PER_WINDOW - bucket.count,
    retryAfterMs: 0,
  };
}

/** Test-only helper. Resets the in-memory bucket map between tests. */
export function _resetBucketsForTesting(): void {
  buckets.clear();
}
