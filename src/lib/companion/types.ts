/**
 * Companion — generic TCG types.
 *
 * The architecture is TCG-agnostic. Pokémon Mode (v1) is one
 * `ModeConfig`; future modes (Magic, Lorcana, One Piece) layer in as
 * additional configs against the same engine. Component code reads
 * labels and rule defaults from a `ModeConfig` — it MUST NOT bake in
 * "Poison", "Burn", "Prize Cards", "Active", or "Bench" as strings.
 *
 * Persistence model (v1): all of this state is in-memory. Only game
 * RESULTS persist (Wave 3). A reload restarts the game.
 */

export type PlayerId = "p1" | "p2";

/** A board position. v1 = 1 active + 5 bench per player; the engine
 *  is structured so adding/removing bench rows in a future mode is
 *  a `ModeConfig` change, not a component edit. */
export type SlotPosition = "active" | "bench_1" | "bench_2" | "bench_3" | "bench_4" | "bench_5";

export const BENCH_POSITIONS: ReadonlyArray<SlotPosition> = [
  "bench_1",
  "bench_2",
  "bench_3",
  "bench_4",
  "bench_5",
];

export const ALL_POSITIONS: ReadonlyArray<SlotPosition> = [
  "active",
  ...BENCH_POSITIONS,
];

/** Per-slot state. Field names are generic; the mode config supplies
 *  user-facing labels. */
export interface SlotState {
  player: PlayerId;
  position: SlotPosition;
  occupied: boolean;
  name: string | null;
  /** Max HP the player typed in. Optional — not all TCGs surface HP
   *  the same way; v1 displays it next to damage but doesn't enforce
   *  KO at hp boundary (player declares the KO). */
  maxHp: number | null;
  /** Current damage. Always >= 0; subtract operations clamp at 0. */
  damage: number;
  /** Win-resource cost when this slot's piece is KO'd. Pokémon Mode:
   *  number of prize cards drawn (1/2/3). Generic name: "ko_value". */
  koValue: number;
  /** Generic condition flags. Pokémon Mode labels: Poison (A), Burn (B).
   *  Both can be true simultaneously per the wedge rules — they're
   *  independent toggles in the data model. The A/B special-case
   *  exists because the Checkup state machine wedge logic
   *  (Poison-before-Burn, KO interrupts) hangs off them. Extra
   *  conditions that don't feed into Checkup live in
   *  `extraConditions` below. */
  conditionA: boolean;
  conditionB: boolean;
  /** Optional informational status conditions defined by the mode
   *  (e.g. Pokémon's Asleep / Paralyzed / Confused — the trio that
   *  the v1 Scope deliberately excluded from the data model). These
   *  do NOT feed into the Checkup state machine; they exist for
   *  accessibility (new players don't know the physical-card
   *  rotation convention). Keyed by `ExtraConditionDef.key` from
   *  the mode's `extraConditions` array. */
  extraConditions: Record<string, boolean>;
  /** Slot personalization (Scope §11, revised) — opaque theme key.
   *  The available theme keys are defined by the active mode's
   *  `slotThemes` (so Pokémon Mode ships type names like "fire",
   *  Magic Mode would ship mana colors, etc.). Default = "none"
   *  reads as unstyled. The slot stores the string verbatim; the
   *  CSS keys off `data-slot-theme="<key>"`. */
  slotTheme: string;
  /** Attached resource units that fuel attacks (Pokémon: energy
   *  cards, Magic: mana, Lorcana: ink, etc.). Keyed by
   *  `EnergyTypeDef.key` from the mode's `energyTypes` array. Counts
   *  are >= 0; entries that hit 0 may be left in the map or omitted
   *  — the UI filters > 0 before rendering badges. Travels with the
   *  piece through MOVE_PIECE / UPDATE_PIECE_META (retreat cost is
   *  a manual discard the user makes via the UI). */
  energies: Record<string, number>;
}

export interface CoinFlipEntry {
  /** "heads" / "tails" outcome — but the labels are mode-driven. The
   *  raw outcome is a binary side; the mode config maps it to a
   *  display label. */
  side: "a" | "b";
  /** Stable id for list keys. We can't use Date.now() in a reducer
   *  pure-function without poisoning it, so a counter is threaded
   *  through the session state. */
  id: number;
}

export interface DiceRollEntry {
  faces: number;
  result: number;
  id: number;
}

/** Optional status condition that's mode-defined and informational.
 *  Does NOT feed into the Checkup state machine — those primary
 *  conditions are `conditionA` / `conditionB` on the mode config. */
