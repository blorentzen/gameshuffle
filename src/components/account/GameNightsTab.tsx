"use client";

/**
 * "Game Nights" under My Stuff — the member's nights in one place, organized by
 * lifecycle section (Draft → Registration → Complete → Cancelled). Each card
 * carries a role tag (Hosting / Going) and links to manage or the public page.
 * Backed by /api/account/game-nights.
 *
 * Renders the SHARED EventCard, so generated header art, hover motion and card
 * geometry all arrive for free. It used to hand-roll .bgn-card with a gradient
 * and a literal emoji, which is why My Stuff still looked a generation behind
 * /game-nights after the art pass.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { formatEventTime } from "@/lib/time/format";
import { EventCard } from "@/components/events/EventCard";
import { artCategoryFor } from "@/components/events/EventHeaderArt";
import type { GameNight } from "@/lib/game-nights/types";
import { MYSTUFF_SECTIONS, sectionForNightStatus } from "@/lib/account/statusSections";

interface Entry { night: GameNight; role: "host" | "attend" }

function NightCard({ entry }: { entry: Entry }) {
  const { night: n, role } = entry;
  const href = role === "host" ? `/game-nights/${n.id}/manage` : `/game-nights/${n.id}`;
  return (
    <EventCard
      href={href}
      title={n.title}
      seed={n.id}
      cover={n.cover_image_url}
      artCategory={artCategoryFor("game-night", n.kind)}
      when={n.starts_at ? formatEventTime(n.starts_at) : "Date TBD"}
      meta={n.place}
      countLabel={role === "host" ? "Manage \u2192" : "View \u2192"}
      // Management surface: it does not load ticket tiers, so a price chip
      // here would say "Free" on a paid night.
      showPrice={false}
      badges={
        <span className={`mystuff-role mystuff-role--${role}`}>
          {role === "host" ? "Hosting" : "Going"}
        </span>
      }
    />
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
