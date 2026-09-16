"use client";

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Farkle scoreboard — bank each turn's points and race to the target (10,000 by
 * default). Once someone crosses it, everyone gets one more turn (final round);
 * the highest score then wins. Quick buttons for common Farkle values. Players
 * come from the shared roster; scores keyed by player id, saved on the device.
 */

interface FState { scores: Record<string, number>; target: number }
const INITIAL: FState = { scores: {}, target: 10000 };
const QUICK = [50, 100, 500, 1000];

export function Farkle() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<FState>("gs-bgn-farkle", INITIAL);
  const [add, setAdd] = useState<Record<string, string>>({});
  const target = state.target ?? 10000;
  const scores = state.scores ?? {};
  const scoreOf = (id: string) => scores[id] ?? 0;

  const leaderScore = players.length ? Math.max(...players.map((p) => scoreOf(p.id))) : 0;
  const finalRound = leaderScore >= target && players.length > 0;

  const bump = (id: string, delta: number) =>
    setState((s) => ({ ...s, scores: { ...(s.scores ?? {}), [id]: Math.max(0, scoreOf(id) + delta) } }));
  const commitAdd = (id: string) => {
    const n = Number(add[id]);
    if (Number.isFinite(n) && n !== 0) bump(id, n);
    setAdd((a) => ({ ...a, [id]: "" }));
  };
  const reset = () => { if (window.confirm("Reset the Farkle board?")) setState((s) => ({ ...s, scores: {} })); };

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <label className="bgn-sheet__toggle">
            Target
            <span style={{ width: "6rem", display: "inline-block" }}>
              <Input type="number" value={target} onChange={(e) => setState((s) => ({ ...s, target: Math.max(1, Number(e.target.value) || 0) }))} aria-label="Target score" />
            </span>
          </label>
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      {finalRound && (
        <p className="bgn-crib__win">🎲 {target.toLocaleString()} reached — final round! Everyone gets one more turn; highest score wins.</p>
      )}

      <div className="bgn-counters">
        {players.map((p) => {
          const score = scoreOf(p.id);
          return (
            <div key={p.id} className={`bgn-counter${finalRound && score === leaderScore ? " bgn-counter--leader" : ""}`} style={{ borderTopColor: "var(--bg-primary)" }}>
              <div className="bgn-counter__head">
                <span className="bgn-counter__name">{p.name}</span>
              </div>
              <div className="bgn-counter__value">{score.toLocaleString()}</div>
              <div className="bgn-farkle__quick">
                {QUICK.map((q) => (
                  <Button key={q} variant="ghost" size="small" onClick={() => bump(p.id, q)}>+{q}</Button>
                ))}
              </div>
              <div className="bgn-crib__add">
                <Input type="number" inputMode="numeric" value={add[p.id] ?? ""} placeholder="Turn" onChange={(e) => setAdd((a) => ({ ...a, [p.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitAdd(p.id); } }} aria-label={`Add turn score for ${p.name}`} />
                <Button variant="secondary" size="small" onClick={() => commitAdd(p.id)}>Bank</Button>
                <Button variant="ghost" size="small" onClick={() => setAdd((a) => ({ ...a, [p.id]: "" }))}>Farkle</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
