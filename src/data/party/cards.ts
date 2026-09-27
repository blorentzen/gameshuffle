/**
 * House rules and missions for Mario Party nights. Shared across Mario Party
 * games; a card tied to one game's mechanics lists it in `games`.
 *
 * Ids are permanent: saved setups store them, and the streamer phase will pay
 * mission rewards against them. Retire a card with `retired: true` rather than
 * deleting or renumbering it.
 *
 * Every card is family-safe. "Spicy" means disruptive to the game, nothing more.
 */

export interface PartyCard {
  id: string;
  kind: "rule" | "mission";
  /** Whole table, or the player who drew it. */
  scope: "table" | "player";
  title: string;
  text: string;
  /** Rules only. */
  tone?: "mild" | "spicy";
  /** Missions only: how hard, 1 to 3. The streamer phase maps this to a reward. */
  worth?: 1 | 2 | 3;
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

  // Missions
  { id: "m01", kind: "mission", scope: "player", worth: 1, title: "Lucky streak", text: "Land on three Lucky Spaces." },
  { id: "m02", kind: "mission", scope: "player", worth: 2, title: "Solo act", text: "Win a 1 vs 3 minigame as the solo player." },
  { id: "m03", kind: "mission", scope: "player", worth: 2, title: "Duelist", text: "Win a Duel minigame." },
  { id: "m04", kind: "mission", scope: "player", worth: 1, title: "Party buddy", text: "Recruit a Jamboree Buddy.", games: [JAMBOREE] },
  { id: "m05", kind: "mission", scope: "player", worth: 3, title: "Fat wallet", text: "End a turn holding 100 coins or more." },
  { id: "m06", kind: "mission", scope: "player", worth: 3, title: "Star thief", text: "Take a Star from another player." },
  { id: "m07", kind: "mission", scope: "player", worth: 3, title: "Hat trick", text: "Win three minigames in a row." },
  { id: "m08", kind: "mission", scope: "player", worth: 2, title: "Bowser-proof", text: "Go the whole game without landing on a Bowser Space." },
  { id: "m09", kind: "mission", scope: "player", worth: 2, title: "Bonus round", text: "Win a Bonus Star at the end of the game." },
  { id: "m10", kind: "mission", scope: "player", worth: 1, title: "Full pockets", text: "Hold three items at once." },
  { id: "m11", kind: "mission", scope: "player", worth: 1, title: "Perfect ten", text: "Roll a 10 on a normal Dice Block." },
  { id: "m12", kind: "mission", scope: "player", worth: 2, title: "Doubles", text: "Roll matching numbers with Double Dice." },
  { id: "m13", kind: "mission", scope: "player", worth: 3, title: "Window shopper", text: "Finish in the top two without buying a single item." },
  { id: "m14", kind: "mission", scope: "player", worth: 1, title: "Underdog", text: "Win a minigame while you're in last place." },
  { id: "m15", kind: "mission", scope: "player", worth: 2, title: "Comeback", text: "Finish ahead of whoever was leading at the halfway turn." },
  { id: "m16", kind: "mission", scope: "player", worth: 2, title: "Two Stars, one turn", text: "Get two Stars in a single turn." },
];

/** Cards that apply to this game and ruleset. */
export function cardsFor(gameSlug: string, rulesetId: string | null, kind: PartyCard["kind"]): PartyCard[] {
  return PARTY_CARDS.filter(
    (c) => c.kind === kind && !c.retired
      && (!c.games || c.games.includes(gameSlug))
      && (!rulesetId || !c.notUnder?.includes(rulesetId)),
  );
}
