"use client";

/**
 * GoldenEye 007 multiplayer randomizer (beta), in two parts like the Mario Kart
 * page: the match (scenario, a map that fits the player count, weapons, game
 * length; teams for the team scenarios) and a different character for each of
 * 2 to 4 players. Each part of the match has its own refresh button, and
 * rolling the match never touches the characters. Map art comes from the
 * map screenshots, portraits from the character sheet (see game-art). Only rolls.
 */

import { useCallback, useState } from "react";
import { Badge, Button, Card, IconButton, Input, Select, Switch } from "@empac/cascadeds";
import { IconBomb, IconClock, IconCopy, IconCrosshair, IconDice5, IconMap2, IconRefresh, IconTarget, IconWand } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { RollingText } from "@/components/randomizer/RollingText";
import { IMAGE_COMING_SOON } from "@/components/ImageComingSoon";
import { goldeneyeMapArt, goldeneyePortrait } from "@/data/game-art";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { GOLDENEYE_LENGTHS, GOLDENEYE_WEAPON_SETS } from "@/data/goldeneye/multiplayer";
import {
  characterPool, mapPool, matchText, rerollCharacter, rerollLength, rerollMap, rerollScenario, rerollWeapons, rollCharacters, rollMatch, scenarioPool,
  type GoldenEyeCast, type GoldenEyeMatch, type GoldenEyeOptions,
} from "@/lib/goldeneye/roll";

const TEAM_COLORS = ["#2f66ec", "#d9502a"];
type Part = "scenario" | "map" | "weapons" | "length";

