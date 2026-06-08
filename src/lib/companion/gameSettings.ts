/**
 * Game settings — per-session preferences chosen at New Game time
 * (or imported from a saved-state row in Phase 2).
 *
 * Lives in `SessionState` because settings persist across the
 * game's lifetime and need to survive RESET_GAME (we reset to
 * defaults when a new New Game flow starts).
 *
 * Format presets cover the common case. "Custom" unlocks per-field
 * editing so anyone playing a house-rule variation can dial in
 * their own combo (lower prize count for sudden-death matches,
 * smaller bench, no Mega ex / VMAX cards, etc.).
 *
 * The defaults are wired to Pokémon Mode's standard TCG rules; if
 * a future mode (Magic, Lorcana) ships, it would seed its own
 * format presets via mode config.
 */

export const GAME_FORMAT_KEYS = [
  "standard",
  "miniGame",
  "suddenDeath",
  "custom",
] as const;

export type GameFormatKey = (typeof GAME_FORMAT_KEYS)[number];

/** All per-game settings stored on the session. */
export interface GameSettings {
  /** Which preset (or `"custom"` for hand-tuned). Display only —
   *  the rules below are the actual gameplay knobs. */
  format: GameFormatKey;
  /** Number of win-resource units (Pokémon: prize cards) per player.
   *  Override of `mode.winCounterStart`. */
  prizeCount: number;
  /** Number of bench slots rendered per player. The data model
   *  always has 5; the UI hides positions beyond this. */
  benchSize: number;
  /** When true, the Mega ex / VMAX (3-prize) Card Type option is
   *  available in the placement / evolve flow. False forces only
   *  Basic + ex/V choices. */
  allowMega: boolean;
  /** When true, a `UPDATE_PIECE_META` action that changes `koValue`
   *  clears all conditions on the slot (TCG-accurate evolution
   *  rule). Off = custom-mode override that leaves conditions in
   *  place across evolutions. */
  evolutionClearsConditions: boolean;
  /** True once the player has confirmed game settings — the
   *  board renders, the New Game modal hides. RESET_GAME flips
   *  this back to false so the modal returns. */
  gameStarted: boolean;
}

/** Preset metadata shown in the GameSettingsModal picker. */
export interface GameFormatDef {
  key: GameFormatKey;
  label: string;
  description: string;
  /** CDS icon name for the preset card. */
  icon: string;
  /** Default settings the preset applies when selected. */
  settings: Omit<GameSettings, "format" | "gameStarted">;
}

export const GAME_FORMATS: ReadonlyArray<GameFormatDef> = [
  {
    key: "standard",
    label: "Standard TCG",
    description:
      "Full Pokémon TCG rules — 6 prize cards, 5 bench, all card types allowed.",
    // `cards` (Tabler's playing-card-stack glyph) — comes in via the
    // shared TablerIcon wrapper rather than CDS, since CDS doesn't
    // re-export this one. Reads as "TCG deck" at a glance.
    icon: "cards",
    settings: {
      prizeCount: 6,
      benchSize: 5,
      allowMega: true,
      evolutionClearsConditions: true,
    },
  },
  {
    key: "miniGame",
    label: "Mini-game",
    description:
      "Quick 3-prize match. Same full ruleset, just a faster path to game over.",
    icon: "bolt",
    settings: {
      prizeCount: 3,
      benchSize: 5,
      allowMega: true,
      evolutionClearsConditions: true,
    },
  },
  {
    key: "suddenDeath",
    label: "Sudden death",
    description:
      "First KO wins. 1 prize, 3 bench — no second chances, no Mega cards.",
    icon: "flame",
    settings: {
      prizeCount: 1,
      benchSize: 3,
      allowMega: false,
      evolutionClearsConditions: true,
    },
  },
  {
    key: "custom",
    label: "Custom",
    description:
      "House rules — pick your own prize count, bench size, and toggles.",
    icon: "settings",
    settings: {
      prizeCount: 6,
      benchSize: 5,
      allowMega: true,
      evolutionClearsConditions: true,
    },
  },
];

/** Default settings the session boots with before the user opens
 *  the New Game modal — Standard TCG with the gate closed
 *  (`gameStarted: false`). */
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  format: "standard",
  prizeCount: 6,
  benchSize: 5,
  allowMega: true,
  evolutionClearsConditions: true,
  gameStarted: false,
};

export function formatByKey(key: GameFormatKey): GameFormatDef {
  const def = GAME_FORMATS.find((f) => f.key === key);
  if (!def) throw new Error(`Unknown game format: ${key}`);
  return def;
}
