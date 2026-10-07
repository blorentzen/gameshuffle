"use client";

/**
 * Hero roulette for hero shooters (Overwatch, Marvel Rivals): a different hero
 * for each player, optionally following the role queue and skipping heroes
 * already played tonight; a Team-Up team (Marvel Rivals); and a map. Names
 * only: heroes render as role-coloured tiles with our own icons. Built from the
 * Mario Kart randomizer pieces (intro card, Options drawer, player cards).
 */

import { useCallback, useState } from "react";
import { Badge, Button, Card, IconButton, Input, Switch } from "@empac/cascadeds";
import { CardActions } from "@/components/randomizer/CardActions";
import { seatLabel } from "@/lib/randomizers/seats";
import { IconCopy, IconDice5, IconHeart, IconMap2, IconRefresh, IconShield, IconStar, IconSword, IconUsersGroup } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { RollingText, useRollFrames } from "@/components/randomizer/RollingText";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { heroPool, mapModes, rerollHero, rollHeroes, rollMap, rollTeamUpComp, seatRoles } from "@/lib/heroes/roll";
import type { Hero, HeroGame, HeroMap, HeroRole, HeroTeamUp, RoleIcon } from "@/lib/heroes/types";

const ICONS: Record<RoleIcon, typeof IconShield> = { shield: IconShield, sword: IconSword, heart: IconHeart, star: IconStar };
const MAX_PLAYERS = 6;

function roleOf(game: HeroGame, hero: Hero): HeroRole | { id: "all"; label: string; color: string; icon: RoleIcon } {
  return game.roles.find((r) => r.id === hero.role) ?? { id: "all", label: "Every role", color: "#7a5af8", icon: "star" };
}

/** One hero as a tile: role colour, our role icon, name, role and sub-role. Spins through the pool when it mounts with a reel. */
function HeroTile({ game, hero, reel, queueRole }: { game: HeroGame; hero: Hero | null; reel?: Hero[]; queueRole?: string | null }) {
  const frame = useRollFrames(reel, !!reel?.length);
  const shown = frame ?? hero;
  const queue = queueRole ? game.roles.find((r) => r.id === queueRole) : null;
  if (!shown) {
    const Icon = queue ? ICONS[queue.icon] : IconDice5;
    return (
      <div className="hero-tile hero-tile--empty" style={{ "--hero-color": queue?.color ?? "#3b3f4a" } as React.CSSProperties}>
        <span className="hero-tile__icon" aria-hidden><Icon size={40} stroke={1.5} /></span>
        <span className="hero-tile__name">{queue ? `${queue.label} slot` : "Roll a hero"}</span>
      </div>
    );
  }
  const role = roleOf(game, shown);
  const Icon = ICONS[role.icon];
  return (
    <div className={`hero-tile${frame ? " is-rolling" : ""}`} style={{ "--hero-color": role.color } as React.CSSProperties} aria-hidden={frame ? true : undefined}>
      <span className="hero-tile__icon" aria-hidden><Icon size={40} stroke={1.5} /></span>
      <span className="hero-tile__name">{shown.name}</span>
      <span className="hero-tile__role">{role.label}{shown.subRole ? ` · ${shown.subRole}` : ""}</span>
    </div>
  );
}

