"use client";

/**
 * Perfect Dark Combat Simulator randomizer (beta), laid out like GoldenEye's:
 * the match (scenario, arena, weapon set, time limit, simulants and an optional
 * chaos option), each part with its own refresh button, and a character for
 * each of 1 to 4 players, rolled separately so re-rolling the match never
 * changes them. Team scenarios split players and simulants into two teams.
 * Names only for now ("Image coming soon" slots). Only rolls.
 */

import { useCallback, useState } from "react";
import { Badge, Button, Card, IconButton, Input, Select, Switch } from "@empac/cascadeds";
import { IconBolt, IconClock, IconCopy, IconCrosshair, IconDice5, IconMap2, IconRefresh, IconRobot, IconTarget, IconBomb } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { RollingText } from "@/components/randomizer/RollingText";
import { IMAGE_COMING_SOON } from "@/components/ImageComingSoon";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { PERFECT_DARK } from "@/data/perfect-dark/combat-simulator";
import {
  arenaPool, characterPool, matchText, rerollArena, rerollCharacter, rerollLimit, rerollScenario, rerollSims, rerollWeapons, rollCharacters, rollMatch, scenarioPool, weaponSetPool,
} from "@/lib/perfectdark/roll";
import type { PdMatch, PdOptions } from "@/lib/perfectdark/types";

const TEAM_COLORS = ["#2f66ec", "#d9502a"];
type Part = "scenario" | "arena" | "weapons" | "limit" | "sims";
const MAX_PLAYERS = 4;

