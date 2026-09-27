/**
 * House rules and missions for Mario Party nights. Shared across Mario Party
 * games; a card tied to one game's mechanics lists it in `games`.
 *
 * Ids are permanent: saved setups store them, and the streamer phase will pay
 * mission rewards against them. Retire a card with `retired: true` rather than
 * deleting or renumbering it.
 *
 * Every card is family-safe. "Spicy" means disruptive to the game, nothing more.
 *
 * Text can name players and a turn count, filled in when the card is dealt:
 *   {player}  the seat the card is dealt to
 *   {rival}   a different seat, drawn at random
 *
 * Only people play by these cards. CPUs never get dealt one, and a card that
 * needs its rival to hold back (a Truce) only names another person
 * (`rivalObeys`). A CPU can still be a rival when the card only asks the
 * player to do something to them.
 *   {n}       a number of turns from `turns`, capped to fit the game's length
 */

export interface PartyCard {
  id: string;
  /** House rule, Chance card (a help or a crutch for one player), or mission. */
  kind: "rule" | "chance" | "mission";
  /** Whole table, or the player who drew it. */
  scope: "table" | "player";
  title: string;
  text: string;
  /** Rules only. */
  tone?: "mild" | "spicy";
  /** Missions only: how hard, 1 to 3. The streamer phase maps this to a reward. */
  worth?: 1 | 2 | 3;
  /** Chance cards only: works for the player, or against them. */
  effect?: "help" | "crutch";
  /** Range for `{n}` turns. */
  turns?: [number, number];
  /** The rival has to follow the card too, so the rival must be a person. */
  rivalObeys?: boolean;
  /** In the starter deck everyone gets without an account. The rest need a free account. */
  starter?: boolean;
  /** Only for these game slugs. Absent = any Mario Party. */
  games?: string[];
  /** Can't happen under these ruleset ids (a rule about Chance Time under Pro Rules). */
  notUnder?: string[];
  retired?: boolean;
}

const JAMBOREE = "super-mario-party-jamboree";

