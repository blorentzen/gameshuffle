import { PARTY_GAMES } from "@/data/party";
import { nightGame } from "@/lib/nights/games";

/**
 * Game night modules: things a host adds to a game night and configures, stored
 * in board_game_nights.modules. Client-safe (types, defaults, validation).
 *
 * First module: Mario Party. The randomizer pages only roll; the meta game
 * (Chance cards, missions, a live scoreboard across games, points) is this
 * module, run as a live night everyone joins on their phone.
 */

export interface PartyModuleCards {
  /** House rules dealt to the table when the night starts. */
  rules: number;
  spicy: boolean;
  /** Chance cards dealt round the table, and which kind. */
  chance: number;
  mix: "both" | "help" | "crutch";
  /** Missions for each person. */
  missions: number;
}

export interface PartyModule {
  type: "mario-party";
  /** Games in the night, Mario Party first (Mario Kart can join the scoreboard). */
  games: string[];
  cards: PartyModuleCards;
  /** Secret: each phone sees only its own hand. Open: everyone sees every hand. */
  visibility: "secret" | "open";
  /** Last time's MVP starts with a crutch, last place with a help. */
  carryover: boolean;
  /** Seat the host at the table. */
  hostPlays: boolean;
}

export type NightModule = PartyModule;

export const DEFAULT_PARTY_MODULE: PartyModule = {
  type: "mario-party",
  games: ["super-mario-party-jamboree"],
  cards: { rules: 1, spicy: false, chance: 2, mix: "both", missions: 2 },
  visibility: "secret",
  carryover: true,
  hostPlays: true,
};

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
};

/** Normalize one Mario Party module (unknown games dropped, a Mario Party game always first). */
export function readPartyModule(raw: unknown): PartyModule {
  const r = (raw ?? {}) as Omit<Partial<PartyModule>, "cards"> & { cards?: Partial<PartyModuleCards> };
  const d = DEFAULT_PARTY_MODULE;
  const games = [...new Set((Array.isArray(r.games) ? r.games : d.games).map(String))].filter((g) => nightGame(g)).slice(0, 12);
  const party = games.filter((g) => PARTY_GAMES[g]);
  const ordered = party.length ? [...party, ...games.filter((g) => !PARTY_GAMES[g])] : [d.games[0], ...games];
  const c: Partial<PartyModuleCards> = r.cards ?? {};
  return {
    type: "mario-party",
    games: ordered,
    cards: {
      rules: clamp(c.rules, 0, 3, d.cards.rules),
      spicy: !!c.spicy,
      chance: clamp(c.chance, 0, 4, d.cards.chance),
      mix: c.mix === "help" || c.mix === "crutch" ? c.mix : "both",
      missions: clamp(c.missions, 0, 3, d.cards.missions),
    },
    visibility: r.visibility === "open" ? "open" : "secret",
    carryover: r.carryover !== false,
    hostPlays: r.hostPlays !== false,
  };
}

export function readModules(raw: unknown): NightModule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m) => (m as { type?: string })?.type === "mario-party").slice(0, 1).map(readPartyModule);
}

export function partyModuleOf(modules: unknown): PartyModule | null {
  return readModules(modules).find((m) => m.type === "mario-party") ?? null;
}