export function PerfectDarkRandomizer() {
  const toast = useToast();
  const [players, setPlayers] = useState(2);
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);
  const [freshSave, setFreshSave] = useState(false);
  const [allowTeams, setAllowTeams] = useState(true);
  const [sims, setSims] = useState(2);
  const [simDifficulties, setSimDifficulties] = useState<string[]>([]);
  const [simSpecials, setSimSpecials] = useState(false);
  const [chaos, setChaos] = useState(false);
  const [cast, setCast] = useState<"main" | "additional">("main");
  const [animate, setAnimate] = useState(true);
  const [match, setMatch] = useState<PdMatch | null>(null);
  const [characters, setCharacters] = useState<(string | null)[]>(Array(MAX_PLAYERS).fill(null));
  const [spins, setSpins] = useState<Record<Part, number>>({ scenario: 0, arena: 0, weapons: 0, limit: 0, sims: 0 });
  const spin = (...keys: Part[]) => setSpins((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, s[k] + 1])) }));

  const opts: PdOptions = { players, freshSave, allowTeams, sims, simDifficulties, simSpecials, chaos, cast };
  const D = PERFECT_DARK;
  const simCap = Math.min(freshSave ? D.simulants.maxSimulantsFreshSave : D.simulants.maxSimulants, D.simulants.maxPlayersPlusSims - players);
  const charReel = characterPool(opts).map((n) => ({ name: n, img: IMAGE_COMING_SOON, color: "#2b2f3a" }));

  const roll = () => {
    setMatch(rollMatch(opts));
    spin("scenario", "arena", "weapons", "limit", "sims");
    track(EVENTS.toolUsed, { tool: "perfect-dark", part: "match" });
  };
  const reroll: Record<Part, () => void> = {
    scenario: () => { if (match) { setMatch(rerollScenario(match, opts)); spin("scenario"); } },
    arena: () => { if (match) { setMatch(rerollArena(match, opts)); spin("arena"); } },
    weapons: () => { if (match) { setMatch(rerollWeapons(match, opts)); spin("weapons"); } },
    limit: () => { if (match) { setMatch(rerollLimit(match)); spin("limit"); } },
    sims: () => { if (match) { setMatch(rerollSims(match, opts)); spin("sims"); } },
  };
  const rollEveryone = () => {
    const picks = rollCharacters(players, opts);
    setCharacters(Array.from({ length: players }, (_, i) => picks[i] ?? null));
    track(EVENTS.toolUsed, { tool: "perfect-dark", part: "characters" });
  };
  const refreshOne = (seat: number) => setCharacters((c) => rerollCharacter(c, seat, opts));

  // Teams and the simulant count depend on the player count, so a new count clears the match; characters keep their seats.
  const setPlayerCount = (n: number) => {
    setPlayers(n);
    setMatch(null);
    setCharacters((c) => Array.from({ length: n }, (_, i) => c[i] ?? null));
  };
  const removePlayer = (seat: number) => {
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setCharacters((c) => [...c.filter((_, j) => j !== seat), null]);
    setPlayers(players - 1);
    setMatch(null);
  };
  const seatNames = Array.from({ length: players }, (_, i) => seatName(i));
  const hasAny = !!match || characters.some(Boolean);
  const copy = () => hasAny && navigator.clipboard.writeText(matchText(match, characters, seatNames)).then(() => { toast.success("Match copied"); track(EVENTS.resultCopied, { tool: "perfect-dark" }); }, () => toast.error("Couldn't copy the match"));

  const refresh = (part: Part, label: string) => (
    <IconButton variant="tertiary" size="small" aria-label={label} title={label} onClick={reroll[part]} disabled={!match}>
      <IconRefresh size={18} />
    </IconButton>
  );
  const rolling = (part: Part, value: string, pool: string[]) =>
    <RollingText key={spins[part]} value={value} pool={pool} spin={animate && spins[part] > 0} />;

  const tiles: { part: Exclude<Part, "arena" | "sims">; label: string; refreshLabel: string; Icon: typeof IconTarget; value?: string; sub?: string | null; pool: string[] }[] = [
    { part: "scenario", label: "Scenario", refreshLabel: "New scenario", Icon: IconTarget, value: match?.scenario.name, sub: match?.scenario.blurb, pool: scenarioPool(opts).map((s) => s.name) },
    { part: "weapons", label: "Weapons", refreshLabel: "New weapons", Icon: IconBomb, value: match?.weaponSet.name, sub: match?.weaponSet.weapons.join(" · "), pool: weaponSetPool(opts).map((w) => w.name) },
    { part: "limit", label: "Time limit", refreshLabel: "New time limit", Icon: IconClock, value: match?.limit, sub: null, pool: D.limits.time },
  ];

  return (
    <div className="goldeneye-randomizer pd-randomizer">
      <div className="randomizer-controls">
        <span className="party-muted">{players} {players === 1 ? "player" : "players"} · {arenaPool(opts).length} arenas · {characterPool(opts).length} characters</span>
        <Button variant="secondary" size="small" iconBefore={IconCopy} disabled={!hasAny} onClick={copy}>Copy match</Button>
      </div>

      <section aria-labelledby="pd-match-h">
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2 id="pd-match-h">Roll the match.</h2>
            <p>Scenario, arena, weapon set, time limit and simulants for {players} {players === 1 ? "player" : "players"}. Tap the refresh button on any part to roll just that one.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" iconBefore={IconDice5} onClick={roll}>{match ? "Roll the match again" : "Roll the match"}</Button>
            </div>
          </div>
          <div className="randomizer-setup">
            <RandomizerOptions summary={[
              sims ? `${Math.min(sims, simCap)} simulant${Math.min(sims, simCap) === 1 ? "" : "s"}` : "No simulants",
              freshSave && "New save only", allowTeams && "Team scenarios", simSpecials && "Special simulants", chaos && "A chaos option",
            ].filter((x): x is string => !!x)}>
              <Select floatingLabel="Simulants" value={String(sims)} onChange={(v) => setSims(Number(v))}
                options={Array.from({ length: D.simulants.maxSimulants + 1 }, (_, n) => ({ value: String(n), label: n === 0 ? "No simulants" : `${n} simulant${n === 1 ? "" : "s"}`, disabled: n > simCap }))} />
              <FilterGroup label="Simulant difficulty" activeValues={simDifficulties} onToggle={(v) => setSimDifficulties((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]))}
                options={(freshSave ? D.simulants.freshDifficulties : D.simulants.difficulties).map((d) => ({ value: d, label: d }))} />
              <FilterGroup label="Rules" activeValues={[freshSave ? "fresh" : "", allowTeams ? "teams" : "", simSpecials ? "specials" : "", chaos ? "chaos" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "fresh") setFreshSave((x) => !x); if (v === "teams") setAllowTeams((x) => !x); if (v === "specials") setSimSpecials((x) => !x); if (v === "chaos") setChaos((x) => !x); }}
                options={[{ value: "fresh", label: "New save only" }, { value: "teams", label: "Team scenarios" }, { value: "specials", label: "Special simulants" }, { value: "chaos", label: "A chaos option" }]} />
              <p className="party-muted">New save only keeps to the 3 arenas, 2 scenarios, 4 simulants and easier difficulties open from the start. Special simulants can roll types like KazeSim (charges in) or PeaceSim (never shoots). A chaos option adds One-Hit Kills, Slow Motion, Paintball or similar.</p>
            </RandomizerOptions>
          </div>
        </div>

        <div className="ge-match">
          <Card variant="elevated" padding="none" className="ge-map">
            <div className="ge-map__art"><IconMap2 size={56} stroke={1.25} aria-hidden /></div>
            <div className="ge-map__body">
              <div className="ge-tile__head">
                <span className="ge-tile__label">Arena{match?.arena.goldeneyeClassic ? " · GoldenEye classic" : ""}</span>
                {refresh("arena", "New arena")}
              </div>
              <p className="ge-map__name">{match ? rolling("arena", match.arena.name, arenaPool(opts).map((a) => a.name)) : "Not rolled yet"}</p>
            </div>
          </Card>

          <div className="ge-tiles">
            {tiles.map((t) => (
              <Card key={t.part} variant="outlined" padding="medium" className="ge-tile">
                <span className="ge-tile__icon" aria-hidden><t.Icon size={20} stroke={1.75} /></span>
                <div className="ge-tile__body">
                  <div className="ge-tile__head">
                    <span className="ge-tile__label">{t.label}</span>
                    {refresh(t.part, t.refreshLabel)}
                  </div>
                  <p className="ge-tile__value">{t.value ? rolling(t.part, t.value, t.pool) : "Not rolled yet"}</p>
                  {t.value && t.sub && <p className="ge-tile__sub">{t.sub}</p>}
                </div>
              </Card>
            ))}
            <Card variant="outlined" padding="medium" className="ge-tile">
              <span className="ge-tile__icon" aria-hidden><IconRobot size={20} stroke={1.75} /></span>
              <div className="ge-tile__body">
                <div className="ge-tile__head">
                  <span className="ge-tile__label">Simulants</span>
                  {refresh("sims", "New simulants")}
                </div>
                {!match ? <p className="ge-tile__value">Not rolled yet</p>
                  : !match.sims.length ? <p className="ge-tile__value">None</p>
                  : (
                    <ul key={spins.sims} className="pd-sims">
                      {match.sims.map((s, i) => (
                        <li key={i}>
                          {match.teams && <Badge size="small" variant={match.teams.sims[i] === 1 ? "info" : "warning"}>Team {match.teams.sims[i]}</Badge>}
                          <strong>{s.difficulty}Sim</strong>{s.type ? ` · ${s.type}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </Card>
            {match?.option && (
              <Card variant="outlined" padding="medium" className="ge-tile">
                <span className="ge-tile__icon" aria-hidden><IconBolt size={20} stroke={1.75} /></span>
                <div className="ge-tile__body">
                  <div className="ge-tile__head"><span className="ge-tile__label">Chaos option</span></div>
                  <p className="ge-tile__value">{match.option}</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="pd-chars-h" className="ge-section">
        <div className="kart-intro kart-intro--single">
          <div className="kart-intro__content">
            <h2 id="pd-chars-h">Pick everyone&apos;s character.</h2>
            <p>Everyone gets a different character. Refresh one player, or reroll everyone; the match stays as it is.</p>
            <div className="kart-intro__actions">
              <Select floatingLabel="Characters" value={freshSave ? "main" : cast} onChange={(v) => setCast(v as "main" | "additional")}
                options={[{ value: "main", label: "Main characters" }, { value: "additional", label: "Additional characters", disabled: freshSave }]} />
              <Button variant="primary" disabled={players >= MAX_PLAYERS} onClick={() => setPlayerCount(players + 1)}>Add Player</Button>
              <Button variant="primary" iconBefore={IconDice5} onClick={rollEveryone}>{characters.some(Boolean) ? "Reroll everyone" : "Randomize Characters"}</Button>
              <Switch label="Rolling animation" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            </div>
            <p className="party-muted">{freshSave
              ? "New save only is on, so it's the bodies open from the start."
              : cast === "main" ? "Joanna's outfits and the named cast: Carrington, Cassandra, Elvis, Trent and more." : "Guards, agents, lab techs and flight crew."}</p>
          </div>
        </div>

        <div className="randomizer-grid">
          {Array.from({ length: players }, (_, i) => {
            const c = characters[i] ?? null;
            const team = match?.teams?.players[i];
            return (
              <div key={i} className="player-card">
                <div className="player-card__header">
                  <div className="player-card__name">
                    <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                  <div className="player-card__actions">
                    <Button variant="primary" size="small" onClick={() => refreshOne(i)}>Refresh Character</Button>
                    {players > 1 && <Button variant="danger" size="small" onClick={() => removePlayer(i)}>Remove Player</Button>}
                  </div>
                </div>
                <ul className="player-card__slots">
                  <KartSlot label="Character" portrait name={c} imageSrc={c ? IMAGE_COMING_SOON : null} fallback={IMAGE_COMING_SOON} empty={<span className="slot-icon" aria-hidden><IconCrosshair size={56} stroke={1.5} /></span>} color={team ? TEAM_COLORS[team - 1] : "#2b2f3a"} pool={charReel} animate={animate} />
                </ul>
                <div className="goldeneye-player__meta">
                  {team && <Badge variant={team === 1 ? "info" : "warning"} size="small">Team {team}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="type-card-disclaimer">GameShuffle is a fan-made tool and isn&apos;t affiliated with or endorsed by Microsoft, Rare or Nintendo. Perfect Dark is a trademark of its owner.</p>
      </section>
    </div>
  );
}