export const PARTY_CARDS: PartyCard[] = [
  // House rules
  { id: "r01", kind: "rule", scope: "table", tone: "mild", title: "Keep left", text: "At every fork, take the left path. No exceptions." },
  { id: "r02", kind: "rule", scope: "player", tone: "mild", title: "Big spender", text: "You can only buy items that cost 10 coins or more." },
  { id: "r03", kind: "rule", scope: "table", tone: "spicy", title: "Closed for business", text: "Nobody buys items this game. Coins are for Stars only." },
  { id: "r04", kind: "rule", scope: "table", tone: "mild", title: "Off hand", text: "Whoever is in first place hits the Dice Block with their other hand." },
  { id: "r05", kind: "rule", scope: "player", tone: "mild", title: "Loyal buddy", text: "Once you recruit a Jamboree Buddy, you can't try for another.", games: [JAMBOREE] },
  { id: "r06", kind: "rule", scope: "player", tone: "mild", title: "Play-by-play", text: "Narrate your whole turn like a sports commentator." },
  { id: "r07", kind: "rule", scope: "player", tone: "mild", title: "Silent turn", text: "No talking on your turn. Point to make your choices." },
  { id: "r08", kind: "rule", scope: "player", tone: "spicy", title: "Hoarder", text: "You can't use an item until your item slots are full." },
  { id: "r09", kind: "rule", scope: "player", tone: "spicy", title: "Rivals", text: "Pick a rival now. Every item that hurts someone has to be used on them." },
  { id: "r10", kind: "rule", scope: "table", tone: "spicy", title: "Kingmaker", text: "At each fork, the last-place player chooses the leader's path." },
  { id: "r11", kind: "rule", scope: "table", tone: "spicy", title: "Seat swap", text: "At the halfway turn, everyone passes their controller one seat to the left and plays on from there." },
  { id: "r12", kind: "rule", scope: "player", tone: "spicy", title: "Fashionably late", text: "Walk past the first Star you reach. You can buy the next one." },
  { id: "r13", kind: "rule", scope: "player", tone: "mild", title: "Mushroom diet", text: "The only item you can buy is a Mushroom." },
  { id: "r14", kind: "rule", scope: "player", tone: "mild", title: "Tortoise", text: "No items that add to your roll: no Mushrooms, no Double, Triple or Custom dice." },
  { id: "r15", kind: "rule", scope: "player", tone: "spicy", title: "Glove magnet", text: "If you get a Dueling Glove, you have to use it on the leader." },
  { id: "r16", kind: "rule", scope: "table", tone: "mild", title: "Truce", text: "First and last place are allies for three turns: no items on each other." },
  { id: "r17", kind: "rule", scope: "player", tone: "mild", title: "Piggy bank", text: "Don't spend a single coin until you have 30." },
  { id: "r18", kind: "rule", scope: "table", tone: "mild", title: "Cheer squad", text: "Whoever wins a minigame picks someone to do a victory cheer for them." },
  { id: "r19", kind: "rule", scope: "table", tone: "spicy", title: "Chance Time champion", text: "Whoever triggers Chance Time chooses which way the result goes, if the table agrees it's fair.", notUnder: ["pro"] },
  { id: "r20", kind: "rule", scope: "player", tone: "mild", title: "Scenic route", text: "When you have a choice of paths, always take the longer one." },

  // Chance cards: crutches (handicaps)
  { id: "c01", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Tunnel vision", text: "{player} can only steal Stars from {rival}." },
  { id: "c02", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Window shopping", text: "{player} can't buy a Star until turn {n}.", turns: [5, 10] },
  { id: "c03", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Take a dive", text: "{player} has to lose their next minigame on purpose." },
  { id: "c04", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Mushroom diet", text: "{player} can only buy Mushrooms for the next {n} turns.", turns: [3, 6] },
  { id: "c05", kind: "chance", scope: "player", effect: "crutch", title: "Pockets sewn shut", text: "{player} can't use items for the next {n} turns.", turns: [2, 4] },
  { id: "c06", kind: "chance", scope: "player", effect: "crutch", title: "Long way round", text: "{player} takes the longer path at every fork for {n} turns.", turns: [3, 5] },
  { id: "c07", kind: "chance", scope: "player", effect: "crutch", title: "Wrong hand", text: "{player} plays the next {n} minigames with the controller in their other hand.", turns: [1, 3] },
  { id: "c08", kind: "chance", scope: "player", effect: "crutch", title: "Grudge", text: "{player} has to use their next item that hurts someone on {rival}." },
  { id: "c09", kind: "chance", scope: "player", effect: "crutch", title: "No gloves", text: "{player} can't start a Duel for the rest of the game." },
  { id: "c10", kind: "chance", scope: "player", effect: "crutch", title: "Closed on Sundays", text: "{player} has to walk past every Item Shop for {n} turns.", turns: [3, 6] },
  { id: "c11", kind: "chance", scope: "player", effect: "crutch", title: "Shopping spree", text: "{player} spends every coin they can at the next shop they reach." },
  { id: "c12", kind: "chance", scope: "player", effect: "crutch", title: "Bargain bin", text: "{player} can't buy anything over 5 coins for {n} turns.", turns: [3, 6] },

  // Chance cards: helps
  { id: "h01", starter: true, kind: "chance", scope: "player", effect: "help", rivalObeys: true, title: "Truce", text: "{rival} can't use items on {player} for {n} turns.", turns: [3, 5] },
  { id: "h02", starter: true, kind: "chance", scope: "player", effect: "help", title: "Duel-proof", text: "Nobody can challenge {player} to a Duel for {n} turns.", turns: [4, 8] },
  { id: "h03", starter: true, kind: "chance", scope: "player", effect: "help", title: "Backseat driver", text: "{player} chooses which way the leader goes at their next fork." },
  { id: "h04", kind: "chance", scope: "player", effect: "help", title: "Hands off", text: "For {n} turns, nobody can steal coins or Stars from {player} on purpose.", turns: [3, 5] },
  { id: "h05", starter: true, kind: "chance", scope: "player", effect: "help", title: "Head start", text: "Everyone except {player} plays the next minigame one-handed." },
  { id: "h06", kind: "chance", scope: "player", effect: "help", title: "Veto", text: "{player} can cancel one house rule, any time this game." },
  { id: "h07", kind: "chance", scope: "player", effect: "help", title: "Pass it on", text: "{player} can hand one of their crutch cards to someone else." },
  { id: "h08", kind: "chance", scope: "player", effect: "help", rivalObeys: true, title: "Bodyguard", text: "{rival} can't take a Star from {player} for the rest of the game." },
  { id: "h09", kind: "chance", scope: "player", effect: "help", rivalObeys: true, title: "Navigator", text: "{player} chooses which way {rival} goes at their next {n} forks.", turns: [2, 3] },
  { id: "h10", kind: "chance", scope: "player", effect: "help", title: "Get out of jail", text: "{player} can throw away one crutch card whenever they like." },

  // Missions
  { id: "m01", starter: true, kind: "mission", scope: "player", worth: 1, title: "Lucky streak", text: "Land on three Lucky Spaces." },
  { id: "m02", starter: true, kind: "mission", scope: "player", worth: 2, title: "Solo act", text: "Win a 1 vs 3 minigame as the solo player." },
  { id: "m03", starter: true, kind: "mission", scope: "player", worth: 2, title: "Duelist", text: "Win a Duel minigame." },
  { id: "m04", kind: "mission", scope: "player", worth: 1, title: "Party buddy", text: "Recruit a Jamboree Buddy.", games: [JAMBOREE] },
  { id: "m05", starter: true, kind: "mission", scope: "player", worth: 3, title: "Fat wallet", text: "End a turn holding 100 coins or more." },
  { id: "m06", starter: true, kind: "mission", scope: "player", worth: 3, title: "Star thief", text: "Take a Star from another player." },
  { id: "m07", kind: "mission", scope: "player", worth: 3, title: "Hat trick", text: "Win three minigames in a row." },
  { id: "m08", kind: "mission", scope: "player", worth: 2, title: "Bowser-proof", text: "Go the whole game without landing on a Bowser Space." },
  { id: "m09", starter: true, kind: "mission", scope: "player", worth: 2, title: "Bonus round", text: "Win a Bonus Star at the end of the game." },
  { id: "m10", kind: "mission", scope: "player", worth: 1, title: "Full pockets", text: "Hold three items at once." },
  { id: "m11", starter: true, kind: "mission", scope: "player", worth: 1, title: "Perfect ten", text: "Roll a 10 on a normal Dice Block." },
  { id: "m12", kind: "mission", scope: "player", worth: 2, title: "Doubles", text: "Roll matching numbers with Double Dice." },
  { id: "m13", kind: "mission", scope: "player", worth: 3, title: "Window shopper", text: "Finish in the top two without buying a single item." },
  { id: "m14", kind: "mission", scope: "player", worth: 1, title: "Underdog", text: "Win a minigame while you're in last place." },
  { id: "m15", kind: "mission", scope: "player", worth: 2, title: "Comeback", text: "Finish ahead of whoever was leading at the halfway turn." },
  { id: "m16", kind: "mission", scope: "player", worth: 2, title: "Two Stars, one turn", text: "Get two Stars in a single turn." },
  { id: "m17", kind: "mission", scope: "player", worth: 3, title: "Settle the score", text: "Take a Star from {rival}." },
  { id: "m18", starter: true, kind: "mission", scope: "player", worth: 1, title: "Rivalry", text: "Finish the game ahead of {rival}." },
  { id: "m19", kind: "mission", scope: "player", worth: 3, title: "Called out", text: "Beat {rival} in a Duel." },
  { id: "m20", kind: "mission", scope: "player", worth: 2, title: "Deeper pockets", text: "Have more coins than {rival} at the end of turn {n}.", turns: [5, 10] },
  { id: "m21", kind: "mission", scope: "player", worth: 1, title: "Shadow", text: "End a turn on the same space as {rival}." },
];

/**
 * Cards that apply to this game and ruleset, for a table of `seats` playing a
 * game of `turns`. A card whose shortest turn count won't fit (a 5-turn Frenzy
 * game) is left out rather than dealt with a nonsense number.
 */
export function cardsFor(gameSlug: string, rulesetId: string | null, kind: PartyCard["kind"], humans = 4, turns = 20, starterOnly = false): PartyCard[] {
  return PARTY_CARDS.filter(
    (c) => c.kind === kind && !c.retired
      && (!starterOnly || c.kind === "rule" || c.starter)
      && (!c.games || c.games.includes(gameSlug))
      && (!rulesetId || !c.notUnder?.includes(rulesetId))
      && (!c.rivalObeys || humans > 1)
      && (!c.turns || c.turns[0] <= turns - 2),
  );
}

/* ── Dealing ─────────────────────────────────────────────────────────────── */

/** A card as dealt: who it's for, who it names, and how many turns. */
export interface CardDraw {
  id: string;
  seat: number | null;
  rival: number | null;
  n: number | null;
}

export function cardById(id: string): PartyCard | undefined {
  return PARTY_CARDS.find((c) => c.id === id);
}

/** Who's at the table: every seat index, and which of them are people (not CPUs). */
export interface CardTable {
  seats: number[];
  people: number[];
}

/** A table whose first `people` of `seats` seats are people (the single-screen layout). */
export function simpleTable(seats: number, people = seats): CardTable {
  return { seats: Array.from({ length: seats }, (_, i) => i), people: Array.from({ length: Math.min(people, seats) }, (_, i) => i) };
}

/**
 * Deal `card` to `seat` (null for table-wide), filling in a rival and a turn
 * count. `turns` is the game's length: `{n}` never runs past its last turns.
 * A rival who has to follow the card (`rivalObeys`) is always a person.
 */
export function dealCard(card: PartyCard, seat: number | null, table: CardTable, turns: number, rng: () => number = Math.random): CardDraw {
  let rival: number | null = null;
  if (card.text.includes("{rival}")) {
    const others = (card.rivalObeys ? table.people : table.seats).filter((i) => i !== seat);
    if (others.length) rival = others[Math.floor(rng() * others.length)];
  }
  let n: number | null = null;
  if (card.turns) {
    const [lo, hi] = card.turns;
    const cap = Math.max(lo, Math.min(hi, turns - 2));
    n = lo + Math.floor(rng() * (cap - lo + 1));
  }
  return { id: card.id, seat, rival, n };
}

/** A dealt card's text split into plain runs and player references, for rendering names in bold. */
export type CardPart = string | { seat: number };
export function cardParts(card: PartyCard, draw: CardDraw): CardPart[] {
  return card.text.split(/(\{player\}|\{rival\}|\{n\})/).filter(Boolean).map((piece): CardPart => {
    if (piece === "{player}") return draw.seat !== null ? { seat: draw.seat } : "someone";
    if (piece === "{rival}") return draw.rival !== null ? { seat: draw.rival } : "someone";
    if (piece === "{n}") return String(draw.n ?? card.turns?.[0] ?? 3);
    return piece;
  });
}

/** Plain-text version of a dealt card. */
export function cardText(card: PartyCard, draw: CardDraw, name: (seat: number) => string): string {
  return cardParts(card, draw).map((p) => (typeof p === "string" ? p : name(p.seat))).join("");
}

/* ── Card moments ────────────────────────────────────────────────────────── */

/**
 * In-game moments that bring cards into play. The table switches on the ones it
 * likes; the randomizer shows them as reminders and makes the draw one tap.
 */
export interface CardMoment {
  id: string;
  title: string;
  text: string;
  notUnder?: string[];
}

export const CARD_MOMENTS: CardMoment[] = [
  { id: "chance-time", title: "Chance Time", text: "Whoever lands on a Chance Time Space also draws a Chance card.", notUnder: ["pro"] },
  { id: "bowser", title: "Bowser's tax", text: "Land on a Bowser Space and draw a crutch." },
  { id: "catch-up", title: "Catch-up", text: "Every five turns, last place draws a help and first place draws a crutch." },
  { id: "homestretch", title: "Homestretch", text: "When the Homestretch starts, every player draws a Chance card." },
  { id: "mission-reward", title: "Mission bonus", text: "Finish a mission and draw a help." },
  { id: "duel", title: "Duel stakes", text: "Win a Duel and draw a help. Lose one and draw a crutch." },
  { id: "intermission", title: "Intermission", text: "Between parts of the night, every player draws a Chance card." },
];

export function momentsFor(rulesetId: string | null): CardMoment[] {
  return CARD_MOMENTS.filter((m) => !rulesetId || !m.notUnder?.includes(rulesetId));
}
