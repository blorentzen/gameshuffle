/**
 * GameShuffle's reaction stickers (GIF round 2 picks 2026-10-31; sticker rounds on
 * https://claude.ai/artifact/DgWUf1AjnpeshFqbtQYXoX: the Tile look, the Deeper palette, all 69 kept).
 * Each is a word on a tile in one of the site's tones with a Tabler glyph that moves for about five seconds,
 * then rests (Britton: only the icon art moves; the tile and the word never do). Drawn by GsSticker.
 *
 * Client-safe. Never rename or remove an id: comments and messages store it.
 */

export type StickerTone = "blue" | "violet" | "magenta" | "teal" | "green" | "orange" | "red" | "shuffle" | "fire" | "duel";
export type StickerMotion =
  | "bounce" | "pop" | "flicker" | "nod" | "stamp" | "tick" | "shake" | "wobble" | "roll" | "blink" | "squeeze"
  | "flash" | "spin" | "clash" | "nudge" | "swap" | "swing" | "launch" | "pulse" | "drip";
export type StickerGroup = "Wins" | "Ouch" | "Lobby" | "Mid-match" | "Racing" | "After the match" | "Game night" | "Chat";

export interface Sticker {
  id: string;
  /** What the tile says. A soft hyphen (­) marks where a long word may break. */
  word: string;
  /** The Tabler icon's name without the "Icon" prefix (stickerIcons.ts maps it). */
  icon: string;
  tone: StickerTone;
  motion: StickerMotion;
  group: StickerGroup;
  /** One plain line: shown on hover or press and hold, and read by screen readers. */
  meaning: string;
}

export const STICKER_GROUPS: StickerGroup[] = ["Wins", "Ouch", "Lobby", "Mid-match", "Racing", "After the match", "Game night", "Chat"];

const S = (id: string, word: string, icon: string, tone: StickerTone, motion: StickerMotion, group: StickerGroup, meaning: string): Sticker =>
  ({ id, word, icon, tone, motion, group, meaning });

