"use client";

/**
 * The round robin board: standings first, then one round at a time (a CDS
 * Select picks the round, and it opens on the first round with matches left).
 * Printing shows every round.
 */

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { roundRobinStandings, type RRResult, type RRSchedule } from "@/lib/brackets/roundRobin";
import { MatchPick } from "./MatchPick";

export function RoundRobinBoard({ names, schedule, results, ties, onResult }: {
  names: string[];
  schedule: RRSchedule;
  results: (RRResult | null)[];
  ties: boolean;
  onResult: (match: number, r: RRResult | null) => void;
}) {
  const table = useMemo(() => roundRobinStandings(names.length, schedule, results), [names.length, schedule, results]);
  const byRound = useMemo(() => {
    const out: { index: number; a: number; b: number }[][] = Array.from({ length: schedule.rounds }, () => []);
    schedule.matches.forEach((m, index) => out[m.round].push({ index, a: m.a, b: m.b }));
    return out;
  }, [schedule]);
  const firstOpen = byRound.findIndex((ms) => ms.some((m) => !results[m.index]));
  const [picked, setPicked] = useState<number | null>(null);
  const round = picked ?? (firstOpen < 0 ? schedule.rounds - 1 : firstOpen);
  const decided = results.filter(Boolean).length;
  const leg = (r: number) => (schedule.rounds > names.length ? (r < schedule.rounds / 2 ? " (first leg)" : " (second leg)") : "");

  return (
    <div className="bt-rr">
      <section className="bt-rr__table" aria-labelledby="bt-rr-standings">
        <h3 id="bt-rr-standings" className="bt-sub">Standings</h3>
        <p className="bt-muted">{decided} of {schedule.matches.length} matches played. Win 3 points{ties ? ", tie 1" : ""}.</p>
        <div className="bt-table-scroll" tabIndex={0} role="region" aria-label="Standings">
          <Table dense>
            <TableHeader>
              <TableRow>
                <TableHead align="right">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead align="right">Played</TableHead>
                <TableHead align="right">W</TableHead>
                {ties && <TableHead align="right">T</TableHead>}
                <TableHead align="right">L</TableHead>
                <TableHead align="right">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.map((r) => (
                <TableRow key={r.player}>
                  <TableCell align="right">{r.rank}</TableCell>
                  <TableCell>{names[r.player]}</TableCell>
                  <TableCell align="right">{r.played}</TableCell>
                  <TableCell align="right">{r.wins}</TableCell>
                  {ties && <TableCell align="right">{r.ties}</TableCell>}
                  <TableCell align="right">{r.losses}</TableCell>
                  <TableCell align="right"><strong>{r.points}</strong></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="bt-rr__rounds" aria-labelledby="bt-rr-schedule">
        <div className="bt-rr__head">
          <h3 id="bt-rr-schedule" className="bt-sub">Schedule</h3>
          <div className="bt-rr__pick bt-no-print">
            <Select
              floatingLabel="Round"
              value={String(round)}
              onChange={(v) => setPicked(Number(v))}
              options={byRound.map((ms, r) => ({ value: String(r), label: `Round ${r + 1}${leg(r)}${ms.every((m) => results[m.index]) ? " · done" : ""}` }))}
            />
          </div>
        </div>
        {byRound.map((ms, r) => (
          <div key={r} className="bt-rr__round" hidden={r !== round}>
            <h4 className="bt-rr__round-title">Round {r + 1}{leg(r)}</h4>
            <ul className="bt-list">
              {ms.map((m, i) => (
                <li key={m.index}>
                  <MatchPick label={`Round ${r + 1}, match ${i + 1}`} a={names[m.a]} b={names[m.b]} value={results[m.index]} ties={ties} onChange={(o) => onResult(m.index, o)} />
                </li>
              ))}
            </ul>
            {schedule.byes[r] != null && <p className="bt-muted">{names[schedule.byes[r]!]} sits out this round.</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
