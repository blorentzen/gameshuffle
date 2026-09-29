"use client";

import { useState } from "react";
import { Alert, Button, Chip } from "@empac/cascadeds";
import { IconBomb, IconCoin, IconMushroom, IconShield, IconStar } from "@tabler/icons-react";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { RosterEmpty } from "@/components/game-nights/companion/RosterEmpty";
import {
  BUST_BOMBS, TARGET, bank, bankValue, facesPoints, keepAndRoll, newTurn,
  type Face, type TurnState,
} from "@/lib/originals/shuffleDice";

/**
 * Shuffle Dice (a GameShuffle Original), a one-device prototype for
 * playtesting the ruleset: roll five, keep what you like, push your luck,
 * and bank before the third Bomb.
 */

const FACE: Record<Face, { label: string; icon: React.ReactNode }> = {
  star: { label: "Star", icon: <IconStar size={16} /> },
  coin: { label: "Coin", icon: <IconCoin size={16} /> },
  mushroom: { label: "Mushroom", icon: <IconMushroom size={16} /> },
  shell: { label: "Shell", icon: <IconShield size={16} /> },
  bomb: { label: "Bomb", icon: <IconBomb size={16} /> },
};

export function ShuffleDice() {
  const { players: roster } = useRoster();
  const names = roster.map((p) => p.name);
  const [scores, setScores] = useState<number[]>([]);
  const [player, setPlayer] = useState(0);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [keep, setKeep] = useState<number[]>([]);
  const [winner, setWinner] = useState<number | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  if (roster.length === 0) return <RosterEmpty>Add at least two players above to play Shuffle Dice.</RosterEmpty>;

  const reset = () => { setScores(names.map(() => 0)); setPlayer(0); setTurn(null); setKeep([]); setWinner(null); setWarn(null); };
  const board = scores.length === names.length ? scores : names.map(() => 0);
  const passTurn = () => { setPlayer((p) => (p + 1) % names.length); setTurn(null); setKeep([]); setWarn(null); };
  const value = turn ? bankValue(turn, keep) : { points: 0, shells: 0 };

  return (
    <div className="account-card oddone-tool">
      <Alert variant="info" title="Prototype">This is a first draft of the rules, here so we can playtest them. Tell us what felt good or broken.</Alert>

      <ul className="party-live__scores">
        {names.map((n, i) => (
          <li key={i} className={i === player && winner === null ? "sd__active" : undefined}>
            <span>{n}{i === player && winner === null ? " · rolling" : ""}</span>
            <span className="party-muted">{board[i]} / {TARGET}</span>
          </li>
        ))}
      </ul>

      {winner !== null ? (
        <>
          <p className="oddone__verdict"><strong>{names[winner]}</strong> wins Shuffle Dice!</p>
          <Button variant="primary" onClick={reset}>Play again</Button>
        </>
      ) : !turn ? (
        <Button variant="primary" disabled={names.length < 2} onClick={() => { if (scores.length !== names.length) setScores(names.map(() => 0)); setTurn(newTurn()); setKeep([]); }}>
          {names.length < 2 ? "Add at least 2 players" : `${names[player]}: roll the dice`}
        </Button>
      ) : (
        <>
          <div className="sd__row">
            <span className="party-options__label">Set aside · Bombs: {turn.bombs} of {BUST_BOMBS}, the third one busts</span>
            <div className="party-chips">
              {turn.kept.length ? turn.kept.map((f, i) => <Chip key={i} icon={FACE[f].icon} label={FACE[f].label} variant={f === "bomb" ? "error" : "default"} />) : <span className="party-muted">Nothing yet</span>}
            </div>
          </div>

          {turn.bust ? (
            <>
              <p className="oddone__verdict">Third bomb. <strong>{names[player]}</strong> busts and loses this turn&apos;s points.</p>
              <Button variant="primary" onClick={passTurn}>Pass to {names[(player + 1) % names.length]}</Button>
            </>
          ) : (
            <>
              <div className="sd__row">
                <span className="party-options__label">This roll: tap the dice to keep</span>
                <div className="party-chips">
                  {turn.roll.map((f, i) => (
                    <Chip key={`${turn.kept.length}-${i}`} clickable selected={keep.includes(i)} variant={keep.includes(i) ? "primary" : "default"} icon={FACE[f].icon} label={FACE[f].label}
                      onClick={() => { setWarn(null); setKeep((k) => (k.includes(i) ? k.filter((x) => x !== i) : [...k, i])); }} />
                  ))}
                </div>
              </div>
              {warn && <p className="party-muted">{warn}</p>}
              <p className="party-muted">Banking now scores <strong>{value.points}</strong>{value.shells ? `, and ${value.shells} shell${value.shells === 1 ? "" : "s"} steal from the leader` : ""}. Kept so far is worth {facesPoints(turn.kept)}.</p>
              <span className="party-row">
                <Button variant="secondary" onClick={() => {
                  const next = keepAndRoll(turn, keep);
                  if (next === "keep_one") { setWarn("Keep at least one die before rolling again."); return; }
                  setTurn(next); setKeep([]);
                }}>Keep and roll</Button>
                <Button variant="primary" onClick={() => {
                  const next = bank(board, player, value);
                  setScores(next);
                  if (next[player] >= TARGET) { setWinner(player); setTurn(null); return; }
                  passTurn();
                }}>Bank {value.points}</Button>
              </span>
            </>
          )}
        </>
      )}
      {scores.length > 0 && winner === null && <Button variant="ghost" size="small" onClick={reset}>New game</Button>}
    </div>
  );
}
