/**
 * Companion session reducer — Wave 1 + Wave 2.
 *
 * Pure reducer so unit tests can drive the engine without mounting
 * React. Side-effecting calls (the RNG) live outside the reducer
 * and are passed in as action payloads.
 *
 * Wave 1 actions:
 *   - PLACE_PIECE         — turn an empty slot into an occupied one
 *   - REMOVE_PIECE        — clear a slot without scoring (discard)
 *   - ADJUST_DAMAGE       — +/- delta with clamp at 0
 *   - RESET_DAMAGE        — set damage to 0 (keeps slot occupied)
 *   - ADJUST_WIN_COUNTER  — manual prize-count adjust
 *   - LOG_COIN_FLIP       — append an outcome to history (cap 5)
 *   - LOG_DICE_ROLL       — append a roll (cap 5)
 *   - RESET_GAME          — wipe all in-memory state back to initial
 *
 * Wave 2 actions (conditions + checkup wedge + auto-KO prize):
 *   - TOGGLE_CONDITION    — flip Poison/Burn on a slot
 *   - KNOCKOUT            — KO a slot → opp prize -= koValue → game-over check
 *   - START_CHECKUP       — enter the end-of-turn resolution sequence
 *   - CHECKUP_APPLY_A     — apply condition A damage to the current slot
 *   - CHECKUP_APPLY_B     — apply condition B damage to the current slot
 *   - CHECKUP_COIN_B      — record the condition-B coin outcome
 *   - CHECKUP_ADVANCE     — acknowledge the current step (typically a KO)
 *                            and move to the next slot
 *   - CHECKUP_END         — cancel / dismiss the checkup
 *
 * The checkup state machine is the v1 correctness wedge. The exact
 * rules per v1 Scope §"Critical correctness":
 *   1. Condition A damage applies BEFORE condition B damage.
 *   2. If A's damage KOs the slot, B (damage + coin) NEVER resolves.
 *   3. B's coin flip happens AFTER B's damage is applied, not before.
 * The reducer enforces this — UI consumers can't get the order wrong
 * because the only legal next action is computed by the reducer.
 */

import type {
  CoinFlipEntry,
  DiceRollEntry,
  ModeConfig,
  PlayerId,
  SessionState,
  SlotPosition,
  SlotState,
} from "./types";
import { ALL_POSITIONS } from "./types";
import { FRESH_TURN, nextPlayer, type CardRules, type TurnState, type TurnUsed } from "./pokemonRules";
import { DEFAULT_SLOT_THEME } from "./styling";
import { DEFAULT_GAME_SETTINGS, type GameSettings } from "./gameSettings";

/** Coin / dice history surface — last 3 outcomes is enough for
 *  trust + verification without crowding the center-band strip. */
const HISTORY_CAP = 3;

function opponent(player: PlayerId): PlayerId {
  return player === "p1" ? "p2" : "p1";
}

/** Build an empty slot. Engine-default ko value comes from the mode
 *  config so the data model never bakes in 1. Theme defaults to
 *  unstyled ("none") per Scope §11. */
function emptySlot(player: PlayerId, position: SlotPosition, mode: ModeConfig): SlotState {
  return {
    player,
    position,
    occupied: false,
    name: null,
    maxHp: null,
    damage: 0,
    koValue: mode.koValueDefault,
    conditionA: false,
    conditionB: false,
    extraConditions: {},
    slotTheme: DEFAULT_SLOT_THEME,
    energies: {},
    cardId: null,
    cardImage: null,
  };
}

