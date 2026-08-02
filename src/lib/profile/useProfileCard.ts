"use client";

/**
 * Client cache + fetch for the profile hovercard (Spec 1 §4.2). A module-level
 * cache keyed by userId (TTL ~5 min) — many surfaces render the same user
 * repeatedly (chat especially), so a fetch per hover would be unacceptable.
 * In-flight requests are deduped. `prefetchProfileCard` warms it on hover intent.
 */

import { useEffect, useState } from "react";
import type { ProfileCardData } from "./cardTypes";

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: ProfileCardData | null; ts: number }>();
const inflight = new Map<string, Promise<ProfileCardData | null>>();

/** Fresh cached value, or `undefined` when absent/stale. */
function fresh(userId: string): ProfileCardData | null | undefined {
  const hit = cache.get(userId);
  return hit && Date.now() - hit.ts < TTL ? hit.data : undefined;
}

async function fetchCard(userId: string): Promise<ProfileCardData | null> {
  const cached = fresh(userId);
  if (cached !== undefined) return cached;
  const existing = inflight.get(userId);
  if (existing) return existing;

  const p = (async () => {
    let data: ProfileCardData | null = null;
    try {
      const res = await fetch(`/api/profile/card/${userId}`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { card?: ProfileCardData } | null;
        data = body?.card ?? null;
      }
    } catch {
      data = null;
    }
    cache.set(userId, { data, ts: Date.now() });
    inflight.delete(userId);
    return data;
  })();
  inflight.set(userId, p);
  return p;
}

/** Warm the cache on hover intent (no state, safe to call from event handlers). */
export function prefetchProfileCard(userId: string): void {
  if (fresh(userId) === undefined) void fetchCard(userId);
}

/** Load a card when `enabled` (e.g. the overlay opened). Serves cache instantly. */
export function useProfileCard(userId: string | null, enabled: boolean) {
  const [data, setData] = useState<ProfileCardData | null>(() =>
    userId ? fresh(userId) ?? null : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    const cached = fresh(userId);
    if (cached !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchCard(userId).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return { data, loading };
}
