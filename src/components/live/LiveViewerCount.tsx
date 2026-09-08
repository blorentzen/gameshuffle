"use client";

/**
 * All-up live viewer count for the /live header. Polls /api/live/[slug]/viewers
 * (cached server-side) every 30s and hides itself when the streamer is offline.
 */

import { useEffect, useState } from "react";

interface Counts {
  total: number;
  live: boolean;
  platforms: { platform: string; count: number; live: boolean }[];
}

export function LiveViewerCount({ slug }: { slug: string }) {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetch(`/api/live/${encodeURIComponent(slug)}/viewers`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled) setCounts(d);
        })
        .catch(() => {});
    poll();
    const id = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [slug]);

  if (!counts?.live) return null;
  const multi = counts.platforms.filter((p) => p.live).length > 1;

  return (
    <span className="live-viewers" title={multi ? "Across all platforms" : "On Twitch"}>
      <span className="live-viewers__dot" aria-hidden />
      <strong>{counts.total.toLocaleString()}</strong> watching
    </span>
  );
}
