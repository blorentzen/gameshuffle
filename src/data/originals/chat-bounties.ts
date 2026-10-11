/**
 * Chat Sets the Bounty (break mode): challenges for the streamer's next game.
 * Chat votes one in; if the streamer pulls it off, everyone who voted for it
 * splits the bounty. Each is something one person can do on stream in a single
 * game, hard enough to be worth tokens, and clear enough that anyone watching
 * can tell whether it happened. `{name}` is the streamer. Labels stay short
 * (they're the vote cards); our own wording, no titles beyond the game's name.
 */

export interface ChatBounty { id: string; label: string; text: string }

export const ANY_GAME_BOUNTIES: ChatBounty[] = [
  { id: "cb-a-01", label: "Win it", text: "{name} wins the next game." },
  { id: "cb-a-02", label: "Podium", text: "{name} finishes in the top three of the next game." },
  { id: "cb-a-03", label: "Chat's pick", text: "{name} wins the next game with the character chat picks." },
  { id: "cb-a-04", label: "Comeback", text: "{name} is in last place at some point and still finishes in the top half." },
  { id: "cb-a-05", label: "No talking", text: "{name} plays the whole next game without saying a word, and still beats someone." },
  { id: "cb-a-06", label: "Off-hand", text: "{name} beats at least one player using their other hand on the stick." },
];

export const MARIO_KART_BOUNTIES: ChatBounty[] = [
  { id: "cb-k-01", label: "First place", text: "{name} wins the next race." },
  { id: "cb-k-02", label: "No items", text: "{name} finishes the next race in the top five without using an item." },
  { id: "cb-k-03", label: "Clean lap", text: "{name} finishes the next race without falling off the track." },
  { id: "cb-k-04", label: "From the back", text: "{name} is in last place on lap one and finishes in the top four." },
  { id: "cb-k-05", label: "Blue shell dodge", text: "{name} dodges or outruns a blue shell in the next race." },
  { id: "cb-k-06", label: "Heavy hitter", text: "{name} wins the next race with the heaviest character on the roster." },
];

export const SMASH_BOUNTIES: ChatBounty[] = [
  { id: "cb-s-01", label: "Match win", text: "{name} wins the next match." },
  { id: "cb-s-02", label: "Two-stock", text: "{name} wins the next match with at least two stocks left." },
  { id: "cb-s-03", label: "No specials", text: "{name} wins the next match without using a special move." },
  { id: "cb-s-04", label: "Spike", text: "{name} lands a spike or meteor smash in the next match." },
  { id: "cb-s-05", label: "Random fighter", text: "{name} wins the next match on the random fighter select." },
  { id: "cb-s-06", label: "Taunt KO", text: "{name} taunts right after taking a stock in the next match." },
];

export const PARTY_BOUNTIES: ChatBounty[] = [
  { id: "cb-p-01", label: "Star player", text: "{name} ends the next game with the most Stars." },
  { id: "cb-p-02", label: "Minigame streak", text: "{name} wins three minigames in a row." },
  { id: "cb-p-03", label: "Coin hoard", text: "{name} reaches 100 coins at some point in the next game." },
  { id: "cb-p-04", label: "Bonus Star", text: "{name} gets at least one Bonus Star at the end." },
  { id: "cb-p-05", label: "Top two", text: "{name} finishes the next game in first or second." },
];

/** The challenges that fit the game on stream, then the any-game ones. */
export function bountiesFor(gameOnStream: string | null): ChatBounty[] {
  const g = gameOnStream ?? "";
  if (g.includes("mario-kart")) return [...MARIO_KART_BOUNTIES, ...ANY_GAME_BOUNTIES];
  if (g.includes("smash")) return [...SMASH_BOUNTIES, ...ANY_GAME_BOUNTIES];
  if (g.includes("party")) return [...PARTY_BOUNTIES, ...ANY_GAME_BOUNTIES];
  return ANY_GAME_BOUNTIES;
}
