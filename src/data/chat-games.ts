/**
 * The Twitch chat games guide (/twitch-chat-games, search pages round, picks
 * 2026-10-20): only games GameShuffle runs, each with what chat does and the
 * command that starts it, and a screenshot of it on stream. Commands are the
 * real ones (src/lib/twitch/commands/guide.ts); keep them in step.
 */

export interface ChatGame {
  id: string;
  name: string;
  /** What happens, in a sentence or two. */
  does: string;
  /** What starts it (a chat command, or where to press). */
  start: string;
  /** What viewers type (a command when it starts with "!"). */
  chat: string;
  /** A short note after it. */
  chatNote?: string;
  /** Which games it suits. */
  fits: string;
  /** The overlay screenshot under /images/guides/chat-games/, once filmed. */
  shot?: string;
  shotAlt?: string;
  /** The picture's size in pixels (so the page doesn't jump while it loads). */
  shotSize?: [number, number];
  help?: { href: string; label: string };
}

export const CHAT_GAMES_CHECKED = "2026-10-20";

export const CHAT_GAMES_GUIDE: ChatGame[] = [
  {
    id: "chat-brain",
    shot: "chat-brain.webp",
    shotSize: [1340, 1006],
    shotAlt: "Chat Brain on a stream overlay: a survey question, three answers found, one strike and a countdown",
    name: "Chat Brain",
    does: "A survey game built from real people's answers. Chat names the most popular answers on the board, one short window at a time; three strikes and the board is over. Play chat against the board, 1v1 or teams with chat helping, a speed round where the first viewer to name an answer takes its points, or your chat against another streamer's.",
    start: "!cb start",
    chat: "!a pizza",
    fits: "Any game, and Just Chatting",
    help: { href: "/help/streaming/chat-brain", label: "How Chat Brain works on stream" },
  },
  {
    id: "trivia",
    shot: "trivia.webp",
    shotSize: [1184, 730],
    shotAlt: "A trivia question on a stream overlay with four choices and a countdown",
    name: "Trivia night",
    does: "Build a trivia night and play it on stream. Every viewer is their own team: they answer in chat or on your live page, and the overlay shows the question, the clock and the standings. Fill the rounds from our checked question pack or your own questions.",
    start: "Play it on my stream, in Trivia nights",
    chat: "!a 1985",
    chatNote: "or just b on a multiple choice",
    fits: "Any stream",
    help: { href: "/help/apps/trivia-nights", label: "How trivia nights work" },
  },
  {
    id: "stream-bingo",
    shot: "stream-bingo.webp",
    shotSize: [1104, 734],
    shotAlt: "Stream Bingo on an overlay: the last number called and the board of called numbers",
    name: "Stream Bingo",
    does: "Viewers grab a card while the doors are open, then numbers get called on a timer. The first real bingo wins (every claim is checked against the numbers called), with a token prize or one you name. Pick a pattern: a line, four corners, blackout or your own.",
    start: "!bingo start",
    chat: "!bingocard",
    chatNote: "then marks it on your live page",
    fits: "Any stream, and breaks",
    help: { href: "/help/streaming/stream-bingo", label: "How Stream Bingo works" },
  },
  {
    id: "polls",
    shot: "polls.webp",
    shotSize: [1144, 642],
    shotAlt: "A live poll on a stream overlay: what should we play next, with three options",
    name: "Live polls",
    does: "One poll across Twitch chat, your Discord and your live page. Viewers vote with a number and the overlay shows the tally moving. Close it by hand or on a timer.",
    start: "!poll Next game? | Kart | Smash",
    chat: "!vote 2",
    fits: "Any stream",
  },
  {
    id: "chat-draft",
    shot: "chat-draft.webp",
    shotSize: [1458, 1094],
    shotAlt: "A Pokémon chat draft on an overlay: three picks made and chat voting on the fourth",
    name: "Chat Draft",
    does: "Chat builds your team one pick at a time. Each pick is a quick vote between a few random options that fit the rules: a Pokémon team with no repeated types, a Mario Kart build, a Smash stage list or three fighters. Or run captain mode and let two captains draft players into teams.",
    start: "!draft start pokemon",
    chat: "!vote 3",
    fits: "Pokémon, Mario Kart, Smash",
    help: { href: "/help/streaming/chat-draft", label: "How Chat Draft works" },
  },
  {
    id: "who-said-it",
    shot: "who-said-it.webp",
    shotSize: [1144, 756],
    shotAlt: "Who Said It on an overlay: a quote and chat's votes on who said it",
    name: "Who Said It?",
    does: "Pulls a line from your channel's quote list and chat votes on who said it. Quotes come from your own chat, so the best ones are inside jokes.",
    start: "!whosaid",
    chat: "!vote 1",
    chatNote: "(add quotes with \"!quote add The line - Name\")",
    fits: "Any stream with a quote list",
  },
  {
    id: "battle",
    shot: "battle.webp",
    shotSize: [1264, 948],
    shotAlt: "A viewer battle lineup on an overlay: eight viewers, each with a Smash fighter",
    name: "Viewer battles",
    does: "Viewers join your lobby, then one command rolls everyone at once: a character for each player (and a kart in Mario Kart), shown as a lineup on screen. Then play it out in a viewer lobby.",
    start: "!gs battle",
    chat: "!gs join",
    fits: "Mario Kart, Smash, Mario Party, Splatoon, Kirby Air Riders and more",
  },
  {
    id: "break",
    shot: "break.webp",
    shotSize: [1520, 854],
    shotAlt: "Break mode on an overlay: a Higher or Lower round and the break's leaderboard",
    name: "Break mode",
    does: "Stepping away? Games run themselves while you're gone: Higher or Lower, Boss Fight, Kart Derby, Five Letters, Roster Rush and more. Chat plays right in chat, and a break champion is waiting when you're back.",
    start: "!gs brb 10",
    chat: "Answers straight into chat",
    fits: "Any stream",
    help: { href: "/help/streaming/break-mode", label: "How break mode works" },
  },
  {
    id: "wheel",
    shot: "wheel.webp",
    shotSize: [1520, 1141],
    shotAlt: "A challenge wheel on a stream overlay, landed on Mirror mode",
    name: "Wheel spins",
    does: "Spin one of your wheels on screen: challenges, punishments, the next game. The result goes to chat only when the wheel lands, so nobody spoils it.",
    start: "!spin",
    chat: "!wheel add Sing a song",
    chatNote: "mods add to it",
    fits: "Any stream",
  },
  {
    id: "chaos",
    shot: "chaos.webp",
    shotSize: [904, 508],
    shotAlt: "Chaos events on a stream overlay: an active modifier, Bananas only, and an open chat challenge worth 250 tokens",
    name: "Chaos events",
    does: "Viewers spend their tokens to throw an event into your run: a handicap, a challenge or a rule for the game on stream, drawn from your deck. Viewers opt in first, and you choose what's in the deck.",
    start: "Viewers start it",
    chat: "!chaos",
    chatNote: "or !random",
    fits: "The games in your event deck",
  },
  {
    id: "bounties",
    name: "Bounties",
    does: "Post a token reward for the viewer who pulls something off (\"beat me in the next race\"), then hand it to whoever did it with !gs bounty award @name. Paid from your monthly token allowance, never real money.",
    start: "!gs bounty 500 beat me in the next race",
    chat: "Goes for it in your viewer lobby",
    fits: "Any game you play with viewers",
  },
  {
    id: "picks-bans",
    shot: "picks-bans.webp",
    shotSize: [762, 428],
    shotAlt: "The picks and bans banner on a stream overlay, with the live page link and how many ballots are in",
    name: "Picks and bans",
    does: "For Mario Kart: open a round and chat picks and bans tracks for the next race; the most-voted ones count. Viewers can vote on your live page too.",
    start: "!gs picks open",
    chat: "!gs pick wario stadium",
    fits: "Mario Kart 8 Deluxe, Mario Kart World",
  },
];

export const CHAT_GAMES_FAQ = [
  { q: "Do my viewers need an account?", a: "No. Everything here is played by typing in chat. A few games also let viewers tap their answer on your live page, which asks them to sign in with Twitch once." },
  { q: "Do I need to add a bot to my channel?", a: "GameShuffle's bot joins your chat when you connect Twitch, and it only posts what the games need (a question, a result). Commands you don't use can be switched off." },
  { q: "Can my mods run them?", a: "Yes. Most games start from a mod's command too, and mods you give full access to get the stream's control room on their own page." },
  { q: "Do they show on my stream?", a: "Each game has an overlay piece you add to OBS or Streamlabs as one browser source, placed where you want it in the layout editor." },
  { q: "Does it work outside Twitch?", a: "The games are played in Twitch chat. Polls and trivia also post to your Discord, and most games have a card on your GameShuffle live page." },
  { q: "Is it free?", a: "Twitch streaming tools are part of GS Pro, which has a free trial. The free tools on GameShuffle (randomizers, the dailies, the wheel spinner) stay free." },
];
