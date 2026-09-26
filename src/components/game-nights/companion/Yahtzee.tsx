"use client";

import { Button, IconButton } from "@empac/cascadeds";
import { useLocalState } from "@/lib/game-nights/companion/useLocalState";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { RosterEmpty } from "@/components/game-nights/companion/RosterEmpty";

type Cat = { id: string; label: string; hint?: string; fixed?: number };

const UPPER: Cat[] = [
  { id: "ones", label: "Aces", hint: "sum of 1s" },
  { id: "twos", label: "Twos", hint: "sum of 2s" },
  { id: "threes", label: "Threes", hint: "sum of 3s" },
  { id: "fours", label: "Fours", hint: "sum of 4s" },
  { id: "fives", label: "Fives", hint: "sum of 5s" },
  { id: "sixes", label: "Sixes", hint: "sum of 6s" },
];
const LOWER: Cat[] = [
  { id: "threeKind", label: "3 of a kind", hint: "sum of all dice" },
  { id: "fourKind", label: "4 of a kind", hint: "sum of all dice" },
  { id: "fullHouse", label: "Full house", hint: "25", fixed: 25 },
  { id: "smStraight", label: "Sm. straight", hint: "30", fixed: 30 },
  { id: "lgStraight", label: "Lg. straight", hint: "40", fixed: 40 },
  { id: "yahtzee", label: "Yahtzee", hint: "50", fixed: 50 },
  { id: "chance", label: "Chance", hint: "sum of all dice" },
];

// Each extra Yahtzee after the first scores this many bonus points.
const YAHTZEE_BONUS = 100;
const BONUS_KEY = "_yBonus"; // stored per-player as a count of extra Yahtzees

type Scores = Record<string, number | null>;
interface YState { scores: Record<string, Scores> } // scores[playerId]
const INITIAL: YState = { scores: {} };

const sumCats = (s: Scores, cats: Cat[]) => cats.reduce((t, c) => t + (s[c.id] ?? 0), 0);