export function initialSessionState(
  mode: ModeConfig,
  gameSettings: GameSettings = DEFAULT_GAME_SETTINGS,
): SessionState {
  const slots: SlotState[] = [];
  for (const player of ["p1", "p2"] as const) {
    for (const position of ALL_POSITIONS) {
      slots.push(emptySlot(player, position, mode));
    }
  }
  return {
    slots,
    gameSettings,
    playerNames: {
      p1: "Player 1",
      p2: "Player 2",
    },
    winCounters: {
      p1: gameSettings.prizeCount,
      p2: gameSettings.prizeCount,
    },
    coinHistory: [],
    diceHistory: [],
    nextHistoryId: 1,
    winner: null,
    loadedFromSaveId: null,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type SessionAction =
  | {
      type: "PLACE_PIECE";
      player: PlayerId;
      position: SlotPosition;
      name: string | null;
      maxHp: number | null;
      koValue: number;
      /** Scope §11 — optional at placement. Omitted ⇒ default
       *  unstyled. The user can change it later via STYLE_SLOT. */
      slotTheme?: string;
      /** Set when placed from the player's collection — Scrydex card id +
       *  small image URL for the real card art on the slot. */
      cardId?: string | null;
      cardImage?: string | null;
      /** The card's rules data, when it came from the catalog. */
      rules?: CardRules | null;
    }
  | { type: "REMOVE_PIECE"; player: PlayerId; position: SlotPosition }
  | { type: "KNOCKOUT"; player: PlayerId; position: SlotPosition }
  | {
      type: "STYLE_SLOT";
      player: PlayerId;
      position: SlotPosition;
      slotTheme: string;
    }
  | {
      type: "ADJUST_DAMAGE";
      player: PlayerId;
      position: SlotPosition;
      delta: number;
    }
  | { type: "RESET_DAMAGE"; player: PlayerId; position: SlotPosition }
  | {
      type: "TOGGLE_CONDITION";
      player: PlayerId;
      position: SlotPosition;
      which: "a" | "b";
      value: boolean;
    }
  | {
      /** Toggle a mode-defined informational status condition (e.g.
       *  Pokémon's Asleep / Paralyzed / Confused). Mutual exclusion
       *  within `exclusiveGroup` is enforced here so the UI doesn't
       *  have to. */
      type: "TOGGLE_EXTRA_CONDITION";
      player: PlayerId;
      position: SlotPosition;
      key: string;
      value: boolean;
    }
  | {
      /** Edit piece metadata — name, max HP, and KO value — in a
       *  single dispatch. Used by the Evolve section in the slot's
       *  action sheet so a Pokémon evolving from Charmander to
       *  Charizard updates its name, HP, and card type together
       *  without three round-trips. Fields are optional; omitted
       *  fields preserve their current value. Damage and conditions
       *  stay put — this is metadata only. */
      type: "UPDATE_PIECE_META";
      player: PlayerId;
      position: SlotPosition;
      name?: string | null;
      maxHp?: number | null;
      koValue?: number;
      /** Evolve/edit can also swap the underlying card (art + type). */
      slotTheme?: string;
      cardId?: string | null;
      cardImage?: string | null;
      /** Explicit "this was an evolution" — clears conditions (damage +
       *  energy carry over). A koValue change also implies evolution. */
      evolved?: boolean;
      /** The new card's rules data (an evolution from the catalog). */
      rules?: CardRules | null;
      /** Attach a Tool (by name) or take it off (null). */
      tool?: string | null;
    }
  | {
      /** Adjust an attached-energy count by `delta`. Clamps at 0 —
       *  energy maps never store negatives. Used by the energy
       *  +/- buttons on the slot's action sheet. */
      type: "ADJUST_ENERGY";
      player: PlayerId;
      position: SlotPosition;
      energyKey: string;
      delta: number;
    }
  | {
      /** Clear ALL attached energies on a slot — convenience action
       *  for the "Discard all energy" button (Pokémon: retreat-cost
       *  or knockout cleanup). */
      type: "CLEAR_ENERGIES";
      player: PlayerId;
      position: SlotPosition;
    }
  | {
      /** Move a piece between two of the same player's slots. If the
       *  destination is occupied, the two slots swap. Damage moves
       *  with the piece per spec §"correctness hygiene" item 5;
       *  conditions clear when a piece arrives on the bench per
       *  spec §3 + §"hygiene" item 4. */
      type: "MOVE_PIECE";
      player: PlayerId;
      from: SlotPosition;
      to: SlotPosition;
    }
  | { type: "ADJUST_WIN_COUNTER"; player: PlayerId; delta: number }
  | { type: "SET_PLAYER_NAME"; player: PlayerId; name: string }
  | {
      /** Apply chosen game settings + flip `gameStarted` to true.
       *  Used by the GameSettingsModal when the player confirms
       *  their format choice. Resets win counters to the new prize
       *  count, leaves slots / names / history alone. */
      type: "APPLY_GAME_SETTINGS";
      settings: GameSettings;
    }
  | {
      /** Restore a saved game from the resume picker. Replaces
       *  slots, playerNames, winCounters, and gameSettings from
       *  the persisted snapshot. History (coin / dice) starts
       *  fresh — we don't save it. The optional `saveId` flags the
       *  loaded row so the Save modal can offer "Update" vs
       *  "Save as new" instead of always inserting a new row. */
      type: "LOAD_SAVED_STATE";
      saveId?: string | null;
      snapshot: {
        slots: SlotState[];
        playerNames: Record<PlayerId, string>;
        winCounters: Record<PlayerId, number>;
        gameSettings: GameSettings;
        turn?: TurnState | null;
      };
    }
  | {
      /** Link the current session to a save row. Dispatched by the
       *  Save modal after a fresh insert so subsequent Saves default
       *  to updating the same row (rather than inserting a new one
       *  every time). Passing `null` unlinks. */
      type: "LINK_SAVE_ID";
      saveId: string | null;
    }
  | { type: "LOG_COIN_FLIP"; side: CoinFlipEntry["side"] }
  | { type: "LOG_DICE_ROLL"; faces: number; result: number }
  | {
      /** Apply a damage delta to a slot and auto-KO if the slot's
       *  damage now meets/exceeds its max HP. KO removes the piece
       *  and credits the opponent's win counter — same path as the
       *  manual `KNOCKOUT` action. Used by the Resolve modal for
       *  Poison / Burn damage application. */
      type: "APPLY_DAMAGE_WITH_KO_CHECK";
      player: PlayerId;
      position: SlotPosition;
      delta: number;
    }
  | {
      /** Resolve the Burn coin flip — heads (side === "a") clears
       *  condition B; tails leaves it on. Also logs the flip into
       *  the shared coin history. */
      type: "RESOLVE_BURN_COIN";
      player: PlayerId;
      position: SlotPosition;
      side: CoinFlipEntry["side"];
      /** In a shared game: the server's flip this resolves (its side wins). */
      rollId?: string;
    }
  | {
      /** Resolve an extra-condition coin flip (Pokémon Asleep wake
       *  flip) — heads (side === "a") clears the named extra
       *  condition; tails leaves it on. Logs the flip into the
       *  shared coin history. */
      type: "RESOLVE_EXTRA_COIN";
      player: PlayerId;
      position: SlotPosition;
      key: string;
      side: CoinFlipEntry["side"];
      /** In a shared game: the server's flip this resolves (its side wins). */
      rollId?: string;
    }
  | { type: "RESET_GAME"; mode: ModeConfig }
  /** The flip is done: turns start with `first` (turn 1). */
  | { type: "START_TURNS"; first: PlayerId }
  /** End the turn: the next player's turn, once-a-turn things fresh. */
  | { type: "END_TURN" }
  /** Tick (or untick) a once-a-turn thing by hand: a Supporter or Stadium played, etc. */
  | { type: "MARK_USED"; key: keyof TurnUsed; value: boolean }
  /** An attack: damage onto the target (Knock Out when it reaches HP) and
   *  the attack ticked. Ending the turn is separate (Checkup comes first). */
  | {
      type: "ATTACK";
      target: { player: PlayerId; position: SlotPosition };
      damage: number;
      /** The attack's name, for the other phone's "Pikachu ex used Thunder". */
      name?: string;
      /** Damage the attack does to the attacker itself ("also does 30 damage
       *  to itself"), in the same step so one Undo takes back the whole attack. */
      self?: { player: PlayerId; position: SlotPosition; damage: number };
    };

// ---------------------------------------------------------------------------
// Slot helpers
// ---------------------------------------------------------------------------

function mapSlot(
  slots: SlotState[],
  player: PlayerId,
  position: SlotPosition,
  fn: (s: SlotState) => SlotState,
): SlotState[] {
  return slots.map((s) =>
    s.player === player && s.position === position ? fn(s) : s,
  );
}

function findSlotIn(
  slots: SlotState[],
  player: PlayerId,
  position: SlotPosition,
): SlotState | undefined {
  return slots.find((s) => s.player === player && s.position === position);
}

function emptySlotFor(
  player: PlayerId,
  position: SlotPosition,
  mode: ModeConfig,
): SlotState {
  return emptySlot(player, position, mode);
}

function pushHistory<T>(history: T[], entry: T): T[] {
  const next = [entry, ...history];
  if (next.length > HISTORY_CAP) next.length = HISTORY_CAP;
  return next;
}

// ---------------------------------------------------------------------------
// Win counter + game-over
// ---------------------------------------------------------------------------

function clampWinCounter(value: number, mode: ModeConfig): number {
  // Direction-aware soft clamp: "down" counters never dip below 0;
  // "up" counters never exceed the start (which doubles as the cap
  // for up-mode TCGs like Lorcana). Mode-driven so future modes
  // with negative or asymmetric counters can opt out.
  if (mode.winCounterDirection === "down") return Math.max(0, value);
  return Math.min(mode.winCounterStart, Math.max(0, value));
}

/**
 * Apply a delta to a player's win counter and return the next state,
 * including the `winner` field if the threshold was crossed.
 *
 * For "down" direction: a player wins when their OWN counter reaches
 * 0 (Pokémon: you've drawn all your prizes).
 * For "up" direction: v1 doesn't ship an up mode; modes that need it
 * should add a `winCounterTarget` and wire it here. For now we leave
 * `winner` null in up mode and let the UI manual-confirm.
 */
function applyWinDelta(
  state: SessionState,
  mode: ModeConfig,
  player: PlayerId,
  delta: number,
): SessionState {
  const next = clampWinCounter(state.winCounters[player] + delta, mode);
  const winCounters = { ...state.winCounters, [player]: next };
  let winner = state.winner;
  // Only auto-flag a winner on a delta that REDUCES toward the goal
  // — manual "undo" adjustments shouldn't trigger the prompt.
  if (
    !winner &&
    mode.winCounterDirection === "down" &&
    delta < 0 &&
    next === 0
  ) {
    winner = player;
  }
  return { ...state, winCounters, winner };
}

// ---------------------------------------------------------------------------
// Knockout (manual + checkup-triggered)
// ---------------------------------------------------------------------------

/**
 * Knock out a slot — empty it, credit the OPPONENT with a prize
 * draw (counter shift = -koValue for down, +koValue for up), then
 * check for game-end. Returns the next state.
 *
 * The "credited player" is the opponent because in Pokémon (and most
 * TCGs) the win-resource accrues to whoever defeated the piece, not
 * whoever owned it.
 */
function knockoutSlot(
  state: SessionState,
  mode: ModeConfig,
  player: PlayerId,
  position: SlotPosition,
): SessionState {
  const slot = findSlotIn(state.slots, player, position);
  if (!slot || !slot.occupied) return state;

  const slots = mapSlot(state.slots, player, position, () =>
    emptySlotFor(player, position, mode),
  );
  const opp = opponent(player);
  const delta = mode.winCounterDirection === "down" ? -slot.koValue : slot.koValue;
  return applyWinDelta({ ...state, slots }, mode, opp, delta);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** The reducer is pure. `mode` is curried in via the provider. */
export function makeReducer(mode: ModeConfig) {
  return function reducer(state: SessionState, action: SessionAction): SessionState {
    switch (action.type) {
      case "PLACE_PIECE": {
        const slots = mapSlot(state.slots, action.player, action.position, (s) => ({
          ...s,
          occupied: true,
          name: action.name,
          maxHp: action.maxHp,
          koValue: action.koValue,
          // Fresh piece: zero damage, no conditions. Even when reusing
          // an "empty" row, this is the safe default.
          damage: 0,
          conditionA: false,
          conditionB: false,
          extraConditions: {},
          slotTheme: action.slotTheme ?? DEFAULT_SLOT_THEME,
          cardId: action.cardId ?? null,
          cardImage: action.cardImage ?? null,
          rules: action.rules ?? null,
          tool: null,
          enteredTurn: state.turn?.number ?? null,
        }));
        return { ...state, slots };
      }

      case "UPDATE_PIECE_META": {
        // TCG accuracy: when a Pokémon evolves, all Special Conditions
        // (Poison, Burn, Asleep, Paralyzed, Confused) clear. We treat
        // a `koValue` change (e.g. Basic → ex/V → Mega) as the
        // canonical "evolution happened" signal — name-only edits
        // don't auto-clear so players can fix typos safely. Custom
        // game-mode toggle to disable this lives on
        // `state.gameSettings.evolutionClearsConditions`. */
        const clears = state.gameSettings.evolutionClearsConditions;
        const slots = mapSlot(state.slots, action.player, action.position, (s) => {
          if (!s.occupied) return s;
          // Evolution = an explicit `evolved` swap (card picker) OR a koValue
          // change (Basic → ex/V → Mega). Damage + energy carry (we spread
          // `...s`); only Special Conditions clear. A name-only edit never
          // clears, so typo fixes are safe.
          const koChanged =
            action.koValue !== undefined && action.koValue !== s.koValue;
          const evolvedNow = action.evolved === true || koChanged;
          const isEvolution = clears && evolvedNow;
          return {
            ...s,
            ...(action.name !== undefined ? { name: action.name } : {}),
            ...(action.maxHp !== undefined ? { maxHp: action.maxHp } : {}),
            ...(action.koValue !== undefined ? { koValue: action.koValue } : {}),
            ...(action.slotTheme !== undefined
              ? { slotTheme: action.slotTheme }
              : {}),
            ...(action.cardId !== undefined ? { cardId: action.cardId } : {}),
            ...(action.cardImage !== undefined
              ? { cardImage: action.cardImage }
              : {}),
            ...(action.rules !== undefined ? { rules: action.rules } : {}),
            ...(action.tool !== undefined ? { tool: action.tool } : {}),
            // It can't evolve again this turn.
            ...(evolvedNow ? { enteredTurn: state.turn?.number ?? s.enteredTurn ?? null } : {}),
            ...(isEvolution
              ? {
                  conditionA: false,
                  conditionB: false,
                  extraConditions: {},
                }
              : {}),
          };
        });
        return { ...state, slots };
      }

      case "ADJUST_ENERGY": {
        const target = findSlotIn(state.slots, action.player, action.position);
        const slots = mapSlot(state.slots, action.player, action.position, (s) => {
          if (!s.occupied) return s;
          const current = s.energies[action.energyKey] ?? 0;
          const next = Math.max(0, current + action.delta);
          return {
            ...s,
            energies: { ...s.energies, [action.energyKey]: next },
          };
        });
        // Attaching to your own Pokémon on your turn ticks off the Energy for the turn.
        const turn = state.turn && target?.occupied && action.delta > 0 && action.player === state.turn.player
          ? { ...state.turn, used: { ...state.turn.used, energy: true } }
          : state.turn;
        return { ...state, slots, turn };
      }

      case "CLEAR_ENERGIES": {
        const slots = mapSlot(state.slots, action.player, action.position, (s) => {
          if (!s.occupied) return s;
          return { ...s, energies: {} };
        });
        return { ...state, slots };
      }

      case "STYLE_SLOT": {
        const slots = mapSlot(state.slots, action.player, action.position, (s) => ({
          ...s,
          slotTheme: action.slotTheme,
        }));
        return { ...state, slots };
      }

      case "REMOVE_PIECE": {
        // Discard without scoring — no prize change. Use KNOCKOUT for
        // the score-credited path.
        const slots = mapSlot(state.slots, action.player, action.position, () =>
          emptySlotFor(action.player, action.position, mode),
        );
        return { ...state, slots };
      }

      case "KNOCKOUT":
        return knockoutSlot(state, mode, action.player, action.position);

      case "ADJUST_DAMAGE": {
        const slot = findSlotIn(state.slots, action.player, action.position);
        const slots = mapSlot(state.slots, action.player, action.position, (s) => ({
          ...s,
          damage: Math.max(0, s.damage + action.delta),
        }));
        // Damage reaching HP is a Knock Out, the same as Checkup damage
        // (Undo puts it back if it was a slip).
        const damage = Math.max(0, (slot?.damage ?? 0) + action.delta);
        if (slot?.occupied && action.delta > 0 && slot.maxHp != null && damage >= slot.maxHp) {
          return knockoutSlot({ ...state, slots }, mode, action.player, action.position);
        }
        return { ...state, slots };
      }

      case "RESET_DAMAGE": {
        const slots = mapSlot(state.slots, action.player, action.position, (s) => ({
          ...s,
          damage: 0,
        }));
        return { ...state, slots };
      }

      case "MOVE_PIECE": {
        if (action.from === action.to) return state;
        const fromSlot = findSlotIn(state.slots, action.player, action.from);
        const toSlot = findSlotIn(state.slots, action.player, action.to);
        if (!fromSlot || !toSlot) return state;
        if (!fromSlot.occupied) return state;

        // Snapshot of the piece's content (everything except the
        // address fields `player` + `position`). We carry damage,
        // koValue, AND theme with the piece — theme is a visual
        // identity property of the piece per Scope §11. We clear
        // conditions when the destination is bench (per Pokémon
        // rules).
        const pieceClears = action.to !== "active";
        const carriedFromPiece = {
          occupied: fromSlot.occupied,
          name: fromSlot.name,
          maxHp: fromSlot.maxHp,
          damage: fromSlot.damage,
          koValue: fromSlot.koValue,
          conditionA: pieceClears ? false : fromSlot.conditionA,
          conditionB: pieceClears ? false : fromSlot.conditionB,
          // Extra status conditions follow the same retreat rules
          // as conditionA/B — clear on move to bench, preserve on
          // promote to active.
          extraConditions: pieceClears ? {} : fromSlot.extraConditions,
          slotTheme: fromSlot.slotTheme,
          cardId: fromSlot.cardId,
          cardImage: fromSlot.cardImage,
          enteredTurn: fromSlot.enteredTurn ?? null,
          tool: fromSlot.tool ?? null,
          rules: fromSlot.rules ?? null,
          // Energies travel with the piece in either direction. TCG
          // retreat costs are paid manually via the "Discard energy"
          // controls in the action sheet — we don't auto-deduct on
          // movement because the user might be modeling a free
          // retreat, switch card, escape rope, etc.
          energies: fromSlot.energies,
        };

        // If the destination is occupied, this is a swap. The
        // displaced piece moves the OTHER way; conditions on that
        // piece clear if its new home is bench. Theme + energies
        // carry unchanged either direction.
        const swapClears = action.from !== "active";
        const carriedToPiece = toSlot.occupied
          ? {
              occupied: toSlot.occupied,
              name: toSlot.name,
              maxHp: toSlot.maxHp,
              damage: toSlot.damage,
              koValue: toSlot.koValue,
              conditionA: swapClears ? false : toSlot.conditionA,
              conditionB: swapClears ? false : toSlot.conditionB,
              extraConditions: swapClears ? {} : toSlot.extraConditions,
              slotTheme: toSlot.slotTheme,
              cardId: toSlot.cardId,
              cardImage: toSlot.cardImage,
              energies: toSlot.energies,
              enteredTurn: toSlot.enteredTurn ?? null,
              tool: toSlot.tool ?? null,
              rules: toSlot.rules ?? null,
            }
          : null;

        const slots = state.slots.map((s) => {
          if (s.player !== action.player) return s;
          if (s.position === action.to) {
            return { ...s, ...carriedFromPiece };
          }
          if (s.position === action.from) {
            return carriedToPiece
              ? { ...s, ...carriedToPiece }
              : emptySlotFor(action.player, action.from, mode);
          }
          return s;
        });
        // The Active leaving (or swapping with a Benched Pokémon) on your own
        // turn is your retreat. Promoting into an empty Active isn't.
        const retreated = !!state.turn && action.player === state.turn.player && (action.from === "active" || (action.to === "active" && toSlot.occupied));
        const turn = retreated && state.turn ? { ...state.turn, used: { ...state.turn.used, retreat: true } } : state.turn;
        return { ...state, slots, turn };
      }

      case "TOGGLE_CONDITION": {
        const slots = mapSlot(state.slots, action.player, action.position, (s) => {
          if (!s.occupied) return s;
          return {
            ...s,
            ...(action.which === "a"
              ? { conditionA: action.value }
              : { conditionB: action.value }),
          };
        });
        return { ...state, slots };
      }

      case "TOGGLE_EXTRA_CONDITION": {
        const def = mode.extraConditions.find((c) => c.key === action.key);
        if (!def) return state;
        const slots = mapSlot(state.slots, action.player, action.position, (s) => {
          if (!s.occupied) return s;
          // Build the next conditions map. Mutual exclusion: when
          // turning ON a condition in a group, clear all others in
          // the same group. Turning OFF only affects the targeted
          // condition.
          const next: Record<string, boolean> = { ...s.extraConditions };
          if (action.value && def.exclusiveGroup) {
            for (const other of mode.extraConditions) {
              if (other.exclusiveGroup === def.exclusiveGroup && other.key !== def.key) {
                next[other.key] = false;
              }
            }
          }
          next[def.key] = action.value;
          return { ...s, extraConditions: next };
        });
        return { ...state, slots };
      }

      case "ADJUST_WIN_COUNTER":
        return applyWinDelta(state, mode, action.player, action.delta);

      case "LINK_SAVE_ID":
        return { ...state, loadedFromSaveId: action.saveId };

      case "LOAD_SAVED_STATE": {
        // Restore a snapshot from the resume picker. Game settings
        // come back with gameStarted forced true so the New Game
        // modal doesn't pop on top. History (coin / dice) resets
        // — it's UI-affordance state and intentionally not saved.
        // `loadedFromSaveId` flags this session as "linked to a
        // save row" so the Save modal can offer Update vs Save-as-new.
        return {
          ...state,
          slots: action.snapshot.slots,
          playerNames: action.snapshot.playerNames,
          winCounters: action.snapshot.winCounters,
          gameSettings: { ...action.snapshot.gameSettings, gameStarted: true },
          coinHistory: [],
          diceHistory: [],
          nextHistoryId: 1,
          winner: null,
          loadedFromSaveId: action.saveId ?? null,
          turn: action.snapshot.turn ?? null,
        };
      }

      case "APPLY_GAME_SETTINGS": {
        // Reset win counters to the chosen prize count so the
        // previous game's progress doesn't leak. Slots, names, and
        // history are independent of the format and stay put. Wipe
        // any save link — picking new settings means this is a new
        // game, not a continuation.
        return {
          ...state,
          gameSettings: { ...action.settings, gameStarted: true },
          winCounters: {
            p1: action.settings.prizeCount,
            p2: action.settings.prizeCount,
          },
          winner: null,
          loadedFromSaveId: null,
          turn: null,
        };
      }

      case "SET_PLAYER_NAME": {
        const trimmed = action.name.trim();
        // Clamp to a reasonable label length to avoid the header
        // breaking on extra-long inputs; empty falls back to default.
        const safe =
          trimmed.length === 0
            ? action.player === "p1"
              ? "Player 1"
              : "Player 2"
            : trimmed.slice(0, 24);
        return {
          ...state,
          playerNames: { ...state.playerNames, [action.player]: safe },
        };
      }

      case "LOG_COIN_FLIP": {
        const entry: CoinFlipEntry = { side: action.side, id: state.nextHistoryId };
        return {
          ...state,
          coinHistory: pushHistory(state.coinHistory, entry),
          nextHistoryId: state.nextHistoryId + 1,
        };
      }

      case "LOG_DICE_ROLL": {
        const entry: DiceRollEntry = {
          faces: action.faces,
          result: action.result,
          id: state.nextHistoryId,
        };
        return {
          ...state,
          diceHistory: pushHistory(state.diceHistory, entry),
          nextHistoryId: state.nextHistoryId + 1,
        };
      }

      case "APPLY_DAMAGE_WITH_KO_CHECK": {
        const slot = findSlotIn(state.slots, action.player, action.position);
        if (!slot || !slot.occupied) return state;
        const newDamage = Math.max(0, slot.damage + action.delta);
        const damagedSlots = mapSlot(
          state.slots,
          action.player,
          action.position,
          (s) => ({ ...s, damage: newDamage }),
        );
        const koed = slot.maxHp != null && newDamage >= slot.maxHp;
        if (koed) {
          return knockoutSlot(
            { ...state, slots: damagedSlots },
            mode,
            action.player,
            action.position,
          );
        }
        return { ...state, slots: damagedSlots };
      }

      case "RESOLVE_BURN_COIN": {
        const slot = findSlotIn(state.slots, action.player, action.position);
        if (!slot || !slot.occupied) return state;
        const heads = action.side === "a";
        const slots = mapSlot(
          state.slots,
          action.player,
          action.position,
          (s) => ({
            ...s,
            // Heads clears Burn; tails leaves it on.
            conditionB: heads ? false : s.conditionB,
          }),
        );
        const entry: CoinFlipEntry = {
          side: action.side,
          id: state.nextHistoryId,
        };
        return {
          ...state,
          slots,
          coinHistory: pushHistory(state.coinHistory, entry),
          nextHistoryId: state.nextHistoryId + 1,
        };
      }

      case "RESOLVE_EXTRA_COIN": {
        const slot = findSlotIn(state.slots, action.player, action.position);
        if (!slot || !slot.occupied) return state;
        const heads = action.side === "a";
        const slots = mapSlot(
          state.slots,
          action.player,
          action.position,
          (s) => ({
            ...s,
            extraConditions: heads
              ? { ...s.extraConditions, [action.key]: false }
              : s.extraConditions,
          }),
        );
        const entry: CoinFlipEntry = {
          side: action.side,
          id: state.nextHistoryId,
        };
        return {
          ...state,
          slots,
          coinHistory: pushHistory(state.coinHistory, entry),
          nextHistoryId: state.nextHistoryId + 1,
        };
      }

      case "START_TURNS":
        return { ...state, turn: { number: 1, player: action.first, first: action.first, used: { ...FRESH_TURN } } };

      case "END_TURN": {
        if (!state.turn) return state;
        // Paralysis wears off at the end of its owner's turn (the turn it
        // couldn't act in).
        const ending = state.turn.player;
        const slots = state.slots.map((s) =>
          s.player === ending && s.occupied && s.extraConditions.paralyzed
            ? { ...s, extraConditions: { ...s.extraConditions, paralyzed: false } }
            : s,
        );
        return { ...state, slots, turn: { ...state.turn, number: state.turn.number + 1, player: nextPlayer(ending), used: { ...FRESH_TURN } } };
      }

      case "MARK_USED":
        if (!state.turn || state.turn.used[action.key] === action.value) return state;
        return { ...state, turn: { ...state.turn, used: { ...state.turn.used, [action.key]: action.value } } };

      case "ATTACK": {
        const turn = state.turn ? { ...state.turn, used: { ...state.turn.used, attacked: true } } : state.turn;
        const hit = (st: SessionState, player: PlayerId, position: SlotPosition, amount: number): SessionState => {
          const slot = findSlotIn(st.slots, player, position);
          if (!slot || !slot.occupied || amount <= 0) return st;
          const damage = slot.damage + amount;
          const next = { ...st, slots: mapSlot(st.slots, player, position, (s) => ({ ...s, damage })) };
          return slot.maxHp != null && damage >= slot.maxHp ? knockoutSlot(next, mode, player, position) : next;
        };
        let next: SessionState = { ...state, turn };
        next = hit(next, action.target.player, action.target.position, Math.max(0, action.damage));
        if (action.self) next = hit(next, action.self.player, action.self.position, action.self.damage);
        return next;
      }

      case "RESET_GAME": {
        // Player names are identity, not game state — preserve them
        // across a reset so the same two players carry their names
        // into the next match without retyping. gameSettings get
        // wiped back to defaults (with `gameStarted: false`) so the
        // New Game modal reappears for the next match's format
        // selection.
        const fresh = initialSessionState(action.mode);
        return { ...fresh, playerNames: state.playerNames };
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findSlot(
  state: SessionState,
  player: PlayerId,
  position: SlotPosition,
): SlotState | undefined {
  return findSlotIn(state.slots, player, position);
}

/** True when the player has any slot that needs a checkup. Used to
 *  decide whether to surface the "Resolve Checkup" prompt. */
export function playerHasCheckup(state: SessionState, player: PlayerId): boolean {
  return state.slots.some((s) => {
    if (s.player !== player || !s.occupied) return false;
    if (s.conditionA || s.conditionB) return true;
    // Any extra condition active counts — the Resolve modal explains
    // all of them, including the informational-only ones
    // (Paralyzed / Confused).
    return Object.values(s.extraConditions).some(Boolean);
  });
}

// ---------------------------------------------------------------------------
// Undo history
// ---------------------------------------------------------------------------

/** The board plus the states before it, newest last, for Undo. */
export interface HistoryState {
  present: SessionState;
  past: SessionState[];
}

export type HistoryAction =
  | SessionAction
  | { type: "UNDO" }
  /** Put a whole board in place with nothing to undo (leaving a shared game keeps its board). */
  | { type: "REPLACE_STATE"; state: SessionState };

/** How many steps Undo can go back. */
export const UNDO_CAP = 50;
/** Not a change to the game: coin and dice logs, and which save row this is. */
const OUTSIDE_HISTORY = new Set<SessionAction["type"]>(["LOG_COIN_FLIP", "LOG_DICE_ROLL", "LINK_SAVE_ID"]);
/** A new game (or a loaded one): nothing before it to undo. */
const STARTS_FRESH = new Set<SessionAction["type"]>(["RESET_GAME", "LOAD_SAVED_STATE", "APPLY_GAME_SETTINGS"]);

/**
 * Wrap the reducer with Undo. Every change to the game is recorded (up to
 * UNDO_CAP); UNDO steps back one, keeping the coin and dice logs and the
 * save link as they are now (they're not moves).
 */
export function withHistory(reducer: (state: SessionState, action: SessionAction) => SessionState) {
  return function historyReducer(h: HistoryState, action: HistoryAction): HistoryState {
    if (action.type === "REPLACE_STATE") return { present: action.state, past: [] };
    if (action.type === "UNDO") {
      const prev = h.past[h.past.length - 1];
      if (!prev) return h;
      return {
        present: {
          ...prev,
          coinHistory: h.present.coinHistory,
          diceHistory: h.present.diceHistory,
          nextHistoryId: h.present.nextHistoryId,
          loadedFromSaveId: h.present.loadedFromSaveId,
        },
        past: h.past.slice(0, -1),
      };
    }
    const next = reducer(h.present, action);
    if (next === h.present) return h;
    if (STARTS_FRESH.has(action.type)) return { present: next, past: [] };
    if (OUTSIDE_HISTORY.has(action.type)) return { present: next, past: h.past };
    const past = [...h.past, h.present];
    if (past.length > UNDO_CAP) past.shift();
    return { present: next, past };
  };
}
