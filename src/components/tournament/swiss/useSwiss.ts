"use client";

/**
 * The Swiss view for one tournament, shared by the organizer's console and the
 * public page: loads /api/tournament/[id]/swiss, refreshes every few seconds
 * while rounds are being played, and sends actions (the reply carries the new
 * view). Errors come back as plain sentences from the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SwissView } from "@/lib/tournaments/swissStore";

const POLL_MS = 4000;

export function useSwiss(tournamentId: string, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const [view, setView] = useState<SwissView | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/swiss`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; view?: SwissView; error?: string } | null;
    if (!live.current) return;
    if (j?.error === "missing") setMissing(true);
    if (j?.ok && j.view) setView(j.view);
  }, [tournamentId]);

  useEffect(() => {
    live.current = true;
    if (!enabled) return;
    void load();
    return () => { live.current = false; };
  }, [enabled, load]);

  // Refresh while rounds are running and the tab is visible.
  const running = view?.phase === "swiss" || view?.phase === "cut";
  useEffect(() => {
    if (!enabled || !running) return;
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const iv = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(iv);
  }, [enabled, running, load]);

  /** Sends an action; returns null on success or the server's sentence. */
  const act = useCallback(async (body: Record<string, unknown>): Promise<string | null> => {
    setBusy(String(body.action));
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/swiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; view?: SwissView; message?: string } | null;
      if (j?.ok && j.view) { setView(j.view); return null; }
      return j?.message ?? "That didn't go through. Try again.";
    } catch {
      return "That didn't go through. Check your connection and try again.";
    } finally {
      setBusy(null);
    }
  }, [tournamentId]);

  return { view, missing, busy, act, reload: load };
}

/** Seconds left on the round clock, ticking down locally between refreshes. */
export function useClock(clock: SwissView["clock"]): number | null {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = clock?.running ? clock.endsAt : null;
  useEffect(() => {
    if (!endsAt) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [endsAt]);
  if (!clock || clock.left === null) return null;
  // A device clock running slow would count from more than the round's length: cap it.
  return endsAt ? Math.min(clock.total, Math.round((Date.parse(endsAt) - now) / 1000)) : clock.left;
}
