"use client";

import { Button, IconButton, Select } from "@empac/cascadeds";
import { useLocalState } from "@/lib/game-nights/companion/useLocalState";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { RosterEmpty } from "@/components/game-nights/companion/RosterEmpty";

/**
 * Hearts scorecard — round scoring, lowest total wins, game ends when someone
 * hits 100. Each hand distributes 26 points; the "🌙" per-round control does
 * shoot-the-moon for you (26 to everyone else, 0 to the shooter). Players come
 * from the shared roster; scores are keyed by player id and saved on the device.
 */

const GAME_END = 100;
const HAND_POINTS = 26;

interface HState { rounds: Record<string, number>[] }
const INITIAL: HState = { rounds: [] };

export function Hearts() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<HState>("gs-bgn-hearts", INITIAL);
  const rounds: Record<string, number>[] = (state.rounds ?? []).map((r) => (r && !Array.isArray(r) && typeof r === "object" ? r : {}));

  const addRound = () => setState(() => ({ rounds: [...rounds, {}] }));
  const removeRound = (r: number) => setState(() => ({ rounds: rounds.filter((_, i) => i !== r) }));
  const setCell = (r: number, id: string, v: number) =>
    setState(() => ({ rounds: rounds.map((row, ri) => (ri === r ? { ...row, [id]: v } : row)) }));
  const shootMoon = (r: number, shooterId: string) =>
    setState(() => ({
      rounds: rounds.map((row, ri) =>
        ri === r ? Object.fromEntries(players.map((pl) => [pl.id, pl.id === shooterId ? 0 : HAND_POINTS])) : row,
      ),
    }));
  const reset = () => { if (window.confirm("Clear the Hearts scorecard?")) setState({ rounds: [] }); };

  const totals = players.map((pl) => rounds.reduce((sum, row) => sum + (row[pl.id] ?? 0), 0));
  const played = rounds.length > 0 && players.length > 0;
  const low = played ? Math.min(...totals) : null;
  const gameOver = played && Math.max(...totals) >= GAME_END;

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="secondary" size="small" onClick={addRound}>Add round</Button>
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      <p className="bgn-tools__hint">
        Each hand is 26 points. Lowest score wins; the game ends when someone reaches {GAME_END}.
        {gameOver && " Game over."}
      </p>

      <div className="bgn-sheet__scroll">
        <table className="bgn-sheet">
          <thead>
            <tr>
              <th className="bgn-sheet__rowlabel">Round</th>
              {players.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
              <th className="bgn-sheet__rowlabel">🌙</th>
            </tr>
          </thead>
          <tbody>
            {rounds.length === 0 ? (
              <tr><td className="bgn-sheet__empty" colSpan={players.length + 2}>No rounds yet. Add a round after the first hand.</td></tr>
            ) : (
              rounds.map((row, r) => {
                const sum = players.reduce((a, pl) => a + (row[pl.id] ?? 0), 0);
                const off = sum !== HAND_POINTS && sum !== 0;
                return (
                  <tr key={r}>
                    <td className="bgn-sheet__rowlabel">
                      <span className="bgn-sheet__roundnum">{r + 1}</span>
                      <span className={off ? "bgn-hearts__sum bgn-hearts__sum--off" : "bgn-hearts__sum"}>({sum})</span>
                      <IconButton variant="tertiary" size="small" className="bgn-sheet__x" aria-label={`Remove round ${r + 1}`} onClick={() => removeRound(r)}>×</IconButton>
                    </td>
                    {players.map((pl) => (
                      <td key={pl.id}>
                        <input className="bgn-sheet__cell" type="number" inputMode="numeric" value={row[pl.id] ?? 0}
                          onChange={(e) => setCell(r, pl.id, e.target.value === "" ? 0 : Number(e.target.value))} aria-label={`Round ${r + 1}, ${pl.name}`} />
                      </td>
                    ))}
                    <td>
                      <Select
                        value=""
                        onChange={(v) => { if (v !== "") shootMoon(r, String(v)); }}
                        placeholder="—"
                        size="small"
                        aria-label={`Shoot the moon, round ${r + 1}`}
                        options={players.map((pl) => ({ value: pl.id, label: pl.name }))}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="bgn-sheet__rowlabel">Total</td>
              {totals.map((t, p) => (
                <td key={players[p].id} className={`bgn-sheet__total${played && t === low ? " bgn-sheet__total--best" : ""}`}>
                  {t}{played && t === low && <span className="bgn-sheet__crown"> 👑</span>}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
