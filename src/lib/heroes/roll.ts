/**
 * Pure hero roulette draws: a hero per player (optionally following the game's
 * role queue and skipping heroes already played tonight), a Team-Up comp, and
 * a map. No React or I/O; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import type { Hero, HeroGame, HeroMap, HeroTeamUp } from "@/lib/heroes/types";

export interface HeroOptions {
  /** Role ids allowed. Empty = every role. */
  roles: string[];
  /** Follow the role queue (seat i gets the role the queue puts there). */
  roleQueue: boolean;
  /** Heroes already played tonight, left out while others remain. */
  used?: string[];
}

const fits = (h: Hero, role: string) => h.role === role || h.role === "all";

/** The role each seat plays under role queue (Tank first, then Damage, then Support), repeating for bigger groups. */
export function seatRoles(game: HeroGame, players: number): (string | null)[] {
  if (!game.roleQueue) return Array(players).fill(null);
  const order = Object.entries(game.roleQueue).flatMap(([role, n]) => Array(n).fill(role) as string[]);
  return Array.from({ length: players }, (_, i) => order[i % order.length]);
}

export function heroPool(game: HeroGame, o: Pick<HeroOptions, "roles">): Hero[] {
  return o.roles.length ? game.heroes.filter((h) => h.role === "all" || o.roles.includes(h.role)) : game.heroes;
}

/**
 * Heroes who can fill a role-queue seat. The Roles filter narrows the choice,
 * but a seat whose role it leaves out still gets a hero of that role (the queue
 * wins), instead of an empty pool.
 */
function seatPool(game: HeroGame, pool: Hero[], role: string): Hero[] {
  const narrowed = pool.filter((h) => fits(h, role));
  return narrowed.length ? narrowed : game.heroes.filter((h) => fits(h, role));
}

/** A different hero for each player. */
export function rollHeroes(game: HeroGame, players: number, o: HeroOptions, rng: Rng = Math.random): Hero[] {
  const pool = heroPool(game, o);
  const used = new Set(o.used ?? []);
  const roles = o.roleQueue ? seatRoles(game, players) : Array(players).fill(null);
  const taken = new Set<string>();
  return roles.map((role) => {
    const base = role ? seatPool(game, pool, role) : pool;
    const open = base.filter((h) => !taken.has(h.name));
    const fresh = open.filter((h) => !used.has(h.name));
    const h = pick(fresh.length ? fresh : open.length ? open : base, rng)!;
    taken.add(h.name);
    return h;
  });
}

/** A new hero for one seat, keeping the others (and the seat's queue role). */
export function rerollHero(game: HeroGame, current: Hero[], seat: number, o: HeroOptions, rng: Rng = Math.random): Hero {
  const pool = heroPool(game, o);
  const role = o.roleQueue ? seatRoles(game, current.length)[seat] : null;
  const others = new Set(current.filter((_, i) => i !== seat).map((h) => h.name));
  const used = new Set(o.used ?? []);
  const base = (role ? seatPool(game, pool, role) : pool).filter((h) => !others.has(h.name) && h.name !== current[seat]?.name);
  const fresh = base.filter((h) => !used.has(h.name));
  return pick(fresh.length ? fresh : base.length ? base : pool, rng)!;
}

/** A team built around one Team-Up: its anchor and partners first, the rest filled at random. */
export function rollTeamUpComp(game: HeroGame, size: number, rng: Rng = Math.random): { teamUp: HeroTeamUp; heroes: Hero[] } | null {
  const ups = (game.teamUps ?? []).filter((t) => 1 + t.partners.length <= size);
  const teamUp = pick(ups, rng);
  if (!teamUp) return null;
  const byName = new Map(game.heroes.map((h) => [h.name, h]));
  const core = [teamUp.anchor, ...teamUp.partners].map((n) => byName.get(n)).filter((h): h is Hero => !!h);
  const rest = shuffle(game.heroes.filter((h) => !core.includes(h)), rng).slice(0, Math.max(0, size - core.length));
  return { teamUp, heroes: [...core, ...rest] };
}

export function rollMap(game: HeroGame, modes: string[], rng: Rng = Math.random): HeroMap | null {
  const pool = modes.length ? game.maps.filter((m) => modes.includes(m.mode)) : game.maps;
  return pick(pool.length ? pool : game.maps, rng) ?? null;
}

/** The distinct map modes, in list order. */
export function mapModes(game: HeroGame): string[] {
  return [...new Set(game.maps.map((m) => m.mode))];
}
