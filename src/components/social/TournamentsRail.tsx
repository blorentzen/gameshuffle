"use client";

/**
 * Community Hub tournaments rail — Live and Upcoming in one card, each state
 * clearly marked. Cancelled / complete / draft never reach here (filtered in
 * listHubTournaments). Pure presentation; items link to the tournament page.
 */

import Link from "next/link";
import { Card } from "@empac/cascadeds";
import type { HubTournament, HubTournaments } from "@/lib/communities/discover";

function whenLabel(iso: string | null): string {
  if (!iso) return "Time TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ t, live }: { t: HubTournament; live: boolean }) {
  const spots = t.maxParticipants ? `${t.participantCount}/${t.maxParticipants}` : `${t.participantCount}`;
  return (
    <li>
      <Link href={`/tournament/${t.id}`} className="trail__item">
        <span className="trail__badge" aria-hidden>🏆</span>
        <span className="trail__body">
          <span className="trail__title">{t.title}</span>
          <span className="trail__meta">
            {live ? "Racing now" : whenLabel(t.whenIso)} · {spots} {t.maxParticipants ? "players" : t.participantCount === 1 ? "player" : "players"}
            {t.organizerName ? ` · ${t.organizerName}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function TournamentsRail({ tournaments }: { tournaments: HubTournaments }) {
  const { live, upcoming } = tournaments;
  const empty = live.length === 0 && upcoming.length === 0;
  return (
    <Card padding="large">
      <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700, margin: "0 0 var(--spacing-12)" }}>Tournaments</h2>
      {empty ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
          No tournaments running right now. <Link href="/tournament/create" style={{ color: "var(--bg-primary, var(--primary-600))" }}>Host one →</Link>
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
          {live.length > 0 && (
            <section>
              <p className="trail__section trail__section--live">
                <span className="trail__livedot" aria-hidden /> Live
                <span className="trail__count">· {live.length}</span>
              </p>
              <ul className="trail__list">{live.map((t) => <Row key={t.id} t={t} live />)}</ul>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <p className="trail__section">Upcoming <span className="trail__count">· {upcoming.length}</span></p>
              <ul className="trail__list">{upcoming.map((t) => <Row key={t.id} t={t} live={false} />)}</ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
