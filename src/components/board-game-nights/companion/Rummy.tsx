"use client";

import { Button, IconButton, Input } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Rummy scorecard — round scoring, first to the target (default 500) wins. Add a
 * round each hand and enter everyone's points; totals + the leader update live.
 * Players come from the shared roster; scores keyed by player id, saved on device.
 */

interface RState { rounds: Record<string, number>[]; target: number }
const INITIAL: RState = { rounds: [], target: 500 };

export function Rummy() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<RState>("gs-bgn-rummy", INITIAL);
  const target = state.target ?? 500;
  const rounds: Record<string, number>[] = (state.rounds ?? []).map((r) => (r && !Array.isArray(r) && typeof r === "object" ? r : {}));

  const addRound = () => setState((s) => ({ ...s, rounds: [...rounds, {}] }));
  const removeRound = (r: number) => setState((s) => ({ ...s, rounds: rounds.filter((_, i) => i !== r) }));
  const setCell = (r: number, id: string, v: number) =>
    setState((s) => ({ ...s, rounds: rounds.map((row, ri) => (ri === r ? { ...row, [id]: v } : row)) }));
  const reset = () => { if (window.confirm("Clear the Rummy card?")) setState((s) => ({ ...s, rounds: [] })); };

  const totals = players.map((pl) => rounds.reduce((sum, row) => sum + (row[pl.id] ?? 0), 0));
  const played = rounds.length > 0 && players.length > 0;
  const high = played ? Math.max(...totals) : null;
  const reached = played && high !== null && high >= target;

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="secondary" size="small" onClick={addRound}>Add round</Button>
          <label className="bgn-sheet__toggle">
            Target
            <span style={{ width: "5rem", display: "inline-block" }}>
              <Input type="number" value={target} onChange={(e) => setState((s) => ({ ...s, target: Math.max(1, Number(e.target.value) || 0) }))} aria-label="Target score" />
            </span>
          </label>
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      <p className="bgn-tools__hint">
        First to {target} wins.{reached && " Target reached — highest score takes it."}
      </p>

      <div className="bgn-sheet__scroll">
        <table className="bgn-sheet">
          <thead>
            <tr>
              <th className="bgn-sheet__rowlabel">Round</th>
              {players.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.length === 0 ? (
              <tr><td className="bgn-sheet__empty" colSpan={players.length + 1}>No rounds yet. Add a round after the first hand.</td></tr>
            ) : (
              rounds.map((row, r) => (
                <tr key={r}>
                  <td className="bgn-sheet__rowlabel">
                    <span className="bgn-sheet__roundnum">{r + 1}</span>
                    <IconButton variant="tertiary" size="small" className="bgn-sheet__x" aria-label={`Remove round ${r + 1}`} onClick={() => removeRound(r)}>×</IconButton>
                  </td>
                  {players.map((pl) => (
                    <td key={pl.id}>
                      <input className="bgn-sheet__cell" type="number" inputMode="numeric" value={row[pl.id] ?? 0}
                        onChange={(e) => setCell(r, pl.id, e.target.value === "" ? 0 : Number(e.target.value))} aria-label={`Round ${r + 1}, ${pl.name}`} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="bgn-sheet__rowlabel">Total</td>
              {totals.map((t, p) => (
                <td key={players[p].id} className={`bgn-sheet__total${played && t === high ? " bgn-sheet__total--best" : ""}`}>
                  {t}{played && t === high && <span className="bgn-sheet__crown"> 👑</span>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
