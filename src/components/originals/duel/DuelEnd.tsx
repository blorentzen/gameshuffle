"use client";

/**
 * After a duel: the result (the one boxed thing: the trainer's round picture, won or lost, turns
 * against par, the time, cards left, both sides' cards as they ended), Share, Practice and Next up;
 * then your streak, today's leaderboard, today's cards (your six and the trainer's own card: add
 * them to My Cards, or find them in our shop) and the support line. A practice duel says Practice and leaves the board, points and streak out.
 */

import { useState, type ReactNode } from "react";
import { Button } from "@empac/cascadeds";
import { IconCards, IconRefresh, IconShoppingBag, IconTrophy } from "@tabler/icons-react";
import { DailiesNextButton, DailiesShare, DailiesYours, withLink } from "@/components/originals/Dailies";
import { ShareButton } from "@/components/share/ShareButton";
import { OriginalsLink } from "@/components/originals/OriginalsHost";
import { SupportMoment } from "@/components/support/SupportMoment";
import { ChallengeVersus } from "@/components/share/ShareChallenge";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, tagged, track } from "@/lib/analytics/events";
import { ordinal } from "@/lib/daily/boardRules";
import { formatTime } from "@/lib/originals/dailies";
import { TCG_SHOP_URL } from "@/data/shop";
import type { DuelCardView, DuelRunView } from "@/lib/originals/duel/view";
import { CardThumb } from "./DuelBits";
import { TrainerArt } from "./TrainerArt";

const SHARE_URL = "https://www.gameshuffle.co/daily-duel";

/** "1 turn" / "3 turns". */
const turnsWord = (n: number) => `${n} ${n === 1 ? "turn" : "turns"}`;

function parLine(run: DuelRunView): string | null {
  if (run.par == null) return null;
  if (run.result !== "won") return `This pack can be won in ${turnsWord(run.par)}.`;
  const over = run.turns - run.par;
  if (over < 0) return `${turnsWord(-over)} under par.`;
  if (over === 0) return "Right on par.";
  return `${turnsWord(over)} over par.`;
}

export function DuelEnd({ run, place, players, signedIn, board, onPractice, onToday, onZoom }: {
  run: DuelRunView;
  /** Today's place on the day board (official duels on the board). */
  place: number | null;
  players: number;
  signedIn: boolean;
  /** The day board (official duels only). */
  board: ReactNode;
  onPractice: () => void;
  /** Practice: back to today's own result. */
  onToday?: () => void;
  onZoom: (card: DuelCardView, owner: string) => void;
}) {
  const won = run.result === "won";
  const trainer = run.trainer.name;
  const their = `${trainer}'s`;
  const play = run.play;
  const knocked = play.foe.filter((c) => c.out).length;
  const official = run.official;
  const kicker = official ? (run.number >= 1 ? `The Daily Duel #${run.number}` : "The warm-up duel") : "Practice duel";
  const shareText = (url: string) => withLink(run.share ?? "", url);
  const sharedNow = () => track(EVENTS.duelShared, { via: official ? "result" : "practice" });

  return (
    <div className="duel-end">
      <section className="duel-result" aria-labelledby="duel-result-title" tabIndex={-1} id="duel-result">
        {run.trainer.picture && <TrainerArt picture={run.trainer.picture} shape="round" className="duel-result__face" />}
        <p className="duel-result__kicker">{kicker}</p>
        <h2 id="duel-result-title" className="duel-result__title">{won ? `You beat ${trainer} in ${turnsWord(run.turns)}` : `${trainer} wins this one`}</h2>
        <dl className="duel-result__stats">
          {won
            ? <div><dt>Turns</dt><dd>{run.turns}</dd></div>
            : <div><dt>Knocked out</dt><dd>{knocked} of {play.foe.length}</dd></div>}
          {run.par != null && <div><dt>Par</dt><dd>{run.par}</dd></div>}
          {official && run.seconds != null && <div><dt>Time</dt><dd>{formatTime(run.seconds)}</dd></div>}
          <div><dt>Cards left</dt><dd>{run.cardsLeft} of {play.you.length}</dd></div>
        </dl>
        {parLine(run) && <p className="duel-result__line">{parLine(run)}</p>}
        {official && run.board && (
          <p className="duel-result__line"><IconTrophy size={18} aria-hidden="true" />+{run.board.points} {run.board.points === 1 ? "point" : "points"} on today&apos;s board{run.board.tokens > 0 ? `, +${run.board.tokens} tokens` : ""}{place ? ` · ${ordinal(place)} of ${players} today` : ""}</p>
        )}
        {official && !run.board && run.points != null && !signedIn && <p className="duel-result__small">Put a name on the leaderboard below to see where this lands.</p>}
        {!official && <p className="duel-result__small">Practice doesn&apos;t change your score or streak. Your first duel today is the one on the board.</p>}
        <div className="duel-result__sides">
          <div>
            <p className="duel-result__label">Your six</p>
            <div className="duel-result__cards">{play.you.map((c) => <CardThumb key={c.index} card={c} onPress={() => onZoom(c, "Your")} label={`See the ${c.name} card${c.out ? ", knocked out" : `, ${c.cur} of ${c.hp} HP left`}`} />)}</div>
          </div>
          <div>
            <p className="duel-result__label">{their} team</p>
            <div className="duel-result__cards">{play.foe.map((c) => <CardThumb key={c.index} card={c} onPress={() => onZoom(c, their)} label={`See ${their} ${c.name} card${c.out ? ", knocked out" : `, ${c.cur} of ${c.hp} HP left`}`} />)}</div>
          </div>
        </div>
        {official && <ChallengeVersus game="duel" mine={{ kind: "duel", won, turns: run.turns, seconds: run.seconds, standing: play.you.map((c) => !c.out), knocked, team: play.foe.length }} />}
        <div className="duel-result__actions" onClickCapture={(e) => { if ((e.target as HTMLElement).closest(".duel-share")) sharedNow(); }}>
          <span className="duel-share">
            {official
              ? <DailiesShare current="duel" oneText="Copy my result" shareOne={() => { void navigator.clipboard.writeText(shareText(SHARE_URL)); }} one={{ request: { kind: "duel", duelRun: run.id }, text: shareText, fallbackUrl: SHARE_URL }} />
              : <ShareButton request={{ kind: "duel", duelRun: run.id }} text={shareText} game="duel" fallbackUrl={SHARE_URL} title="My Daily Duel practice" variant="secondary" />}
          </span>
          <Button variant="secondary" iconBefore={IconRefresh} onClick={onPractice}>{official ? "Practice this duel" : "Practice again"}</Button>
          {official ? <DailiesNextButton current="duel" /> : onToday && <Button variant="ghost" onClick={onToday}>Back to today&apos;s result</Button>}
        </div>
      </section>

      {official && <div className="duel-streak"><DailiesYours current="duel" only /></div>}

      {official && board}

      <DuelCards cards={play.you} trainer={run.trainer.picture?.kind === "card" ? { id: run.trainer.picture.id, card: run.trainer.picture.card } : null} signedIn={signedIn} />

      <SupportMoment from="duel" title="Enjoying the Daily Duel?" />
    </div>
  );
}

