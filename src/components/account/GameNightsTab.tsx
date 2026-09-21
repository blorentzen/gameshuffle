"use client";

/**
 * "Game Nights" under My Stuff — the member's nights in one place, organized by
 * lifecycle section (Draft → Registration → Complete → Cancelled). Each card
 * carries a role tag (Hosting / Going) and links to manage or the public page.
 * Backed by /api/account/game-nights. Reuses the .bgn-card grid from the hub so
 * it looks consistent with /game-nights and the Tournaments tab.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { nightVisual } from "@/data/game-night-visuals";
import { formatEventTime } from "@/lib/time/format";
import type { GameNight } from "@/lib/game-nights/types";
import { MYSTUFF_SECTIONS, sectionForNightStatus } from "@/lib/account/statusSections";

interface Entry { night: GameNight; role: "host" | "attend" }

function NightCard({ entry }: { entry: Entry }) {
  const { night: n, role } = entry;
  const v = nightVisual(n.id);
  const href = role === "host" ? `/game-nights/${n.id}/manage` : `/game-nights/${n.id}`;
  return (
    <Link href={href} className="bgn-card">
      <span className={`bgn-card__hero${n.cover_image_url ? " bgn-card__hero--img" : ""}`} style={n.cover_image_url ? undefined : { background: v.gradient }}>
        {n.cover_image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={n.cover_image_url} alt="" className="bgn-card__hero-photo" />
          : <span className="bgn-card__hero-emoji" aria-hidden>{v.emoji}</span>}
        <span className="bgn-card__hero-count">{role === "host" ? "Manage →" : "View →"}</span>
      </span>
      <span className="bgn-card__body">
        <span className="bgn-card__when">{n.starts_at ? formatEventTime(n.starts_at) : "Date TBD"}</span>
        <span className="bgn-card__title">{n.title}</span>
        <span className="mystuff-card__tags">
          <span className={`mystuff-role mystuff-role--${role}`}>{role === "host" ? "Hosting" : "Going"}</span>
          {n.place && <span className="mystuff-card__place">{n.place}</span>}
        </span>
      </span>
    </Link>
  );
}

export function GameNightsTab() {
  const [hosting, setHosting] = useState<GameNight[]>([]);
  const [attending, setAttending] = useState<GameNight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/game-nights")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.ok) return;
        setHosting(Array.isArray(j.hosting) ? j.hosting : []);
        setAttending(Array.isArray(j.attending) ? j.attending : []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="account-card"><p style={{ color: "var(--text-tertiary)" }}>Loading your game nights…</p></div>;
  }

  const entries: Entry[] = [
    ...hosting.map((night) => ({ night, role: "host" as const })),
    ...attending.map((night) => ({ night, role: "attend" as const })),
  ];
  const empty = entries.length === 0;

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-16)", flexWrap: "wrap", marginBottom: "var(--spacing-20)" }}>
        <div>
          <h2 style={{ margin: 0 }}>Game Nights</h2>
          <p style={{ color: "var(--text-tertiary)", margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-14)" }}>
            Nights you host and nights you&rsquo;re going to, grouped by where they are in their run.
          </p>
        </div>
        <Link href="/game-nights/create" style={{ textDecoration: "none" }}>
          <Button variant="primary">Host a night</Button>
        </Link>
      </div>

      {empty ? (
        <div className="bgn-empty">
          <p>You haven&rsquo;t hosted or joined a game night yet.</p>
          <Link href="/game-nights" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Find a night</Button>
          </Link>
        </div>
      ) : (
        MYSTUFF_SECTIONS.map((section) => {
          const inSection = entries.filter((e) => sectionForNightStatus(e.night.status) === section.key);
          if (inSection.length === 0) return null;
          return (
            <div key={section.key} style={{ marginBottom: "var(--spacing-32)" }}>
              <h3 className="bgn-side__heading" style={{ marginTop: 0 }}>{section.label}</h3>
              <div className="bgn-grid">
                {inSection.map((e) => <NightCard key={`${e.night.id}-${e.role}`} entry={e} />)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
