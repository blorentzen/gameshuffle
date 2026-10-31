"use client";

/**
 * Swiss on the public tournament page. A player sees their match first (table,
 * opponent, the clock, one tap to report; the other player confirms), then
 * everyone sees the round's tables, the standings and the top cut.
 */

import { Accordion, Badge, Button } from "@empac/cascadeds";
import { IconTrophy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { BracketView } from "@/components/tournament/BracketView";
import { clockText, cutRoundLabel, scoreChoices } from "@/lib/tournaments/swiss";
import type { SwissView } from "@/lib/tournaments/swissStore";
import { useClock, useSwiss } from "./useSwiss";
import { CutMatches, StandingsTable, TablesTable } from "./SwissParts";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function MatchCard({ view, you, act, busy, onDeck }: {
  view: SwissView;
  you: NonNullable<SwissView["you"]>;
  act: (b: Record<string, unknown>) => Promise<string | null>;
  busy: string | null;
  onDeck?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const left = useClock(view.clock);
  const m = you.match;
  const report = async (mine: number, theirs: number) => {
    const err = await act({ action: "report", key: m!.key, mine, theirs });
    if (err) toast.toast({ variant: "error", title: "Couldn't report", message: err });
  };
  const drop = async () => {
    const ok = await confirm({
      title: "Drop from the tournament?",
      body: m && !m.result && m.opponent ? `You won't be paired again. Your match against ${m.opponent.name} counts as a loss if it isn't finished.` : "You won't be paired again. Your record so far stays in the standings.",
      confirmLabel: "Drop",
    });
    if (!ok) return;
    const err = await act({ action: "drop" });
    if (err) toast.toast({ variant: "error", title: "Couldn't drop", message: err });
    else toast.toast({ variant: "success", message: "You've dropped. Thanks for playing." });
  };

  if (you.dropped) return <div className="comp-card swiss-you"><p className="swiss-you__note">You dropped from this tournament. Your record ({you.record}) stays in the standings.</p></div>;
  if (!m) {
    return (
      <div className="comp-card swiss-you">
        <p className="swiss-you__note">
          {view.phase === "cut" ? `Your Swiss run ended at ${you.record}${you.rank ? `, ${ordinal(you.rank)} place` : ""}.` : view.phase === "done" ? `You finished ${you.rank ? ordinal(you.rank) : ""} (${you.record}).` : "You'll see your table here when the next round is paired."}
        </p>
      </div>
    );
  }
  const myName = "You";
  const choices = scoreChoices(view.bestOf, m.cut);
  const statusLine = m.state === "bye" ? "A bye counts as a win. Sit back until the next round."
    : m.result ? (m.result.mine > m.result.theirs ? `You won ${m.result.mine}-${m.result.theirs}.` : m.result.mine < m.result.theirs ? `You lost ${m.result.mine}-${m.result.theirs}.` : `A tie, ${m.result.mine}-${m.result.theirs}.`) + (m.setByOrganizer ? " Entered by the organizer." : "")
    : m.state === "disagree" ? "You two reported different results. The organizer will settle it."
    : m.opponent && !m.opponent.account ? `${m.opponent.name} joined without an account, so the organizer enters this result${m.myReport ? ". Yours is sent." : "."}`
    : m.myReport ? `Waiting for ${m.opponent?.name ?? "your opponent"} to confirm.`
    : m.theyReported ? `${m.opponent?.name ?? "Your opponent"} reported. Tap the result to confirm it.`
    : null;
  return (
    <div className="comp-card swiss-you" aria-labelledby="swiss-you-title">
      <div className="swiss-you__top">
        <h2 id="swiss-you-title" className="swiss-you__label">{m.label}</h2>
        {m.table && <Badge variant="info" size="small">Table {m.table}</Badge>}
      </div>
      {m.opponent ? (
        <div className="swiss-you__vs">
          <div className="swiss-you__who"><span className="swiss-you__av swiss-you__av--me" aria-hidden>{initials(myName)}</span><strong>{myName}</strong><span className="swiss-muted">{you.record} · {you.points} pts</span></div>
          <span className="swiss-muted">vs</span>
          <div className="swiss-you__who"><span className="swiss-you__av" aria-hidden>{initials(m.opponent.name)}</span><strong>{m.opponent.name}</strong><span className="swiss-muted">{m.opponent.record} · {m.opponent.points} pts</span></div>
        </div>
      ) : null}
      {view.clock && left !== null && !m.result && (
        <p className="swiss-you__clock"><span className="swiss-clock__time">{clockText(left)}</span> <span className="swiss-muted">{view.clock.running ? "left" : "paused"} · best of {view.bestOf}</span></p>
      )}
      {m.opponent && !m.result && !m.setByOrganizer && (
        <div className="swiss-you__report" role="group" aria-label="Report the result">
          <p className="swiss-you__ask">Report the result</p>
          <div className="swiss-you__choices">
            {choices.map((c) => (
              <Button key={c.label} size="small" variant={m.myReport && m.myReport[0] === c.mine && m.myReport[1] === c.theirs ? "primary" : "secondary"} aria-pressed={!!m.myReport && m.myReport[0] === c.mine && m.myReport[1] === c.theirs} onClick={() => void report(c.mine, c.theirs)} disabled={!!busy}>
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {statusLine && <p className={`swiss-you__status${m.state === "disagree" ? " swiss-you__status--warn" : ""}`} aria-live="polite">{statusLine}</p>}
      <div className="swiss-you__links">
        <Button variant="ghost" size="small" onClick={() => document.getElementById("swiss-standings")?.scrollIntoView({ behavior: "smooth" })}>Standings</Button>
        {onDeck && <Button variant="ghost" size="small" onClick={onDeck}>My deck list</Button>}
        <Button variant="ghost" size="small" onClick={() => void drop()} disabled={!!busy}>Drop</Button>
      </div>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function SwissPublicPanel({ tournamentId, showDeckLink }: { tournamentId: string; showDeckLink?: boolean }) {
  const { view, busy, act } = useSwiss(tournamentId);
  if (!view) return <div className="comp-card"><LoadingLines label="Loading Swiss" /></div>;
  if (view.phase === "setup") {
    return (
      <div className="comp-card">
        <h2 className="swiss-card-title">Swiss</h2>
        <p className="swiss-help">{view.structure}</p>
        <p className="swiss-help">Pairings show here when the organizer starts round 1.</p>
      </div>
    );
  }
  const nameOf = (id: string | null) => (id ? view.standings.find((r) => r.id === id)?.name ?? "Player" : "TBD");
  const champion = view.cut ? view.cut.matches.find((m) => m.round === view.cut!.bracket.rounds - 1)?.winner ?? null : view.phase === "done" ? view.standings[0]?.id ?? null : null;
  return (
    <>
      {view.you && <MatchCard view={view} you={view.you} act={act} busy={busy} onDeck={showDeckLink ? () => document.getElementById("deck-list")?.scrollIntoView({ behavior: "smooth" }) : undefined} />}

      {champion && <div className="comp-card"><p className="swiss-champion"><IconTrophy size={18} stroke={1.9} aria-hidden /> {nameOf(champion)} won the tournament</p></div>}

      {view.cut && (
        <div className="comp-card">
          <h2 className="swiss-card-title">Top {view.topCut}</h2>
          <CutMatches matches={view.cut.matches} nameOf={nameOf} label={(m) => cutRoundLabel(view.cut!.bracket, m.round)} />
          <BracketView bracket={view.cut.bracket} nameOf={nameOf} />
        </div>
      )}

      {view.round && view.phase === "swiss" && (
        <div className="comp-card">
          <h2 className="swiss-card-title">Round {view.round.n} of {view.rounds}</h2>
          <TablesTable tables={view.round.tables} label={`Round ${view.round.n} tables`} />
        </div>
      )}

      <div className="comp-card" id="swiss-standings">
        <h2 className="swiss-card-title">{view.phase === "done" ? "Final standings" : view.phase === "cut" ? "Swiss standings" : `Standings after round ${(view.round?.n ?? 1) - (view.counts.done < view.counts.tables ? 1 : 0)}`}</h2>
        <StandingsTable rows={view.standings} topCut={view.topCut} final={view.phase === "done"} highlight={view.you?.participantId ?? null} />
      </div>

      {view.history.length > 0 && (
        <div className="comp-card">
          <h2 className="swiss-card-title">Earlier rounds</h2>
          <Accordion variant="bordered" allowMultiple items={view.history.map((r) => ({ id: `r${r.n}`, title: `Round ${r.n}`, content: <TablesTable tables={r.tables} label={`Round ${r.n} tables`} /> }))} />
        </div>
      )}
    </>
  );
}
