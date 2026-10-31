/**
 * How the Commands pages explain each built-in chat command (client-safe):
 * its group, what it needs to work on a stream, and an example exchange.
 * What a command does, how to type it and who can use it come from the
 * registry (`help`, `minAuthority`); this adds the rest so the streamer's
 * Commands page and the viewers' page can say "works on your stream" or
 * hide what can't happen (just in time). Keyed by the registry's canonical
 * name; a command missing here falls back to its family's group.
 * `scripts/test-command-routing.ts` checks every built-in has an entry.
 */

export type CommandGroup =
  | "join" | "race" | "picks" | "live" | "tools" | "tokens" | "party" | "fun" | "replies" | "custom" | "admin";

export const COMMAND_GROUPS: { id: CommandGroup; label: string; blurb: string }[] = [
  { id: "join", label: "Joining and rolling", blurb: "Viewers get into your lobby and roll their own picks for the game on stream." },
  { id: "race", label: "Mario Kart race", blurb: "Tracks, items, rallies and the room code." },
  { id: "picks", label: "Picks and bans", blurb: "Chat votes on the tracks and items you roll from." },
  { id: "live", label: "Polls and live games", blurb: "Polls, Stream Bingo, Chat Draft, Chat Brain, Who Said It? and break mode." },
  { id: "tools", label: "Overlay tools", blurb: "The wheel, dice, coin, timer, raffle and the rest, on your overlay." },
  { id: "tokens", label: "Tokens and bets", blurb: "Your community's tokens: balances, gifts, bounties and predictions." },
  { id: "party", label: "Party nights", blurb: "Seats, Chance cards and missions during a Mario Party night." },
  { id: "fun", label: "Fun and info", blurb: "Quick answers, random picks, events and links." },
  { id: "replies", label: "Replies", blurb: "Ready-made replies like !socials and !rules. Keep ours or write your own." },
  { id: "custom", label: "Your commands", blurb: "Commands you wrote." },
  { id: "admin", label: "Mods and managing", blurb: "Bring your mods in and manage your commands from chat." },
];

/** What a command needs before it can do anything on a stream. */
export type CommandNeed = "mario-kart" | "mario-kart-world" | "rollable-game" | "party-night" | "tournament" | "wheel";

export const NEED_LABELS: Record<CommandNeed, string> = {
  "mario-kart": "Mario Kart 8 Deluxe or World",
  "mario-kart-world": "Mario Kart World",
  "rollable-game": "a game GameShuffle rolls for",
  "party-night": "a Mario Party night",
  tournament: "a live tournament",
  wheel: "a wheel",
};

export interface CommandGuide {
  group: CommandGroup;
  needs?: CommandNeed[];
  /** What someone types, and what the bot says back. */
  example?: [string, string];
}

const FAMILY_GROUP: Record<string, CommandGroup> = {
  play: "join", race: "race", picks: "picks", tokens: "tokens", market: "tokens", mod: "join", community: "fun", core: "fun", commands_admin: "admin",
};

