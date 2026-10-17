"use client";

/**
 * Homepage: Keep game night free (Britton's pick, 2026-10-16). A band near the
 * bottom pointing to /support, with this month's goal bar once staff set a
 * goal. Hidden for supporters, GS Pro members and outside the US (support is
 * US only for now), the same rule as the quiet line (SupportNudge).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Progress } from "@empac/cascadeds";
import { EVENTS, track } from "@/lib/analytics/events";

interface Status { available: boolean; supporter: boolean; pro: boolean; progress?: { goalCents: number; raisedCents: number } | null }

export function SupportBand() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/support/status").then((r) => (r.ok ? r.json() : null)).then((s: Status | null) => { if (alive && s) setStatus(s); }).catch(() => { /* no band */ });
    return () => { alive = false; };
  }, []);
  if (!status || !status.available || status.supporter || status.pro) return null;
  const goal = status.progress?.goalCents ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round(((status.progress?.raisedCents ?? 0) / goal) * 100)) : null;
  return (
    <section className="home-support" aria-labelledby="home-support-title">
      <div className="home-support__copy">
        <h2 id="home-support-title" className="home-support__title">Keep game night free</h2>
        <p className="home-support__text">No ads, built independently. If GameShuffle has made your game nights better, chipping in keeps it running.{pct !== null ? ` This month: ${pct}% covered.` : ""}</p>
        {pct !== null && <Progress value={pct} variant="success" label={`${pct} percent of this month's costs covered`} className="home-support__bar" />}
      </div>
      <Link href="/support" onClick={() => track(EVENTS.supportClicked, { from: "home" })}><Button variant="primary">Support GameShuffle</Button></Link>
    </section>
  );
}