export function Yahtzee() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<YState>("gs-bgn-yahtzee", INITIAL);
  const scores = state.scores ?? {};
  const scoreOf = (id: string): Scores => scores[id] ?? {};

  const setCell = (id: string, catId: string, v: number | null) =>
    setState((s) => ({ ...s, scores: { ...(s.scores ?? {}), [id]: { ...scoreOf(id), [catId]: v } } }));
  // Fixed categories cycle: blank -> scored (fixed) -> scratched (0) -> blank.
  const cycleFixed = (id: string, cat: Cat) =>
    setState((s) => {
      const cur = scoreOf(id)[cat.id];
      const next = cur == null ? cat.fixed! : cur > 0 ? 0 : null;
      return { ...s, scores: { ...(s.scores ?? {}), [id]: { ...scoreOf(id), [cat.id]: next } } };
    });
  const bumpBonus = (id: string, delta: number) =>
    setState((s) => ({
      ...s,
      scores: { ...(s.scores ?? {}), [id]: { ...scoreOf(id), [BONUS_KEY]: Math.max(0, (scoreOf(id)[BONUS_KEY] ?? 0) + delta) } },
    }));
  const reset = () => { if (window.confirm("Clear the scorecard?")) setState(INITIAL); };

  const derived = players.map((pl) => {
    const sc = scoreOf(pl.id);
    const upperSub = sumCats(sc, UPPER);
    const bonus = upperSub >= 63 ? 35 : 0;
    const upperTotal = upperSub + bonus;
    const bonusCount = sc[BONUS_KEY] ?? 0;
    const bonusPoints = bonusCount * YAHTZEE_BONUS;
    const lowerTotal = sumCats(sc, LOWER) + bonusPoints;
    return { upperSub, bonus, upperTotal, lowerTotal, bonusCount, grand: upperTotal + lowerTotal };
  });
  const grands = derived.map((d) => d.grand);
  const anyScore = players.some((pl) => Object.values(scoreOf(pl.id)).some((v) => v != null));
  const best = anyScore ? Math.max(...grands) : null;

  const numberCell = (pl: { id: string; name: string }, cat: Cat) => (
    <td key={cat.id}>
      <input
        className="bgn-sheet__cell"
        type="number"
        inputMode="numeric"
        value={scoreOf(pl.id)[cat.id] ?? ""}
        placeholder={cat.hint}
        onChange={(e) => setCell(pl.id, cat.id, e.target.value === "" ? null : Number(e.target.value))}
        aria-label={`${cat.label}, ${pl.name}`}
      />
    </td>
  );

  const fixedCell = (pl: { id: string; name: string }, cat: Cat) => {
    const v = scoreOf(pl.id)[cat.id];
    const color = v == null ? undefined : v > 0 ? "var(--success-600, #0f7a0a)" : "var(--text-tertiary)";
    const glyph = v == null ? " " : v > 0 ? `✓ ${cat.fixed}` : "✗";
    return (
      <td key={cat.id}>
        <Button
          variant="ghost"
          size="small"
          className="bgn-sheet__fixed"
          onClick={() => cycleFixed(pl.id, cat)}
          aria-label={`${cat.label}, ${pl.name}: ${v == null ? "not taken" : v > 0 ? "scored" : "scratched"}`}
        >
          <span style={{ color }}>{glyph}</span>
        </Button>
      </td>
    );
  };

  const cell = (pl: { id: string; name: string }, cat: Cat) => (cat.fixed ? fixedCell(pl, cat) : numberCell(pl, cat));

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>

      <div className="bgn-sheet__scroll">
        <table className="bgn-sheet bgn-sheet--yahtzee">
          <thead>
            <tr>
              <th className="bgn-sheet__rowlabel">Category</th>
              {players.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bgn-sheet__section"><td colSpan={players.length + 1}>Upper section</td></tr>
            {UPPER.map((cat) => (
              <tr key={cat.id}>
                <td className="bgn-sheet__rowlabel">{cat.label} <span className="bgn-sheet__hint">{cat.hint}</span></td>
                {players.map((pl) => cell(pl, cat))}
              </tr>
            ))}
            <tr className="bgn-sheet__subtotal">
              <td className="bgn-sheet__rowlabel">Bonus (63+ → 35)</td>
              {derived.map((d, p) => <td key={players[p].id} className="bgn-sheet__total">{d.bonus ? "+35" : `${d.upperSub}/63`}</td>)}
            </tr>

            <tr className="bgn-sheet__section"><td colSpan={players.length + 1}>Lower section</td></tr>
            {LOWER.map((cat) => (
              <tr key={cat.id}>
                <td className="bgn-sheet__rowlabel">{cat.label} <span className="bgn-sheet__hint">{cat.hint}</span></td>
                {players.map((pl) => cell(pl, cat))}
              </tr>
            ))}
            <tr>
              <td className="bgn-sheet__rowlabel">Extra Yahtzees <span className="bgn-sheet__hint">+100 each</span></td>
              {derived.map((d, p) => (
                <td key={players[p].id}>
                  <div className="bgn-sheet__stepper">
                    <IconButton variant="secondary" size="small" onClick={() => bumpBonus(players[p].id, -1)} disabled={d.bonusCount === 0} aria-label={`Remove extra Yahtzee, ${players[p].name}`}>−</IconButton>
                    <span>{d.bonusCount}</span>
                    <IconButton variant="secondary" size="small" onClick={() => bumpBonus(players[p].id, 1)} aria-label={`Add extra Yahtzee, ${players[p].name}`}>+</IconButton>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="bgn-sheet__rowlabel">Total</td>
              {grands.map((g, p) => (
                <td key={players[p].id} className={`bgn-sheet__total${anyScore && g === best ? " bgn-sheet__total--best" : ""}`}>
                  {g}{anyScore && g === best && <span className="bgn-sheet__crown"> 👑</span>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
