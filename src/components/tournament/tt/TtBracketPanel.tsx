"use client";

/**
 * A single or double elimination bracket decided by time trial. On the public page (`TtBracketPanel`): the board and
 * each round's tracks, your open match with both players' times and Add my time, and every match in play. On the
 * manage page's Run tab (`TtBracketRunPanel`): the matches in play with their track score, settling a match on the
 * times so far, and (when the organizer asks for clips) the times to check and the verifiers. Verifiers see the times
 * to check on the public page. The bracket drawing itself stays where it is (BracketView); this sits above it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconPlus, IconTrophy } from "@tabler/icons-react";
import { AdminTable } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { TtBracketMatchView, TtBracketView } from "@/lib/tournaments/tt/bracketTt";
import { AddTimeWindow, ClipWindow, MatchTracks, boardLine, trackName } from "./TtParts";
import { TtMatchChecks } from "./TtMatchChecks";

const POLL_MS = 8000;

function useTtBracket(tournamentId: string) {
  const [view, setView] = useState<TtBracketView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true);
  const load = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/tt`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; bracket?: TtBracketView } | null;
    if (live.current && j?.ok && j.bracket) setView(j.bracket);
  }, [tournamentId]);
  useEffect(() => {
    live.current = true;
    void load();
    return () => { live.current = false; };
  }, [load]);
  const running = !!view && view.started && view.generated && !view.champion;
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => window.clearInterval(iv);
  }, [running, load]);
  const act = useCallback(async (body: Record<string, unknown>): Promise<{ error: string | null; level: string[] }> => {
    setBusy(String(body.matchId ?? body.action));
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/tt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; bracket?: TtBracketView; message?: string; level?: string[] } | null;
      if (j?.ok && j.bracket) { setView(j.bracket); return { error: null, level: j.level ?? [] }; }
      return { error: j?.message ?? "That didn't go through. Try again.", level: [] };
    } catch {
      return { error: "That didn't go through. Check your connection and try again.", level: [] };
    } finally {
      setBusy(null);
    }
  }, [tournamentId]);
  return { view, busy, act, reload: load };
}

const scoreText = (m: TtBracketMatchView) => `${m.a.won} to ${m.b.won}${m.held ? ", waiting for a check" : ""}`;
const timesIn = (m: TtBracketMatchView) => m.tracks.reduce((n, t) => n + (t.a != null ? 1 : 0) + (t.b != null ? 1 : 0), 0);

/** Each bracket round and the tracks it races. */
function Schedule({ view }: { view: TtBracketView }) {
  if (!view.schedule.length) return null;
  return (
    <ol className="tt-ev-plan" aria-label="Tracks by round">
      {view.schedule.map((r) => (
        <li key={r.label}><b>{r.label}</b> {r.tracks.map((t) => trackName(view.settings.game, t)).join(", ")}</li>
      ))}
    </ol>
  );
}

/** Everyone's matches in play: a table for viewers. */
function OpenMatches({ matches }: { matches: TtBracketMatchView[] }) {
  return (
    <AdminTable label="Matches in play">
      <Table className="tt-ev-table">
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            <TableHead>Players</TableHead>
            <TableHead className="tt-ev-num">Tracks won</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.label}</TableCell>
              <TableCell>{m.a.name} <span className="tt-ev-muted">against</span> {m.b.name}</TableCell>
              <TableCell className="tt-ev-num">{scoreText(m)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTable>
  );
}

/** The organizer's matches in play: one row each, with its Settle button in reach on a phone. */
function SettleRows({ matches, onSettle, busy }: { matches: TtBracketMatchView[]; onSettle: (m: TtBracketMatchView) => void; busy: string | null }) {
  return (
    <ul className="tt-br-rows" aria-label="Matches in play">
      {matches.map((m) => (
        <li key={m.id} className="tt-br-row">
          <span className="tt-br-row__words">
            <span className="tt-br-row__label">{m.label}</span>
            <span>{m.a.name} <span className="tt-ev-muted">against</span> {m.b.name}</span>
            <span className="tt-ev-muted">{m.held ? `Decided ${m.a.won} to ${m.b.won}, waiting for a clip check` : `${scoreText(m)} in tracks · ${timesIn(m)} of ${m.tracks.length * 2} times in`}</span>
          </span>
          <Button size="small" variant="secondary" loading={busy === m.id} disabled={!!busy} onClick={() => onSettle(m)}>Settle</Button>
        </li>
      ))}
    </ul>
  );
}