export interface ExtraConditionDef {
  /** Stable string id — used as the key in `SlotState.extraConditions`. */
  key: string;
  /** Human label — shown in the modal toggle + as the badge tooltip. */
  label: string;
  /** CDS icon name (kebab-case). Rendered at 16/20px inside the badge. */
  icon: string;
  /** Hex/CSS color for the badge background. */
  color: string;
  /** Long-form educational text — surfaced in the Resolve modal so
   *  new players learn what each condition does and how to track it
   *  on their physical cards. Two short sentences is the target. */
  description: string;
  /** Optional mutual-exclusion group. Toggling on a condition in
   *  this group auto-clears any other condition in the same group
   *  on the same slot. Used to enforce Pokémon's "only one of
   *  Asleep / Paralyzed / Confused at a time" rule. */
  exclusiveGroup?: string;
  /** When true, the Resolve modal offers a coin flip on the done
   *  step for each affected slot — heads clears the condition,
   *  tails leaves it on. Pokémon Asleep uses this; Paralyzed
   *  auto-clears on the next turn (no flip) and Confused's flip
   *  happens before attacking, not in checkup. */
  checkupCoinClear?: boolean;
}

// Resolve is now a flat-list modal rather than a step-by-step
// walker; the activeCheckup state field and its CheckupStepKind
// were removed in the v2 UX refactor. Each Resolve action — Poison
// damage, Burn damage + coin, Sleep flip — dispatches against the
// slot directly. KO detection still lives in the reducer (via the
// APPLY_DAMAGE_WITH_KO_CHECK action). The wedge-correctness logic
// is still mathematically true (damage is commutative), but the UI
// no longer forces a canonical order.

export interface SessionState {
  slots: SlotState[];
  /** Per-game preferences (format, prize count, bench size, etc.).
   *  Chosen at New Game time via the GameSettingsModal. The
   *  `gameStarted` flag inside doubles as a gate — when false the
   *  board hides behind the settings modal. RESET_GAME flips it
   *  back to false. */
  gameSettings: import("./gameSettings").GameSettings;
  /** Player labels — surfaced in the board headers and persisted to
   *  the game-result row on game-end. Defaults to "Player 1" /
   *  "Player 2" so the board is always usable; users can rename
   *  inline in the header. */
  playerNames: Record<PlayerId, string>;
  /** Mode-agnostic counters per player. Pokémon Mode label: "Prize
   *  Cards". Direction (down = count toward 0; up = count toward a
   *  target) is in mode config. */
  winCounters: Record<PlayerId, number>;
  /** Coin-flip history. Capped at 5 by the reducer per spec §5. */
  coinHistory: CoinFlipEntry[];
  /** Dice-roll history. Capped at 5 by the reducer. */
  diceHistory: DiceRollEntry[];
  /** Monotonic id used to stamp history entries — avoids
   *  `Date.now()` (impure) in the reducer. */
  nextHistoryId: number;
  /** Set when a player's win counter crossed the game-end threshold.
   *  Game-end persistence (writing to a DB row) is Wave 3; this
   *  field exists so the UI can surface the prompt now. */
  winner: PlayerId | null;
  /** ID of the `companion_save_states` row this session was loaded
   *  from, or set after a fresh save lands. Drives the Save modal's
   *  "Update existing" vs "Save as new" affordance. Cleared by
   *  RESET_GAME and APPLY_GAME_SETTINGS so a new game starts
   *  un-linked. */
  loadedFromSaveId: string | null;
}

/** Direction the win-resource counter moves on a KO. */
export type WinCounterDirection = "down" | "up";

/** Mode configuration. v1 ships exactly one (`pokemonMode`). The
 *  shape exists to keep component code free of TCG-specific strings —
 *  not because the abstraction is stress-tested yet. See v1 Scope
 *  §"Technical scope, note on the mode abstraction". */
export interface ModeConfig {
  /** Stable mode key — persisted as the `mode` column on game_session
   *  in Wave 3. */
  key: string;
  /** Human label for the mode (shown in UI chrome, e.g. "Pokémon"). */
  displayName: string;

  /** Position display labels. Pokémon: Active / Bench. Other TCGs
   *  may rename ("Battle Zone", "Reserve"). */
  positionLabels: {
    active: string;
    bench: string;
  };

  /** Condition toggle labels — Wave 2 wires these into the slot UI.
   *  v1 ships both as Pokémon labels but the engine treats them as
   *  opaque `condition_a` / `condition_b`. */
  conditionALabel: string;
  conditionAEffect: string;
  /** Long-form educational text for condition A — surfaced in the
   *  Resolve modal alongside each step so new players learn what
   *  the condition does. */
  conditionADescription: string;
  /** Damage applied during checkup when condition A is on. Pokémon
   *  Mode: 10 (Poison). */
  conditionADamage: number;
  /** CDS Icon name to render in the condition badge. Pokémon Mode:
   *  `"droplet"` for Poison. Future modes can map to whatever icon
   *  fits their semantic. */
  conditionAIcon: string;
  /** Hex/CSS color for the condition badge background. Pokémon
   *  Mode: purple for Poison, red for Burn. */
  conditionAColor: string;
  conditionBLabel: string;
  conditionBEffect: string;
  /** Long-form educational text for condition B. */
  conditionBDescription: string;
  /** Damage applied during checkup when condition B is on. Pokémon
   *  Mode: 20 (Burn). */
  conditionBDamage: number;
  conditionBIcon: string;
  conditionBColor: string;
  /** Optional roster of mode-specific status conditions that show
   *  as informational badges on the slot but don't drive Checkup
   *  logic. Pokémon Mode ships Asleep / Paralyzed / Confused —
   *  helps new players who don't know the physical-card rotation
   *  convention. */
  extraConditions: ReadonlyArray<ExtraConditionDef>;
  /** Whether condition B requires a coin flip after the damage is
   *  applied (heads = cure). Pokémon Burn does; a future mode's
   *  condition B might not. */
  conditionBCoinAfterDamage: boolean;

