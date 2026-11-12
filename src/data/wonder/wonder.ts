import type {
  WonderBadge, WonderBadgeType, WonderCharacter, WonderGame, WonderLevel, WonderLevelType, WonderRule, WonderWorld, WonderWorldId,
} from "@/lib/wonder/types";

/**
 * Super Mario Bros. Wonder (Nintendo, October 20, 2023) and its Nintendo Switch 2 Edition + Meetup in Bellabel Park
 * (March 26, 2026). Checked 2026-11-11.
 *
 * Sources (Super Mario Wiki, read through its API on 2026-11-11):
 *   - "Super Mario Bros. Wonder": the worlds table (every course in each world, its Wonder Seeds and its star rating)
 *     and the playable characters (the Yoshis and Nabbit take no damage from most enemies and hazards and can't use
 *     power-ups; the game's own Random pick never lands on them).
 *   - "Badge (Super Mario Bros. Wonder)": every badge in its group (Action, Boost, Expert, Dual), how each is had.
 *     24 in the original game, 18 more in the Switch 2 Edition (All Flower Power and 17 Dual Badges). Support Badges
 *     only work in Bellabel Park's attractions, so they're left out.
 *   - "Super Mario Bros. Wonder – Nintendo Switch 2 Edition + Meetup in Bellabel Park": Rosalina (plays like Mario),
 *     Co-Star Luma (an assist for a second player: left out, it isn't a character you play a course as), and the seven
 *     Koopaling showdowns ("Brigade Tent" on the map), one per world plus Ludwig's in Bellabel Park (each
 *     showdown's own page gives its world and stars).
 *
 * Names are the game's English names. The character select calls the Toads Yellow Toad and Blue Toad.
 * Level types: Shining Falls' trials, Castle Bowser's four courses (in the Petal Isles), Operation Poplin Rescue and the
 * Special World courses are courses; The Final Battle! is the boss level. Badge House, Poplin houses, WONDER? and
 * Bonus: Coins Galore! aren't levels you pick, so they're left out.
 * Badge descriptions are our own words. Rules are our own.
 * Saved setups and chat rolls store names, so rename with care.
 */

const P: WonderWorldId = "pipe-rock-plateau", F: WonderWorldId = "fluff-puff-peaks", S: WonderWorldId = "shining-falls",
  D: WonderWorldId = "sunbaked-desert", M: WonderWorldId = "fungi-mines", B: WonderWorldId = "deep-magma-bog",
  I: WonderWorldId = "petal-isles", X: WonderWorldId = "special-world", BP: WonderWorldId = "bellabel-park";

const WORLDS: WonderWorld[] = [
  { id: P, name: "Pipe-Rock Plateau", number: 1, color: "#21609e" },
  { id: F, name: "Fluff-Puff Peaks", number: 2, color: "#a8306f" },
  { id: S, name: "Shining Falls", number: 3, color: "#7a5a0e" },
  { id: D, name: "Sunbaked Desert", number: 4, color: "#9a5a12" },
  { id: M, name: "Fungi Mines", number: 5, color: "#256b31" },
  { id: B, name: "Deep Magma Bog", number: 6, color: "#5b2f7c" },
  { id: I, name: "Petal Isles", number: null, color: "#a8460c" },
  { id: X, name: "Special World", number: null, color: "#36364e" },
  { id: BP, name: "Bellabel Park", number: null, color: "#7e5800", switch2: true },
];

// Characters ─────────────────────────────────────────────────────────────────

