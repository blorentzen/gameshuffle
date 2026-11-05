"use client";

/** Small shared pieces of a team series page: the team tag, the live pill, a night's standings, a countdown. */

import { useEffect, useState, useSyncExternalStore } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { TableScroll } from "@/components/ui/TableScroll";
import type { TeamRow } from "@/lib/series/rules";
import type { SeriesTeamView } from "@/lib/series/view";

export function TeamTag({ team, size = "md" }: { team: Pick<SeriesTeamView, "tag" | "color" | "ink" | "name">; size?: "sm" | "md" }) {
  return (
    <span className={`ss-tag ss-tag--${size}`} style={{ background: team.color, color: team.ink }} aria-hidden>
      {team.tag}
    </span>
  );
}

export function LivePill({ children }: { children: React.ReactNode }) {
  return <span className="ss-live"><i aria-hidden />{children}</span>;
}

/** A night's (or the total's) standings: place, team, players, points and the last race's points. */
export function StandingsTable({ rows, teams, label, showLast }: { rows: TeamRow[]; teams: SeriesTeamView[]; label: string; showLast: boolean }) {
  return (
    <TableScroll label={label} className="ss-standings">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead align="right">#</TableHead>
            <TableHead>Team</TableHead>
            <TableHead align="right">Points</TableHead>
            {showLast && <TableHead align="right">Last race</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const t = teams.find((x) => x.id === r.teamId);
            if (!t) return null;
            return (
              <TableRow key={r.teamId}>
                <TableCell align="right" className="ss-num">{r.place}</TableCell>
                <TableCell>
                  <span className="ss-who">
                    <TeamTag team={t} />
                    <span className="ss-who__text">
                      <b>{t.name}</b>
                      <span>{t.players.map((p) => p.name).join(" and ") || "Players to come"}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell align="right" className="ss-num ss-num--strong">{r.points}</TableCell>
                {showLast && <TableCell align="right" className="ss-num ss-gain">{r.last ? `+${r.last}` : "0"}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}

/** Seconds until a moment, ticking every quarter second; null when there's no moment. */
export function useSecondsUntil(deadline: number | null, skew = 0): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline == null ? null : Math.max(0, Math.ceil((deadline - (now + skew)) / 1000));
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const noop = () => () => {};
/** True once the page has hydrated (so times can show in the viewer's own zone without a mismatch). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** "Mon, Jul 12, 7:00 PM": Pacific on the server's first paint, the viewer's own zone once hydrated. */
export function whenText(iso: string | null, local: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return local ? d.toLocaleString("en-US", opts) : `${d.toLocaleString("en-US", { ...opts, timeZone: "America/Los_Angeles" })} PT`;
}

export function When({ iso }: { iso: string | null }) {
  const local = useHydrated();
  const text = whenText(iso, local);
  return text ? <time dateTime={iso ?? undefined}>{text}</time> : null;
}
