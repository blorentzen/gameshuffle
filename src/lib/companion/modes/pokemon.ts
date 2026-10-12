/**
 * Pokémon Mode — v1 launch configuration.
 *
 * Every Pokémon-specific string and rule default lives here. Components
 * must not bake these in directly. See v1 Scope §"Technical scope,
 * data model" — this is the only file where the words "Poison", "Burn",
 * "Prize Cards", "Active", or "Bench" should appear.
 */

import type { ModeConfig } from "../types";

export const pokemonMode: ModeConfig = {
  key: "pokemon",
  displayName: "Pokémon",

  positionLabels: {
    active: "Active",
    bench: "Bench",
  },

  conditionALabel: "Poison",
  conditionAEffect: "10 damage between turns",
  conditionADescription:
    "A Poisoned Pokémon takes 10 damage between every player's turn. It stays Poisoned until it retreats to the Bench or is Knocked Out.",
  conditionADamage: 10,
  // One meaning per glyph: conditions never reuse an Energy glyph (the
  // droplet is Water, the flame is Fire). Conditions are square tags.
  conditionAIcon: "skull",
  conditionAColor: "#9333ea",
  conditionBLabel: "Burn",
  conditionBEffect: "20 damage between turns, then flip: heads cures it",
  conditionBDescription:
    "A Burned Pokémon takes 20 damage between every player's turn. Then flip a coin: heads cures the Burn, tails it persists. Burn also clears on retreat.",
  conditionBDamage: 20,
  conditionBCoinAfterDamage: true,
  conditionBIcon: "temperature",
  conditionBColor: "#dc2626",

  winCounterLabel: "Prize Cards",
  winCounterStart: 6,
  winCounterDirection: "down",

  damageIncrements: [10, 50],

  koValueOptions: [1, 2, 3],
  // Maps the prize value to the card archetype it covers — so new
  // players can pick "Mega ex" instead of guessing "3".
  koValueLabels: {
    1: "Basic",
    2: "ex / V",
    3: "Mega ex / VMAX",
  },
  koValueDefault: 1,

  coinLabels: {
    a: "Heads",
    b: "Tails",
  },

  diceFaceOptions: [6],
  diceFaceDefault: 6,

  resolutionOrder: ["condition_a", "condition_b"],

  coinFlipEnabled: true,
  diceEnabled: true,

  // v1 Scope §4: passive reminder to resolve orientation-based
  // conditions on the physical card. Leaning always-on per the open
  // UX question; the engine doesn't track Asleep/Paralyzed state.
  checkupFooterReminder:
    "Paralyzed wears off by itself at the end of its owner's turn, and Confused has nothing to do between turns. Every Special Condition clears when the Pokémon evolves or goes to the Bench.",

  // Informational status conditions per the v2 UX add — new players
  // don't know the physical-card rotation convention, so we surface
  // these as toggleable badges. All three share the "status"
  // exclusive group so the reducer enforces "only one at a time"
  // (matching the TCG rule). Poison + Burn (conditionA/B above)
  // stay stackable with any of these.
  extraConditions: [
    {
      key: "asleep",
      label: "Asleep",
      icon: "zzz",
      color: "#475569",
      description:
        "An Asleep Pokémon can't attack or retreat. Between turns, flip a coin: heads wakes it up, tails it stays asleep. (On the table: rotate the card 90° clockwise.)",
      effect: "Can't attack or retreat. Flip between turns: heads wakes it",
      learnMore: "/pokemon-tcg/rules/special-conditions#asleep",
      exclusiveGroup: "status",
      checkupCoinClear: true,
    },
    {
      key: "paralyzed",
      label: "Paralyzed",
      icon: "lock",
      color: "#facc15",
      // White on this yellow is about 1.5:1; dark ink reads.
      ink: "#3b2a00",
      description:
        "A Paralyzed Pokémon can't attack or retreat this turn. It automatically wakes up at the end of your next turn. (On the table: rotate the card 90° counter-clockwise.)",
      effect: "Can't attack or retreat this turn. Wears off at the end of its owner's turn",
      learnMore: "/pokemon-tcg/rules/special-conditions#paralyzed",
      exclusiveGroup: "status",
    },
    {
      key: "confused",
      label: "Confused",
      icon: "spiral",
      color: "#ec4899",
      description:
        "Before a Confused Pokémon attacks, flip a coin. Tails: the attack fails and you put 30 damage on yourself. (On the table: rotate the card 180°.)",
      effect: "Flip before attacking: tails, the attack fails and it takes 30",
      learnMore: "/pokemon-tcg/rules/special-conditions#confused",
      exclusiveGroup: "status",
    },
  ],

  // Scope §11: slot themes inspired by Pokémon TCG energy types.
  // Order follows the modern S&V trainer-side layout convention so
  // the picker reads as the canonical type ribbon. Visual styling
  // for each is in `src/styles/companion.css` keyed off
  // `data-slot-theme="<key>"`.
  // Icons for the type badge on the slot panel. These come from the
  // CDS-available icon set; the CSS pattern overlay (in companion.css)
  // uses inline SVG and can choose richer glyphs (e.g. the canonical
  // Tabler `leaf` for Grass) — small visual mismatch with the badge
  // is fine because the badge carries its own text label.
  // Pokémon TCG turn structure (Scarlet & Violet era), surfaced in
  // the Turn information modal so new players can reference what
  // happens in each phase without leaving the board.
  turnReference: [
    {
      title: "Draw",
      summary: "Start your turn by drawing a card from your deck.",
      actions: [
        "Draw 1 card.",
        "If your deck is empty, you lose immediately.",
      ],
      icon: "cards",
    },
    {
      title: "Play Pokémon & attach Energy",
      summary:
        "Set up your board. You can attach one Energy and play any Basic Pokémon from your hand to your Bench.",
      actions: [
        "Attach 1 Energy to one of your Pokémon (once per turn).",
        "Play Basic Pokémon from your hand to the Bench (no limit).",
        "Evolve Pokémon (not on the turn they were played or evolved).",
      ],
      icon: "plus",
    },
    {
      title: "Play Trainer cards",
      summary:
        "Items, Supporters, Stadiums, and Tools: most are once-per-turn or have specific rules.",
      actions: [
        "Items: any number per turn.",
        "Supporter: 1 per turn.",
        "Stadium: 1 per turn (replaces any in play).",
        "Tools: 1 per Pokémon at a time.",
      ],
      icon: "tag",
    },
    {
      title: "Retreat",
      summary:
        "Swap your Active Pokémon with one on the Bench. Costs energy equal to the retreat cost.",
      actions: [
        "Discard energy equal to the Active Pokémon's Retreat Cost.",
        "Pick a Bench Pokémon to become the new Active.",
        "All Special Conditions on the retreating Pokémon clear.",
        "Once per turn.",
      ],
      icon: "arrows-exchange",
    },
    {
      title: "Attack",
      summary:
        "Declare an attack from your Active Pokémon. Attacks end your turn.",
      actions: [
        "Tap Attack and pick one your Active Pokémon has the Energy for.",
        "GameShuffle works out Weakness and Resistance; add any card effects.",
        "If Confused, flip first: tails the attack fails and you take 30 damage.",
        "After attacking, your turn ends.",
      ],
      icon: "swords",
    },
    {
      title: "End of turn",
      summary:
        "Resolve between-turn effects, then it's the opponent's turn.",
      actions: [
        "Tap End turn: the Checkup lists Poison, Burn and Asleep for both players.",
        "Asleep: flip a coin; heads wakes it up.",
        "Paralysis wears off at the end of its owner's turn.",
      ],
      icon: "hourglass",
    },
  ],

  slotThemes: [
    { key: "grass", label: "Grass", icon: "leaf", color: "#65b16a" },
    { key: "fire", label: "Fire", icon: "flame", color: "#e2453f" },
    { key: "water", label: "Water", icon: "droplet", color: "#4ca9cd" },
    { key: "lightning", label: "Lightning", icon: "bolt", color: "#e0bf1f" },
    { key: "psychic", label: "Psychic", icon: "eye", color: "#b45cb1" },
    { key: "fighting", label: "Fighting", icon: "hand-stop", color: "#c26f4d" },
    { key: "darkness", label: "Darkness", icon: "moon", color: "#3a3c52" },
    { key: "metal", label: "Metal", icon: "shield", color: "#8b969c" },
    { key: "dragon", label: "Dragon", icon: "crown", color: "#c99b2b" },
    { key: "colorless", label: "Colorless", icon: "star", color: "#9a9a8c" },
  ],

  // Energy types fuel attacks. The 9 basics map to the standard
  // Pokémon TCG energy cards (Dragon is intentionally absent — no
  // Dragon energy card exists). "Special" is a meta-bucket for any
  // Special Energy card; the user tracks the count, the card's
  // specific identity stays at the table. Colors mirror the slot-
  // theme palette so a Pokémon's type + attached energies read as
  // a cohesive group on the slot.
  energyTypes: [
    { key: "grass", label: "Grass", icon: "leaf", color: "#65b16a", invertText: true },
    { key: "fire", label: "Fire", icon: "flame", color: "#e2453f", invertText: true },
    { key: "water", label: "Water", icon: "droplet", color: "#4ca9cd", invertText: true },
    { key: "lightning", label: "Lightning", icon: "bolt", color: "#f1d43e" },
    { key: "psychic", label: "Psychic", icon: "eye", color: "#b45cb1", invertText: true },
    { key: "fighting", label: "Fighting", icon: "hand-stop", color: "#c26f4d", invertText: true },
    { key: "darkness", label: "Darkness", icon: "moon", color: "#3a3c52", invertText: true },
    { key: "metal", label: "Metal", icon: "shield", color: "#99a2a6" },
    // Colorless is a star, as on the cards.
    { key: "colorless", label: "Colorless", icon: "star", color: "#b3b3a3" },
    // Special Energy: sparkles (Psychic is the eye now). Metallic gold
    // signals "premium card".
    { key: "special", label: "Special", icon: "sparkles", color: "#c6a862" },
  ],
};
