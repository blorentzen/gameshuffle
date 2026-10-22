"use client";

/**
 * Check a room (the match read, dashboard additions picks 2026-10-20): paste the room's names,
 * pick whose read it is, and see what each place pays, where everyone is likely to finish and
 * who's favored. A signed-in player's last room feeds the overlay's "Tonight's room" and !odds.
 */

import { useState } from "react";
import { Alert, Button, Input, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/TableScroll";
import { MMR_GAMES, MMR_GAME_IDS, placeWord, type MmrGame } from "@/lib/mmr/rules";
import type { RoomPlayer, RoomRead } from "@/lib/lounge/room";
import { EVENTS, track } from "@/lib/analytics/events";

const FORMATS = [{ value: "1", label: "Free-for-all" }, { value: "2", label: "2v2" }, { value: "3", label: "3v3" }, { value: "4", label: "4v4" }, { value: "6", label: "6v6" }];
const fmt = (n: number | null | undefined) => (n == null ? "?" : Math.round(n).toLocaleString("en-US"));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "0");

export function RoomCheck({ game: startGame, myNames }: { game: MmrGame; myNames: Partial<Record<MmrGame, string>> }) {
  const [text, setText] = useState("");
  const [game, setGame] = useState<MmrGame>(startGame);
  const [teamSize, setTeamSize] = useState(1);
  const [me, setMe] = useState(myNames[startGame] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ players: RoomPlayer[][]; read: RoomRead } | null>(null);

  const go = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/lounge/room", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, game, teamSize, me }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error === "too_few" ? (teamSize > 1 ? "Paste at least two teams, one per line, names separated by commas." : "Paste at least two names.") : j.error === "slow_down" ? "Give it a minute before the next check." : "MKCentral isn't answering right now. Try again in a minute.");
      else { setResult(j); track(EVENTS.loungeRoomRead, { players: (j.players as RoomPlayer[][]).flat().length, format: teamSize }); }
    } finally { setBusy(false); }
  };

  const read = result?.read;
  const mine = read?.me ?? null;
  const maxPay = mine ? Math.max(1, ...mine.pay.map((v) => Math.abs(v))) : 1;
  const teamName = (i: number) => result!.players[i].map((p) => p.name).join(" · ");

  return (
    <div className="lounge-room">
      <div className="lounge-room__form">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="The room's names" placeholder={teamSize > 1 ? "One team per line, names separated by commas" : "One name per line or comma, as the room shows them"} />
        <div className="lounge-room__opts">
          <Select floatingLabel="Game" aria-label="Game" value={game} onChange={(v) => { const g = String(v) as MmrGame; setGame(g); if (!me || me === myNames[game]) setMe(myNames[g] ?? ""); }} options={MMR_GAME_IDS.map((g) => ({ value: g, label: MMR_GAMES[g].short }))} />
          <Select floatingLabel="Format" aria-label="Format" value={String(teamSize)} onChange={(v) => setTeamSize(Number(v))} options={FORMATS} />
          <Input floatingLabel="Read it for" aria-label="Read it for (a lounge name in the room)" value={me} onChange={(e) => setMe(e.target.value)} maxLength={40} />
          <Button variant="primary" loading={busy} onClick={go} disabled={!text.trim()}>Read the room</Button>
        </div>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}

      {read && result && (
        <div className="lounge-room__out">
          {read.missing.length > 0 && <Alert variant="info">Not on the lounge in {MMR_GAMES[game].short}: {read.missing.join(", ")}. The read leaves them out.</Alert>}
          <div className="lounge-room__sum">
            <StatCard label="Room average" stat={fmt(read.average)} />
            <StatCard label={mine ? "Seed by MMR" : "Read it for"} stat={mine ? `${placeWord(mine.seed)} of ${read.teams.filter((t) => t.rating != null).length}` : "Nobody"} />
            <StatCard label="Likely finish" stat={mine ? placeWord(Math.round(mine.likely)) : "?"} />
            <StatCard label="Breaks even" stat={mine ? (mine.breakEven ? placeWord(mine.breakEven) : "Even 1st loses") : "?"} />
          </div>
          {!mine && <p className="lounge-empty">Add a lounge name from the room under Read it for to see what each place pays.</p>}

          {mine && (
            <section className="lounge-sec" aria-labelledby="room-pay">
              <h3 id="room-pay">What each place pays {teamName(mine.team)}</h3>
              <TableScroll label="Payouts table">
                <Table>
                  <TableHeader><TableRow><TableHead>Place</TableHead><TableHead><span className="sr-only">Bar</span></TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {mine.pay.map((v, i) => (
                      <TableRow key={i} className={Math.round(mine.likely) === i + 1 ? "lounge-board-row--me" : undefined}>
                        <TableCell>{placeWord(i + 1)}{Math.round(mine.likely) === i + 1 ? " (likely)" : ""}</TableCell>
                        <TableCell><span className="lounge-pay" aria-hidden="true"><i className={v >= 0 ? "g" : "l"} style={{ width: `${(Math.abs(v) / maxPay) * 50}%` }} /></span></TableCell>
                        <TableCell align="right"><span className={v >= 0 ? "lounge-up" : "lounge-down"}>{signed(v)}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableScroll>
            </section>
          )}

          <section className="lounge-sec" aria-labelledby="room-lineup">
            <h3 id="room-lineup">The room <small>By MMR, with each {teamSize > 1 ? "team's" : "player's"} likely finish</small></h3>
            <TableScroll label="Room table">
              <Table>
                <TableHeader><TableRow><TableHead>{teamSize > 1 ? "Team" : "Player"}</TableHead><TableHead align="right">MMR</TableHead><TableHead align="right">Likely</TableHead></TableRow></TableHeader>
                <TableBody>
                  {read.teams.map((t, i) => ({ t, i })).sort((a, b) => (b.t.rating ?? -1) - (a.t.rating ?? -1)).map(({ t, i }) => (
                    <TableRow key={i} className={mine?.team === i ? "lounge-board-row--me" : undefined}>
                      <TableCell>{t.players.map((p) => p.name).join(" · ")}{read.favorite === i ? <span className="lounge-cell-note">Favorite</span> : null}{t.players.length === 1 && t.players[0].division ? <span className="lounge-cell-note">{t.players[0].division}</span> : null}</TableCell>
                      <TableCell align="right">{fmt(t.rating)}</TableCell>
                      <TableCell align="right">{t.likely != null ? t.likely.toFixed(1) : "?"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </section>
          <p className="lounge-foot-note">Payouts follow the lounge&apos;s formula as GameShuffle measured it on real tables (within about 2 MMR); likely finishes come from how often higher-rated players finished ahead (two times in three).</p>
        </div>
      )}
    </div>
  );
}
