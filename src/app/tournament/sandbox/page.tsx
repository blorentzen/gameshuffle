"use client";

/**
 * Tournament sandbox — a public, no-login, end-to-end walkthrough of the real
 * tournament lifecycle for marketing: Set up → Manage → Run → Results. Runs the
 * actual bracket + scoring engines on a local sample field, so a visitor can
 * click through the whole experience — configure, review registrations, seed,
 * play it out, and see the champion + standings — then create their own.
 * Ephemeral client state; no database.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Container, Button, Input } from "@empac/cascadeds";
import {
  generateSingleElim,
  generateDoubleElim,
  reportWinner,
  bracketChampion,
  computeBracketPlacements,
  isPowerOf2,
  type Bracket,
} from "@/lib/tournaments/bracket";
import { DEFAULT_SCORING_TABLE } from "@/lib/tournaments/scoring";
import {
  generateHeatMains,
  reportHeatResult,
  reportMainResult,
  heatMainsStandings,
  heatMainsStage,
  nextMainTier,
  type HeatMains,
  type HRace,
} from "@/lib/tournaments/heatMains";
import { BracketView } from "@/components/tournament/BracketView";

type Mode = "single_elim" | "double_elim" | "points" | "heat_mains";
type PStatus = "confirmed" | "registered" | "declined";
interface P { id: string; name: string; status: PStatus }

const START_ROSTER: P[] = [
  { id: "aria", name: "Aria", status: "confirmed" },
  { id: "bolt", name: "Bolt", status: "confirmed" },
  { id: "cypher", name: "Cypher", status: "confirmed" },
  { id: "dash", name: "Dash", status: "confirmed" },
  { id: "echo", name: "Echo", status: "confirmed" },
  { id: "fjord", name: "Fjord", status: "confirmed" },
  { id: "glyph", name: "Glyph", status: "confirmed" },
  { id: "hex", name: "Hex", status: "confirmed" },
  { id: "ion", name: "Ion", status: "confirmed" },
  { id: "jinx", name: "Jinx", status: "confirmed" },
  { id: "koda", name: "Koda", status: "confirmed" },
  { id: "lux", name: "Lux", status: "confirmed" },
  { id: "mako", name: "Mako", status: "confirmed" },
  { id: "nova", name: "Nova", status: "confirmed" },
  { id: "orbit", name: "Orbit", status: "confirmed" },
  { id: "pixel", name: "Pixel", status: "confirmed" },
  { id: "quill", name: "Quill", status: "registered" }, // pending — visitor reviews
  { id: "raze", name: "Raze", status: "registered" },
];

const MODES: { id: Mode; label: string }[] = [
  { id: "single_elim", label: "Single Elim" },
  { id: "double_elim", label: "Double Elim" },
  { id: "points", label: "Points / Standings" },
  { id: "heat_mains", label: "Heat → Mains ★" },
];
const GAMES = [
  { id: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe" },
  { id: "mario-kart-world", label: "Mario Kart World" },
];
const STAGES = ["Set up", "Manage", "Run", "Results"];

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A race in the sandbox points mode: entered either as finishing places
// (positions → points via the scoring table, like the real manage page) or as a
// direct points tally.
interface SbRace { id: string; byPoints: boolean; entries: Record<string, number> }

interface SbStanding { id: string; name: string; points: number; played: number; wins: number; avg: number | null }

function sbStandings(races: SbRace[], scoringTable: number[], drivers: { id: string; name: string }[]): SbStanding[] {
  return drivers
    .map((d) => {
      let points = 0, played = 0, wins = 0, posSum = 0, posCount = 0;
      for (const r of races) {
        const v = r.entries[d.id];
        if (v == null) continue;
        played += 1;
        if (r.byPoints) {
          points += v;
        } else {
          points += scoringTable[v - 1] ?? 0;
          posSum += v;
          posCount += 1;
          if (v === 1) wins += 1;
        }
      }
      return { id: d.id, name: d.name, points, played, wins, avg: posCount ? posSum / posCount : null };
    })
    .filter((s) => s.played > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || (a.avg ?? 99) - (b.avg ?? 99));
}

export default function TournamentSandboxPage() {
  const [stage, setStage] = useState(0);
  const [game, setGame] = useState(GAMES[0].id);
  const [format, setFormat] = useState<Mode>("single_elim");
  const [roster, setRoster] = useState<P[]>(START_ROSTER);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [sbRaces, setSbRaces] = useState<SbRace[]>([]);
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [entryByPoints, setEntryByPoints] = useState(false);
  const [hm, setHm] = useState<HeatMains | null>(null);
  const [series, setSeries] = useState(2);
  const [newPlayer, setNewPlayer] = useState("");
  const idRef = useRef(1);

  const confirmed = roster.filter((p) => p.status === "confirmed");
  const pending = roster.filter((p) => p.status === "registered");
  const active = roster.filter((p) => p.status !== "declined");
  const nameOf = (id: string | null) => roster.find((p) => p.id === id)?.name ?? "TBD";

  const setStatus = (id: string, status: PStatus) =>
    setRoster((r) => r.map((p) => (p.id === id ? { ...p, status } : p)));
  const acceptAll = () => setRoster((r) => r.map((p) => (p.status === "registered" ? { ...p, status: "confirmed" } : p)));
  const addPlayer = () => {
    const name = newPlayer.trim() || `Player ${active.length + 1}`;
    setRoster((r) => [...r, { id: `p${idRef.current++}`, name, status: "confirmed" }]);
    setNewPlayer("");
  };
  const removePlayer = (id: string) => setRoster((r) => r.filter((p) => p.id !== id));

  const isBracket = format === "single_elim" || format === "double_elim";
  const isHeatMains = format === "heat_mains";
  const canSeedDouble = format !== "double_elim" || isPowerOf2(confirmed.length);

  const seed = () => {
    const ids = confirmed.map((p) => p.id);
    if (ids.length < 2) return;
    if (isHeatMains) {
      setHm(generateHeatMains(ids, { series }));
    } else {
      setBracket(format === "double_elim" ? generateDoubleElim(ids) : generateSingleElim(ids));
    }
    setSbRaces([]);
  };

  // Simulate the current phase (fills the un-run races with random orders).
  const runHeatMainsStep = () => {
    if (!hm) return;
    const st = heatMainsStage(hm);
    if (st === "heats") {
      let next = hm;
      for (const h of next.heats) if (!h.results) next = reportHeatResult(next, h.id, shuffle(h.drivers));
      setHm(next);
    } else if (st === "mains") {
      const t = nextMainTier(hm);
      if (t != null) setHm(reportMainResult(hm, t, shuffle(hm.mains[t].drivers)));
    }
  };

  const resetRun = () => {
    if (isBracket) seed();
    else setSbRaces([]);
  };

  const autoPlay = () => {
    if (!bracket) return;
    let b = bracket;
    for (let guard = 0; guard < 300; guard++) {
      const m = b.matches.find((x) => x.a && x.b && !x.winner);
      if (!m) break;
      b = reportWinner(b, m.id, Math.random() < 0.5 ? m.a! : m.b!);
    }
    setBracket(b);
  };

  // Randomize a race's finishing order (convenience).
  const simulateRace = () => {
    const order = shuffle(confirmed.map((p) => p.id));
    const entries: Record<string, number> = {};
    order.forEach((id, i) => (entries[id] = i + 1));
    setSbRaces((prev) => [...prev, { id: `r${prev.length + 1}`, byPoints: false, entries }]);
  };

  // Add a race from the manual entry inputs (places or a points tally).
  const addRace = () => {
    const entries: Record<string, number> = {};
    for (const [id, val] of Object.entries(entry)) {
      const n = Number(val);
      if (val !== "" && Number.isFinite(n) && n >= 0) entries[id] = n;
    }
    if (Object.keys(entries).length === 0) return;
    setSbRaces((prev) => [...prev, { id: `r${prev.length + 1}`, byPoints: entryByPoints, entries }]);
    setEntry({});
  };

  const pointsStandings = useMemo(
    () => sbStandings(sbRaces, DEFAULT_SCORING_TABLE, confirmed.map((p) => ({ id: p.id, name: p.name }))),
    [confirmed, sbRaces],
  );

  const goRun = () => {
    if (isBracket && !bracket) seed();
    if (isHeatMains && !hm) seed();
    setStage(2);
  };

  const finalPlacements = useMemo(() => {
    if (isBracket && bracket) {
      return computeBracketPlacements(bracket).map((r) => ({ ...r, name: nameOf(r.participantId) }));
    }
    if (isHeatMains && hm) {
      return heatMainsStandings(hm).map((r) => ({ ...r, name: nameOf(r.participantId) }));
    }
    return pointsStandings.map((s, i) => ({ participantId: s.id, placement: i + 1, name: s.name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracket, hm, pointsStandings, isBracket, isHeatMains]);

  const champ = finalPlacements[0]?.participantId ?? (isBracket && bracket ? bracketChampion(bracket) : null);
  // Inner tiles sit on white panels, so give them a subtle tint to stay distinct.
  const cardBase: React.CSSProperties = { background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", border: "1px solid var(--border-default)" };
  // Grounded section panels — a clean surface fill + border, sitting on a
  // subtly darker page (below) so they don't float on a same-color background.
  const panel: React.CSSProperties = { marginBottom: "1.5rem", background: "var(--surface-default)", border: "1px solid var(--border-default)" };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem", minHeight: "100vh", background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      <Container>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <span className="marketing-eyebrow">Interactive demo</span>
          <h1 style={{ fontSize: "var(--font-size-32)", fontWeight: 700, margin: "0.5rem 0 0.75rem" }}>Tournament sandbox</h1>
          <p style={{ fontSize: "var(--font-size-16)", color: "var(--text-secondary)", maxWidth: 660, marginBottom: "1.5rem" }}>
            Walk through a whole tournament — set it up, review registrations, seed it, run it, and see the results — with a sample field you can add to or trim. No account needed; this is the exact engine GameShuffle uses.
          </p>

          {/* Stepper */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {STAGES.map((s, i) => (
              <button
                key={s}
                onClick={() => setStage(i)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.8rem", borderRadius: 999,
                  border: `1px solid ${i === stage ? "var(--bg-primary, var(--primary-500))" : "var(--border-default)"}`,
                  background: i === stage ? "var(--bg-primary, var(--primary-500))" : "var(--surface-raised, var(--surface-default))",
                  color: i === stage ? "var(--text-on-primary, #fff)" : "var(--text-secondary)",
                  fontWeight: 600, fontSize: "var(--font-size-14)", cursor: "pointer",
                }}
              >
                <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: 999, alignItems: "center", justifyContent: "center", fontSize: "var(--font-size-12)", background: i === stage ? "rgba(255,255,255,0.25)" : "var(--border-default)" }}>{i + 1}</span>
                {s}
              </button>
            ))}
          </div>

          {/* STAGE 0 — Set up */}
          {stage === 0 && (
            <div className="comp-card" style={panel}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>1. Set up your tournament</h2>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>Pick a game and a format. In the real builder you&apos;d also set tracks, item rules, and build restrictions.</p>
              <div style={{ marginBottom: "1.25rem" }}>
                <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>Game</div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {GAMES.map((g) => <Button key={g.id} variant={game === g.id ? "primary" : "secondary"} size="small" onClick={() => setGame(g.id)}>{g.label}</Button>)}
                </div>
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>Format</div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {MODES.map((m) => <Button key={m.id} variant={format === m.id ? "primary" : "secondary"} size="small" onClick={() => { setFormat(m.id); setBracket(null); setHm(null); setSbRaces([]); }}>{m.label}</Button>)}
                </div>
                {format === "heat_mains" && (
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                    ★ New: a sprint-car-style ladder — race heats, win to lock the A Main, and the top finishers in the B Main transfer up. A way back from a bad start.
                  </p>
                )}
              </div>
              <Button variant="primary" onClick={() => setStage(1)}>Next: Manage registrations →</Button>
            </div>
          )}

          {/* STAGE 1 — Manage */}
          {stage === 1 && (
            <div className="comp-card" style={panel}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>2. Manage the field</h2>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>Add players, accept or decline registrations, and drop anyone. Only confirmed players get seeded — build the field however you like.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                {[["Total", active.length], ["Pending", pending.length], ["Confirmed", confirmed.length]].map(([l, v]) => (
                  <div key={l as string} style={{ ...cardBase, padding: "0.85rem 1rem", borderRadius: "0.5rem", textAlign: "center" }}>
                    <div style={{ fontSize: "var(--font-size-24)", fontWeight: 700 }}>{v as number}</div>
                    <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{l as string}</div>
                  </div>
                ))}
              </div>

              {/* Add a player */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <Input type="text" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPlayer(); }} placeholder="Add a player by name…" style={{ flex: 1 }} />
                <Button variant="secondary" size="small" onClick={addPlayer}>Add player</Button>
              </div>

              {/* Roster — accept/decline pending, remove anyone */}
              <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="account-card__label">Field ({active.length})</span>
                {pending.length > 0 && <Button variant="ghost" size="small" onClick={acceptAll}>Accept all pending</Button>}
              </div>
              {active.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>No players yet — add some above.</p>
              ) : (
                <div style={{ ...cardBase, borderRadius: "0.5rem", overflow: "hidden" }}>
                  {active.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--font-size-14)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ fontSize: "var(--font-size-12)", fontWeight: 600, padding: "0.05rem 0.4rem", borderRadius: 999, color: p.status === "confirmed" ? "var(--success-700, #17a710)" : "var(--warning-700, #b26b00)", background: "var(--surface-default)", border: "1px solid var(--border-default)" }}>{p.status === "confirmed" ? "Confirmed" : "Pending"}</span>
                      </span>
                      <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                        {p.status === "registered" && <Button variant="primary" size="small" onClick={() => setStatus(p.id, "confirmed")}>Accept</Button>}
                        <Button variant="ghost" size="small" onClick={() => removePlayer(p.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isBracket && !canSeedDouble && (
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--warning-700)", marginTop: "1rem" }}>Double elim needs a power-of-2 field (4, 8…). Accept both pending players to reach 8.</p>
              )}
              <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
                <Button variant="ghost" onClick={() => setStage(0)}>← Back</Button>
                <Button variant="primary" disabled={confirmed.length < 2 || !canSeedDouble} onClick={goRun}>Next: Run it →</Button>
              </div>
            </div>
          )}

          {/* STAGE 2 — Run */}
          {stage === 2 && (
            <div className="comp-card" style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)", margin: 0 }}>
                  3. {format === "points" ? "Score the races" : isHeatMains ? "Run the heats & mains" : "Run the bracket"}
                </h2>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {isHeatMains ? (
                    <>
                      {hm && heatMainsStage(hm) === "heats" && !hm.heats.some((h) => h.results) && (
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                          Heat series
                          <select value={series} onChange={(e) => { const s = Number(e.target.value); setSeries(s); setHm(generateHeatMains(confirmed.map((p) => p.id), { series: s })); }} style={{ height: 28, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 4px", background: "var(--surface-default)", color: "var(--text-primary)" }}>
                            <option value={1}>1 round</option>
                            <option value={2}>2 rounds</option>
                          </select>
                        </label>
                      )}
                      <Button variant="secondary" size="small" onClick={runHeatMainsStep} disabled={!hm || heatMainsStage(hm) === "complete"}>
                        {!hm || heatMainsStage(hm) === "heats" ? "Simulate heats" : `Simulate ${hm.mains[nextMainTier(hm) ?? 0]?.label ?? "main"}`}
                      </Button>
                      <Button variant="ghost" size="small" onClick={seed}>Reset</Button>
                    </>
                  ) : format === "points" ? (
                    <>
                      <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
                        {[["place", "By place"], ["points", "By points"]].map(([v, l]) => (
                          <button key={v} onClick={() => setEntryByPoints(v === "points")}
                            style={{ padding: "0.3rem 0.6rem", border: "none", cursor: "pointer", fontSize: "var(--font-size-12)", fontWeight: 600,
                              background: (entryByPoints ? "points" : "place") === v ? "var(--bg-primary, var(--primary-500))" : "var(--surface-default)",
                              color: (entryByPoints ? "points" : "place") === v ? "var(--text-on-primary, #fff)" : "var(--text-secondary)" }}>{l}</button>
                        ))}
                      </div>
                      <Button variant="secondary" size="small" onClick={simulateRace}>Simulate</Button>
                      {sbRaces.length > 0 && <Button variant="ghost" size="small" onClick={() => setSbRaces([])}>Reset</Button>}
                    </>
                  ) : (
                    <><Button variant="secondary" size="small" onClick={autoPlay}>Auto-play</Button><Button variant="ghost" size="small" onClick={resetRun}>Reset</Button></>
                  )}
                </div>
              </div>
              {isHeatMains ? (
                hm ? (
                  <>
                    <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>Call each race live — tap drivers in the order they finish. Win a heat and you&apos;re locked into the A Main; everyone else is seeded by total heat points. Each main seats {hm.mainSeedSize}, and the top {hm.transfer} of every main transfer up to the one above. Already confirmed a race? <strong>Edit</strong> it to fix an order or DQ a driver.</p>
                    <HeatMainsView hm={hm} nameOf={nameOf}
                      onReportHeat={(heatId, order, dq) => setHm((h) => (h ? reportHeatResult(h, heatId, order, dq) : h))}
                      onReportMain={(tier, order, dq) => setHm((h) => (h ? reportMainResult(h, tier, order, dq) : h))} />
                  </>
                ) : <p style={{ color: "var(--text-tertiary)" }}>Seed from the Manage step.</p>
              ) : format === "points" ? (
                <div>
                  {/* Manual race entry — enter each driver's finishing place, or a points tally. */}
                  <div style={{ ...cardBase, borderRadius: "0.5rem", padding: "0.85rem 1rem", marginBottom: "1.25rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-size-14)", marginBottom: "0.65rem" }}>
                      Enter race {sbRaces.length + 1} — {entryByPoints ? "points per driver" : "finishing place (1 = win)"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      {confirmed.map((p) => (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-14)" }}>
                          <input type="number" min={entryByPoints ? 0 : 1} value={entry[p.id] ?? ""} placeholder={entryByPoints ? "pts" : "pos"}
                            onChange={(e) => setEntry((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            style={{ width: 52, height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 6px", textAlign: "center", background: "var(--surface-default)", color: "var(--text-primary)" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        </label>
                      ))}
                    </div>
                    <Button variant="primary" size="small" onClick={addRace} disabled={Object.values(entry).every((v) => !v)}>Add race {sbRaces.length + 1}</Button>
                  </div>
                  {sbRaces.length === 0 ? (
                    <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Enter a race above (or <strong>Simulate</strong>) and the standings evaluate live.</p>
                  ) : (
                    <>
                      <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>Standings · {sbRaces.length} race{sbRaces.length === 1 ? "" : "s"}</div>
                      <StandingsList rows={pointsStandings.map((s, i) => ({ id: s.id, rank: i + 1, name: s.name, meta: s.avg != null ? `${s.wins}W · avg ${s.avg.toFixed(1)}` : "", points: s.points }))} />
                    </>
                  )}
                </div>
              ) : bracket ? (
                <div>
                  <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>Click a name to advance them, or enter a match score and the higher advances.</p>
                  <BracketView bracket={bracket} nameOf={nameOf} allowScores onReport={(matchId, winnerId) => setBracket((b) => (b ? reportWinner(b, matchId, winnerId) : b))} />
                </div>
              ) : <p style={{ color: "var(--text-tertiary)" }}>Seed the bracket from the Manage step.</p>}
              <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
                <Button variant="ghost" onClick={() => setStage(1)}>← Back</Button>
                <Button variant="primary" onClick={() => setStage(3)}>See results →</Button>
              </div>
            </div>
          )}

          {/* STAGE 3 — Results */}
          {stage === 3 && (
            <div className="comp-card" style={panel}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>4. Results {champ ? <>· 🏆 {nameOf(champ)}</> : ""}</h2>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>This is what participants and viewers see on the shareable public page — final standings and, for brackets, the full bracket.</p>
              {finalPlacements.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Play out the {format === "points" ? "races" : "bracket"} in step 3 to see final standings.</p>
              ) : (
                <StandingsList rows={finalPlacements.map((p) => ({ id: p.participantId, rank: p.placement, name: p.name, meta: "", points: (p as { points?: number }).points }))} />
              )}
              {isBracket && bracket && <div style={{ marginTop: "1.5rem" }}><BracketView bracket={bracket} nameOf={nameOf} /></div>}
              {isHeatMains && hm && <div style={{ marginTop: "1.5rem" }}><HeatMainsView hm={hm} nameOf={nameOf} /></div>}
              <div style={{ marginTop: "1.5rem" }}><Button variant="ghost" onClick={() => setStage(2)}>← Back to run</Button></div>
            </div>
          )}

          {/* CTA */}
          <div className="comp-card" style={{ ...panel, marginBottom: 0, textAlign: "center", padding: "2rem 1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, marginBottom: "0.5rem" }}>Ready to run the real thing?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", maxWidth: 520, marginInline: "auto" }}>
              Create a tournament for Mario Kart 8 Deluxe or Mario Kart World — invite players (or add guests), score it live, and share a public bracket.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/tournament/create"><Button variant="primary">Create your tournament</Button></Link>
              <Link href="/tournament"><Button variant="secondary">Browse tournaments</Button></Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}

function HeatMainsView({ hm, nameOf, onReportHeat, onReportMain }: {
  hm: HeatMains;
  nameOf: (id: string | null) => string;
  onReportHeat?: (heatId: string, order: string[], dq: string[]) => void;
  onReportMain?: (tier: number, order: string[], dq: string[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const tile: React.CSSProperties = { background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" };
  const editable = !!onReportHeat; // handlers present ⇒ Run stage (Results passes none)
  const stage = heatMainsStage(hm);
  const upTier = nextMainTier(hm);

  const chip = (label: string) => (
    <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--bg-primary, var(--primary-500))", background: "color-mix(in srgb, var(--primary-500) 16%, var(--surface-default))", padding: "0.05rem 0.4rem", borderRadius: 999, whiteSpace: "nowrap" }}>{label}</span>
  );

  const report = (race: HRace, order: string[], dq: string[]) => {
    if (race.kind === "heat") onReportHeat?.(race.id, order, dq);
    else onReportMain?.(race.tier ?? 0, order, dq);
    setEditingId(null);
  };

  // transferTag: what a top finisher of this race earns; champ: A-Main podium.
  const Race = ({ race, isUp, transferTo, champ }: { race: HRace; isUp: boolean; transferTo?: string; champ?: boolean }) => {
    const run = !!race.results;
    const list = race.results ?? race.drivers;
    const entering = editable && !run && isUp;
    const isEditing = editable && run && editingId === race.id;
    const header = (
      <div style={{ padding: "0.4rem 0.65rem", fontWeight: 700, fontSize: "var(--font-size-14)", borderBottom: "1px solid var(--border-default)", background: "var(--surface-default)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <span>{race.label} <span style={{ fontWeight: 500, color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>· {race.raceCount} races</span></span>
        {entering && <span style={{ fontSize: "var(--font-size-12)", fontWeight: 600, color: "var(--bg-primary, var(--primary-500))" }}>Tap to place</span>}
        {run && editable && !isEditing && <button type="button" onClick={() => setEditingId(race.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--bg-primary, var(--primary-500))", fontWeight: 700, fontSize: "var(--font-size-12)" }}>Edit</button>}
      </div>
    );

    if (entering) return <div style={tile}>{header}<TapEntry drivers={race.drivers} nameOf={nameOf} onConfirm={(o) => report(race, o, [])} /></div>;
    if (isEditing) return <div style={tile}>{header}<EditEntry race={race} nameOf={nameOf} onSave={(o, dq) => report(race, o, dq)} onCancel={() => setEditingId(null)} /></div>;

    return (
      <div style={{ ...tile, opacity: !run && !isUp ? 0.7 : 1 }}>
        {header}
        <div>
          {list.map((id, i) => {
            const isDq = run && race.dq.includes(id);
            const movesUp = run && !isDq && transferTo != null && i < hm.transfer && (race.kind === "heat" ? i === 0 : true);
            const isChamp = champ && run && i === 0 && !isDq;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.65rem", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
                <span style={{ width: 18, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{run ? (isDq ? "—" : i + 1) : "·"}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)", textDecoration: isDq ? "line-through" : "none", color: isDq ? "var(--text-tertiary)" : "var(--text-primary)" }}>{isChamp ? "🏆 " : ""}{nameOf(id)}{isDq ? " · DQ" : ""}</span>
                {movesUp && chip(`→ ${transferTo}`)}
                {race.kind === "heat" && run && !isDq && i === 0 && chip("heat win")}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const seriesGroups = Array.from({ length: hm.series }, (_, s) => hm.heats.filter((h) => h.series === s));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Heats, grouped by series */}
      <div>
        <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>
          Heats — {hm.series > 1 ? `each driver races ${hm.series} heats; ` : ""}win any heat to lock the A Main
        </div>
        {seriesGroups.map((group, s) => (
          <div key={s} style={{ marginBottom: s < hm.series - 1 ? "0.85rem" : 0 }}>
            {hm.series > 1 && <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>Series {s + 1}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
              {group.map((h) => <Race key={h.id} race={h} isUp={stage === "heats"} transferTo="A Main" />)}
            </div>
          </div>
        ))}
      </div>

      {/* Mains — A (the feature) first, then the consi ladder below */}
      {hm.mains.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>
            Mains — seats {hm.mainSeedSize} each; top {hm.transfer} of every main transfer up
          </div>
          <div style={{ display: "grid", gridTemplateColumns: hm.mains.length > 1 ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr", gap: "0.75rem", alignItems: "start" }}>
            {hm.mains.map((m) => (
              <Race key={m.id} race={m} isUp={upTier === (m.tier ?? 0)} champ={(m.tier ?? 0) === 0}
                transferTo={(m.tier ?? 0) > 0 ? hm.mains[(m.tier ?? 0) - 1]?.label : undefined} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Edit a confirmed race after the fact: nudge drivers up/down into the corrected
 * order, or DQ someone (drops to the back on save). Saving re-reports the race,
 * which recomputes every downstream main.
 */
function EditEntry({ race, nameOf, onSave, onCancel }: { race: HRace; nameOf: (id: string | null) => string; onSave: (order: string[], dq: string[]) => void; onCancel: () => void }) {
  const [order, setOrder] = useState<string[]>(race.results ?? race.drivers);
  const [dq, setDq] = useState<string[]>(race.dq ?? []);
  const move = (i: number, dir: -1 | 1) =>
    setOrder((o) => {
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const c = [...o];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const toggleDq = (id: string) => setDq((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const save = () => {
    const nonDq = order.filter((id) => !dq.includes(id));
    const dqd = order.filter((id) => dq.includes(id));
    onSave([...nonDq, ...dqd], dq);
  };
  const arrow: React.CSSProperties = { border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", borderRadius: 4, width: 24, height: 24, cursor: "pointer", fontSize: "var(--font-size-12)", lineHeight: 1 };
  return (
    <div>
      {order.map((id, i) => {
        const isDq = dq.includes(id);
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.5rem", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
            <span style={{ width: 18, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{isDq ? "—" : i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)", textDecoration: isDq ? "line-through" : "none", color: isDq ? "var(--text-tertiary)" : "var(--text-primary)" }}>{nameOf(id)}</span>
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0 || isDq} style={{ ...arrow, opacity: i === 0 || isDq ? 0.4 : 1 }}>▲</button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === order.length - 1 || isDq} style={{ ...arrow, opacity: i === order.length - 1 || isDq ? 0.4 : 1 }}>▼</button>
            <button type="button" onClick={() => toggleDq(id)} style={{ ...arrow, width: "auto", padding: "0 6px", fontWeight: 700, color: isDq ? "var(--bg-primary, var(--primary-500))" : "var(--text-secondary)" }}>{isDq ? "Undo" : "DQ"}</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0.65rem", borderTop: "1px solid var(--border-default)" }}>
        <Button variant="ghost" size="small" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="small" onClick={save}>Save results</Button>
      </div>
    </div>
  );
}

/**
 * Tap-in-finish-order entry for one race. Tap drivers in the order they cross
 * the line; the running 1st/2nd/3rd… builds as you go. Undo pops the last, and
 * the final driver auto-fills so you only tap N-1. Confirm reports the order.
 */
function TapEntry({ drivers, nameOf, onConfirm }: { drivers: string[]; nameOf: (id: string | null) => string; onConfirm: (order: string[]) => void }) {
  const [order, setOrder] = useState<string[]>([]);
  const remaining = drivers.filter((d) => !order.includes(d));
  const canConfirm = remaining.length <= 1;
  const confirm = () => onConfirm(remaining.length === 1 ? [...order, remaining[0]] : order);
  return (
    <div>
      {order.map((id, i) => (
        <div key={id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.65rem", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 8%, var(--surface-default))" }}>
          <span style={{ width: 18, textAlign: "center", fontWeight: 800, fontSize: "var(--font-size-12)", color: "var(--bg-primary, var(--primary-500))" }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: "var(--font-size-14)" }}>{nameOf(id)}</span>
          <span aria-hidden style={{ color: "var(--bg-primary, var(--primary-500))" }}>✓</span>
        </div>
      ))}
      {remaining.map((id) => (
        <button key={id} type="button" onClick={() => setOrder((o) => [...o, id])}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", textAlign: "left", cursor: "pointer", padding: "0.35rem 0.65rem", border: "none", borderTop: "1px solid var(--border-subtle, var(--border-default))", background: "transparent", color: "var(--text-primary)" }}>
          <span style={{ width: 18, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>·</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{nameOf(id)}</span>
          <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--text-tertiary)" }}>{order.length + 1}{ordinalSuffix(order.length + 1)} →</span>
        </button>
      ))}
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0.65rem", borderTop: "1px solid var(--border-default)" }}>
        <Button variant="ghost" size="small" onClick={() => setOrder((o) => o.slice(0, -1))} disabled={order.length === 0}>Undo</Button>
        <Button variant="primary" size="small" onClick={confirm} disabled={!canConfirm}>Confirm results</Button>
      </div>
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

function StandingsList({ rows }: { rows: { id: string; rank: number; name: string; meta: string; points?: number }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.45rem 0.65rem", borderRadius: "0.4rem", background: r.rank <= 3 ? "var(--surface-raised, var(--surface-default))" : "transparent", border: "1px solid var(--border-subtle, var(--border-default))" }}>
          <span style={{ width: 28, textAlign: "center", fontWeight: 800 }}>{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{r.name}</span>
          {r.meta && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{r.meta}</span>}
          {r.points != null && <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 52, textAlign: "right" }}>{r.points} pts</span>}
        </div>
      ))}
    </div>
  );
}
