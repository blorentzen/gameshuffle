"use client";

import { useMemo, useState } from "react";
import { Accordion, Alert, Badge, Button, Chip, Input, Select, Switch } from "@empac/cascadeds";
import { IconDice5, IconSwords, IconUsersGroup } from "@tabler/icons-react";
import { ULTIMATE } from "@/data/smash/ultimate";
import { SMASH_CARDS } from "@/data/smash/cards";
import { useGameCollection } from "@/hooks/useGameCollection";
import { defaultCollection } from "@/lib/collection/catalog";
import type { Bracket } from "@/lib/tournaments/bracket";
import { MissionBonusSection } from "@/components/tournament/MissionBonusSection";
import {
  counterpickOptions, newSet, nextStriker, readRules, remainingStarters, rollSetFighters, rollSetStage, rollSmashRound,
  setScore, setWinner, stageName, stageStatusLabel, STARTER_PRESETS, starterPresetOf, type Side, type SmashRound, type SmashSet, type SmashTourneyRules,
} from "@/lib/smash/tournament";
import { crewState, newCrewBattle, recordCrewGame, undoCrewGame, type CrewBattle, type CrewSide } from "@/lib/smash/crew";

/**
 * Smash layer for a tournament on the standard formats: the organizer's rules
 * (best-of, legal stages, how fighters and stages are chosen), a set helper
 * for 1v1 bracket matches (strikes, counterpicks, rolled fighters, game
 * winners, then report the set), shared round rolls for points formats, crew
 * battles, and mission bonus points. The public page shows it read-only.
 */

interface Participant { id: string; display_name: string; status?: string }

const FIGHTER_MODES: Record<SmashTourneyRules["fighters"], string> = {
  pick: "Players pick their fighters",
  random: "Random fighters every game",
  random_unique: "Random fighters, no repeats in a set",
};

