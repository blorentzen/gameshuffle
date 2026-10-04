"use client";

/**
 * GoldenEye 007 multiplayer randomizer (beta): a scenario, a map that fits the
 * player count, a weapon set and a game length, plus a different character for
 * each of 2 to 4 players (teams for the team scenarios). Character portraits
 * come from the CDN character sheet (see goldeneyePortrait). Only rolls.
 */

import { useCallback, useState } from "react";
import { Badge, Button, Input, Switch } from "@empac/cascadeds";
import { IconCopy, IconCrosshair, IconDice5 } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { IMAGE_COMING_SOON } from "@/components/ImageComingSoon";
import { goldeneyePortrait } from "@/data/game-art";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { characterPool, mapPool, matchText, rerollMap, rerollWeapons, rollCharacters, rollMatch, type GoldenEyeMatch, type GoldenEyeOptions } from "@/lib/goldeneye/roll";

const TEAM_COLORS = ["#2f66ec", "#d9502a"];

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
  const [animate, setAnimate] = useState(true);
  const [match, setMatch] = useState<GoldenEyeMatch | null>(null);

  const opts: GoldenEyeOptions = { players, freshSave, noOddjob, allowTeams, handicaps, cheat };
  const charReel = characterPool(opts).map((n) => ({ name: n, img: goldeneyePortrait(n), color: "#3b3f4a" }));

  const roll = () => {
    setMatch(rollMatch(opts));
    trackEvent("GoldenEye Match Rolled", { players: String(players) });
  };
  const newMap = () => { if (match) setMatch(rerollMap(match, opts)); };
  const newWeapons = () => { if (match) setMatch(rerollWeapons(match)); };
  const rerollCharacter = (seat: number) => {
    if (!match) { roll(); return; }
    const taken = new Set(match.characters.filter((_, i) => i !== seat));
    const next = rollCharacters(32, opts).find((c) => !taken.has(c));
    if (next) setMatch({ ...match, characters: match.characters.map((c, i) => (i === seat ? next : c)) });
  };
  const setPlayerCount = (n: number) => { setPlayers(n); setMatch(null); };
  const removePlayer = (seat: number) => { setNames((n) => [...n.filter((_, j) => j !== seat), ""]); setPlayerCount(players - 1); };
  const copy = () => match && navigator.clipboard.writeText(matchText(match, Array.from({ length: players }, (_, i) => seatName(i)))).then(() => toast.success("Match copied"), () => toast.error("Couldn't copy the match"));

  return (
    <div className="goldeneye-randomizer">
      <div className="randomizer-controls">
        <span className="party-muted">{players} players · {mapPool(opts).length} maps · {characterPool(opts).length} characters</span>
        <Button variant="secondary" size="small" iconBefore={IconCopy} disabled={!match} onClick={copy}>Copy match</Button>
      </div>

      <section>
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2>Roll the whole match.</h2>
            <p>Scenario, map, weapons and game length, plus a character for everyone. 2 to 4 players.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" disabled={players >= 4} onClick={() => setPlayerCount(players + 1)}>Add Player</Button>
              <Button variant="primary" iconBefore={IconDice5} onClick={roll}>{match ? "Roll again" : "Roll the match"}</Button>
              <span style={{ marginLeft: "var(--spacing-12)" }}>
                <Switch label="Rolling animation" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
              </span>
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

        <div className="goldeneye-match">
          {[
            { label: "Scenario", value: match?.scenario.name, sub: match?.scenario.blurb, color: "#1d2b4f" },
            { label: "Map", value: match?.map.name, sub: match ? `Up to ${match.map.maxPlayers} players${match.map.unlock ? ` · ${match.map.unlock}` : ""}` : undefined, color: "#3a2d1c", action: match ? { label: "New map", run: newMap } : undefined },
            { label: "Weapons", value: match?.weaponSet.name, sub: match ? (!match.weaponSet.weapons.length ? "Unarmed only" : match.weaponSet.weapons.join(" · ") === match.weaponSet.name ? undefined : match.weaponSet.weapons.join(" · ")) : undefined, color: "#4a1f1f", action: match && !match.scenario.forcesWeaponSet ? { label: "New weapons", run: newWeapons } : undefined },
            { label: "Game length", value: match?.length.label, sub: match?.cheat ? `Cheat: ${match.cheat}` : undefined, color: "#1f3a2c" },
          ].map((b) => (
            <div key={b.label} className="party-board" style={{ "--party-board": b.color } as React.CSSProperties}>
              <div className="party-board__body">
                <div className="party-board__head">
                  <span className="party-board__label">{b.label}</span>
                  {b.action && <Button size="small" variant="ghost" onClick={b.action.run}>{b.action.label}</Button>}
                </div>
                <p className="party-board__name">{b.value ?? "Roll the match"}</p>
                {b.sub && <p className="goldeneye-match__sub">{b.sub}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="randomizer-grid">
          {Array.from({ length: players }, (_, i) => {
            const c = match?.characters[i] ?? null;
            const team = match?.teams?.[i];
            return (
              <div key={i} className="player-card">
                <div className="player-card__header">
                  <div className="player-card__name">
                    <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                  <div className="player-card__actions">
                    <Button variant="primary" size="small" onClick={() => rerollCharacter(i)}>Refresh Character</Button>
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
