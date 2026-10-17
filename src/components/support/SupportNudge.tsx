"use client";

/**
 * The quiet "help keep it free" line (Britton's pick, 2026-10-16): after a
 * Daily, a Daily Dex or a free tool. At most once a week per browser, never
 * for supporters or GS Pro members, never inside the Discord Activity.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { EVENTS, track } from "@/lib/analytics/events";

const KEY = "gs-support-nudge";
const WEEK = 7 * 86_400_000;

export function SupportNudge({ from }: { from: string }) {
  const { activity } = useOriginalsHost();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (activity) return;
    let last = 0;
    try { last = Number(localStorage.getItem(KEY) ?? 0) || 0; } catch { return; }
    if (Date.now() - last < WEEK) return;
    let alive = true;
    void fetch("/api/support/status").then((r) => (r.ok ? r.json() : null)).then((s: { available: boolean; supporter: boolean; pro: boolean } | null) => {
      if (!alive || !s || !s.available || s.supporter || s.pro) return;
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ }
      setShow(true);
    }).catch(() => { /* no nudge */ });
    return () => { alive = false; };
  }, [activity]);

  if (!show) return null;
  return (
    <p className="support-nudge">
      Enjoying GameShuffle? <Link href="/support" onClick={() => track(EVENTS.supportClicked, { from })}>Help keep it free</Link>
    </p>
  );
}
