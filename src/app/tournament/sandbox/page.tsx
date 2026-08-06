"use client";

/**
 * Tournament sandbox — a public, no-login, end-to-end walkthrough of the real
 * tournament lifecycle for marketing: Set up → Manage → Run → Results. Runs the
 * actual bracket + scoring engines on a local sample field, so a visitor can
 * click through the whole experience — configure, review registrations, seed,
 * play it out, and see the champion + standings — then create their own.
 * Ephemeral client state; no database.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Container, Button } from "@empac/cascadeds";
import {
  generateSingleElim,
  generateDoubleElim,
  reportWinner,
  bracketChampion,
  computeBracketPlacements,
  isPowerOf2,
  type Bracket,
} from "@/lib/tournaments/bracket";
import { computeStandings, DEFAULT_SCORING_TABLE, type TournamentRace } from "@/lib/tournaments/scoring";
import { BracketView } from "@/components/tournament/BracketView";

type Mode = "single_elim" | "double_elim" | "points";
type PStatus = "confirmed" | "registered" | "declined";
interface P { id: string; name: string; status: PStatus }

const START_ROSTER: P[] = [
  { id: "aria", name: "Aria", status: "confirmed" },
  { id: "bolt", name: "Bolt", status: "confirmed" },
  { id: "cypher", name: "Cypher", status: "confirmed" },
  { id: "dash", name: "Dash", status: "confirmed" },
  { id: "echo", name: "Echo", status: "confirmed" },
  { id: "fjord", name: "Fjord", status: "confirmed" },
  { id: "gizmo", name: "Gizmo", status: "registered" }, // pending — visitor reviews
  { id: "halo", name: "Halo", status: "registered" },
];

const MODES: { id: Mode; label: string }[] = [
  { id: "single_elim", label: "Single Elim" },
  { id: "double_elim", label: "Double Elim" },
  { id: "points", label: "Points / Standings" },
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

export default function TournamentSandboxPage() {
  const [stage, setStage] = useState(0);
  const [game, setGame] = useState(GAMES[0].id);
  const [format, setFormat] = useState<Mode>("single_elim");
  const [roster, setRoster] = useState<P[]>(START_ROSTER);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [races, setRaces] = useState<TournamentRace[]>([]);

  const confirmed = roster.filter((p) => p.status === "confirmed");
  const pending = roster.filter((p) => p.status === "registered");
  const nameOf = (id: string | null) => roster.find((p) => p.id === id)?.name ?? "TBD";

  const setStatus = (id: string, status: PStatus) =>
    setRoster((r) => r.map((p) => (p.id === id ? { ...p, status } : p)));
  const acceptAll = () => setRoster((r) => r.map((p) => (p.status === "registered" ? { ...p, status: "confirmed" } : p)));

  const isBracket = format !== "points";
  const canSeedDouble = format !== "double_elim" || isPowerOf2(confirmed.length);

  const seed = () => {
    const ids = confirmed.map((p) => p.id);
    if (ids.length < 2) return;
    setBracket(format === "double_elim" ? generateDoubleElim(ids) : generateSingleElim(ids));
    setRaces([]);
  };

  const resetRun = () => {
    if (isBracket) seed();
    else setRaces([]);
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

  const simulateRace = () => {
    const order = shuffle(confirmed.map((p) => p.id));
    const placements: Record<string, number> = {};
    order.forEach((id, i) => (placements[id] = i + 1));
    setRaces((prev) => [...prev, { id: `r${prev.length + 1}`, race_number: prev.length + 1, placements }]);
  };

  const pointsStandings = useMemo(
    () => computeStandings(confirmed.map((p) => ({ id: p.id, display_name: p.name, team: null })), races, DEFAULT_SCORING_TABLE),
    [confirmed, races],
  );

  const goRun = () => {
    if (isBracket && !bracket) seed();
    setStage(2);
  };

  const finalPlacements = useMemo(() => {
    if (isBracket && bracket) {
      return computeBracketPlacements(bracket).map((r) => ({ ...r, name: nameOf(r.participantId) }));
    }
    return pointsStandings.filter((s) => s.racesPlayed > 0).map((s, i) => ({ participantId: s.participantId, placement: i + 1, name: s.name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracket, pointsStandings, isBracket]);

  const champ = isBracket && bracket ? bracketChampion(bracket) : finalPlacements[0]?.participantId ?? null;
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
            Walk through a whole tournament — set it up, review registrations, seed it, run it, and see the results — with a sample field of eight. No account needed; this is the exact engine GameShuffle uses.
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
                  {MODES.map((m) => <Button key={m.id} variant={format === m.id ? "primary" : "secondary"} size="small" onClick={() => { setFormat(m.id); setBracket(null); setRaces([]); }}>{m.label}</Button>)}
                </div>
              </div>
              <Button variant="primary" onClick={() => setStage(1)}>Next: Manage registrations →</Button>
            </div>
          )}

          {/* STAGE 1 — Manage */}
          {stage === 1 && (
            <div className="comp-card" style={panel}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>2. Manage registrations</h2>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>Accept or decline players who want in. Only confirmed players get seeded.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                {[["Total", roster.filter((p) => p.status !== "declined").length], ["Pending", pending.length], ["Confirmed", confirmed.length]].map(([l, v]) => (
                  <div key={l as string} style={{ ...cardBase, padding: "0.85rem 1rem", borderRadius: "0.5rem", textAlign: "center" }}>
                    <div style={{ fontSize: "var(--font-size-24)", fontWeight: 700 }}>{v as number}</div>
                    <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{l as string}</div>
                  </div>
                ))}
              </div>
              {pending.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span className="account-card__label">Pending registrations ({pending.length})</span>
                    <Button variant="secondary" size="small" onClick={acceptAll}>Accept all</Button>
                  </div>
                  {pending.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.25rem", borderBottom: "1px solid var(--border-subtle, var(--border-default))" }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--font-size-14)" }}>{p.name}</span>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        <Button variant="primary" size="small" onClick={() => setStatus(p.id, "confirmed")}>Accept</Button>
                        <Button variant="ghost" size="small" onClick={() => setStatus(p.id, "declined")}>Decline</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Confirmed field ({confirmed.length})</span>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {confirmed.map((p) => <span key={p.id} style={{ ...cardBase, padding: "0.25rem 0.6rem", borderRadius: 999, fontSize: "var(--font-size-12)" }}>{p.name}</span>)}
                </div>
              </div>
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
                  3. {format === "points" ? "Score the races" : "Run the bracket"}
                </h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {format === "points"
                    ? <><Button variant="primary" size="small" onClick={simulateRace}>Simulate a race</Button>{races.length > 0 && <Button variant="ghost" size="small" onClick={() => setRaces([])}>Reset</Button>}</>
                    : <><Button variant="secondary" size="small" onClick={autoPlay}>Auto-play</Button><Button variant="ghost" size="small" onClick={resetRun}>Reset</Button></>}
                </div>
              </div>
              {format === "points" ? (
                races.length === 0
                  ? <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Hit <strong>Simulate a race</strong> to score a GP and watch the standings build.</p>
                  : <StandingsList rows={pointsStandings.filter((s) => s.racesPlayed > 0).map((s, i) => ({ id: s.participantId, rank: i + 1, name: s.name, meta: `${s.wins}W · avg ${s.avgPosition?.toFixed(1)}`, points: s.points }))} />
              ) : bracket ? (
                <BracketView bracket={bracket} nameOf={nameOf} onReport={(matchId, winnerId) => setBracket((b) => (b ? reportWinner(b, matchId, winnerId) : b))} />
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
