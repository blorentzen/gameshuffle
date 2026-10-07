"use client";

/**
 * The viewer's access to one AI feature (GET /api/ai/access), shared across
 * every component on the page that asks for the same feature. `spent` takes
 * the `remaining` an /api/ai call returned so the count stays current.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { aiBlock, type AiAccessInfo, type AiFeature } from "@/lib/ai/features";

const cache = new Map<string, Promise<AiAccessInfo | null>>();

export function useAiAccess(feature: AiFeature) {
  const { user, loading } = useAuth();
  const key = `${user?.id ?? "anon"}:${feature}`;
  const [info, setInfo] = useState<AiAccessInfo | null>(null);

  useEffect(() => {
    if (loading) return;
    let live = true;
    let p = cache.get(key);
    if (!p) {
      p = fetch(`/api/ai/access?feature=${feature}`).then((r) => (r.ok ? (r.json() as Promise<AiAccessInfo>) : null)).catch(() => null);
      cache.set(key, p);
    }
    void p.then((i) => { if (live) setInfo(i); });
    return () => { live = false; };
  }, [key, feature, loading]);

  const spent = useCallback((remaining: number | null | undefined) => {
    if (remaining === undefined) return;
    setInfo((i) => {
      if (!i) return i;
      const next = { ...i, remaining };
      cache.set(key, Promise.resolve(next));
      return next;
    });
  }, [key]);

  return { info, block: aiBlock(info), spent };
}
