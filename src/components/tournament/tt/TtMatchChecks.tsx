"use client";

/**
 * The times to check in a Swiss event or bracket decided by time trial, when the organizer asks for clips: on the
 * manage page's Run tab with the verifiers, and on the tournament page for verifiers. Times holding a decided match come
 * first (it counts once they're checked). Refreshes every 10 seconds while the page is open; renders nothing when the
 * tournament asks for screenshots only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import type { TtMatchChecksView } from "@/lib/tournaments/tt/event";
import { TtChecks, TtVerifiers } from "./TtRunPanel";

const POLL_MS = 10_000;

export function TtMatchChecks({ tournamentId, onChange }: { tournamentId: string; onChange?: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<TtMatchChecksView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true);
  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/tt?checks=1`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; checks?: TtMatchChecksView } | null;
    if (live.current && j?.ok && j.checks) setData(j.checks);
  }, [tournamentId]);
  useEffect(() => {
    live.current = true;
    void load();
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { live.current = false; window.clearInterval(iv); };
  }, [load]);

  const run = async (body: Record<string, unknown>, done?: string): Promise<boolean> => {
    setBusy(String(body.action));
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/tt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!j?.ok) { toast.error(j?.message ?? "That didn't go through. Try again."); return false; }
      if (done) toast.success(done);
      await load();
      onChange?.();
      return true;
    } catch {
      toast.error("That didn't go through. Check your connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!data || data.rule === 0) return null;
  return (
    <>
      <TtChecks checks={data.checks} waiting={data.holding} game={data.game} canManage={data.canManage} busy={busy} run={run} matches />
      {data.staff && <TtVerifiers staff={data.staff} busy={busy} run={run} />}
    </>
  );
}
