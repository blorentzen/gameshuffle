"use client";

/**
 * The Career tab (lounge page picks, 2026-10-20): every season in one table with a Career row,
 * and the all-time chart with each season's own division lines. Loaded when the tab opens, from
 * /lounge/<name>/career, so MKCentral is only asked for a career someone looks at (past seasons
 * are kept for good after the first read).
 */

import { useEffect, useState } from "react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { TableScroll } from "@/components/ui/TableScroll";
import { CareerChart } from "./CareerChart";
import { careerTotals, seasonLabel, type CareerSeason } from "@/lib/lounge/season";
import type { MmrGame } from "@/lib/mmr/rules";

type State = { status: "loading" } | { status: "down" } | { status: "ok"; seasons: CareerSeason[] };
const fmt = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("en-US"));
const pct = (n: number | null | undefined) => (n == null ? "" : `${Math.round(n * 100)}%`);

export function CareerTab({ name, game }: { name: string; game: MmrGame }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/lounge/${encodeURIComponent(name)}/career?game=${game}`)
      .then((res) => res.json() as Promise<{ ok: boolean; seasons?: CareerSeason[] }>)
      .then((body) => { if (alive) setState(body.ok && body.seasons ? { status: "ok", seasons: body.seasons } : { status: "down" }); })
      .catch(() => { if (alive) setState({ status: "down" }); });
    return () => { alive = false; };
  }, [name, game, attempt]);
  const retry = () => { setState({ status: "loading" }); setAttempt((a) => a + 1); };

  if (state.status === "loading") return <p className="lounge-empty" role="status">Reading every season from MKCentral…</p>;
  if (state.status === "down") {
    return (
      <div className="lounge-sec lounge-sec--flat">
        <p className="lounge-empty" role="status">MKCentral isn&apos;t answering right now.</p>
        <div><Button variant="secondary" size="small" onClick={retry}>Try again</Button></div>
      </div>
    );
  }
  const rows = [...state.seasons].reverse();
  const current = rows.find((r) => r.current)?.season ?? null;
  const totals = careerTotals(rows);
  const shared = rows.some((r) => r.shared);
  return (
    <div className="lounge-panel">
      <section className="lounge-sec lounge-sec--flat" aria-labelledby="lounge-career-chart">
        <h2 id="lounge-career-chart">Every season</h2>
        {totals.seasons ? <CareerChart seasons={state.seasons} /> : <p className="lounge-empty">No events in any season yet.</p>}
      </section>
      <section className="lounge-sec" aria-labelledby="lounge-career-table">
        <h2 id="lounge-career-table">Season by season</h2>
        <TableScroll label="Season by season table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Season</TableHead><TableHead scope="col">Finished</TableHead><TableHead align="right">Peak</TableHead>
                <TableHead align="right">Events</TableHead><TableHead align="right">Wins</TableHead><TableHead align="right">World rank</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.season}>
                  <TableHead scope="row">{seasonLabel(r.season, current)}</TableHead>
                  {r.played ? (
                    <>
                      <TableCell className="lounge-nowrap">{r.division ?? "Placement"} · {fmt(r.mmr)}</TableCell>
                      <TableCell align="right">{fmt(r.maxMmr)}</TableCell>
                      <TableCell align="right">{fmt(r.events)}</TableCell>
                      <TableCell align="right">{pct(r.winRate)}</TableCell>
                      <TableCell align="right">{r.worldRank ? `#${fmt(r.worldRank)}` : ""}</TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={5}>{r.current ? "No events yet" : "Didn't play"}</TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="lounge-career-total">
                <TableHead scope="row">Career</TableHead>
                <TableCell>{totals.seasons} {totals.seasons === 1 ? "season" : "seasons"}</TableCell>
                <TableCell align="right">{fmt(totals.peak)}</TableCell>
                <TableCell align="right">{fmt(totals.events)}</TableCell>
                <TableCell align="right">{pct(totals.winRate)}</TableCell>
                <TableCell align="right">{totals.bestRank ? `Best #${fmt(totals.bestRank)}` : ""}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableScroll>
        <p className="lounge-note">
          Finished is the division and MMR at the end of a season (now, for this one); world rank is where the season ended.
          {shared ? " Season 1 of Mario Kart World was one lounge for 12 and 24 players, so it shows in both." : ""}
        </p>
      </section>
    </div>
  );
}
