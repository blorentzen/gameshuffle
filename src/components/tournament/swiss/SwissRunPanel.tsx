"use client";

/**
 * The organizer's Swiss console on the manage page: pair round 1, then each
 * round's tables with results coming in from players' phones (both agree =
 * done; a disagreement is flagged to settle), the round clock, drops, the top
 * cut and finishing the event. One primary button: whatever comes next.
 */

import { useState } from "react";
import { Accordion, Alert, Badge, Button, Modal } from "@empac/cascadeds";
import { IconTrophy } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { BracketView } from "@/components/tournament/BracketView";
import { clockText, cutRoundLabel } from "@/lib/tournaments/swiss";
import type { ViewCutMatch, ViewTable } from "@/lib/tournaments/swissStore";
import { useClock, useSwiss } from "./useSwiss";
import { CutMatches, ResultModal, StandingsTable, TablesTable } from "./SwissParts";

type Open = { kind: "table"; t: ViewTable } | { kind: "cut"; m: ViewCutMatch } | null;

export function SwissRunPanel({ tournamentId, status, decksRequired, onStatus }: {
  tournamentId: string;
  status: string;
  /** Deck lists are due before round 1 (warn about missing ones when pairing). */
  decksRequired: boolean;
  /** The event started or finished (the manage page updates its status). */
  onStatus?: (status: "in_progress" | "complete") => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { view, missing, busy, act } = useSwiss(tournamentId);
  const [open, setOpen] = useState<Open>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropId, setDropId] = useState("");
  const left = useClock(view?.clock ?? null);

  if (missing) return <Alert variant="info" title="Swiss needs a database update">Once it&apos;s applied, you can pair round 1 here.</Alert>;
  if (!view) return <LoadingLines label="Loading Swiss" />;

  const run = async (body: Record<string, unknown>, done?: string) => {
    const err = await act(body);
    if (err) toast.toast({ variant: "error", title: "Couldn't do that", message: err });
    else if (done) toast.toast({ variant: "success", message: done });
    return !err;
  };
  const nameOf = (id: string | null) => (id ? view.standings.find((r) => r.id === id)?.name ?? "Player" : "TBD");

  const start = async () => {
    if (decksRequired) {
      const r = await fetch(`/api/tournament/${tournamentId}/deck-lists?view=organizer`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      const lacking = ((r?.organizer?.rows ?? []) as { status: string; deck: unknown }[]).filter((x) => (x.status === "confirmed" || x.status === "checked_in") && !x.deck).length;
      if (lacking && !(await confirm({ title: `${lacking === 1 ? "1 player has" : `${lacking} players have`} no deck list`, body: "They can still play if you start now. Lists lock once round 1 is paired.", confirmLabel: "Pair round 1 anyway" }))) return;
    }
    if (await run({ action: "start" }, "Round 1 is paired. Everyone's been told their table.")) onStatus?.("in_progress");
  };
  const step = async () => {
    if (view.next === "pair") await run({ action: "pair" }, `Round ${(view.round?.n ?? 0) + 1} is paired.`);
    else if (view.next === "cut") await run({ action: "cut" }, `The Top ${view.topCut} is set.`);
    else if (view.next === "finish") {
      if (!(await confirm({ title: "Finish the tournament?", body: "Final standings are saved and the event is marked complete.", confirmLabel: "Finish" }))) return;
      if (await run({ action: "finish" }, "Final standings saved.")) onStatus?.("complete");
    }
  };

  // ── Before round 1 ──
  if (view.phase === "setup") {
    return (
      <div className="swiss-run">
        <p className="swiss-help">{view.structure}</p>
        <p className="swiss-help">{view.players} confirmed {view.players === 1 ? "player" : "players"}. Pairing round 1 starts the event and tells everyone their table.</p>
        {status === "draft" && <Alert variant="info">Publish the tournament first, then pair round 1.</Alert>}
        <div className="swiss-run__actions">
          <Button variant="primary" onClick={() => void start()} loading={busy === "start"} disabled={!!busy || status === "draft" || view.players < 4}>Pair round 1</Button>
        </div>
        {view.players < 4 && <p className="swiss-help">Swiss needs at least 4 confirmed players.</p>}
      </div>
    );
  }

  const mainLabel = view.next === "pair" ? `Pair round ${(view.round?.n ?? 0) + 1}` : view.next === "cut" ? `Start the Top ${view.topCut}` : view.next === "finish" ? "Finish the tournament" : view.phase === "cut" ? "Waiting on the top cut" : "Waiting on results";
  const champion = view.cut ? view.cut.matches.find((m) => m.round === view.cut!.bracket.rounds - 1)?.winner ?? null : view.phase === "done" ? view.standings[0]?.id ?? null : null;
  const canRepair = view.phase === "swiss" && !!view.round && view.round.tables.every((t) => !t.b || (t.state === "waiting" && !t.reportA && !t.reportB && !t.result));
  const dropChoices = view.standings.filter((r) => !r.dropped).map((r) => ({ value: r.id, label: `${r.name} (${r.record})` }));

  return (
    <div className="swiss-run">
      {/* Head: where we are and the clock */}
      <div className="swiss-run__head">
        <h3 className="swiss-run__title">{view.phase === "cut" ? `Top ${view.topCut}` : view.phase === "done" ? "Finished" : `Round ${view.round?.n} of ${view.rounds}`}</h3>
        {view.clock && view.phase !== "done" && (
          <div className="swiss-clock" aria-live="off">
            <span className="swiss-clock__time">{left === null ? "--:--" : clockText(left)}</span>
            <span className="swiss-clock__label">{left === null ? "Clock not started" : view.clock.running ? "left in the round" : "paused"}</span>
          </div>
        )}
      </div>

      {view.phase !== "done" && (
        <div className="swiss-run__chips">
          <Badge variant="success" size="small">{view.counts.done} of {view.counts.tables} {view.phase === "cut" ? "matches" : "tables"} in</Badge>
          {view.counts.disagree > 0 && <Badge variant="warning" size="small">{view.counts.disagree} to settle</Badge>}
          {view.clock && (
            <>
              <Button size="small" variant="secondary" onClick={() => void run({ action: "timer", op: "add" }, "5 minutes added.")} disabled={!!busy || left === null}>+5 minutes</Button>
              {view.clock.running
                ? <Button size="small" variant="ghost" onClick={() => void run({ action: "timer", op: "pause" })} disabled={!!busy}>Pause clock</Button>
                : <Button size="small" variant="ghost" onClick={() => void run({ action: "timer", op: left === null ? "start" : "resume" })} disabled={!!busy}>{left === null ? "Start clock" : "Resume clock"}</Button>}
              <Button size="small" variant="ghost" onClick={async () => { if (await confirm({ title: "Restart the clock?", body: `Back to ${view.clock?.minutes} minutes for everyone.`, confirmLabel: "Restart clock" })) void run({ action: "timer", op: "restart" }); }} disabled={!!busy}>Restart clock</Button>
            </>
          )}
        </div>
      )}

      {champion && (
        <p className="swiss-champion"><IconTrophy size={18} stroke={1.9} aria-hidden /> {nameOf(champion)} {view.phase === "done" ? "won the tournament" : "won the final"}</p>
      )}

      {view.round && view.phase === "swiss" && (
        <TablesTable tables={view.round.tables} label={`Round ${view.round.n} tables`} onOpen={(t) => setOpen({ kind: "table", t })} />
      )}

      {view.cut && (
        <>
          <CutMatches
            matches={view.cut.matches}
            nameOf={nameOf}
            label={(m) => cutRoundLabel(view.cut!.bracket, m.round)}
            onOpen={view.phase === "done" ? undefined : (m) => setOpen({ kind: "cut", m })}
          />
          <BracketView bracket={view.cut.bracket} nameOf={nameOf} />
        </>
      )}

      {view.phase !== "done" && (
        <div className="swiss-run__actions">
          <div className="swiss-run__secondary">
            <Button variant="ghost" size="small" onClick={() => { setDropId(""); setDropOpen(true); }} disabled={!!busy}>Drop a player</Button>
            {canRepair && <Button variant="ghost" size="small" onClick={async () => { if (await confirm({ title: `Re-pair round ${view.round!.n}?`, body: "Nobody has reported yet. Everyone gets new tables and a new alert.", confirmLabel: "Re-pair" })) void run({ action: "repair" }, "Round re-paired."); }} disabled={!!busy}>Re-pair this round</Button>}
          </div>
          <Button variant="primary" onClick={() => void step()} loading={busy === "pair" || busy === "cut" || busy === "finish"} disabled={!!busy || !view.next || view.next === "wait"}>{mainLabel}</Button>
        </div>
      )}
      <p className="swiss-help">Pairings: same record first, no rematches, and the bye goes to the lowest record that hasn&apos;t had one. A result can be changed until the round after next is paired.</p>

      <Accordion
        variant="bordered"
        allowMultiple
        defaultOpenIds={view.phase === "done" ? ["standings"] : []}
        items={[
          { id: "standings", title: view.phase === "done" ? "Final standings" : "Standings", content: <StandingsTable rows={view.standings} topCut={view.topCut} final={view.phase === "done"} /> },
          ...view.history.map((r) => ({ id: `r${r.n}`, title: `Round ${r.n}`, content: <TablesTable tables={r.tables} label={`Round ${r.n} tables`} onOpen={view.phase === "swiss" && r.n >= (view.round?.n ?? 0) - 1 ? (t: ViewTable) => setOpen({ kind: "table", t }) : undefined} /> })),
        ]}
      />

      {open?.kind === "table" && open.t.b && (
        <ResultModal
          open
          onClose={() => setOpen(null)}
          title={`Table ${open.t.t}: ${open.t.a.name} vs ${open.t.b.name}`}
          aName={open.t.a.name}
          bName={open.t.b.name}
          bestOf={view.bestOf}
          cut={false}
          reportA={open.t.reportA}
          reportB={open.t.reportB}
          hasResult={!!open.t.result}
          setByOrganizer={open.t.result?.by === "organizer"}
          busy={!!busy}
          onPick={async (a, b) => { const key = `r${historyRound(view, open.t) ?? view.round?.n}`; if (await run({ action: "result", key, table: open.t.t, a, b }, "Result saved.")) setOpen(null); }}
          onClear={async () => { const key = `r${historyRound(view, open.t) ?? view.round?.n}`; if (await run({ action: "result", key, table: open.t.t, clear: true }, "Result cleared.")) setOpen(null); }}
        />
      )}
      {open?.kind === "cut" && open.m.a && open.m.b && (
        <ResultModal
          open
          onClose={() => setOpen(null)}
          title={`${cutRoundLabel(view.cut!.bracket, open.m.round)}: ${nameOf(open.m.a)} vs ${nameOf(open.m.b)}`}
          aName={nameOf(open.m.a)}
          bName={nameOf(open.m.b)}
          bestOf={view.bestOf}
          cut
          reportA={open.m.reportA}
          reportB={open.m.reportB}
          hasResult={!!open.m.result}
          setByOrganizer={false}
          busy={!!busy}
          onPick={async (a, b) => { if (await run({ action: "result", key: `c:${open.m.id}`, a, b }, "Result saved.")) setOpen(null); }}
          onClear={() => {}}
        />
      )}

      <Modal
        isOpen={dropOpen}
        onClose={() => setDropOpen(false)}
        title="Drop a player"
        size="small"
        primaryAction={{ label: "Drop them", onClick: async () => { if (dropId && (await run({ action: "drop_player", participantId: dropId }, "Dropped."))) setDropOpen(false); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setDropOpen(false) }}
        destructive
      >
        <div className="swiss-drop">
          <Select floatingLabel="Player" fullWidth value={dropId} onChange={(v) => setDropId(String(v))} options={[{ value: "", label: "Choose a player" }, ...dropChoices]} />
          <p className="swiss-help">They aren&apos;t paired again and keep their record. An unfinished match this round counts as a loss for them.</p>
        </div>
      </Modal>
    </div>
  );
}

/** Which round a table opened from the history list belongs to (tables are numbered per round). */
function historyRound(view: NonNullable<ReturnType<typeof useSwiss>["view"]>, t: ViewTable): number | null {
  if (view.round?.tables.some((x) => x === t || (x.t === t.t && x.a.id === t.a.id))) return view.round.n;
  for (const r of view.history) if (r.tables.some((x) => x.t === t.t && x.a.id === t.a.id)) return r.n;
  return null;
}