  /** Win-counter label + start value + direction. Pokémon: "Prize
   *  Cards", 6, down. Magic Mode would be "Life", 20, down (Lorcana
   *  is up to 20). */
  winCounterLabel: string;
  winCounterStart: number;
  winCounterDirection: WinCounterDirection;

  /** Damage increment buttons offered in the slot controls. */
  damageIncrements: ReadonlyArray<number>;

  /** Allowed KO values (number of win-resource units the slot's
   *  piece "costs" on KO). Pokémon: [1, 2, 3] for Basic / ex/V /
   *  Mega ex/VMAX. */
  koValueOptions: ReadonlyArray<number>;
  /** Human-readable label for each KO value — keys match values in
   *  `koValueOptions`. Used by the placement form so players see
   *  "Basic" / "ex / V" / "Mega ex / VMAX" alongside the prize
   *  count. Missing entries fall back to the bare number. */
  koValueLabels: Record<number, string>;
  /** Default KO value when a slot is placed via the form. */
  koValueDefault: number;

  /** Coin label pair. Pokémon: heads / tails. */
  coinLabels: {
    a: string;
    b: string;
  };

  /** Available dice. v1 ships d6 only; engine supports more so a
   *  mode config can add d10 / d20 etc. without component changes. */
  diceFaceOptions: ReadonlyArray<number>;
  diceFaceDefault: number;

  /** Resolution order for end-of-turn condition damage — Wave 2's
   *  correctness wedge. Listed here so adding Magic mode (no
   *  Poison/Burn equivalent) is config, not a code change. */
  resolutionOrder: ReadonlyArray<"condition_a" | "condition_b">;

  /** Feature flags for utilities — a mode may not use them. */
  coinFlipEnabled: boolean;
  diceEnabled: boolean;

  /** Passive reminder shown as a footer in the checkup prompt for
   *  conditions the engine deliberately does NOT track (Pokémon:
   *  orientation-based Asleep / Paralyzed / Confused). Null = no
   *  footer. v1 Scope §4 — closes the silent-friction gap without
   *  dragging orientation state into the data model. */
  checkupFooterReminder: string | null;

  /** Available slot themes for cosmetic personalization (Scope §11).
   *  Each mode ships its own list — Pokémon Mode ships TCG type
   *  themes, Magic Mode (later) would ship mana-color themes, etc.
   *  Keys are mode-local; the slot stores the chosen key verbatim
   *  and the CSS keys off `data-slot-theme="<key>"`. */
  slotThemes: ReadonlyArray<import("./styling").SlotTheme>;

  /** Turn structure reference shown in the Turn information modal —
   *  ordered list of phases with their typical actions. New players
   *  use this to learn how a turn flows. */
  turnReference: ReadonlyArray<TurnPhase>;

  /** Attached-resource catalog (Pokémon: energy types, Magic: mana
   *  colors, Lorcana: inks). When empty, the Energy section in the
   *  slot's action sheet hides entirely. Otherwise each entry
   *  contributes a +/- counter chip + a badge on the slot for non-
   *  zero counts. */
  energyTypes: ReadonlyArray<EnergyTypeDef>;
}

/** One energy / resource type. Mode-defined so Pokémon's "Fire"
 *  energy and Magic's "Red" mana share the same shape. */
export interface EnergyTypeDef {
  /** Stable string id — used as the key in `SlotState.energies`. */
  key: string;
  /** Display label shown in the +/- row and on slot badges. */
  label: string;
  /** Saturated brand color used for the badge background + the
   *  energy chip in the action sheet. Hex string. */
  color: string;
  /** Icon name fed to the shared `TablerIcon` wrapper — CDS first,
   *  Tabler-direct as fallback (see `EXTRAS` map in TablerIcon). */
  icon: string;
  /** When true, the badge renders text white over the color. Pick
   *  per-color so light-on-color stays legible. */
  invertText?: boolean;
}

/** One phase of a turn — shown in the Turn information modal as a
 *  card with title + summary + bulleted actions. */
export interface TurnPhase {
  /** Display title for the phase (e.g. "Draw a card", "Attack"). */
  title: string;
  /** One-sentence summary of what happens this phase. */
  summary: string;
  /** Bulleted action list — common things you can do this phase. */
  actions: ReadonlyArray<string>;
  /** Optional CDS icon name shown in the phase header. */
  icon?: string;
}