const CHARACTERS: WonderCharacter[] = [
  { name: "Mario", slug: "mario", color: "#d9302b" },
  { name: "Luigi", slug: "luigi", color: "#1f8f3a" },
  { name: "Peach", slug: "peach", color: "#e05a9b" },
  { name: "Daisy", slug: "daisy", color: "#e08a10" },
  { name: "Yellow Toad", slug: "yellow-toad", color: "#d9a400" },
  { name: "Blue Toad", slug: "blue-toad", color: "#2f6fd6" },
  { name: "Toadette", slug: "toadette", color: "#d6478c" },
  // Switch 2 Edition: plays like Mario, Luigi, Peach, Daisy, the Toads and Toadette.
  { name: "Rosalina", slug: "rosalina", color: "#2f9fb3", switch2: true },
  { name: "Yoshi", slug: "yoshi", color: "#3aa83a", noDamage: true },
  { name: "Red Yoshi", slug: "red-yoshi", color: "#d6383a", noDamage: true },
  { name: "Yellow Yoshi", slug: "yellow-yoshi", color: "#d9a910", noDamage: true },
  { name: "Light-Blue Yoshi", slug: "light-blue-yoshi", color: "#3fa6d6", noDamage: true },
  { name: "Nabbit", slug: "nabbit", color: "#7a4fb0", noDamage: true },
];

// Badges ─────────────────────────────────────────────────────────────────────

