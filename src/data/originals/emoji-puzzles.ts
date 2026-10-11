/**
 * Emoji Puzzle (break mode): a game told in emoji; chat types the game.
 * Our own puzzles, each checked to have one fair answer; `accept` lists the
 * other ways people say the title. Ids are stable (they key the 30-day
 * no-repeat list). Emoji only, no art.
 */

export interface EmojiPuzzle { id: string; emoji: string; answer: string; accept: string[] }

export const EMOJI_PUZZLES: EmojiPuzzle[] = [
  { id: "ep-mariokart", emoji: "🍄🏎️🍌", answer: "Mario Kart", accept: ["mariokart", "mk", "mario kart 8", "mario kart world"] },
  { id: "ep-minecraft", emoji: "🧱⛏️💎", answer: "Minecraft", accept: [] },
  { id: "ep-angrybirds", emoji: "🐦😠🐷", answer: "Angry Birds", accept: [] },
  { id: "ep-pacman", emoji: "🟡👻🍒", answer: "Pac-Man", accept: ["pacman"] },
  { id: "ep-pvz", emoji: "🌻🧟🏡", answer: "Plants vs. Zombies", accept: ["plants vs zombies", "plants versus zombies", "pvz"] },
  { id: "ep-animalcrossing", emoji: "🏝️🦝🍑", answer: "Animal Crossing", accept: ["acnh", "animal crossing new horizons"] },
  { id: "ep-splatoon", emoji: "🦑🎨🔫", answer: "Splatoon", accept: ["splatoon 3"] },
  { id: "ep-fortnite", emoji: "🚌🪂🏗️", answer: "Fortnite", accept: [] },
  { id: "ep-amongus", emoji: "👨‍🚀🔪🚨", answer: "Among Us", accept: [] },
  { id: "ep-zelda", emoji: "🗡️🛡️🧝", answer: "The Legend of Zelda", accept: ["zelda", "legend of zelda"] },
  { id: "ep-pokemon", emoji: "⚡🐭🔴", answer: "Pokémon", accept: ["pokemon", "pikachu"] },
  { id: "ep-stardew", emoji: "🌱🐔🏡", answer: "Stardew Valley", accept: ["stardew"] },
  { id: "ep-rocketleague", emoji: "🚗⚽🥅", answer: "Rocket League", accept: [] },
  { id: "ep-guitarhero", emoji: "🎸🦸🎶", answer: "Guitar Hero", accept: [] },
  { id: "ep-justdance", emoji: "💃🕺🎵", answer: "Just Dance", accept: [] },
  { id: "ep-donkeykong", emoji: "🦍🍌🛢️", answer: "Donkey Kong", accept: ["dk"] },
  { id: "ep-marioparty", emoji: "🎲⭐🎉", answer: "Mario Party", accept: ["mario party jamboree", "super mario party"] },
  { id: "ep-smash", emoji: "👊💥🏆", answer: "Super Smash Bros.", accept: ["smash", "smash bros", "super smash bros", "smash ultimate"] },
  { id: "ep-tetris", emoji: "🟦🟥🟨⬇️", answer: "Tetris", accept: [] },
  { id: "ep-goat", emoji: "🐐💥🏙️", answer: "Goat Simulator", accept: [] },
  { id: "ep-duckhunt", emoji: "🦆🔫🐕", answer: "Duck Hunt", accept: [] },
  { id: "ep-pong", emoji: "🏓⬜⬛", answer: "Pong", accept: [] },
  { id: "ep-overcooked", emoji: "🧑‍🍳🔥🍅", answer: "Overcooked", accept: ["overcooked 2"] },
  { id: "ep-starfox", emoji: "🦊⭐🚀", answer: "Star Fox", accept: ["starfox"] },
  { id: "ep-spyro", emoji: "🐉💜💎", answer: "Spyro", accept: ["spyro the dragon"] },
  { id: "ep-castlevania", emoji: "🧛🏰⚔️", answer: "Castlevania", accept: [] },
  { id: "ep-kirby", emoji: "🩷⭐😋", answer: "Kirby", accept: ["kirby air riders", "kirbys dream land"] },
  { id: "ep-sims", emoji: "💎🏠👪", answer: "The Sims", accept: ["sims", "the sims 4", "sims 4"] },
  { id: "ep-tonyhawk", emoji: "🛹🦅🏆", answer: "Tony Hawk's Pro Skater", accept: ["tony hawk", "tony hawks pro skater", "thps"] },
  { id: "ep-banjo", emoji: "🐻🐦🎒", answer: "Banjo-Kazooie", accept: ["banjo kazooie", "banjo"] },
  { id: "ep-megaman", emoji: "🤖🔵🔫", answer: "Mega Man", accept: ["megaman"] },
  { id: "ep-portal", emoji: "🔵🟠🚪", answer: "Portal", accept: ["portal 2"] },
  { id: "ep-halo", emoji: "😇🪖👽", answer: "Halo", accept: [] },
  { id: "ep-wiisports", emoji: "🎳🎾⛳", answer: "Wii Sports", accept: [] },
  { id: "ep-flappy", emoji: "🐤🟩⬆️", answer: "Flappy Bird", accept: [] },
  { id: "ep-fallguys", emoji: "🫘👑🌀", answer: "Fall Guys", accept: [] },
  { id: "ep-yoshi", emoji: "🦖🥚👅", answer: "Yoshi", accept: ["yoshis island", "yoshi's island", "yoshis crafted world"] },
  { id: "ep-sonic", emoji: "🦔💨💍", answer: "Sonic the Hedgehog", accept: ["sonic"] },
  { id: "ep-luigismansion", emoji: "👻🔦🏚️", answer: "Luigi's Mansion", accept: ["luigis mansion"] },
  { id: "ep-candycrush", emoji: "🍬🍭💥", answer: "Candy Crush", accept: ["candy crush saga"] },
  { id: "ep-frogger", emoji: "🐸🚗🛣️", answer: "Frogger", accept: [] },
  { id: "ep-simcity", emoji: "🏙️🚧🏗️", answer: "SimCity", accept: ["sim city"] },
];