/** Today's six and the trainer's own card: add them to My Cards (an account), or find them in our TCGplayer store. */
function DuelCards({ cards, trainer, signedIn }: { cards: DuelCardView[]; trainer: { id: string; card: string } | null; signedIn: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const ids = [...cards.map((c) => c.id), ...(trainer ? [trainer.id] : [])];
  const add = async () => {
    setState("busy");
    let added = 0;
    let full: number | null = null;
    // One at a time: each add checks the free account's card limit.
    for (const id of ids) {
      const res = await fetch("/api/tcg/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: id }) }).catch(() => null);
      const d = (await res?.json().catch(() => null)) as { ok?: boolean; code?: string; limit?: number } | null;
      if (d?.ok) added++;
      else if (d?.code === "collection_full") { full = d.limit ?? 250; break; }
    }
    if (added > 0) track(EVENTS.cardCollected, { from: "daily-duel", count: added });
    if (full !== null) {
      setState(added ? "done" : "idle");
      toast.error(`My Cards holds ${full} different cards on a free account. GS Pro has no limit.`);
    } else if (added === ids.length) {
      setState("done");
      toast.success(`Added ${added} cards to My Cards`);
    } else {
      setState(added ? "done" : "idle");
      toast.error(added ? `Added ${added} of ${ids.length}. Try again for the rest.` : "Couldn't add the cards. Try again.");
    }
  };
  return (
    <section className="duel-flat" aria-labelledby="duel-cards-title">
      <h2 id="duel-cards-title" className="duel-flat__title">Today&apos;s cards</h2>
      <p className="duel-small">{trainer ? `Your six and ${trainer.card} are real Pokémon cards.` : "Your six are real Pokémon cards."}</p>
      <div className="duel-flat__actions">
        {signedIn
          ? <Button variant="secondary" iconBefore={IconCards} onClick={() => void add()} disabled={state !== "idle"} loading={state === "busy"}>{state === "done" ? "In My Cards" : "Add these cards to My Cards"}</Button>
          : <OriginalsLink href="/login?redirect=/daily-duel"><Button variant="secondary" iconBefore={IconCards}>Add these cards to My Cards</Button></OriginalsLink>}
        <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer" className={tagged(EVENTS.tcgStoreClicked, { from: "daily-duel" })}>
          <Button variant="ghost" iconBefore={IconShoppingBag}>Find them in our shop</Button>
        </a>
      </div>
      {!signedIn && <p className="duel-small">Adding cards needs a free account.</p>}
    </section>
  );
}