const slugOf = (name: string) => name.toLowerCase().replace(/[!?]/g, "").replace(/\+/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const badge = (name: string, type: WonderBadgeType, what: string, where: string, extra: Partial<WonderBadge> = {}): WonderBadge =>
  ({ name, slug: slugOf(name), type, what, where, ...extra });

const BASE_BADGES: WonderBadge[] = [
  // Action Badges: new moves, mostly for reaching higher or farther.
  badge("Parachute Cap", "action", "Open your cap in midair to float down slowly.", "Badge House in Pipe-Rock Plateau", { first: true }),
  badge("Wall-Climb Jump", "action", "Jump off a wall, then jump straight up once more.", "Badge Challenge Wall-Climb Jump I or II", { first: true }),
  badge("Dolphin Kick", "action", "A quick burst of speed underwater.", "Badge Challenge Dolphin Kick I or II (Petal Isles)"),
  badge("Floating High Jump", "action", "Jump higher than usual and hang in the air for a moment.", "Badge Challenge Floating High Jump I or II"),
  badge("Crouching High Jump", "action", "Crouch to charge up, then jump higher than usual.", "POOF! Badge Challenge Crouching High Jump I"),
  badge("Timed High Jump", "action", "Jump again just as you land to go higher, even on sand.", "The Poplin Shop in Sunbaked Desert"),
  badge("Fast Dash", "action", "Run and walk a little faster, sand included.", "The hidden Poplin Shop in Sunbaked Desert"),
  badge("Grappling Vine", "action", "Shoot a vine in midair that grabs onto walls.", "Badge Challenge Grappling Vine I or II"),
  badge("Boosting Spin Jump", "action", "A spin in midair lifts you a little higher.", "Badge Challenge Boosting Spin Jump I or II"),
  // Boost Badges: help that's always on.
  badge("Coin Reward", "boost", "Enemies you defeat drop coins.", "Any Poplin Shop", { first: true }),
  badge("Auto Super Mushroom", "boost", "Start every course with a Super Mushroom.", "Wiggler Race Mountaineering!", { first: true }),
  badge("Add ! Blocks", "boost", "Extra ! Blocks show up in courses.", "Poplin Shops after Pipe-Rock Plateau"),
  badge("Safety Bounce", "boost", "Bounce back out of a pit, lava or poison once per fall.", "Poplin Shops from Fluff-Puff Peaks on"),
  badge("Rhythm Jump", "boost", "Jump in time with the music to earn coins.", "Ninji Jump Party (Sunbaked Desert)"),
  badge("Sensor", "boost", "Lets you know when a Wonder Flower or 10-flower coin is nearby.", "Fixing the bridge in Fungi Mines"),
  badge("Coin Magnet", "boost", "Pulls in coins and flower coins around you.", "The Poplin Shop in Deep Magma Bog"),
  badge("All Elephant Power", "boost", "Any power-up turns you into Elephant form.", "Poplin Shops, after The Final Battle!", { late: true }),
  badge("All Fire Power", "boost", "Any power-up gives you Fire form.", "Poplin Shops, after The Final Battle!", { late: true }),
  badge("All Bubble Power", "boost", "Any power-up gives you Bubble form.", "Poplin Shops, after The Final Battle!", { late: true }),
  badge("All Drill Power", "boost", "Any power-up gives you Drill form.", "Poplin Shops, after The Final Battle!", { late: true }),
  badge("All Flower Power", "boost", "Any power-up gives you Flower form.", "Ludwig's Showdown! (Switch 2 Edition)", { late: true, switch2: true }),
  // Expert Badges: harder moves for experienced players, and the joke one.
  badge("Jet Run", "expert", "Run at top speed nonstop, with a short jump after running off a ledge.", "Expert Badge Challenge Jet Run I or II", { first: true }),
  badge("Spring Feet", "expert", "Hop nonstop, and jump higher than usual.", "Expert Badge Challenge Spring Feet I or II"),
  badge("Invisibility", "expert", "You can't be seen, so enemies can't find you.", "Expert Badge Challenge Invisibility I or II"),
  badge("Sound Off?", "expert", "Changes the voices you hear and nothing else.", "WONDER?, after The Final-Final Test Badge Marathon", { late: true, cosmetic: true }),
];

/** Switch 2 Edition: two badges at once, grown from sprouts in Bellabel Park once you have both. */
const DUALS: [string, string][] = [
  ["Parachute Cap", "Floating High Jump"], ["Parachute Cap", "Boosting Spin Jump"], ["Wall-Climb Jump", "Grappling Vine"],
  ["Dolphin Kick", "Boosting Spin Jump"], ["Floating High Jump", "Crouching High Jump"], ["Timed High Jump", "Floating High Jump"],
  ["Coin Reward", "Auto Super Mushroom"], ["Coin Reward", "Coin Magnet"], ["Auto Super Mushroom", "Add ! Blocks"],
  ["Auto Super Mushroom", "All Elephant Power"], ["Auto Super Mushroom", "All Fire Power"], ["Auto Super Mushroom", "All Bubble Power"],
  ["Auto Super Mushroom", "All Drill Power"], ["Auto Super Mushroom", "All Flower Power"], ["Add ! Blocks", "Sensor"],
  ["Rhythm Jump", "Sound Off?"], ["Spring Feet", "Invisibility"],
];

const BADGES: WonderBadge[] = [
  ...BASE_BADGES,
  ...DUALS.map(([a, b]) => {
    const late = [a, b].some((n) => BASE_BADGES.find((x) => x.name === n)?.late);
    return badge(`${a} + ${b}`, "dual", `Both badges at once: ${a} and ${b}.`, "Sprouts in Bellabel Park (Switch 2 Edition)",
      { switch2: true, parts: [a, b], ...(late ? { late: true } : {}) });
  }),
];

// Levels ─────────────────────────────────────────────────────────────────────

const lv = (name: string, world: WonderWorldId, type: WonderLevelType, stars: number | null, extra: Partial<WonderLevel> = {}): WonderLevel =>
  ({ name, world, type, stars, ...extra });

const LEVELS: WonderLevel[] = [
  // Pipe-Rock Plateau
  lv("Welcome to the Flower Kingdom!", P, "course", 1),
  lv("Piranha Plants on Parade", P, "course", 1),
  lv("Scram, Skedaddlers!", P, "course", 1),
  lv("Bulrush Coming Through!", P, "course", 1),
  lv("Here Come the Hoppos", P, "course", 2),
  lv("Rolla Koopa Derby", P, "course", 2),
  lv("Swamp Pipe Crawl", P, "course", 3),
  lv("Angry Spikes and Sinkin' Pipes", P, "course", 2),
  lv("Bulrush Express", P, "course", 4),
  lv("Sproings in the Twilight Forest", P, "course", 2),
  lv("Cosmic Hoppos", P, "course", 3),
  lv("Badge Challenge Parachute Cap I", P, "badge", 1),
  lv("Badge Challenge Wall-Climb Jump I", P, "badge", 1),
  lv("Expert Badge Challenge Jet Run I", P, "badge", 3),
  lv("Wiggler Race Mountaineering!", P, "wiggler", 1),
  lv("Pipe-Rock Plateau Palace", P, "palace", 3),
  lv("KO Arena Pipe-Rock Rumble", P, "ko", null),
  lv("Break Time! Hurry, Hurry", P, "break", null),
  lv("Break Time! Wonder Token Tunes", P, "break", null),
  lv("Break Time! Pop Up, Hoppo!", P, "break", null),
  lv("Wendy's Showdown!", P, "showdown", 2, { switch2: true }),
  // Fluff-Puff Peaks
  lv("Outmaway Valley", F, "course", 3),
  lv("Pokipede Pass", F, "course", 1),
  lv("Condarts Away!", F, "course", 2),
  lv("Pole Block Passage", F, "course", 2),
  lv("Up 'n' Down with Puffy Lifts", F, "course", 2),
  lv("Jump! Jump! Jump!", F, "course", 4),
  lv("Countdown to Drop Down", F, "course", 3),
  lv("Cruising with Linking Lifts", F, "course", 2),
  lv("Badge Challenge Wall-Climb Jump II", F, "badge", 4),
  lv("Badge Challenge Floating High Jump I", F, "badge", 1),
  lv("Expert Badge Challenge Spring Feet I", F, "badge", 3),
  lv("Fluff-Puff Peaks Flying Battleship", F, "battleship", 3),
  lv("Fluff-Puff Peaks Palace", F, "palace", 4),
  lv("KO Arena Fluff-Puff Kerfuff", F, "ko", null),
  lv("Search Party Puzzling Park", F, "search", null),
  lv("Break Time! Kick It, Outmaway", F, "break", null),
  lv("Break Time! Cloud Cover", F, "break", null),
  lv("Break Time! Zip-Go-Round", F, "break", null),
  lv("Lemmy's Showdown!", F, "showdown", 2, { switch2: true }),
  // Shining Falls
  lv("The Hoppycat Trial: Hop, Hop, and Awaaay", S, "course", 3),
  lv("The Anglefish Trial: Ready, Aim, Fly!", S, "course", 2),
  lv("The Midway Trial: Hop to It", S, "course", 2),
  lv("The Sharp Trial: Launch to Victory", S, "course", 4),
  lv("The Sugarstar Trial: Across the Night Sky", S, "course", 3),
  lv("The Final Trial: Zip Track Dash", S, "course", 3),
  lv("POOF! Badge Challenge Crouching High Jump I", S, "badge", 1),
  lv("Search Party An Empty Park?", S, "search", null),
  lv("Break Time! Unreachable Treasure?", S, "break", null),
  lv("Break Time! Watery Wonder Tokens", S, "break", null),
  lv("Break Time! Timer-Switch Climb", S, "break", null),
  lv("Break Time! Timer-Switch Dash", S, "break", null),
  lv("Larry's Showdown!", S, "showdown", 2, { switch2: true }),
  // Sunbaked Desert
  lv("Armads on the Roll", D, "course", 3),
  lv("The Desert Mystery", D, "course", 2),
  lv("Rolling-Ball Hall", D, "course", 2),
  lv("Ninji Jump Party", D, "course", 1),
  lv("Bloomps of the Desert Skies", D, "course", 3),
  lv("Valley Fulla Snootles", D, "course", 2),
  lv("Color-Switch Dungeon", D, "course", 2),
  lv("Secrets of Shova Mansion", D, "course", 2),
  lv("Flight of the Bloomps", D, "course", 4),
  lv("Badge Challenge Parachute Cap II", D, "badge", 3),
  lv("Badge Challenge Crouching High Jump II", D, "badge", 4),
  lv("Expert Badge Challenge Invisibility I", D, "badge", 3),
  lv("Sunbaked Desert Palace", D, "palace", 4),
  lv("KO Arena Sunbaked Skirmish", D, "ko", null),
  lv("Search Party Pipe Park", D, "search", null),
  lv("Break Time! Treasure Vault", D, "break", null),
  lv("Break Time! Raise the Stage", D, "break", null),
  lv("Break Time! Revver Run", D, "break", null),
  lv("Break Time! Floating Wonder Tokens", D, "break", null),
  lv("Break Time! Bouncy Tunes", D, "break", null),
  lv("Break Time! Lights Out", D, "break", null),
  lv("Roy's Showdown!", D, "showdown", 3, { switch2: true }),
  // Fungi Mines
  lv("Upshroom Downshroom", M, "course", 1),
  lv("Taily's Toxic Pond", M, "course", 3),
  lv("Light-Switch Mansion", M, "course", 2),
  lv("Beware of the Rifts", M, "course", 3),
  lv("An Uncharted Area: Wubba Ruins", M, "course", 2),
  lv("Another Uncharted Area: Swaying Ruins", M, "course", 3),
  lv("A Final Uncharted Area: Poison Ruins", M, "course", 4),
  lv("Badge Challenge Grappling Vine I", M, "badge", 2),
  lv("KO Arena Fungi Funk", M, "ko", null),
  lv("Break Time! Tumble House", M, "break", null),
  lv("Break Time! Trottin' Piranha Plants", M, "break", null),
  // The world's last level (a Poplin level with a Royal Seed); the game gives it no star rating.
  lv("Operation Poplin Rescue", M, "course", null),
  lv("Iggy's Showdown!", M, "showdown", 3, { switch2: true }),
  // Deep Magma Bog
  lv("Where the Rrrumbas Rule", B, "course", 2),
  lv("Raarghs in the Ruins", B, "course", 3),
  lv("Pull, Turn, Burn", B, "course", 4),
  lv("Hot-Hot Hot!", B, "course", 2),
  lv("Wavy Ride through the Magma Tube", B, "course", 4),
  lv("Dragon Boneyard", B, "course", 4),
  lv("Badge Challenge Floating High Jump II", B, "badge", 3),
  lv("Badge Challenge Boosting Spin Jump II", B, "badge", 3),
  lv("Badge Challenge Grappling Vine II", B, "badge", 3),
  lv("Expert Badge Challenge Jet Run II", B, "badge", 3),
  lv("Expert Badge Challenge Invisibility II", B, "badge", 3),
  lv("Expert Badge Challenge Spring Feet II", B, "badge", 4),
  lv("Deep Magma Bog Flying Battleship", B, "battleship", 3),
  lv("Deep Magma Bog Palace", B, "palace", 4),
  lv("KO Arena Magma Flare-Up", B, "ko", null),
  lv("Search Party Item Park", B, "search", null),
  lv("Break Time! Hot-Hot Rocks", B, "break", null),
  lv("Morton's Showdown!", B, "showdown", 3, { switch2: true }),
  // Petal Isles (Castle Bowser's four courses and the final battle are here too)
  lv("Leaping Smackerel", I, "course", 2),
  lv("Robbird Cove", I, "course", 2),
  lv("Blewbird Roost", I, "course", 2),
  lv("Downpour Uproar", I, "course", 3),
  lv("Jewel-Block Cave", I, "course", 2),
  lv("Gnawsher Lair", I, "course", 3),
  lv("Maw-Maw Mouthful", I, "course", 2),
  lv("Muncher Fields", I, "course", 2),
  lv("Badge Challenge Dolphin Kick I", I, "badge", 1),
  lv("Badge Challenge Dolphin Kick II", I, "badge", 2),
  lv("Badge Challenge Boosting Spin Jump I", I, "badge", 1),
  lv("Wiggler Race Swimming!", I, "wiggler", 2),
  lv("Wiggler Race Spelunking!", I, "wiggler", 4),
  lv("Petal Isles Flying Battleship", I, "battleship", 3),
  lv("KO Arena Petal Meddle", I, "ko", null),
  lv("Missile Meg Mayhem", I, "course", 3),
  lv("High-Voltage Gauntlet", I, "course", 4),
  lv("Evade the Seeker Bullet Bills!", I, "course", 4),
  lv("KnuckleFest Bowser's Blazing Beats", I, "course", 4),
  lv("The Final Battle! Bowser's Rage Stage", I, "boss", 5),
  // Special World
  lv("Pipe-Rock Plateau Special Bounce, Bounce, Bounce", X, "course", 5),
  lv("Fluff-Puff Peaks Special Climb to the Beat", X, "course", 5),
  lv("Shining Falls Special Triple Threat Deluge", X, "course", 5),
  lv("Sunbaked Desert Special Pole Block Allure", X, "course", 5),
  lv("Fungi Mines Special Dangerous Donut Ride", X, "course", 5),
  lv("Deep Magma Bog Special Solar Roller", X, "course", 5),
  lv("Petal Isles Special Way of the Goomba", X, "course", 5),
  lv("The Semifinal Test Piranha Plant Reprise", X, "course", 5),
  lv("The Final Test Wonder Gauntlet", X, "course", 5),
  lv("The Final-Final Test Badge Marathon", X, "course", 5),
  // Bellabel Park (Switch 2 Edition)
  lv("Ludwig's Showdown!", BP, "showdown", 4, { switch2: true }),
];

// Challenge rules (our own) ──────────────────────────────────────────────────

const RULES: WonderRule[] = [
  // Lives
  { id: "one-life", kind: "lives", title: "One life each", detail: "Go down and you sit out the rest of the level: don't fly your ghost back to a teammate.", lasts: "night" },
  { id: "five-falls", kind: "lives", title: "Five falls for the team", detail: "Count every time someone goes down. On the sixth, everyone starts the level over.", lasts: "three" },
  // Badges (these change what the player cards show)
  { id: "no-badges", kind: "badges", title: "No badges", detail: "Everyone takes their badge off before the level starts.", lasts: "three", badge: "none" },
  { id: "same-badge", kind: "badges", title: "Same badge for everyone", detail: "Everyone wears {badge}.", lasts: "three", badge: "same" },
  { id: "pass-badges", kind: "badges", title: "Pass your badge on", detail: "After every level, hand your badge to the player on your left.", lasts: "night" },
  // Power-ups
  { id: "no-power-ups", kind: "power", title: "No power-ups", detail: "Leave every power-up where it is.", lasts: "three" },
  { id: "elephants-only", kind: "power", title: "Elephants only", detail: "Skip every power-up except the Elephant Fruit.", lasts: "three" },
  { id: "teammates-first", kind: "power", title: "Teammates first", detail: "Don't take a power-up while a teammate who can use one is small.", lasts: "three" },
  // How you play
  { id: "no-running", kind: "play", title: "No running", detail: "Don't hold the dash button. Jet Run wearers are let off.", lasts: "three" },
  { id: "flower-coins", kind: "play", title: "All three 10-flower coins", detail: "Find all three before the Goal Pole, or play the level again.", lasts: "level" },
  { id: "wonder-flower", kind: "play", title: "Find the Wonder Flower", detail: "Finish its Wonder Effect before you reach the Goal Pole.", lasts: "three" },
  { id: "top-of-pole", kind: "play", title: "Top of the Goal Pole", detail: "Everyone grabs the very top, or the level doesn't count.", lasts: "three" },
  { id: "no-going-back", kind: "play", title: "No going back", detail: "Once the screen moves on, leave whatever you missed.", lasts: "three" },
  { id: "no-stomping", kind: "play", title: "No stomping", detail: "Get past enemies without jumping on them.", lasts: "level" },
  { id: "silent-level", kind: "play", title: "Silent level", detail: "Nobody talks until the Goal Pole.", lasts: "level" },
  // Together
  { id: "follow-the-leader", kind: "team", title: "Follow the leader", detail: "Player 1 goes first and nobody passes them.", lasts: "three" },
  { id: "swap-controllers", kind: "team", title: "Swap controllers", detail: "After every level, pass your controller to the player on your left.", lasts: "night" },
  { id: "last-one-picks", kind: "team", title: "Last one in picks", detail: "Whoever reaches the Goal Pole last picks which level comes next.", lasts: "night" },
  { id: "answer-the-flowers", kind: "team", title: "Answer the flowers", detail: "When a Talking Flower speaks, everyone answers it out loud.", lasts: "night" },
];

export const WONDER: WonderGame = {
  slug: "super-mario-bros-wonder",
  name: "Super Mario Bros. Wonder",
  checkedOn: "2026-11-11",
  assetBase: "/images/super-mario-bros-wonder/",
  worlds: WORLDS,
  characters: CHARACTERS,
  badges: BADGES,
  levels: LEVELS,
  rules: RULES,
};