export const STICKERS: Sticker[] = [
  S("gg", "GG", "Trophy", "duel", "bounce", "Wins", "Good game"),
  S("lets-go", "LET'S GO", "Bolt", "green", "pop", "Wins", "Here we go"),
  S("clutch", "CLUTCH", "Flame", "fire", "flicker", "Wins", "Pulled it off under pressure"),
  S("nice", "NICE", "ThumbUp", "teal", "nod", "Wins", "Well done"),
  S("called-it", "CALLED IT", "Target", "violet", "stamp", "Wins", "Saw that coming"),
  S("new-pb", "NEW PB", "Stopwatch", "blue", "tick", "Wins", "A new personal best"),
  S("nooo", "NOOO", "MoodSad", "red", "shake", "Ouch", "That hurt"),
  S("pain", "PAIN", "Bandage", "orange", "wobble", "Ouch", "A rough one"),
  S("rigged", "RIGGED", "Dice5", "magenta", "roll", "Ouch", "The dice hate me"),
  S("lag", "LAG", "WifiOff", "red", "blink", "Ouch", "The connection lost that one"),
  S("so-close", "SO CLOSE", "Ruler2", "orange", "squeeze", "Ouch", "Just short"),
  S("photo-finish", "PHOTO FINISH", "CameraBolt", "blue", "flash", "Ouch", "Decided by a hair"),
  S("one-more", "ONE MORE", "Repeat", "shuffle", "spin", "Game night", "One more game"),
  S("rematch", "REMATCH", "Swords", "fire", "clash", "Game night", "Again, right now"),
  S("your-turn", "YOUR TURN", "ArrowBigRight", "blue", "nudge", "Game night", "You're up"),
  S("shuffle", "SHUFFLE", "ArrowsShuffle", "shuffle", "swap", "Game night", "Mix it up"),
  S("roll-it", "ROLL IT", "Dice", "orange", "roll", "Game night", "Let the dice decide"),
  S("top-10", "TOP 10", "Medal", "duel", "swing", "Game night", "Made the top ten"),
  S("sending-it", "SENDING IT", "Rocket", "violet", "launch", "Chat", "Going for it"),
  S("big-brain", "BIG BRAIN", "Brain", "magenta", "pulse", "Chat", "A smart play"),
  S("respect", "RESPECT", "HeartHandshake", "teal", "pulse", "Chat", "Tip of the hat"),
  S("hype", "HYPE", "Confetti", "fire", "pop", "Chat", "Let's get loud"),
  S("brb", "BRB", "Clock", "teal", "tick", "Chat", "Be right back"),
  S("hydrate", "HYDRATE", "Droplet", "blue", "drip", "Chat", "Drink some water"),

  S("queue-up", "QUEUE UP", "ListNumbers", "blue", "nudge", "Lobby", "Join the next game"),
  S("ready", "READY", "CircleCheck", "green", "stamp", "Lobby", "Good to start"),
  S("loading", "LOADING", "Loader2", "shuffle", "spin", "Lobby", "Still getting in"),
  S("lobbys-open", "LOBBY'S OPEN", "DoorEnter", "teal", "nudge", "Lobby", "Come on in"),
  S("squad-up", "SQUAD UP", "UsersGroup", "violet", "pop", "Lobby", "Teams, now"),
  S("glhf", "GLHF", "Clover", "green", "swing", "Lobby", "Good luck, have fun"),
  S("locked-in", "LOCKED IN", "Lock", "blue", "stamp", "Mid-match", "Fully focused"),
  S("calculated", "CALCULATED", "Calculator", "violet", "tick", "Mid-match", "Exactly as planned"),
  S("cooking", "COOKING", "ChefHat", "orange", "wobble", "Mid-match", "Let them cook: it's working"),
  S("cracked", "CRACKED", "EggCracked", "fire", "shake", "Mid-match", "Ridiculously good"),
  S("clean", "CLEAN", "Sparkles", "teal", "flash", "Mid-match", "Not a single mistake"),
  S("carried", "CARRIED", "Barbell", "magenta", "bounce", "Mid-match", "Someone did the heavy lifting"),
  S("low-hp", "LOW HP", "Battery1", "red", "blink", "Mid-match", "Barely hanging on"),
  S("desync", "DESYNC", "PlugConnectedX", "red", "shake", "Mid-match", "The game disagrees with you"),
  S("respawning", "RESPAWNING", "RotateClockwise2", "shuffle", "spin", "Mid-match", "Back in a second"),
  S("side-quest", "SIDE QUEST", "Compass", "teal", "swing", "Mid-match", "Got distracted"),
  S("boss-fight", "BOSS FIGHT", "Crown", "duel", "pulse", "Mid-match", "The hard part"),
  S("1v1", "1V1", "Vs", "fire", "clash", "Mid-match", "You and me"),
  S("frontrunning", "FRONT­RUNNING", "ArrowBigRightLines", "blue", "nudge", "Racing", "Out front and pulling away"),
  S("bagging", "BAGGING", "ShoppingBag", "orange", "drip", "Racing", "Hanging back for better items"),
  S("final-lap", "FINAL LAP", "Flag3", "fire", "swing", "Racing", "Last chance"),
  S("hold-the-drift", "HOLD THE DRIFT", "SteeringWheel", "violet", "wobble", "Racing", "Don't let go yet"),
  S("full-speed", "FULL SPEED", "Gauge", "red", "tick", "Racing", "Nothing held back"),
  S("w", "W", "ArrowBigUp", "green", "bounce", "After the match", "A win"),
  S("l", "L", "ArrowBigDown", "red", "shake", "After the match", "A loss"),
  S("wp", "WP", "Star", "duel", "pop", "After the match", "Well played"),
  S("run-it-back", "RUN IT BACK", "PlayerTrackPrev", "shuffle", "nudge", "After the match", "Same again"),
  S("level-up", "LEVEL UP", "StairsUp", "green", "launch", "After the match", "Got better"),
  S("unlocked", "UNLOCKED", "LockOpen", "violet", "stamp", "After the match", "Finally got it"),
  S("speedrun", "SPEEDRUN", "Run", "fire", "nudge", "After the match", "Done in record time"),
  S("nerf-it", "NERF IT", "ArrowBigDownLines", "orange", "squeeze", "After the match", "That's too strong"),
  S("buff-it", "BUFF IT", "ArrowBigUpLines", "teal", "launch", "After the match", "That's too weak"),
  S("tilted", "TILTED", "MoodAngry", "red", "wobble", "After the match", "Frustrated and playing worse"),
  S("checkpoint", "CHECKPOINT", "Flag2", "blue", "stamp", "After the match", "Progress saved"),
  S("patch-notes", "PATCH NOTES", "Notes", "teal", "flash", "After the match", "Something changed"),
  S("snack-break", "SNACK BREAK", "Cookie", "orange", "bounce", "Game night", "Back in five"),
  S("pizzas-here", "PIZZA'S HERE", "Pizza", "fire", "spin", "Game night", "Pause everything"),
  S("house-rules", "HOUSE RULES", "HomeStar", "violet", "stamp", "Game night", "We play it our way"),
  S("tiebreaker", "TIEBREAKER", "Scale", "blue", "swing", "Game night", "One more decides it"),
  S("best-of-3", "BEST OF 3", "SquareNumber3", "shuffle", "pop", "Game night", "Not over yet"),
  S("winner-picks", "WINNER PICKS", "HandFinger", "green", "nudge", "Game night", "Winner chooses the next game"),
  S("sudden-death", "SUDDEN DEATH", "HourglassHigh", "red", "squeeze", "Game night", "Next point wins"),
  S("mic-check", "MIC CHECK", "Microphone", "orange", "pulse", "Chat", "Can you hear me?"),
  S("clip-it", "CLIP IT", "Scissors", "magenta", "clash", "Chat", "Somebody save that"),
  S("afk", "AFK", "Zzz", "teal", "drip", "Chat", "Away from the keyboard"),
];

export const STICKER_BY_ID: Record<string, Sticker> = Object.fromEntries(STICKERS.map((s) => [s.id, s]));

/** The word as plain text (no soft hyphen), for labels and alt text. */
export const stickerText = (s: Sticker) => s.word.replace(/­/g, "");
