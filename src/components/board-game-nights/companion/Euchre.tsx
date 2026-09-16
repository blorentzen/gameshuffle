"use client";

import { Button } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";

/**
 * Euchre scoreboard — two teams race to 10. Quick buttons cover the usual scores:
 * +1 (made it), +2 (march / euchre), +4 (alone march). Saved on the device.
 */

const TARGET = 10;
interface Team { name: string; score: number }
interface EState { teams: Team[] }
const INITIAL: EState = { teams: [{ name: "Us", score: 0 }, { name: "Them", score: 0 }] };
const QUICK = [1, 2, 4];

export function Euchre() {
  const [state, setState] = useLocalState<EState>("gs-bgn-euchre", INITIAL);
  const { teams } = state;

  const winnerIdx = teams.findIndex((t) => t.score >= TARGET);
  const hasWinner = winnerIdx >= 0;

  const bump = (i: number, delta: number) =>
    setState((s) => ({ teams: s.teams.map((t, idx) => (idx === i ? { ...t, score: Math.max(0, t.score + delta) } : t)) }));
  const setName = (i: number, name: string) =>
    setState((s) => ({ teams: s.teams.map((t, idx) => (idx === i ? { ...t, name } : t)) }));
  const reset = () => { if (window.confirm("Reset the Euchre board?")) setState((s) => ({ teams: s.teams.map((t) => ({ ...t, score: 0 })) })); };

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      {hasWinner && <p className="bgn-crib__win">🏆 {teams[winnerIdx].name} win, first to {TARGET}!</p>}

      <div className="bgn-crib__players">
        {teams.map((t, i) => {
          const pct = Math.min(100, (t.score / TARGET) * 100);
          return (
            <div key={i} className="bgn-crib__player">
              <div className="bgn-crib__head">
                <input className="bgn-sheet__nameinput" style={{ textAlign: "left" }} value={t.name} onChange={(e) => setName(i, e.target.value)} aria-label={`Team ${i + 1} name`} />
              </div>
              <div className="bgn-crib__score">{t.score}<span className="bgn-crib__target"> / {TARGET}</span></div>
              <div className="bgn-crib__track"><span className="bgn-crib__fill" style={{ width: `${pct}%` }} /></div>
              <div className="bgn-farkle__quick" style={{ justifyContent: "flex-start" }}>
                {QUICK.map((q) => (
                  <Button key={q} variant="secondary" size="small" onClick={() => bump(i, q)}>+{q}</Button>
                ))}
                <Button variant="ghost" size="small" onClick={() => bump(i, -1)}>-1</Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="bgn-tools__hint" style={{ marginTop: "var(--spacing-12)" }}>
        +1 made the call · +2 march or euchre · +4 alone march. First team to {TARGET} wins.
      </p>
    </div>
  );
}
