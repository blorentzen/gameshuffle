/**
 * Challenge wheel presets: ready-made wheels a streamer can start in a click
 * (Pro overlay wheels) or anyone can load into the free wheel spinner. Our own
 * wording. Labels stay within 16 characters so a slice shows them whole
 * (WheelGraphic truncates past that). Client-safe.
 */

export interface WheelPreset {
  id: string;
  name: string;
  /** Who it's for, shown under the name. */
  blurb: string;
  segments: string[];
}

export const WHEEL_PRESETS: WheelPreset[] = [
  {
    id: "mario-kart-challenges",
    name: "Mario Kart challenges",
    blurb: "A rule for the next race.",
    segments: ["No items", "Mirror mode", "Only bikes", "Lightest rider", "Heaviest rider", "No drifting", "Start in reverse", "Bananas only", "Chat picks track", "Tiny wheels", "Last place swap", "Free race"],
  },
  {
    id: "mario-party-house-rules",
    name: "Mario Party house rules",
    blurb: "A twist for the next few turns.",
    segments: ["Swap coins", "Star costs 30", "Reverse order", "Double dice", "No items", "Loser picks", "Coins to last", "Steal a star", "Free round", "Bowser's turn"],
  },
  {
    id: "smash-challenges",
    name: "Smash challenges",
    blurb: "A handicap or rule for the next match.",
    segments: ["No shield", "No jumping", "Items high", "Random fighter", "One stock", "Stamina mode", "No specials", "Big mode", "Swap fighters", "Free match"],
  },
  {
    id: "splatoon-challenges",
    name: "Splatoon challenges",
    blurb: "A handicap for the next battle.",
    segments: ["No special", "Sub only", "Main only", "No super jump", "Random weapon", "Stay on turf", "Charger only", "Roller only", "Ink backwards", "Free battle"],
  },
  {
    id: "stream-punishments",
    name: "Stream punishments",
    blurb: "When the streamer loses a round.",
    segments: ["Do 10 squats", "Accent for 5 min", "Chat names you", "Silent round", "Sing a line", "Wrong hand", "Hat on stream", "Compliment chat", "Mute for 1 min", "You're safe"],
  },
  {
    id: "chat-decides",
    name: "Chat decides",
    blurb: "Hand the next call to chat.",
    segments: ["Next game", "Next character", "Next track", "Challenge run", "Speed round", "Viewer team", "Blind pick", "All or nothing", "Take a break", "Streamer's call"],
  },
  {
    id: "game-night-picks",
    name: "What do we play?",
    blurb: "Settle the next game at a game night.",
    segments: ["Mario Kart", "Mario Party", "Smash", "Splatoon", "Kirby Air Riders", "Jackbox", "Board game", "Card game", "Loser picks", "Winner picks"],
  },
  {
    id: "halloween-game-night",
    name: "Halloween game night",
    blurb: "A spooky rule for the next game.",
    segments: ["Spooky voices", "Lights off round", "Costume vote", "Monster mash", "Ghost player", "Scary music on", "Candy wager", "Boo! Swap seats", "Whisper only", "Free round"],
  },
  {
    id: "spooky-mario-kart",
    name: "Spooky Mario Kart",
    blurb: "A Halloween racer for the next race.",
    segments: ["King Boo", "Dry Bones", "Dry Bowser", "Petey Piranha", "Kamek", "Shy Guy", "Bowser", "Waluigi"],
  },
  {
    id: "christmas-party",
    name: "Christmas party",
    blurb: "A festive rule for the next game.",
    segments: ["Sing a carol", "Sweater vote", "Swap a gift", "Elf voices", "Cocoa break", "Steal a present", "Reindeer race", "Hum a song", "Tell a memory", "Free round"],
  },
  {
    id: "truth-dare-lite",
    name: "Party round",
    blurb: "Friendly prompts for a party.",
    segments: ["Tell a story", "Do an impression", "Best snack pick", "Hot take", "Dance for 10s", "Show a photo", "Trade seats", "Group selfie", "Pick a song", "Free pass"],
  },
];

export function wheelPreset(id: string): WheelPreset | undefined {
  return WHEEL_PRESETS.find((p) => p.id === id);
}