export function HeroRoulette({ game }: { game: HeroGame }) {
  const toast = useToast();
  const [players, setPlayers] = useState(1);
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);
  const [roles, setRoles] = useState<string[]>([]);
  const [roleQueue, setRoleQueue] = useState(false);
  const [noRepeats, setNoRepeats] = useState(false);
  const [used, setUsed] = useState<string[]>([]);
  const [heroes, setHeroes] = useState<(Hero | null)[]>([]);
  const [spins, setSpins] = useState<number[]>([]);
  const [animate, setAnimate] = useState(true);
  const [teamUp, setTeamUp] = useState<{ teamUp: HeroTeamUp; heroes: Hero[] } | null>(null);
  const [teamUpSpin, setTeamUpSpin] = useState(0);
  const [modes, setModes] = useState<string[]>([]);
  const [map, setMap] = useState<HeroMap | null>(null);
  const [mapSpin, setMapSpin] = useState(0);

  const opts = { roles, roleQueue: roleQueue && !!game.roleQueue, used: noRepeats ? used : [] };
  const pool = heroPool(game, { roles });
  const queueRoles = opts.roleQueue ? seatRoles(game, players) : Array(players).fill(null);
  const bump = (seats: number[]) => setSpins((cur) => { const n = [...cur]; seats.forEach((s) => { n[s] = (n[s] ?? 0) + 1; }); return n; });

  const rollEveryone = () => {
    const next = rollHeroes(game, players, opts);
    setHeroes(next);
    bump(next.map((_, i) => i));
    track(EVENTS.toolUsed, { tool: game.slug, part: "heroes" });
  };
  const refreshOne = (seat: number) => {
    // This seat only, even when others haven't rolled yet.
    const current = Array.from({ length: players }, (_, i) => heroes[i] ?? null);
    const h = rerollHero(game, current, seat, opts);
    setHeroes(current.map((x, i) => (i === seat ? h : x)));
    bump([seat]);
  };
  /** Smashdown style: tonight's heroes go on the used list, then everyone rolls again. */
  const nextGame = () => {
    const nextUsed = [...new Set([...used, ...heroes.filter((h): h is Hero => !!h).map((h) => h.name)])];
    setUsed(nextUsed);
    const next = rollHeroes(game, players, { ...opts, used: nextUsed });
    setHeroes(next);
    bump(next.map((_, i) => i));
  };
  const setPlayerCount = (n: number) => { setPlayers(n); setHeroes((h) => h.slice(0, n)); };
  const removePlayer = (seat: number) => {
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setHeroes((h) => h.filter((_, j) => j !== seat));
    setPlayers((p) => p - 1);
  };
  const copy = () => {
    const lines = [`${game.label} heroes`, ...Array.from({ length: players }, (_, i) => `${seatName(i)}: ${heroes[i]?.name ?? "?"}`)];
    if (map) lines.push(`Map: ${map.name} (${map.mode})`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => { toast.success("Heroes copied"); track(EVENTS.resultCopied, { tool: game.slug }); }, () => toast.error("Couldn't copy that"));
  };

  const roleSummary = roles.length ? game.roles.filter((r) => roles.includes(r.id)).map((r) => r.label).join(", ") : "";
  const allModes = mapModes(game);

  return (
    <div className="hero-roulette">
      <div className="randomizer-controls">
        <span className="party-muted">{game.heroes.length} heroes · roster checked {new Date(`${game.checkedOn}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
        <Button variant="secondary" size="small" iconBefore={IconCopy} disabled={!heroes.some(Boolean)} onClick={copy}>Copy heroes</Button>
      </div>

      <section aria-labelledby="hero-roll-h">
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2 id="hero-roll-h">Roll your heroes.</h2>
            <p>A different hero for each player, up to {MAX_PLAYERS}. {pool.length} heroes in the pool{noRepeats && used.length ? `, ${used.length} already played tonight` : ""}.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" disabled={players >= MAX_PLAYERS} onClick={() => setPlayerCount(players + 1)}>Add Player</Button>
              <Button variant="primary" iconBefore={IconDice5} onClick={rollEveryone}>{heroes.some(Boolean) ? "Reroll everyone" : "Roll heroes"}</Button>
              {noRepeats && heroes.some(Boolean) && <Button variant="secondary" onClick={nextGame}>Next game (no repeats)</Button>}
              {noRepeats && used.length > 0 && <Button variant="ghost" onClick={() => setUsed([])}>Reset the night</Button>}
              <Switch label="Rolling animation" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            </div>
          </div>
          <div className="randomizer-setup">
            <RandomizerOptions
              empty="Every hero is in the mix"
              summary={[roleSummary, opts.roleQueue ? "Role queue" : "", noRepeats ? "No repeats tonight" : ""].filter(Boolean)}>
              <FilterGroup label="Roles" activeValues={roles} onToggle={(v) => setRoles((r) => (r.includes(v) ? r.filter((x) => x !== v) : [...r, v]))}
                options={game.roles.map((r) => ({ value: r.id, label: r.label }))} />
              <FilterGroup label="Rules" activeValues={[roleQueue ? "queue" : "", noRepeats ? "norepeat" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "queue") setRoleQueue((x) => !x); if (v === "norepeat") setNoRepeats((x) => !x); }}
                options={[...(game.roleQueue ? [{ value: "queue", label: game.roleQueueLabel ?? "Role queue" }] : []), { value: "norepeat", label: "No repeats tonight" }]} />
              <p className="party-muted">Role queue gives each seat the role the game&apos;s queue puts there. No repeats tonight keeps everyone off heroes they&apos;ve already played until the pool runs out; use Next game between matches.</p>
            </RandomizerOptions>
          </div>
        </div>

        <div className="randomizer-grid">
          {Array.from({ length: players }, (_, i) => (
            <div key={i} className="player-card">
              <div className="player-card__header">
                <div className="player-card__name">
                  <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
                <CardActions
                  refreshLabel={`New hero for ${seatLabel(names, i)}`} onRefresh={() => refreshOne(i)}
                  removeLabel={`Remove ${seatLabel(names, i)}`} onRemove={players > 1 ? () => removePlayer(i) : undefined} />
              </div>
              <HeroTile key={`${i}-${spins[i] ?? 0}`} game={game} hero={heroes[i] ?? null} queueRole={queueRoles[i]} reel={animate && spins[i] ? pool : undefined} />
            </div>
          ))}
        </div>
      </section>

      {game.teamUps?.length ? (
        <section aria-labelledby="hero-teamup-h" className="ge-section">
          <div className="kart-intro kart-intro--single">
            <div className="kart-intro__content">
              <h2 id="hero-teamup-h">Roll a Team-Up team.</h2>
              <p>Pick one of {game.teamUps.length} Team-Ups at random and build a {game.teamSize}-hero team around it: the heroes who make it work first, the rest at random.</p>
              <div className="kart-intro__actions">
                <Button variant="primary" iconBefore={IconUsersGroup} onClick={() => { setTeamUp(rollTeamUpComp(game, game.teamSize)); setTeamUpSpin((n) => n + 1); track(EVENTS.toolUsed, { tool: game.slug, part: "team-up" }); }}>{teamUp ? "Roll another" : "Roll a Team-Up team"}</Button>
              </div>
            </div>
          </div>
          {teamUp && (
            <Card variant="outlined" padding="medium" className="hero-teamup">
              <p className="ge-tile__label">Team-Up</p>
              <p className="ge-tile__value"><RollingText key={teamUpSpin} value={teamUp.teamUp.name} pool={game.teamUps.map((t) => t.name)} spin={animate && teamUpSpin > 0} /></p>
              <p className="ge-tile__sub">{teamUp.teamUp.anchor} with {teamUp.teamUp.partners.join(", ")}</p>
              <ul className="hero-teamup__list">
                {teamUp.heroes.map((h) => {
                  const core = h.name === teamUp.teamUp.anchor || teamUp.teamUp.partners.includes(h.name);
                  return <li key={h.name}><Badge size="small" variant={core ? "info" : "default"}>{core ? "Team-Up" : roleOf(game, h).label}</Badge> {h.name}</li>;
                })}
              </ul>
            </Card>
          )}
        </section>
      ) : null}

      <section aria-labelledby="hero-map-h" className="ge-section">
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2 id="hero-map-h">Roll the map.</h2>
            <p>{game.maps.length} maps across {allModes.length} modes.</p>
            <div className="kart-intro__actions">
              <Button variant="primary" iconBefore={IconMap2} onClick={() => { setMap(rollMap(game, modes)); setMapSpin((n) => n + 1); track(EVENTS.toolUsed, { tool: game.slug, part: "map" }); }}>{map ? "Roll another map" : "Roll a map"}</Button>
            </div>
          </div>
          <div className="randomizer-setup">
            <RandomizerOptions title="Map options" empty="Every mode" summary={modes}>
              <FilterGroup label="Modes" activeValues={modes} onToggle={(v) => setModes((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]))}
                options={allModes.map((m) => ({ value: m, label: m }))} />
            </RandomizerOptions>
          </div>
        </div>
        {map && (
          <Card variant="outlined" padding="medium" className="ge-tile hero-map">
            <span className="ge-tile__icon" aria-hidden><IconMap2 size={20} stroke={1.75} /></span>
            <div className="ge-tile__body">
              <div className="ge-tile__head">
                <span className="ge-tile__label">{map.mode}</span>
                <IconButton variant="tertiary" size="small" aria-label="New map" title="New map" onClick={() => { setMap(rollMap(game, modes)); setMapSpin((n) => n + 1); }}><IconRefresh size={18} /></IconButton>
              </div>
              <p className="ge-tile__value"><RollingText key={mapSpin} value={map.name} pool={game.maps.map((m) => m.name)} spin={animate && mapSpin > 0} /></p>
            </div>
          </Card>
        )}
      </section>

      <p className="type-card-disclaimer">GameShuffle is a fan-made tool and isn&apos;t affiliated with or endorsed by the makers of {game.label}. Hero and map names belong to their owners.</p>
    </div>
  );
}