export function GoldenEyeRandomizer() {
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [players, setPlayers] = useState(4);
  const [names, setNames] = useState<string[]>(Array(4).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);
  const [freshSave, setFreshSave] = useState(false);
  const [noOddjob, setNoOddjob] = useState(true);
  const [allowTeams, setAllowTeams] = useState(true);
  const [handicaps, setHandicaps] = useState(false);
  const [cheat, setCheat] = useState(false);
  const [cast, setCast] = useState<GoldenEyeCast>("main");
  const [animate, setAnimate] = useState(true);
  const [match, setMatch] = useState<GoldenEyeMatch | null>(null);
  const [characters, setCharacters] = useState<(string | null)[]>(Array(4).fill(null));
  /** Roll counters per part: a part spins only when its own counter moves. */
  const [spins, setSpins] = useState<Record<Part, number>>({ scenario: 0, map: 0, weapons: 0, length: 0 });
  const spin = (...keys: Part[]) => setSpins((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, s[k] + 1])) }));

  const opts: GoldenEyeOptions = { players, freshSave, noOddjob, allowTeams, cast, handicaps, cheat };
  const charReel = characterPool(opts).map((n) => ({ name: n, img: goldeneyePortrait(n), color: "#3b3f4a" }));

  const roll = () => {
    setMatch(rollMatch(opts));
    spin("scenario", "map", "weapons", "length");
    trackEvent("GoldenEye Match Rolled", { players: String(players) });
  };
  const reroll: Record<Part, () => void> = {
    scenario: () => { if (!match) return; const next = rerollScenario(match, opts); setMatch(next); spin("scenario", ...(next.weaponSet.id !== match.weaponSet.id ? ["weapons" as const] : []), ...(next.length.id !== match.length.id ? ["length" as const] : [])); },
    map: () => { if (match) { setMatch(rerollMap(match, opts)); spin("map"); } },
    weapons: () => { if (match) { setMatch(rerollWeapons(match)); spin("weapons"); } },
    length: () => { if (match) { setMatch(rerollLength(match)); spin("length"); } },
  };
  const rollEveryone = () => {
    const picks = rollCharacters(players, opts);
    setCharacters(Array.from({ length: players }, (_, i) => picks[i] ?? null));
    trackEvent("GoldenEye Characters Rolled", { players: String(players) });
  };
  const refreshOne = (seat: number) => setCharacters((c) => rerollCharacter(c, seat, opts));

  // Teams and handicaps depend on the player count, so a new count clears the match; characters keep their seats.
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
  const copy = () => hasAny && navigator.clipboard.writeText(matchText(match, characters, seatNames)).then(() => toast.success("Match copied"), () => toast.error("Couldn't copy the match"));

  const refresh = (part: Part, label: string) => (
    <IconButton variant="tertiary" size="small" aria-label={label} title={label} onClick={reroll[part]} disabled={!match}>
      <IconRefresh size={18} />
    </IconButton>
  );
  const rolling = (part: Part, value: string, pool: string[]) =>
    <RollingText key={spins[part]} value={value} pool={pool} spin={animate && spins[part] > 0} />;

  const weaponsSub = match && (!match.weaponSet.weapons.length ? "Unarmed only" : match.weaponSet.weapons.join(" · ") === match.weaponSet.name ? null : match.weaponSet.weapons.join(" · "));
  const tiles: { part: Exclude<Part, "map">; label: string; refreshLabel: string; Icon: typeof IconTarget; value?: string; sub?: string | null; pool: string[]; canRefresh: boolean }[] = [
    { part: "scenario", label: "Scenario", refreshLabel: "New scenario", Icon: IconTarget, value: match?.scenario.name, sub: match?.scenario.blurb, pool: scenarioPool(opts).map((x) => x.name), canRefresh: scenarioPool(opts).length > 1 },
    { part: "weapons", label: "Weapons", refreshLabel: "New weapons", Icon: IconBomb, value: match?.weaponSet.name, sub: weaponsSub, pool: GOLDENEYE_WEAPON_SETS.map((x) => x.name), canRefresh: !match?.scenario.forcesWeaponSet },
    { part: "length", label: "Game length", refreshLabel: "New game length", Icon: IconClock, value: match?.length.label, sub: match?.scenario.lengths === "lastAlive" ? "Set by the scenario" : null, pool: GOLDENEYE_LENGTHS.map((x) => x.label), canRefresh: !!match && match.scenario.lengths !== "lastAlive" },
  ];

  return (
    <div className="goldeneye-randomizer">
      <div className="randomizer-controls">
        <span className="party-muted">{players} players · {mapPool(opts).length} maps · {characterPool(opts).length} characters</span>
        <Button variant="secondary" size="small" iconBefore={IconCopy} disabled={!hasAny} onClick={copy}>Copy match</Button>
      </div>

      <section aria-labelledby="ge-match-h">
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2 id="ge-match-h">Roll the match.</h2>
            <p>Scenario, map, weapons and game length for {players} players. Tap the refresh button on any part to roll just that one.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" iconBefore={IconDice5} onClick={roll}>{match ? "Roll the match again" : "Roll the match"}</Button>
            </div>
          </div>
          <div className="randomizer-setup">
            <RandomizerOptions summary={[freshSave && "New save only", noOddjob && "No Oddjob", allowTeams && "Team scenarios", handicaps && "Random handicaps", cheat && "A random cheat"].filter((x): x is string => !!x)}>
              <FilterGroup label="Rules" activeValues={[freshSave ? "fresh" : "", noOddjob ? "oddjob" : "", allowTeams ? "teams" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "fresh") setFreshSave((x) => !x); if (v === "oddjob") setNoOddjob((x) => !x); if (v === "teams") setAllowTeams((x) => !x); }}
                options={[{ value: "fresh", label: "New save only" }, { value: "oddjob", label: "No Oddjob" }, { value: "teams", label: "Team scenarios" }]} />
              <FilterGroup label="Chaos" activeValues={[handicaps ? "handicaps" : "", cheat ? "cheat" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "handicaps") setHandicaps((x) => !x); if (v === "cheat") setCheat((x) => !x); }}
                options={[{ value: "handicaps", label: "Random handicaps" }, { value: "cheat", label: "A random cheat" }]} />
              <p className="party-muted">No Oddjob is a house rule almost everyone plays: he&apos;s the shortest character, so auto-aim shoots over his head. New save only keeps to the 6 maps and 8 characters open from the start. Team scenarios get teams, and maps that can&apos;t take your player count are skipped.</p>
            </RandomizerOptions>
          </div>
        </div>

        <div className="ge-match">
          <Card variant="elevated" padding="none" className="ge-map">
            <div className="ge-map__art">
              {match
                // eslint-disable-next-line @next/next/no-img-element -- local map screenshot
                ? <img key={spins.map} className={animate && spins.map ? "is-revealing" : undefined} src={goldeneyeMapArt(match.map.id)} alt="" />
                : <IconMap2 size={56} stroke={1.25} aria-hidden />}
            </div>
            <div className="ge-map__body">
              <div className="ge-tile__head">
                <span className="ge-tile__label">Map</span>
                {refresh("map", "New map")}
              </div>
              <p className="ge-map__name">{match ? rolling("map", match.map.name, mapPool(opts).map((x) => x.name)) : "Not rolled yet"}</p>
              {match && <p className="ge-tile__sub">Up to {match.map.maxPlayers} players{match.map.unlock ? ` · ${match.map.unlock}` : ""}</p>}
            </div>
          </Card>

          <div className="ge-tiles">
            {tiles.map((t) => (
              <Card key={t.part} variant="outlined" padding="medium" className="ge-tile">
                <span className="ge-tile__icon" aria-hidden><t.Icon size={20} stroke={1.75} /></span>
                <div className="ge-tile__body">
                  <div className="ge-tile__head">
                    <span className="ge-tile__label">{t.label}</span>
                    {t.canRefresh && refresh(t.part, t.refreshLabel)}
                  </div>
                  <p className="ge-tile__value">{t.value ? rolling(t.part, t.value, t.pool) : "Not rolled yet"}</p>
                  {t.value && t.sub && <p className="ge-tile__sub">{t.sub}</p>}
                </div>
              </Card>
            ))}
            {match?.cheat && (
              <Card variant="outlined" padding="medium" className="ge-tile">
                <span className="ge-tile__icon" aria-hidden><IconWand size={20} stroke={1.75} /></span>
                <div className="ge-tile__body">
                  <div className="ge-tile__head"><span className="ge-tile__label">Cheat</span></div>
                  <p className="ge-tile__value">{match.cheat}</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="ge-chars-h" className="ge-section">
        <div className="kart-intro kart-intro--single">
          <div className="kart-intro__content">
            <h2 id="ge-chars-h">Pick everyone&apos;s character.</h2>
            <p>Everyone gets a different character. Refresh one player, or reroll everyone; the match stays as it is.</p>
            <div className="kart-intro__actions">
              <Select floatingLabel="Characters" value={freshSave ? "main" : cast} onChange={(v) => setCast(v as GoldenEyeCast)}
                options={[
                  { value: "main", label: "Main characters" },
                  { value: "additional", label: "Additional characters", disabled: freshSave },
                ]} />
              <Button variant="primary" disabled={players >= 4} onClick={() => setPlayerCount(players + 1)}>Add Player</Button>
              <Button variant="primary" iconBefore={IconDice5} onClick={rollEveryone}>{characters.some(Boolean) ? "Reroll everyone" : "Randomize Characters"}</Button>
              <Switch label="Rolling animation" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            </div>
            <p className="party-muted">{freshSave
              ? "New save only is on, so it's the 8 characters open from the start."
              : cast === "main" ? "The named cast: Bond, Natalya, Trevelyan, the villains and friends." : "Soldiers, guards, scientists and the rest of the extras."}</p>
          </div>
        </div>

        <div className="randomizer-grid">
          {Array.from({ length: players }, (_, i) => {
            const c = characters[i] ?? null;
            const team = match?.teams?.[i];
            return (
              <div key={i} className="player-card">
                <div className="player-card__header">
                  <div className="player-card__name">
                    <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                  <div className="player-card__actions">
                    <Button variant="primary" size="small" onClick={() => refreshOne(i)}>Refresh Character</Button>
                    {players > 2 && <Button variant="danger" size="small" onClick={() => removePlayer(i)}>Remove Player</Button>}
                  </div>
                </div>
                <ul className="player-card__slots">
                  <KartSlot label="Character" portrait name={c} imageSrc={c ? goldeneyePortrait(c) : null} fallback={IMAGE_COMING_SOON} empty={<span className="slot-icon" aria-hidden><IconCrosshair size={56} stroke={1.5} /></span>} color={team ? TEAM_COLORS[team - 1] : "#3b3f4a"} pool={charReel} animate={animate} />
                </ul>
                <div className="goldeneye-player__meta">
                  {team && <Badge variant={team === 1 ? "info" : "warning"} size="small">Team {team}</Badge>}
                  {match?.handicaps[i] && <span className="party-muted">{match.handicaps[i]}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="type-card-disclaimer">GameShuffle is a fan-made tool and isn&apos;t affiliated with or endorsed by Nintendo, Rare, MGM, Danjaq or Eon Productions. GoldenEye and James Bond are trademarks of their owners.</p>
      </section>
    </div>
  );
}
