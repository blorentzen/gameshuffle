"use client";

/**
 * Community Hub tournaments rail.
 *
 * It used to print Live and Upcoming as two stacked, uncapped sections. With
 * nine live events that is a wall of near-identical rows: no way to move
 * between them, and the rail ran past the fold and pushed everything under it
 * out of reach. Now the two states are a switch, the list is capped, and the
 * overflow is a link rather than more rows — the rail's job is to get you to
 * the right page, not to be the page.
 *
 * Built on CDS Chip (`clickable` + `selected` + `icon`) rather than a
 * hand-rolled segmented control.
 */

import { useState } from "react";
import Link from "next/link";
import { Card, Chip } from "@empac/cascadeds";
import type { HubTournament, HubTournaments } from "@/lib/communities/discover";
import { IconTrophy, IconBolt, IconCalendarEvent } from "@tabler/icons-react";

/** Rows shown before the rail defers to the full page. */
const CAP = 5;

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
        <span className="trail__badge" aria-hidden><IconTrophy size={14} stroke={1.9} /></span>
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
  // Open on whichever state actually has something, so the rail is never a
  // switch pointing at an empty list.
  const [view, setView] = useState<"live" | "upcoming">(live.length > 0 ? "live" : "upcoming");
  const empty = live.length === 0 && upcoming.length === 0;

  const rows = view === "live" ? live : upcoming;
  const shown = rows.slice(0, CAP);

  return (
    <Card padding="large">
      <div className="trail__head">
        <h2 className="trail__heading">Tournaments</h2>
        <Link href="/tournament" className="trail__all">Browse all</Link>
      </div>

      {empty ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
          No tournaments running right now. <Link href="/tournament/create" style={{ color: "var(--bg-primary, var(--primary-600))" }}>Host one →</Link>
        </p>
      ) : (
        <>
          <div className="trail__switch" role="group" aria-label="Tournament state">
            <Chip
              label={`Live · ${live.length}`}
              icon={<IconBolt size={13} stroke={2} />}
              size="small"
              clickable
              selected={view === "live"}
              disabled={live.length === 0}
              onClick={() => setView("live")}
            />
            <Chip
              label={`Upcoming · ${upcoming.length}`}
              icon={<IconCalendarEvent size={13} stroke={2} />}
              size="small"
              clickable
              selected={view === "upcoming"}
              disabled={upcoming.length === 0}
              onClick={() => setView("upcoming")}
            />
          </div>

          {rows.length === 0 ? (
            <p className="trail__empty">Nothing {view === "live" ? "live" : "scheduled"} right now.</p>
          ) : (
            <>
              <ul className="trail__list">
                {shown.map((t) => <Row key={t.id} t={t} live={view === "live"} />)}
              </ul>
              {rows.length > CAP && (
                <Link href="/tournament" className="trail__more">
                  See all {rows.length} {view === "live" ? "live" : "upcoming"} →
                </Link>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
