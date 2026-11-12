"use client";

import { useEffect, useState } from "react";

/**
 * The gated live-night games this viewer may pick (NightGame.gate), from
 * /api/nights/gates. Empty until it answers, so a gated game never flashes in.
 * Pickers pass it to openNightGames().
 */
export function useNightGates(): string[] {
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/nights/gates", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j: { open?: string[] } | null) => { if (live && Array.isArray(j?.open)) setOpen(j.open); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return open;
}
