/**
 * Airtime's names (pure, client-safe). The game's name is a working name, so
 * every place that shows it reads GAME_NAME: renaming the game is an edit here.
 * Weapons, enemies and the course are named here too.
 */

/** The game's display name (working name, not settled). */
export const GAME_NAME = "Airtime";

/** The one course so far. */
export const COURSE_NAME = "City rooftops";

export type WeaponKind = "blaster" | "spread" | "rapid";

export const WEAPON_NAMES: Record<WeaponKind, string> = {
  blaster: "Blaster",
  spread: "Spread",
  rapid: "Rapid",
};

export const WEAPON_LINES: Record<WeaponKind, string> = {
  blaster: "One shot at the nearest enemy ahead.",
  spread: "Three shots in a fan.",
  rapid: "Fast single shots.",
};

export type EnemyKind = "walker" | "flyer" | "turret";

export const ENEMY_NAMES: Record<EnemyKind, string> = {
  walker: "Walker",
  flyer: "Flyer",
  turret: "Turret",
};
