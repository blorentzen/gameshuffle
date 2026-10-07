/**
 * Hero roulette types, shared by the hero-shooter randomizers (Overwatch,
 * Marvel Rivals). Heroes render as role-coloured tiles with the official
 * portrait (src/lib/heroes/art.ts) once `artReady`. Client-safe.
 */

export type RoleIcon = "shield" | "sword" | "heart" | "star";

export interface HeroRole {
  id: string;
  label: string;
  /** Tile colour for this role. */
  color: string;
  icon: RoleIcon;
}

export interface Hero {
  name: string;
  /** A role id, or "all" for a hero who counts as every role (Deadpool). */
  role: string;
  subRole?: string;
  /** Date the hero went live (YYYY-MM-DD), for "newest heroes" filters and upkeep. */
  released?: string;
}

export interface HeroTeamUp {
  name: string;
  /** The hero who grants the team-up. */
  anchor: string;
  /** Heroes who receive it. */
  partners: string[];
}

export interface HeroMap { name: string; mode: string }

export interface HeroGame {
  slug: string;
  label: string;
  /** Short name for headings ("Overwatch"). */
  short: string;
  roles: HeroRole[];
  heroes: Hero[];
  /** Players on a team. */
  teamSize: number;
  /** The role-queue split for a full team (role id → how many), when the game has one. */
  roleQueue?: Record<string, number>;
  /** Label for the role-queue switch ("Role queue: 1 Tank, 2 Damage, 2 Support"). */
  roleQueueLabel?: string;
  teamUps?: HeroTeamUp[];
  maps: HeroMap[];
  /** When the roster was last checked against the game (YYYY-MM-DD). */
  checkedOn: string;
  /** Every hero has a portrait in public/images/<slug>/heroes (scripts/pull-hero-art.ts). */
  artReady?: boolean;
}