/** The public page: your match first, then the board, the rounds' tracks and every match in play. */
export function TtBracketPanel({ tournamentId }: { tournamentId: string }) {
  const { view, reload } = useTtBracket(tournamentId);
  const [adding, setAdding] = useState<string | null | false>(false);
  const [clipFor, setClipFor] = useState<{ id: string; track: string; ms: number } | null>(null);
  if (!view) return <div className="comp-card"><LoadingLines label="Loading the matches" /></div>;
  const s = view.settings;
  const you = view.you;
  const m = you?.match ?? null;
  const me = m ? (m.side === "a" ? m.a : m.b) : null;
  const them = m ? (m.side === "a" ? m.b : m.a) : null;
  const others = view.open.filter((x) => x.id !== m?.id);
  const status = view.champion ? null
    : !view.generated ? "The bracket and its tracks show here once the organizer makes it."
    : !view.started ? "Matches open once the organizer starts the tournament."
    : view.open.length ? `${view.open.length} match${view.open.length === 1 ? "" : "es"} in play. Every open match runs at the same time.`
    : "Waiting on the organizer to settle the last matches.";
  return (
    <>
      {you && view.started && view.generated && !view.champion && (
        <section className="comp-card tt-ev-you" aria-labelledby="tt-br-you">
          <div className="tt-ev-you__head">
            <h2 id="tt-br-you" className="tt-ev__title">{m ? `Your match · ${m.label}` : you.out ? "You're out" : "Your next match"}</h2>
            {m && !m.held && <Button variant="primary" iconBefore={IconPlus} onClick={() => setAdding(null)}>Add my time</Button>}
          </div>
          {m && me && them ? (
            <div className="swiss-tt">
              <p className="tt-ev__hint">
                Against {them.name}.{" "}
                {m.held ? `${me.won > them.won ? "You won" : "You lost"} ${me.won} to ${them.won} in tracks. It counts once the clips are checked.`
                  : me.won > them.won ? `You lead ${me.won} to ${them.won} in tracks.` : me.won < them.won ? `You trail ${me.won} to ${them.won} in tracks.` : me.won ? `Level at ${me.won} to ${them.won}.` : `Race ${m.tracks.length === 1 ? "the track" : "the tracks"} and add your time${m.tracks.length === 1 ? "" : "s"}. The faster time takes each track${m.tracks.length > 1 ? ", first to two wins" : ""}.`}
              </p>
              <MatchTracks game={s.game} opponent={them.name} locked={m.held} onAdd={(t) => setAdding(t)} onClip={setClipFor}
                rows={m.tracks.map((t) => ({ id: t.id, mine: m.side === "a" ? t.a : t.b, theirs: m.side === "a" ? t.b : t.a, proof: m.side === "a" ? t.aProof : t.bProof }))} />
              <AddTimeWindow open={adding !== false} onClose={() => setAdding(false)} tournamentId={tournamentId} settings={s} tracks={m.tracks.map((t) => t.id)}
                runoff={false} start={adding || null} match onAdded={() => void reload()} />
              <ClipWindow tournamentId={tournamentId} item={clipFor} game={s.game} match onClose={() => setClipFor(null)} onDone={() => void reload()} />
            </div>
          ) : (
            <p className="tt-ev__hint">{you.out ? "Your bracket run is over. The matches below keep going." : "Your next match opens once the match before it is decided."}</p>
          )}
        </section>
      )}

      <section className="comp-card tt-ev" aria-labelledby="tt-br-title">
        <h2 id="tt-br-title" className="tt-ev__title">Time trial matches</h2>
        <p className="tt-ev__board">{boardLine(s)} · Best of {view.bestOf} track{view.bestOf === 1 ? "" : "s"}</p>
        {status && <p className="tt-ev__status" aria-live="polite">{status}</p>}
        {view.champion && <p className="tt-ev__winner"><IconTrophy size={20} stroke={1.9} aria-hidden="true" /> {view.champion} won</p>}
        <Schedule view={view} />
        {/* Your own match is in its own card above, so it isn't listed again here. */}
        {others.length > 0 && <OpenMatches matches={others} />}
        {view.canCheck && !view.canManage && view.started && <TtMatchChecks tournamentId={tournamentId} onChange={() => void reload()} />}
      </section>
    </>
  );
}

