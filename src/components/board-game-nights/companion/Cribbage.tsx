"use client";

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Cribbage scoreboard — a digital peg board. Race to 121; the skunk line sits at
 * 91 and the double-skunk line at 61. Add each hand's count as you peg. Players
 * come from the shared roster; scores keyed by player id, saved on the device.
 */

const TARGET = 121;
const SKUNK = 91;
const DOUBLE_SKUNK = 61;

interface CState { scores: Record<string, number> }
const INITIAL: CState = { scores: {} };

export function Cribbage() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<CState>("gs-bgn-cribbage", INITIAL);
  const [add, setAdd] = useState<Record<string, string>>({});
  const scores = state.scores ?? {};
  const scoreOf = (id: string) => scores[id] ?? 0;

  const winner = players.find((p) => scoreOf(p.id) >= TARGET) ?? null;

  const patch = (id: string, delta: number) =>
    setState((s) => ({ scores: { ...(s.scores ?? {}), [id]: Math.max(0, scoreOf(id) + delta) } }));
  const commitAdd = (id: string) => {
    const n = Number(add[id]);
    if (Number.isFinite(n) && n !== 0) patch(id, n);
    setAdd((a) => ({ ...a, [id]: "" }));
  };
  const reset = () => { if (window.confirm("Reset the cribbage board?")) setState({ scores: {} }); };

  const skunkNote = (id: string): string | null => {
    if (!winner || winner.id === id) return null;
    const s = scoreOf(id);
    if (s < DOUBLE_SKUNK) return "Double skunked";
    if (s < SKUNK) return "Skunked";
    return null;
  };

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      {winner && (
        <p className="bgn-crib__win">🏆 {winner.name} pegs out at {TARGET}!</p>
      )}

      <div className="bgn-crib__players">
        {players.map((p) => {
          const score = scoreOf(p.id);
          const pct = Math.min(100, (score / TARGET) * 100);
          const note = skunkNote(p.id);
          return (
            <div key={p.id} className="bgn-crib__player">
              <div className="bgn-crib__head">
                <span className="bgn-counter__name">{p.name}</span>
              </div>
              <div className="bgn-crib__score">
                {score}<span className="bgn-crib__target"> / {TARGET}</span>
                {note && <span className="bgn-crib__skunk"> · {note}</span>}
              </div>
              <div className="bgn-crib__track">
                <span className="bgn-crib__mark" style={{ left: `${(DOUBLE_SKUNK / TARGET) * 100}%` }} title="Double-skunk line (61)" />
                <span className="bgn-crib__mark" style={{ left: `${(SKUNK / TARGET) * 100}%` }} title="Skunk line (91)" />
                <span className="bgn-crib__fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="bgn-crib__add">
                <Input type="number" inputMode="numeric" value={add[p.id] ?? ""} placeholder="Hand" onChange={(e) => setAdd((a) => ({ ...a, [p.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitAdd(p.id); } }} aria-label={`Add points for ${p.name}`} />
                <Button variant="secondary" size="small" onClick={() => commitAdd(p.id)}>Add</Button>
                <Button variant="ghost" size="small" onClick={() => patch(p.id, 1)}>+1</Button>
                <Button variant="ghost" size="small" onClick={() => patch(p.id, -1)}>-1</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
