"use client";

/**
 * A time trial event as this person sees it, shared by the public page and the organizer's run screen: loads
 * /api/tournament/[id]/tt, refreshes while the event runs and the tab is visible, and sends actions (the reply carries
 * the new view). Errors come back as plain sentences from the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TtEventView } from "@/lib/tournaments/tt/event";

const POLL_MS = 8000;

export function useTtEvent(tournamentId: string) {
  const [view, setView] = useState<TtEventView | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/tt`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; view?: TtEventView; error?: string } | null;
    if (!live.current) return;
    if (j?.error === "missing") setMissing(true);
    if (j?.ok && j.view) setView(j.view);
  }, [tournamentId]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => { live.current = false; };
  }, [load]);

  const running = !!view && view.phase !== "setup" && view.phase !== "finished";
  useEffect(() => {
    if (!running) return;
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const iv = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(iv);
  }, [running, load]);

  /** Sends an action; returns null on success or the server's sentence. */
  const act = useCallback(async (body: Record<string, unknown>): Promise<string | null> => {
    setBusy(String(body.action));
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/tt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; view?: TtEventView; message?: string } | null;
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

/** The current time, ticking every `ms` (for countdowns). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(iv);
  }, [ms]);
  return now;
}