export function SmashTournamentPanel({
  settings, participants, format, bracket, onReport, onSettings, readOnly = false,
}: {
  settings: Record<string, unknown> | null | undefined;
  participants: Participant[];
  format: string;
  bracket?: Bracket | null;
  onReport?: (matchId: string, winnerId: string) => Promise<void> | void;
  onSettings?: (patch: Record<string, unknown>) => Promise<void> | void;
  readOnly?: boolean;
}) {
  const game = ULTIMATE;
  const rules = useMemo(() => readRules(settings?.smash, game), [settings, game]);
  const sets = useMemo(() => ((settings?.smashSets as Record<string, SmashSet> | undefined) ?? {}), [settings]);
  const rounds = useMemo(() => ((settings?.smashRounds as SmashRound[] | undefined) ?? []), [settings]);
  const crews = useMemo(() => ((settings?.crewBattles as CrewBattle[] | undefined) ?? []), [settings]);
  // Random fighters come from what the organizer owns (their collection).
  const col = useGameCollection(game.slug, defaultCollection(game.slug));
  const exclude = col.collection.enabled ? col.collection.off.fighters ?? [] : [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (id: string | null | undefined) => participants.find((p) => p.id === id)?.display_name ?? "TBD";
  const active = participants.filter((p) => p.status !== "dropped");

  const save = async (patch: Record<string, unknown>) => {
    if (!onSettings) return;
    setBusy(true); setErr(null);
    try { await onSettings({ ...(settings ?? {}), ...patch }); } finally { setBusy(false); }
  };
  const saveRules = (patch: Partial<SmashTourneyRules>) => save({ smash: { ...rules, ...patch } });
  const saveSet = (s: SmashSet) => save({ smashSets: { ...sets, [s.matchId]: s } });

  const stageLine = rules.stages === "strike"
    ? `Game 1 struck from ${rules.starters.length} starters, then the loser counterpicks`
    : "A random legal stage every game";

  /* ── Rules ─────────────────────────────────────────────────────────────── */

  const toggleLegal = (id: string) => {
    const legal = rules.legal.includes(id) ? rules.legal.filter((x) => x !== id) : [...rules.legal, id];
    if (!legal.length) { setErr("Keep at least one legal stage."); return; }
    void saveRules({ legal, starters: rules.starters.filter((x) => legal.includes(x)) });
  };
  const toggleStarter = (id: string) => {
    const starters = rules.starters.includes(id) ? rules.starters.filter((x) => x !== id) : [...rules.starters, id];
    if (!starters.length) { setErr("Keep at least one starter."); return; }
    void saveRules({ starters });
  };
  const listed = game.stages.filter((s) => s.status !== "banned" || rules.legal.includes(s.id));
  const starterPreset = starterPresetOf(rules.starters);
  const [customStarters, setCustomStarters] = useState(false);

  const rulesEditor = (
    <div className="smash-tourney__rules">
      <div className="party-row">
        <Select floatingLabel="Sets" value={String(rules.bestOf)} onChange={(v) => void saveRules({ bestOf: Number(v) === 5 ? 5 : 3 })} options={[{ value: "3", label: "Best of 3" }, { value: "5", label: "Best of 5" }]} />
        <Select floatingLabel="Finals" value={String(rules.finalsBestOf)} onChange={(v) => void saveRules({ finalsBestOf: Number(v) === 3 ? 3 : 5 })} options={[{ value: "3", label: "Best of 3" }, { value: "5", label: "Best of 5" }]} />
        <Select floatingLabel="Fighters" value={rules.fighters} onChange={(v) => void saveRules({ fighters: v as SmashTourneyRules["fighters"] })}
          options={Object.entries(FIGHTER_MODES).map(([value, label]) => ({ value, label }))} />
        <Select floatingLabel="Stages" value={rules.stages} onChange={(v) => void saveRules({ stages: v as SmashTourneyRules["stages"] })}
          options={[{ value: "strike", label: "Strike, then counterpick" }, { value: "random", label: "Random legal stage" }]} />
      </div>
      <p className="party-options__label">Legal stages ({rules.legal.length})</p>
      <div className="party-chips">
        {listed.map((s) => {
          const on = rules.legal.includes(s.id);
          return <Chip key={s.id} size="small" clickable selected={on} variant={on ? "primary" : "default"} label={`${s.name} · ${stageStatusLabel(s)}`} onClick={() => toggleLegal(s.id)} />;
        })}
      </div>
      {rules.stages === "strike" && (
        <>
          <Select floatingLabel="Starters, struck for game 1" value={customStarters ? "custom" : starterPreset}
            onChange={(v) => {
              const preset = STARTER_PRESETS.find((x) => x.id === v);
              if (!preset) { setCustomStarters(true); return; }
              setCustomStarters(false);
              void saveRules({ starters: preset.stages, legal: [...new Set([...rules.legal, ...preset.stages])] });
            }}
            options={[...STARTER_PRESETS.map((x) => ({ value: x.id, label: x.label })), { value: "custom", label: `Custom (${rules.starters.length} chosen)` }]} />
          {(starterPreset === "custom" || customStarters) && (
            <>
              <p className="party-muted">Tap the legal stages to strike from. An odd number keeps the strike fair; five uses the 1-2-1 order.</p>
              <div className="party-chips">
                {rules.legal.map((id) => {
                  const on = rules.starters.includes(id);
                  return <Chip key={id} size="small" clickable selected={on} variant={on ? "primary" : "default"} label={stageName(id)} onClick={() => toggleStarter(id)} />;
                })}
              </div>
            </>
          )}
        </>
      )}
      {rules.fighters !== "pick" && <p className="party-muted">Random fighters come from your collection{exclude.length ? `, leaving out ${exclude.length} you've switched off` : ""}.</p>}
    </div>
  );

  /* ── Sets (1v1 brackets) ───────────────────────────────────────────────── */

  const [matchPick, setMatchPick] = useState("");
  const [striker, setStriker] = useState<Side>("a");
  const [finals, setFinals] = useState(false);
  const openMatches = (bracket?.matches ?? []).filter((m) => m.a && m.b && !m.winner);
  const liveSets = Object.values(sets).filter((s) => !s.reported && openMatches.some((m) => m.id === s.matchId));

  const startSet = () => {
    const m = openMatches.find((x) => x.id === matchPick);
    if (!m) return;
    void saveSet(newSet(m.id, m.a!, m.b!, finals ? rules.finalsBestOf : rules.bestOf, striker));
    setMatchPick("");
  };

  const setCard = (s: SmashSet) => {
    const score = setScore(s);
    const won = setWinner(s);
    const current = s.games[s.games.length - 1];
    const playing = current && !current.winner ? current : null;
    const who = (side: Side) => nameOf(side === "a" ? s.a : s.b);
    const striking = rules.stages === "strike" && s.games.length === 0 && !playing;
    const strikerNow = striking ? nextStriker(s, rules) : null;
    const cp = rules.stages === "strike" && !striking ? counterpickOptions(s, rules) : null;
    const update = (games: SmashSet["games"]) => void saveSet({ ...s, games });
    const draft = () => playing ?? { fighters: { a: null, b: null }, stageId: null, winner: null };
    const withDraft = (patch: Partial<SmashSet["games"][number]>) => update([...s.games.filter((g) => g !== playing), { ...draft(), ...patch }]);
    // A game can be won once its stage is set (and its fighters, when they're rolled).
    const ready = !!playing?.stageId && (rules.fighters === "pick" || !!playing?.fighters.a);

    return (
      <div key={s.matchId} className="smash-set">
        <div className="smash-set__head">
          <strong>{who("a")}</strong>
          <span className="smash-set__score">{score.a}-{score.b}</span>
          <strong>{who("b")}</strong>
          <Badge variant="info" size="small">Best of {s.bestOf}</Badge>
        </div>

        {won ? (
          <div className="party-row">
            <span>{who(won)} wins the set {Math.max(score.a, score.b)}-{Math.min(score.a, score.b)}.</span>
            {!readOnly && onReport && (
              <Button variant="primary" size="small" disabled={busy} onClick={async () => { await onReport(s.matchId, won === "a" ? s.a : s.b); await saveSet({ ...s, reported: true }); }}>Report and advance</Button>
            )}
          </div>
        ) : (
          <>
            <p className="party-options__label">Game {s.games.filter((g) => g.winner).length + 1}</p>
            {striking && strikerNow && (
              <>
                <p className="party-muted">{who(strikerNow)} strikes a stage.</p>
                {!readOnly && (
                  <div className="party-chips">
                    {remainingStarters(s, rules).map((id) => <Chip key={id} clickable label={stageName(id)} onClick={() => {
                      const strikes = [...s.strikes, id];
                      const left = rules.starters.filter((x) => !strikes.includes(x));
                      // The last strike settles game 1's stage.
                      void saveSet({ ...s, strikes, games: left.length === 1 ? [{ fighters: { a: null, b: null }, stageId: left[0], winner: null }] : s.games });
                    }} />)}
                  </div>
                )}
              </>
            )}
            {cp?.picker && !playing?.stageId && (
              <>
                <p className="party-muted">{who(cp.picker)} lost the last game and picks the stage.</p>
                {!readOnly && <div className="party-chips">{cp.stages.map((id) => <Chip key={id} clickable label={stageName(id)} onClick={() => withDraft({ stageId: id })} />)}</div>}
              </>
            )}
            {rules.stages === "random" && !playing?.stageId && !readOnly && (
              <Button variant="secondary" size="small" iconBefore={IconDice5} onClick={() => withDraft({ stageId: rollSetStage(s, rules) })}>Roll the stage</Button>
            )}
            {playing?.stageId && <p><strong>Stage:</strong> {stageName(playing.stageId)}</p>}
            {rules.fighters !== "pick" && (
              playing?.fighters.a
                ? <p><strong>Fighters:</strong> {who("a")} plays {playing.fighters.a.name}, {who("b")} plays {playing.fighters.b?.name}</p>
                : !readOnly && <Button variant="secondary" size="small" iconBefore={IconDice5} onClick={() => { const f = rollSetFighters(s, rules, exclude); if (f) withDraft({ fighters: f }); }}>Roll fighters</Button>
            )}
            {!readOnly && (
              <span className="party-row">
                {(["a", "b"] as Side[]).map((side) => (
                  <Button key={side} variant="primary" size="small" disabled={busy || !ready} onClick={() => withDraft({ winner: side })}>{who(side)} won</Button>
                ))}
              </span>
            )}
          </>
        )}

        {s.games.some((g) => g.winner) && (
          <ol className="party-list smash-set__games">
            {s.games.filter((g) => g.winner).map((g, i) => (
              <li key={i}>{[g.stageId ? stageName(g.stageId) : null, g.fighters.a ? `${g.fighters.a.name} vs ${g.fighters.b?.name}` : null].filter(Boolean).join(" · ") || `Game ${i + 1}`}: <strong>{who(g.winner!)}</strong></li>
            ))}
          </ol>
        )}
        {!readOnly && (s.games.length > 0 || s.strikes.length > 0) && (
          <Button variant="ghost" size="small" disabled={busy} onClick={() => void saveSet(s.games.length ? { ...s, games: s.games.slice(0, -1) } : { ...s, strikes: s.strikes.slice(0, -1) })}>Undo</Button>
        )}
      </div>
    );
  };

  /* ── Rounds (points formats) ───────────────────────────────────────────── */

  const [roundFighters, setRoundFighters] = useState(false);
  const latest = rounds[rounds.length - 1];
  const isPoints = format === "ffa_points" || format === "round_robin";

  /* ── Crew battles ──────────────────────────────────────────────────────── */

  const [crewNames, setCrewNames] = useState({ a: "", b: "" });
  const [crewPlayers, setCrewPlayers] = useState<{ a: string[]; b: string[] }>({ a: [], b: [] });
  const [crewStocks, setCrewStocks] = useState("3");
  const [crewLeft, setCrewLeft] = useState<Record<string, string>>({});
  const pickCrew = (side: CrewSide, id: string) => setCrewPlayers((c) => {
    const otherSide: CrewSide = side === "a" ? "b" : "a";
    const mine = c[side].includes(id) ? c[side].filter((x) => x !== id) : [...c[side], id];
    return { ...c, [side]: mine, [otherSide]: c[otherSide].filter((x) => x !== id) } as { a: string[]; b: string[] };
  });
  const createCrew = async () => {
    if (!crewPlayers.a.length || !crewPlayers.b.length) { setErr("Each crew needs at least one player."); return; }
    const cb = newCrewBattle({ name: crewNames.a, players: crewPlayers.a }, { name: crewNames.b, players: crewPlayers.b }, Number(crewStocks));
    await save({ crewBattles: [...crews, cb] });
    setCrewPlayers({ a: [], b: [] }); setCrewNames({ a: "", b: "" });
  };
  const saveCrew = (cb: CrewBattle) => save({ crewBattles: crews.map((x) => (x.id === cb.id ? cb : x)) });

  const crewCard = (cb: CrewBattle) => {
    const st = crewState(cb);
    const up = (side: CrewSide) => cb.crews[side].players[st.current[side].index];
    return (
      <div key={cb.id} className="smash-set">
        <div className="smash-set__head">
          <strong>{cb.crews.a.name}</strong>
          <span className="smash-set__score">{st.remaining.a}-{st.remaining.b}</span>
          <strong>{cb.crews.b.name}</strong>
          <Badge variant="info" size="small">{cb.stocks} stocks each</Badge>
        </div>
        {st.winner ? <p><strong>{cb.crews[st.winner].name}</strong> wins with {st.remaining[st.winner]} stock{st.remaining[st.winner] === 1 ? "" : "s"} to spare.</p> : (
          <>
            <p className="party-muted">
              Up now: {nameOf(up("a"))} ({st.current.a.stocks} stock{st.current.a.stocks === 1 ? "" : "s"}) vs {nameOf(up("b"))} ({st.current.b.stocks} stock{st.current.b.stocks === 1 ? "" : "s"})
            </p>
            {!readOnly && (
              <div className="party-row">
                {(["a", "b"] as CrewSide[]).map((side) => {
                  const k = `${cb.id}:${side}`;
                  const max = st.current[side].stocks;
                  return (
                    <span key={side} className="party-row">
                      <Select floatingLabel={`${nameOf(up(side))} won with`} value={crewLeft[k] ?? String(max)} onChange={(v) => setCrewLeft((c) => ({ ...c, [k]: String(v) }))}
                        options={Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: `${i + 1} stock${i ? "s" : ""} left` }))} />
                      <Button variant="primary" size="small" disabled={busy} onClick={() => void saveCrew(recordCrewGame(cb, side, Number(crewLeft[k] ?? max)))}>Record</Button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
        {!readOnly && cb.log.length > 0 && <Button variant="ghost" size="small" disabled={busy} onClick={() => void saveCrew(undoCrewGame(cb))}>Undo last game</Button>}
      </div>
    );
  };

  return (
    <div className="comp-card party-tourney smash-tourney" style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "var(--font-size-18)" }}><IconSwords size={18} stroke={1.9} aria-hidden /> Smash rules</h2>
      <p className="party-muted">
        Best of {rules.bestOf} (finals best of {rules.finalsBestOf}) · {FIGHTER_MODES[rules.fighters]} · {stageLine} · {rules.legal.length} legal stages
      </p>
      {!readOnly && <Accordion variant="flush" items={[{ id: "rules", title: "Edit the rules", content: rulesEditor }]} />}

      {bracket && (
        <>
          <h3 className="party-h3">Sets</h3>
          {liveSets.map(setCard)}
          {!readOnly && openMatches.some((m) => !liveSets.some((s) => s.matchId === m.id)) && (
            <div className="party-row">
              <Select floatingLabel="Match" placeholder="Pick a match" value={matchPick} onChange={(v) => setMatchPick(String(v))}
                options={openMatches.filter((m) => !liveSets.some((s) => s.matchId === m.id)).map((m) => ({ value: m.id, label: `${nameOf(m.a)} vs ${nameOf(m.b)}` }))} />
              {matchPick && (
                <Select floatingLabel="Strikes first" value={striker} onChange={(v) => setStriker(v as Side)}
                  options={[{ value: "a", label: nameOf(openMatches.find((m) => m.id === matchPick)?.a) }, { value: "b", label: nameOf(openMatches.find((m) => m.id === matchPick)?.b) }]} />
              )}
              <Switch label={`Finals (best of ${rules.finalsBestOf})`} checked={finals} onChange={(e) => setFinals(e.target.checked)} />
              <Button variant="primary" size="small" disabled={busy || !matchPick} onClick={startSet}>Start the set</Button>
            </div>
          )}
          {!liveSets.length && readOnly && <p className="party-muted">No sets in progress.</p>}
          {!openMatches.length && !readOnly && <p className="party-muted">No matches are ready. Sets start once both players are in a bracket match.</p>}
        </>
      )}

      {isPoints && (
        <>
          <h3 className="party-h3">Rounds</h3>
          <p className="party-muted">Every flight plays the same roll each round. Scoring is 10, 6, 3 and 1 per flight, plus mission bonus points.</p>
          {latest ? (
            <div className="party-tourney__round">
              <span className="party-options__label">Round {latest.round}</span>
              <strong className="party-tourney__board">{stageName(latest.stageId)}</strong>
              {latest.fighters.length > 0 && <span className="party-muted">{latest.fighters.map((f, i) => `Seat ${i + 1}: ${f.name}`).join(" · ")}</span>}
            </div>
          ) : <p className="party-muted">{readOnly ? "The organizer hasn't rolled a round yet." : "No rounds rolled yet."}</p>}
          {!readOnly && (
            <div className="party-row">
              <Switch label="Same fighter for each seat" checked={roundFighters} onChange={(e) => setRoundFighters(e.target.checked)} />
              <Button variant="primary" size="small" iconBefore={IconDice5} disabled={busy} onClick={() => { const r = rollSmashRound(rounds, rules, roundFighters, exclude); if (r) void save({ smashRounds: [...rounds, r] }); }}>Roll round {rounds.length + 1}</Button>
              {rounds.length > 0 && <Button variant="ghost" size="small" disabled={busy} onClick={() => void save({ smashRounds: rounds.slice(0, -1) })}>Undo last roll</Button>}
            </div>
          )}
        </>
      )}

      <h3 className="party-h3"><IconUsersGroup size={16} stroke={1.9} aria-hidden /> Crew battles</h3>
      {crews.length ? [...crews].reverse().map(crewCard) : <p className="party-muted">{readOnly ? "No crew battles yet." : "Two crews, stocks carry over, and the last crew with stocks left wins."}</p>}
      {!readOnly && (
        <Accordion variant="flush" items={[{
          id: "new-crew", title: "Set up a crew battle",
          content: (
            <div className="smash-tourney__crew">
              {(["a", "b"] as CrewSide[]).map((side) => (
                <div key={side} className="smash-tourney__crew-side">
                  <Input floatingLabel={side === "a" ? "First crew" : "Second crew"} placeholder={side === "a" ? "Crew A" : "Crew B"} value={crewNames[side]} maxLength={30} onChange={(e) => setCrewNames((c) => ({ ...c, [side]: e.target.value }))} />
                  <p className="party-muted">Tap players in the order they play.</p>
                  <div className="party-chips">
                    {active.map((p) => {
                      const at = crewPlayers[side].indexOf(p.id);
                      return <Chip key={p.id} size="small" clickable selected={at >= 0} variant={at >= 0 ? "primary" : "default"} label={at >= 0 ? `${at + 1}. ${p.display_name}` : p.display_name} onClick={() => pickCrew(side, p.id)} />;
                    })}
                  </div>
                </div>
              ))}
              <div className="party-row">
                <Select floatingLabel="Stocks each" value={crewStocks} onChange={(v) => setCrewStocks(String(v))} options={["2", "3", "4"].map((n) => ({ value: n, label: `${n} stocks` }))} />
                <Button variant="primary" size="small" disabled={busy} onClick={createCrew}>Start the crew battle</Button>
              </div>
            </div>
          ),
        }]} />
      )}

      <MissionBonusSection missions={SMASH_CARDS.filter((c) => c.kind === "mission")} lookup={(id) => SMASH_CARDS.find((c) => c.id === id)}
        settings={settings} participants={participants} round={rounds.length || null} onSettings={onSettings} readOnly={readOnly} />
      {err && <Alert variant="warning">{err}</Alert>}
    </div>
  );
}
