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
} from "@/lib/tournaments/heatMains";
import { computeEventPoints, accumulateSeason, type DriverPoints, type SeasonRow } from "@/lib/tournaments/championship";
import { BracketView } from "@/components/tournament/BracketView";
import { HeatMainsView, StandingsList, ChampionshipTable, SeasonTable } from "@/components/tournament/HeatMainsView";

type Mode = "single_elim" | "double_elim" | "points" | "heat_mains";
// confirmed = seated/joined · registered = pending organizer accept (single, guests)
// invited = existing GS user, awaiting their accept · email = email invite, awaiting signup
type PStatus = "confirmed" | "registered" | "declined" | "invited" | "email";
interface P { id: string; name: string; status: PStatus; handle?: string; email?: string }

// Fake "already on GameShuffle" directory for the invite-existing-player typeahead.
const GS_DIRECTORY: { id: string; name: string; handle: string }[] = [
  { id: "u-rueful", name: "Rue", handle: "ruefulracer" },
  { id: "u-tavi", name: "Tavi", handle: "octavia_gg" },
  { id: "u-brisk", name: "Brisk", handle: "briskbanana" },
  { id: "u-marlo", name: "Marlo", handle: "marlo_mk" },
  { id: "u-sage", name: "Sage", handle: "sageshells" },
  { id: "u-quo", name: "Quo", handle: "quokka" },
  { id: "u-vint", name: "Vint", handle: "vintage_v" },
  { id: "u-nyx", name: "Nyx", handle: "nyxnitro" },
];

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
  const [heatSize, setHeatSize] = useState<number | "auto">("auto");
  const [runMode, setRunMode] = useState<"single" | "championship">("single");
  const [seasonName, setSeasonName] = useState("Friday Night League");
  const [newPlayer, setNewPlayer] = useState("");
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [seasonEvents, setSeasonEvents] = useState<Record<string, number>[]>([]);
  const idRef = useRef(1);

  const confirmed = roster.filter((p) => p.status === "confirmed");
  const pending = roster.filter((p) => p.status === "registered");
  const invitedPending = roster.filter((p) => p.status === "invited" || p.status === "email");
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

  // Championship (league) — accounts only. Invite an existing GS user, or email
  // someone so they create a free account. Nobody's seeded until they've joined.
  const rosterHas = (dirId: string) => roster.some((p) => p.id === dirId);
  const inviteMatches = inviteQuery.trim()
    ? GS_DIRECTORY.filter((u) => !rosterHas(u.id) && (u.handle.includes(inviteQuery.trim().toLowerCase().replace(/^@/, "")) || u.name.toLowerCase().includes(inviteQuery.trim().toLowerCase()))).slice(0, 4)
    : [];
  const invitePlayer = (u: { id: string; name: string; handle: string }) => {
    setRoster((r) => [...r, { id: u.id, name: u.name, handle: u.handle, status: "invited" }]);
    setInviteQuery("");
  };
  const inviteByEmail = () => {
    const email = inviteEmail.trim();
    if (!email || !email.includes("@")) return;
    setRoster((r) => [...r, { id: `e${idRef.current++}`, name: email.split("@")[0], email, status: "email" }]);
    setInviteEmail("");
  };
  const acceptInvite = (id: string) => setStatus(id, "confirmed"); // demo: invitee accepts / signs up

  const isBracket = format === "single_elim" || format === "double_elim";
  const isHeatMains = format === "heat_mains";
  const canSeedDouble = format !== "double_elim" || isPowerOf2(confirmed.length);

  // Build a fresh Heat→Mains from the confirmed field with the current knobs.
  const buildHm = (s: number = series, hs: number | "auto" = heatSize) =>
    generateHeatMains(confirmed.map((p) => p.id), { series: s, heatSize: hs === "auto" ? undefined : hs });

  const seed = () => {
    const ids = confirmed.map((p) => p.id);
    if (ids.length < 2) return;
    if (isHeatMains) {
      setHm(buildHm());
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

  // Championship points — Heat→Mains only, computed once the event is complete.
  const eventPoints = useMemo<DriverPoints[]>(
    () => (isHeatMains && hm && heatMainsStage(hm) === "complete" ? computeEventPoints(hm) : []),
    [hm, isHeatMains],
  );
  const seasonStandings = useMemo<SeasonRow[]>(() => accumulateSeason(seasonEvents), [seasonEvents]);

  // Log this event's points into the season, then seed a fresh event (same
  // roster) and drop back to Run — the league carries on.
  const logEventToSeason = () => {
    if (eventPoints.length === 0) return;
    setSeasonEvents((evts) => [...evts, Object.fromEntries(eventPoints.map((p) => [p.participantId, p.total]))]);
    setHm(buildHm());
    setStage(2);
  };

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
            Walk through a whole tournament, or a full championship series where points carry across events into a season table. Set it up, seed it, run it, and see the results, with a sample field you can add to or trim. No account needed; this is the exact engine GameShuffle uses.
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
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>1. Set up your {runMode === "championship" ? "championship" : "tournament"}</h2>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>Run a single tournament, or a championship series where points carry across events into a season table.</p>

              {/* Single vs Championship toggle */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>What are you running?</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.75rem" }}>
                  {([
                    { id: "single", title: "Single tournament", blurb: "One event: bracket, points race, or heat → mains. Play it out, share the final standings." },
                    { id: "championship", title: "Championship series", blurb: "A season of Heat → Mains events. Points accumulate across nights into a live season table." },
                  ] as const).map((opt) => {
                    const on = runMode === opt.id;
                    return (
                      <button key={opt.id} type="button"
                        onClick={() => { setRunMode(opt.id); if (opt.id === "championship") { setFormat("heat_mains"); setBracket(null); setSbRaces([]); } }}
                        style={{ textAlign: "left", cursor: "pointer", padding: "0.85rem 1rem", borderRadius: "0.6rem",
                          border: `1.5px solid ${on ? "var(--bg-primary, var(--primary-500))" : "var(--border-default)"}`,
                          background: on ? "color-mix(in srgb, var(--primary-500) 10%, var(--surface-default))" : "var(--surface-default)" }}>
                        <div style={{ fontWeight: 700, fontSize: "var(--font-size-14)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          {opt.id === "championship" ? "🏆 " : ""}{opt.title}
                          {on && <span style={{ marginLeft: "auto", color: "var(--bg-primary, var(--primary-500))" }}>✓</span>}
                        </div>
                        <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{opt.blurb}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {runMode === "championship" && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>Season name</div>
                  <Input type="text" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="e.g. Friday Night League" style={{ maxWidth: 360 }} />
                </div>
              )}

              <div style={{ marginBottom: "1.25rem" }}>
                <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>Game</div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {GAMES.map((g) => <Button key={g.id} variant={game === g.id ? "primary" : "secondary"} size="small" onClick={() => setGame(g.id)}>{g.label}</Button>)}
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>{runMode === "championship" ? "Event format" : "Format"}</div>
                {runMode === "championship" ? (
                  <div style={{ ...cardBase, padding: "0.7rem 0.9rem", borderRadius: "0.5rem", fontSize: "var(--font-size-14)" }}>
                    <strong>Heat → Mains ★</strong>: every event runs heats into a consi ladder, and the tiered points (A-Main premium + light heat bonus) feed your season standings.
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {MODES.map((m) => <Button key={m.id} variant={format === m.id ? "primary" : "secondary"} size="small" onClick={() => { setFormat(m.id); setBracket(null); setHm(null); setSbRaces([]); }}>{m.label}</Button>)}
                    </div>
                    {format === "heat_mains" && (
                      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                        ★ A sprint-car-style ladder: race heats, win to lock the A Main, and the top finishers in the B Main transfer up. A way back from a bad start. Pick <strong>Championship series</strong> above to carry points across a season.
                      </p>
                    )}
                  </>
                )}
              </div>
              <Button variant="primary" onClick={() => setStage(1)}>Next: {runMode === "championship" ? "Set the league" : "Manage registrations"} →</Button>
            </div>
          )}

          {/* STAGE 1 — Manage */}
          {stage === 1 && (
            <div className="comp-card" style={panel}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>2. {runMode === "championship" ? "Set the league roster" : "Manage the field"}</h2>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>
                {runMode === "championship"
                  ? "Championship leagues are GameShuffle accounts only. That's how points stay tied to real players all season. Invite someone already on GameShuffle, or email an invite so they create a free account. Only players who've joined get seeded."
                  : "Add players, accept or decline registrations, and drop anyone. Only confirmed players get seeded. Build the field however you like."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                {(runMode === "championship"
                  ? [["In league", confirmed.length], ["Invites out", invitedPending.length], ["Total", active.length]]
                  : [["Total", active.length], ["Pending", pending.length], ["Confirmed", confirmed.length]]
                ).map(([l, v]) => (
                  <div key={l as string} style={{ ...cardBase, padding: "0.85rem 1rem", borderRadius: "0.5rem", textAlign: "center" }}>
                    <div style={{ fontSize: "var(--font-size-24)", fontWeight: 700 }}>{v as number}</div>
                    <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{l as string}</div>
                  </div>
                ))}
              </div>

              {runMode === "championship" ? (
                /* Invite existing GS user, or email an invite to create an account */
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                  <div style={{ ...cardBase, borderRadius: "0.5rem", padding: "0.85rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-size-14)", marginBottom: "0.5rem" }}>Invite a GameShuffle player</div>
                    <Input type="text" value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} placeholder="Search by @handle or name…" />
                    {inviteMatches.length > 0 && (
                      <div style={{ marginTop: "0.5rem", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden", background: "var(--surface-default)" }}>
                        {inviteMatches.map((u) => (
                          <button key={u.id} type="button" onClick={() => invitePlayer(u)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", textAlign: "left", cursor: "pointer", padding: "0.4rem 0.6rem", border: "none", background: "transparent", color: "var(--text-primary)" }}>
                            <span style={{ display: "inline-flex", width: 24, height: 24, borderRadius: 999, alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--primary-500) 18%, var(--surface-default))", fontWeight: 700, fontSize: "var(--font-size-12)" }}>{u.name[0]}</span>
                            <span style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: "var(--font-size-14)" }}>{u.name}</strong> <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>@{u.handle}</span></span>
                            <span style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 700, fontSize: "var(--font-size-12)" }}>Invite →</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {inviteQuery.trim() && inviteMatches.length === 0 && (
                      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>No GameShuffle player found. Send an email invite instead. →</p>
                    )}
                  </div>
                  <div style={{ ...cardBase, borderRadius: "0.5rem", padding: "0.85rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--font-size-14)", marginBottom: "0.5rem" }}>Invite by email</div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") inviteByEmail(); }} placeholder="player@email.com" style={{ flex: 1 }} />
                      <Button variant="secondary" size="small" onClick={inviteByEmail}>Send</Button>
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>They get an email to create a free GameShuffle account and land straight in the league.</p>
                  </div>
                </div>
              ) : (
                /* Single tournament — free-text guests allowed */
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                  <Input type="text" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPlayer(); }} placeholder="Add a player by name…" style={{ flex: 1 }} />
                  <Button variant="secondary" size="small" onClick={addPlayer}>Add player</Button>
                </div>
              )}

              {/* Roster — status chips + per-status actions */}
              <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="account-card__label">{runMode === "championship" ? "League roster" : "Field"} ({active.length})</span>
                {runMode !== "championship" && pending.length > 0 && <Button variant="ghost" size="small" onClick={acceptAll}>Accept all pending</Button>}
              </div>
              {active.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>{runMode === "championship" ? "No players yet. Invite some above." : "No players yet. Add some above."}</p>
              ) : (
                <div style={{ ...cardBase, borderRadius: "0.5rem", overflow: "hidden" }}>
                  {active.map((p, i) => {
                    const chip = p.status === "confirmed" ? { label: runMode === "championship" ? "In league" : "Confirmed", color: "var(--success-700, #17a710)" }
                      : p.status === "invited" ? { label: "Invited", color: "var(--warning-700, #b26b00)" }
                      : p.status === "email" ? { label: "Email sent", color: "var(--warning-700, #b26b00)" }
                      : { label: "Pending", color: "var(--warning-700, #b26b00)" };
                    const sub = p.handle ? `@${p.handle}` : p.email ?? "";
                    return (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: "var(--font-size-14)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          {sub && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
                          <span style={{ fontSize: "var(--font-size-12)", fontWeight: 600, padding: "0.05rem 0.4rem", borderRadius: 999, color: chip.color, background: "var(--surface-default)", border: "1px solid var(--border-default)", flexShrink: 0 }}>{chip.label}</span>
                        </span>
                        <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                          {p.status === "registered" && <Button variant="primary" size="small" onClick={() => setStatus(p.id, "confirmed")}>Accept</Button>}
                          {(p.status === "invited" || p.status === "email") && <Button variant="secondary" size="small" onClick={() => acceptInvite(p.id)}>Simulate {p.status === "email" ? "signup" : "accept"}</Button>}
                          <Button variant="ghost" size="small" onClick={() => removePlayer(p.id)}>{p.status === "invited" || p.status === "email" ? "Cancel" : "Remove"}</Button>
                        </div>
                      </div>
                    );
                  })}
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
                        <>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                            Heat series
                            <select value={series} onChange={(e) => { const s = Number(e.target.value); setSeries(s); setHm(buildHm(s, heatSize)); }} style={{ height: 28, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 4px", background: "var(--surface-default)", color: "var(--text-primary)" }}>
                              <option value={1}>1 round</option>
                              <option value={2}>2 rounds</option>
                            </select>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                            Heat size
                            <select value={String(heatSize)} onChange={(e) => { const v = e.target.value === "auto" ? "auto" : Number(e.target.value); setHeatSize(v); setHm(buildHm(series, v)); }} style={{ height: 28, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 4px", background: "var(--surface-default)", color: "var(--text-primary)" }}>
                              <option value="auto">Auto (even)</option>
                              {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} / heat</option>)}
                            </select>
                          </label>
                        </>
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
                    <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>Call each race live. Tap drivers in the order they finish. Win a heat and you&apos;re locked into the A Main; everyone else is seeded by total heat points. Each main seats {hm.mainSeedSize}, and the top {hm.transfer} of every main transfer up to the one above. Already confirmed a race? <strong>Edit</strong> it to fix an order or DQ a driver.</p>
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
                      Enter race {sbRaces.length + 1}: {entryByPoints ? "points per driver" : "finishing place (1 = win)"}
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
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.25rem" }}>This is what participants and viewers see on the shareable public page: final standings and, for brackets, the full bracket.</p>
              {finalPlacements.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Play out the {format === "points" ? "races" : "bracket"} in step 3 to see final standings.</p>
              ) : (
                <StandingsList rows={finalPlacements.map((p) => ({ id: p.participantId, rank: p.placement, name: p.name, meta: "", points: (p as { points?: number }).points }))} />
              )}

              {/* Championship points + season (championship mode, Heat→Mains) */}
              {runMode === "championship" && isHeatMains && eventPoints.length > 0 && (
                <div style={{ marginTop: "1.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div>
                      <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)" }}>Championship points · Event {seasonEvents.length + 1}</div>
                      <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Main points from your final main + a light heat bonus. Making the A Main is worth a jump.</div>
                    </div>
                    <Button variant="primary" size="small" onClick={logEventToSeason}>Log event → run the next →</Button>
                  </div>
                  <ChampionshipTable rows={eventPoints} nameOf={nameOf} />
                </div>
              )}

              {runMode === "championship" && seasonStandings.length > 0 && (
                <div style={{ marginTop: "1.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)" }}>
                      🏆 {seasonName || "Season"} standings · {seasonEvents.length} event{seasonEvents.length === 1 ? "" : "s"} logged
                    </div>
                    <Button variant="ghost" size="small" onClick={() => setSeasonEvents([])}>Reset season</Button>
                  </div>
                  <SeasonTable rows={seasonStandings} events={seasonEvents.length} nameOf={nameOf} />
                </div>
              )}

              {isBracket && bracket && <div style={{ marginTop: "1.5rem" }}><BracketView bracket={bracket} nameOf={nameOf} /></div>}
              {isHeatMains && hm && <div style={{ marginTop: "1.75rem" }}><HeatMainsView hm={hm} nameOf={nameOf} /></div>}
              <div style={{ marginTop: "1.5rem" }}><Button variant="ghost" onClick={() => setStage(2)}>← Back to run</Button></div>
            </div>
          )}

          {/* CTA */}
          <div className="comp-card" style={{ ...panel, marginBottom: 0, textAlign: "center", padding: "2rem 1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, marginBottom: "0.5rem" }}>Ready to run the real thing?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", maxWidth: 520, marginInline: "auto" }}>
              Create a one-off tournament or a full championship series for Mario Kart 8 Deluxe or Mario Kart World. Invite players (or add guests), score it live, and share a public bracket or season table.
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