export const COMMAND_GUIDE: Record<string, CommandGuide> = {
  "8ball": { group: "fun", example: ["!8ball will I win?", "Signs point to yes."] },
  "a": { group: "live", example: ["!a pizza", "(counted quietly)"] },
  "bet": { group: "tokens", needs: ["mario-kart"], example: ["!bet 1 200", "kartkev bet 200 on 1st place."] },
  "bingocard": { group: "live" },
  "cb": { group: "live" },
  "chance": { group: "party", needs: ["party-night"] },
  "chance.vote": { group: "party", needs: ["party-night"] },
  "chaos": { group: "fun" },
  "choose": { group: "fun", example: ["!choose tacos | pizza", "I choose: pizza"] },
  "commands": { group: "admin" },
  "consent": { group: "fun" },
  "crews": { group: "fun", needs: ["tournament"] },
  "draft": { group: "live" },
  "engagement": { group: "fun" },
  "give": { group: "tokens", example: ["!give @PogPriya 50", "kartkev gave PogPriya 50 tokens."] },
  "gs": { group: "fun" },
  "gs.8ball": { group: "tools" },
  "gs.award": { group: "tokens" },
  "gs.ban": { group: "picks", needs: ["mario-kart"] },
  "gs.banreset": { group: "picks", needs: ["mario-kart"] },
  "gs.bans": { group: "picks", needs: ["mario-kart"] },
  "gs.battle": { group: "join", needs: ["rollable-game"], example: ["!gs battle", "Viewer battle! kartkev: Mario · PogPriya: Kirby · …"] },
  "gs.bingo": { group: "live" },
  "gs.bounty": { group: "tokens" },
  "gs.bounty.award": { group: "tokens" },
  "gs.bounty.cancel": { group: "tokens" },
  "gs.clear": { group: "join" },
  "gs.dare": { group: "tools" },
  "gs.decide": { group: "tools" },
  "gs.dice": { group: "tools" },
  "gs.draw": { group: "tools" },
  "gs.enter": { group: "tools" },
  "gs.fc": { group: "race", needs: ["mario-kart"] },
  "gs.flip": { group: "tools" },
  "gs.help": { group: "fun" },
  "gs.items": { group: "race", needs: ["mario-kart"] },
  "gs.join": { group: "join", example: ["!gs join", "kartkev is in the lobby (5/12)."] },
  "gs.kick": { group: "join" },
  "gs.leave": { group: "join" },
  "gs.live": { group: "fun", example: ["!gs live", "Play along: gameshuffle.co/live/novastreams"] },
  "gs.lobby": { group: "join", example: ["!gs lobby", "In the shuffle (5/12): kartkev, PogPriya, LurkerLou…"] },
  "gs.market.close": { group: "tokens", needs: ["mario-kart"] },
  "gs.market.lock": { group: "tokens", needs: ["mario-kart"] },
  "gs.market.open": { group: "tokens", needs: ["mario-kart"] },
  "gs.brb": { group: "live", example: ["!gs brb 10", "Nova is taking a break (about 10 min). Play along right here in chat: first up is Higher or Lower."] },
  "gs.back": { group: "live", example: ["!gs back", "Nova is back! Break champion: kartkev with 14 points."] },
  "gs.pull": { group: "admin" },
  "mmr": { group: "race", needs: ["mario-kart"], example: ["!mmr", "🏁 Sam: 7,912 MMR · Gold · 88 to Platinum · #2,562 world · tonight +158 (4-1) · MK World 12P"] },
  "last10": { group: "race", needs: ["mario-kart"], example: ["!last10", "🏁 Sam's last 10: 7-3, +214. Best: 1st, +58. Average score 96."] },
  "tonight": { group: "race", needs: ["mario-kart"], example: ["!tonight", "🏁 Sam tonight: 5 events, 4-1, +158. Into Platinum on event 4."] },
  "compare": { group: "race", needs: ["mario-kart"], example: ["!compare Riley", "🏁 Sam 8,070 (Platinum) vs Riley 8,412 (Platinum). Riley +342, played 31 more events."] },
  "lounge": { group: "race", needs: ["mario-kart"], example: ["!lounge", "🏁 Sam's lounge page: gameshuffle.co/lounge/Sam"] },
  "h2h": { group: "race", needs: ["mario-kart"], example: ["!h2h Riley", "🏁 Sam vs Riley: 23 events together. As opponents Riley leads 10-7. Teammates 4-2. Last: Oct 18, Riley 2nd, Sam 5th."] },
  "odds": { group: "race", needs: ["mario-kart"], example: ["!odds", "🏁 Sam's room: average 7,792, Sam 3rd of 12 by MMR. 1st +209 · 6th +9 · 12th −231. Favorite: Riley."] },
  "gs.mod": { group: "admin", example: ["!gs mod", "@kartkev help run the stream tools as a mod: gameshuffle.co/mod/join/novastreams"] },
  "gs.mycombo": { group: "join", needs: ["rollable-game"] },
  "gs.pick": { group: "picks", needs: ["mario-kart"], example: ["!gs pick wario stadium", "kartkev picked Wario Stadium."] },
  "gs.pickreset": { group: "picks", needs: ["mario-kart"] },
  "gs.picks": { group: "picks", needs: ["mario-kart"] },
  "gs.picks.close": { group: "picks", needs: ["mario-kart"] },
  "gs.picks.open": { group: "picks", needs: ["mario-kart"] },
  "gs.profile": { group: "fun" },
  "gs.race": { group: "race", needs: ["mario-kart"], example: ["!gs race", "Wario Stadium | Rise of the Koopa"] },
  "gs.rally": { group: "race", needs: ["mario-kart-world"] },
  "gs.resolve": { group: "tokens", needs: ["mario-kart"] },
  "gs.room": { group: "race", needs: ["mario-kart"], example: ["!gs room", "Room code: 4821-7736"] },
  "gs.room.set": { group: "race", needs: ["mario-kart"] },
  "gs.setup": { group: "join", needs: ["rollable-game"], example: ["!gs setup 8", "Grand Prix, 8 races: 1. Mushroom Gorge · 2. Wario Stadium · …"] },
  "gs.shuffle": { group: "join", needs: ["rollable-game"], example: ["!gs shuffle", "Rolled for kartkev: Daisy · Standard Bike"] },
  "gs.spin": { group: "tools", needs: ["wheel"], example: ["!spin", "The wheel is spinning on screen."] },
  "gs.tier": { group: "tools" },
  "gs.timer": { group: "tools", example: ["!gs-timer 5m Break", "A 5:00 Break timer starts on screen."] },
  "gs.tourney": { group: "tools", needs: ["tournament"] },
  "gs.track": { group: "race", needs: ["mario-kart"] },
  "gs.truth": { group: "tools" },
  "leaderboard": { group: "tokens" },
  "lurk": { group: "fun", example: ["!lurk", "Enjoy the lurk, kartkev!"] },
  "mission": { group: "party", needs: ["party-night"] },
  "mission.done": { group: "party", needs: ["party-night"] },
  "opt-in": { group: "fun" },
  "opt-out": { group: "fun" },
  "party": { group: "party", needs: ["party-night"] },
  "party.join": { group: "party", needs: ["party-night"], example: ["!party join", "kartkev took seat 3 in the party night."] },
  "poll": { group: "live", example: ["!poll Next game? | Kart | Smash", "Poll open: Next game? 1) Kart 2) Smash. Vote with !vote 1"] },
  "random": { group: "fun" },
  "roll": { group: "fun", example: ["!roll 1-20", "kartkev rolled 14."] },
  "tokens": { group: "tokens", example: ["!tokens", "kartkev has 1,240 tokens."] },
  "vote": { group: "live", example: ["!vote 2", "(counted quietly)"] },
  "wheel.add": { group: "tools", needs: ["wheel"] },
  "wheel.clear": { group: "tools", needs: ["wheel"] },
  "wheel.list": { group: "tools", needs: ["wheel"] },
  "wheel.remove": { group: "tools", needs: ["wheel"] },
  "whosaid": { group: "live" },
};

/** What the ready-made replies (gs_default_commands) do, in viewers' words.
 *  Their catalog descriptions are written for whoever curates them. */
export const REPLY_SUMMARIES: Record<string, string> = {
  coinflip: "Flip a coin: heads or tails.",
  compliment: "Send someone a compliment: !compliment @name.",
  commands: "Every command on this channel.",
  discord: "The Discord invite.",
  fact: "A random fun fact.",
  follow: "How to follow the stream.",
  gameshuffle: "What GameShuffle is.",
  gg: "Say good game.",
  hi: "Say hi to the bot.",
  hype: "Hype up chat.",
  joke: "A random joke.",
  qotd: "Today's question of the day.",
  quote: "A random quote from the channel's quote book.",
  rules: "The chat rules.",
  schedule: "When the stream is on.",
  shoutout: "Shout out another streamer: !shoutout @name.",
  socials: "Where to follow the streamer.",
  unlurk: "Say you're back from lurking.",
};

export function guideFor(name: string, family: string): CommandGuide {
  return COMMAND_GUIDE[name] ?? { group: FAMILY_GROUP[family] ?? "fun" };
}