/** The manage page's Run tab: matches in play, settling one on the times so far, and the rounds' tracks. */
export function TtBracketRunPanel({ tournamentId, onChanged }: { tournamentId: string; onChanged: () => void }) {
  const { view, busy, act, reload } = useTtBracket(tournamentId);
  const toast = useToast();
  const confirm = useConfirm();
  // The bracket moves on the server as times come in: the manage page reads it again when the open matches change.
  const sig = view ? `${view.open.map((m) => m.id).join(",")}|${view.champion ?? ""}` : null;
  const lastSig = useRef<string | null>(null);
  useEffect(() => {
    if (sig === null) return;
    if (lastSig.current !== null && lastSig.current !== sig) onChanged();
    lastSig.current = sig;
  }, [sig, onChanged]);
  if (!view) return <div className="comp-card"><LoadingLines label="Loading the matches" /></div>;

  const settle = async (m: TtBracketMatchView) => {
    const ok = await confirm({
      title: `Settle ${m.label}?`,
      body: `${m.a.name} against ${m.b.name}, on the times so far. A track with only one time goes to that player; a track with none goes to nobody. If it's still level, pick the winner in the bracket below.`,
      confirmLabel: "Settle it",
    });
    if (!ok) return;
    const r = await act({ action: "match_settle", matchId: m.id });
    if (r.error) { toast.error(r.error); return; }
    if (r.level.length) toast.warning("Still level on the times so far. Pick the winner in the bracket below.");
    else toast.success("Match settled");
  };
  const settleAll = async () => {
    const ok = await confirm({
      title: "Settle every open match?",
      body: "Each match in play is settled on the times so far. Matches that open because of it stay open.",
      confirmLabel: "Settle them",
    });
    if (!ok) return;
    const r = await act({ action: "match_settle_all" });
    if (r.error) { toast.error(r.error); return; }
    if (r.level.length) toast.warning(`${r.level.length} match${r.level.length === 1 ? " is" : "es are"} still level. Pick the winner${r.level.length === 1 ? "" : "s"} in the bracket below.`);
    else toast.success("Matches settled");
  };

  return (
    <section className="comp-card tt-ev" aria-labelledby="tt-br-run">
      <div className="tt-ev-you__head">
        <h2 id="tt-br-run" className="tt-ev__title">Time trial matches</h2>
        {view.open.length > 1 && <Button size="small" variant="secondary" disabled={!!busy} loading={busy === "match_settle_all"} onClick={() => void settleAll()}>Settle every open match</Button>}
      </div>
      <p className="tt-ev__board">{boardLine(view.settings)} · Best of {view.bestOf} track{view.bestOf === 1 ? "" : "s"}</p>
      <p className="tt-ev__status" aria-live="polite">
        {view.champion ? `${view.champion} won. Finalize the placements in the bracket below.`
          : !view.generated ? "Make the bracket below. Each round's tracks show here once it's made."
          : !view.started ? "Matches open when you start the tournament. Both players hear when theirs opens."
          : view.open.length ? (view.settings.matchClips === 0
            ? "Matches settle themselves once the times decide them. Settle one on the times so far when its players run out of time."
            : "Matches settle themselves once the times decide them and their clips are checked. Settling one on the times so far skips the check.")
          : "Nothing in play. Pick any level match's winner in the bracket below."}
      </p>
      <Schedule view={view} />
      {view.started && view.open.length > 0 && <SettleRows matches={view.open} onSettle={(m) => void settle(m)} busy={busy} />}
      <TtMatchChecks tournamentId={tournamentId} onChange={() => void reload()} />
    </section>
  );
}
