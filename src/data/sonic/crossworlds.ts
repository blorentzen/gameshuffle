import type { SonicGame, SonicGadget, SonicMachine, SonicPack, SonicRacer, SonicStat } from "@/lib/sonic/types";

/**
 * Sonic Racing: CrossWorlds (SEGA / Sonic Team, September 25, 2025). Checked 2026-11-09 against version 2.0.0
 * (the Year Two update, November 3, 2026). Names only: no character art, logos or screenshots (the randomizer
 * shows "Image coming soon" until art is cleared).
 *
 * Sources:
 *   - SEGA's official site (asia.sega.com/SonicRacingCrossWorlds/en/): the racer lists behind racers.html
 *     (assets/data/racersMain, racersPrime, racersBonus, racersUpdate, racersCollabo .json), the courses and
 *     machines pages, and the update notices for 1.2.0, 1.3.1 and 1.4.1 (gadget names and slot changes).
 *   - The 2.0.0 patch notes as published November 3, 2026 (finalweapon.net, playday.one): Bayonetta, the 15 new
 *     gadgets, the Super Slot, the Godzilla Pack. SEGA's own site had no 2.0.0 notice yet.
 *   - Sonic Wiki on Fandom: "Characters in Sonic Racing: CrossWorlds" (types, release dates), "Machines in Sonic
 *     Racing: CrossWorlds" (machine types and how each is had), "Gadget (Sonic Racing: CrossWorlds)" (every
 *     gadget, slots, the plates) and the game page (tracks, Grand Prix, CrossWorlds), all read 2026-11-09.
 *   - Wikipedia, "Sonic Racing: CrossWorlds": 58 playable characters as of November 3, 2026; 24 tracks in eight
 *     Grands Prix; a Grand Prix is three races and a final race over all three tracks.
 *
 * What's in (released by 2026-11-09): 58 racers (23 from the start; Super Sonic and Bayonetta to unlock; 13 more
 * from free updates; 20 paid), 73 machines in five types, 134 gadgets, 24 main tracks in 8 Grands Prix, 7 paid tracks (the two
 * CrossOver Grands Prix from Season Pass 1, plus Godzilla Escape), 15 CrossWorlds.
 * Announced but not out yet, so left out: Aigis (Feb 2027), Rei, Asuka and the EVANGELION machines (Jan 2027),
 * Hello Kitty and Kuromi (Apr 2027), the Midgar and Persona packs, the SEGALAND pack's machines (After Burner,
 * OutRun, Super Megalo), the McLaren Racing Car (Nov 17, 2026), and the tracks Tokyo-III, Virtual Sanrio Puroland
 * and SEGALAND. CrossOver Grand Prix 3 can't be rolled until all its tracks are out.
 *
 * Where sources disagree, the official name wins:
 *   - SEGA lists "Dread" and "Werehog"; the wiki says Knuckles the Dread and Sonic the Werehog.
 *   - SEGA writes "Arsene Wing"; the wiki writes Arsène Wing.
 *   - The 2.0.0 notes call it "Speed Item Chance UP"; the wiki's gadget list says Boost Item Chance UP.
 *   - The 2.0.0 notes say "Brake Charge"; the wiki says Break Charge.
 *   - SEGA styles some names ("BiKiNi BOTTOM", "PAC-VILLAGE＆MAZE", racer names in capitals); written plainly here.
 *   - Gadgets the wiki marks "Upcoming" (Collision Charge, Air Trick Evolution, ACL+BST Character Kit) are left
 *     out. The wiki lists a second "Damage Support Kit" (recovery and a burst of speed from Rings) whose real name
 *     no source gives; it's left out until one does.
 * Do not reorder lists: nothing is seeded by position, but saved setups and chat rolls store names, so rename with
 * care.
 */

const S = "speed", A = "acceleration", H = "handling", P = "power", B = "boost";

// Racers ─────────────────────────────────────────────────────────────────────

const racer = (name: string, type: SonicStat, access: SonicRacer["access"], extra: Partial<SonicRacer> = {}): SonicRacer => ({ name, type, access, ...extra });

const RACERS: SonicRacer[] = [
  // The 23 on SEGA's "Main game racers" list, all open from the start.
  racer("Sonic", S, "start"), racer("Tails", A, "start"), racer("Knuckles", P, "start"), racer("Amy", H, "start"),
  racer("Cream & Cheese", H, "start"), racer("Big", P, "start"), racer("Silver", H, "start"), racer("Blaze", S, "start"),
  racer("Shadow", S, "start"), racer("Rouge", H, "start"), racer("Omega", P, "start"), racer("Vector", P, "start"),
  racer("Espio", S, "start"), racer("Charmy", A, "start"), racer("Zavok", P, "start"), racer("Zazz", A, "start"),
  racer("Dr. Eggman", P, "start"), racer("Metal Sonic", S, "start"), racer("Egg Pawn", A, "start"), racer("Sage", A, "start"),
  racer("Jet", S, "start"), racer("Wave", A, "start"), racer("Storm", P, "start"),
  // Unlocked by beating all 23 starting racers as rivals. Every stat maxed, Grand Prix only.
  racer("Super Sonic", S, "unlock", { super: true }),
  // Free updates: Sonic characters.
  racer("Tangle", A, "free"), racer("Whisper", B, "free"), racer("Classic Sonic", S, "free"),
  // Free updates: guests from other SEGA series. Bayonetta (2.0.0) is free but unlocked in Rival Duel.
  racer("Hatsune Miku", B, "free", { guest: "Hatsune Miku" }), racer("Joker", H, "free", { guest: "Persona" }),
  racer("Ichiban Kasuga", P, "free", { guest: "Like a Dragon" }), racer("NiGHTS", S, "free", { guest: "NiGHTS" }),
  racer("AiAi", H, "free", { guest: "Super Monkey Ball" }), racer("Red", S, "free", { guest: "Angry Birds" }),
  racer("Goro Majima", A, "free", { guest: "Like a Dragon" }), racer("Arle", H, "free", { guest: "Puyo Puyo" }),
  racer("Axel", A, "free", { guest: "Crazy Taxi" }), racer("Amigo", H, "free", { guest: "Samba de Amigo" }),
  racer("Bayonetta", H, "unlock", { guest: "Bayonetta" }),
  // Paid: the Sonic Prime racers (Season Pass 1 / Digital Deluxe), Werehog (pre-order or early purchase bonus),
  // Super Shadow (owning both season passes; Grand Prix only).
  racer("Nine", A, "paid", { pack: "prime" }), racer("Rusty Rose", H, "paid", { pack: "prime" }), racer("Dread", P, "paid", { pack: "prime" }),
  racer("Werehog", P, "paid", { pack: "werehog" }),
  racer("Super Shadow", S, "paid", { pack: "super-shadow", super: true }),
  // Paid: Season Pass 1 guest packs.
  racer("Steve", P, "paid", { pack: "minecraft", guest: "Minecraft" }), racer("Alex", P, "paid", { pack: "minecraft", guest: "Minecraft" }),
  racer("Creeper", A, "paid", { pack: "minecraft", guest: "Minecraft" }),
  racer("SpongeBob", H, "paid", { pack: "spongebob", guest: "SpongeBob SquarePants" }), racer("Patrick", P, "paid", { pack: "spongebob", guest: "SpongeBob SquarePants" }),
  racer("PAC-MAN", A, "paid", { pack: "pacman", guest: "PAC-MAN" }), racer("Ghosts", S, "paid", { pack: "pacman", guest: "PAC-MAN" }),
  racer("Mega Man", P, "paid", { pack: "megaman", guest: "Mega Man" }), racer("Proto Man", S, "paid", { pack: "megaman", guest: "Mega Man" }),
  racer("Leonardo", S, "paid", { pack: "tmnt", guest: "Teenage Mutant Ninja Turtles" }), racer("Raphael", P, "paid", { pack: "tmnt", guest: "Teenage Mutant Ninja Turtles" }),
  racer("Donatello", H, "paid", { pack: "tmnt", guest: "Teenage Mutant Ninja Turtles" }), racer("Michelangelo", A, "paid", { pack: "tmnt", guest: "Teenage Mutant Ninja Turtles" }),
  racer("Aang", S, "paid", { pack: "avatar", guest: "Avatar Legends" }), racer("Katara", H, "paid", { pack: "avatar", guest: "Avatar Legends" }),
];

// Machines ───────────────────────────────────────────────────────────────────

const m = (name: string, type: SonicStat, access: SonicMachine["access"], pack?: SonicPack): SonicMachine => ({ name, type, access, ...(pack ? { pack } : {}) });

/**
 * Every machine any racer can ride, by type (Boost machines are the Extreme Gear boards). "unlock" = Donpa
 * Tickets, beating AI Racer teams in Race Park, or Rival Duel (Super Shooting Star, Butterfly Witch).
 */
const MACHINES: SonicMachine[] = [
  // Speed
  m("Speedster Lightning", S, "start"), m("Dark Reaper", S, "start"), m("Mirage Blade", S, "unlock"), m("Super Shining", S, "unlock"),
  m("Royal Chariot", S, "unlock"), m("Stealth Chaser", S, "unlock"), m("Retro Future", S, "unlock"), m("Wild GT", S, "unlock"),
  m("Buster M", S, "unlock"), m("Arsene Wing", S, "free"), m("Banana Cruiser", S, "free"), m("Mach Cyclone", S, "free"),
  m("Devolada Yellow Jack", S, "free"), m("Super Dark Flare", S, "paid", "super-shadow"),
  // Acceleration
  m("Whirlwind Sport", A, "start"), m("Jumble Rage", A, "start"), m("Hyper Scorpion", A, "unlock"), m("Cyber Spear", A, "unlock"),
  m("Pawn Calibur", A, "unlock"), m("Long Stinger", A, "unlock"), m("Radical Fours", A, "unlock"), m("Racing Buggy", A, "unlock"),
  m("Giganto Liner", A, "unlock"), m("Super Roaster", A, "free"), m("Twinkle Bayoen", A, "free"), m("Rush Roadstar", A, "paid", "megaman"),
  m("Genesis Tower US", A, "paid", "sp2-bonus"), m("SegaSaturn JP", A, "paid", "sp2-bonus"), m("Dreamcast EU", A, "paid", "sp2-bonus"),
  // Handling
  m("Pink Cabriolet", H, "start"), m("Lip Spyder", H, "start"), m("Victoria Carriage", H, "unlock"), m("Moto Beetle", H, "unlock"),
  m("Ancient Throne", H, "unlock"), m("Little Lady", H, "unlock"), m("Hot Hatch", H, "unlock"), m("Fossil Rock", H, "unlock"),
  m("Neo Lightron", H, "unlock"), m("Minecart", H, "paid", "minecraft"), m("Patty Wagon", H, "paid", "spongebob"),
  m("PAC-MAN Mobile", H, "paid", "pacman"),
  // Power
  m("Land Smasher", P, "start"), m("Road Dragoon", P, "start"), m("Knight Tank", P, "unlock"), m("Fang Loader", P, "unlock"),
  m("Beat Gator", P, "unlock"), m("Frog Cruiser", P, "unlock"), m("Cross Dozer", P, "unlock"), m("Trail Runner", P, "unlock"),
  m("Egg Drillster Mk.II", P, "unlock"), m("Dragon Brave", P, "free"), m("Goromaru", P, "free"), m("Locomotive de Amigo", P, "free"),
  m("Beast Spike", P, "paid", "werehog"), m("Pizzafire Van", P, "paid", "tmnt"), m("Godzilla Cruiser", P, "paid", "godzilla"),
  m("King Ghidorah Coupe", P, "paid", "godzilla"),
  // Boost (Extreme Gear)
  m("TYPE-J Iota", B, "start"), m("TYPE-S Stream", B, "start"), m("Sakura Board", B, "unlock"), m("Triple Fan", B, "unlock"),
  m("Pop Float", B, "unlock"), m("TYPE-W Windy", B, "unlock"), m("Wispon Booster", B, "unlock"), m("Quad Copter", B, "unlock"),
  m("Jaws Rocket", B, "unlock"), m("Super Shooting Star", B, "unlock"), m("Butterfly Witch", B, "unlock"),
  m("Blue Star", B, "free"), m("Diva Macchina", B, "free"), m("Dream Sleeper", B, "free"),
  m("Gliding Air", B, "paid", "avatar"), m("Mothra Surf", B, "paid", "godzilla"),
];

// Gadgets ────────────────────────────────────────────────────────────────────

/** By the game's groups. Slots as of 2.0.0 (Crash Pads went from 2 to 1 in 1.4.1). */
const GADGETS: [string, [string, 1 | 2 | 3][]][] = [
  ["Ring Gain", [["Champion Bounty", 3], ["Route Planner Bounty", 1], ["Starting Boost Bounty", 1], ["Air Trick Bounty", 1], ["Item Attack Bounty", 1], ["Runoff Bounty", 1], ["Slipstream Bounty", 1], ["Travel Ring Bounty", 1], ["Morph Action Bounty", 1], ["Perfect Charge Bounty", 2], ["Dash Panel Mini Bounty", 1], ["Dash Panel Bounty", 2], ["Dash Panel Combo Bounty", 2]]],
  ["Ring Ability", [["Ring Doubler", 3], ["Less is More", 3], ["Ring Engine", 1], ["Hyper Ring Engine", 2], ["130 Ring Limit", 1], ["200 Ring Limit", 2], ["Mini Ring Thief", 1], ["Ring Thief", 2], ["Ring Gain Mini Boost", 1], ["Ring Gain Boost", 2], ["Ring Range UP", 1]]],
  ["Technique Upgrade", [["Hit and Run", 2], ["Extended Slipstream", 1], ["Air Drift Mobility UP", 1], ["Charge Jump Mobility UP", 1], ["Ultimate Air Trick", 2], ["Air Trick Adept", 1], ["Perfect Landing", 1], ["Air Trick Expert", 2], ["Collision Mini Boost", 1], ["Collision Boost", 2], ["Spin Drift", 2]]],
  ["Charge Upgrade", [["Mini Lv1 Quick Charge", 1], ["Lv1 Quick Charge", 2], ["Lv2 Quick Charge", 1], ["Lv3 Quick Charge", 1], ["Lv4 Quick Charge", 1], ["Ultimate Charge", 2], ["Boundless Charge", 3], ["Perfect Charge Boost", 2], ["Brake Charge", 3], ["Technical Drift", 2], ["Flawless Counter Drift", 2], ["Refined Counter Drift", 1], ["Counter Quick Charge", 3], ["Friction Drift", 2]]],
  ["Stat Upgrade", [["Speed Mod", 1], ["Acceleration Mod", 1], ["Handling Mod", 1], ["Power Mod", 1], ["Boost Mod", 1], ["Speed Tuner 1", 1], ["Speed Tuner 2", 1], ["Acceleration Tuner 1", 1], ["Acceleration Tuner 2", 1], ["Handling Tuner 1", 1], ["Handling Tuner 2", 1], ["Power Tuner 1", 1], ["Power Tuner 2", 1], ["Boost Tuner 1", 1], ["Boost Tuner 2", 1]]],
  ["Power Up", [["Damage Evolution", 1], ["Item Hit Evolution", 1], ["Collision Evolution", 1], ["Ring Evolution", 1], ["Quick Starter", 1], ["Super Quick Starter", 2], ["Slow Starter", 2], ["Super Slow Starter", 3]]],
  ["Support", [["Substitute Item", 2], ["Ring Mercy", 1], ["Damage Mercy", 2], ["Item Mercy", 2], ["Maximum Traction", 1], ["Second Wind", 1], ["Bumper Guard", 1], ["Invincible Start", 2], ["Strong Finish", 2], ["Invincible Finish", 3], ["Item Keeper", 2], ["Quick Recovery", 3], ["Mini Quick Recovery", 1], ["Crash Pads", 1], ["Power Through", 1]]],
  ["Item Control", [["Summon Item Box", 2], ["Lucky Pair", 2], ["Double Down", 3], ["Inventory Swap", 3], ["Inventory Plus", 2], ["Hazard Item Chance UP", 1], ["Attack Item Chance UP", 1], ["Defense Item Chance UP", 2], ["Speed Item Chance UP", 3], ["Wisp Chance UP", 1]]],
  ["Upgrade/Add Item", [["Go Go Omochao", 2], ["Boost Starter", 1], ["Double Boost Specialist", 2], ["Dark Chao Starter", 1], ["Warp Ring Specialist", 2], ["Giant Rocket Punch", 1], ["Giant Spiked Iron Ball", 1], ["Short Fuse", 1], ["Monster Truck Starter", 3]]],
  ["Standard Kit", [["Drift Charge Kit", 3], ["Item Hoarder Kit", 3], ["Damage Support Kit", 3]]],
  ["Machine Type Kit", [["Speed Machine Kit", 3], ["Acceleration Machine Kit", 3], ["Handling Machine Kit", 3], ["Power Machine Kit", 3], ["Boost Machine Kit", 3]]],
  ["Character Type Kit", [["Speed Character Kit", 3], ["Acceleration Character Kit", 3], ["Handling Character Kit", 3], ["Power Character Kit", 3], ["Boost Character Kit", 3]]],
  ["Advanced Kit", [["Gigaton Item Kit", 3], ["Perfect Charge Kit", 3], ["4th Stage Charge Kit", 3], ["Air Trick Action Kit", 3], ["Slipstream Kit", 3], ["Spin Dash Kit", 3], ["Speedy Shortcut Kit", 3], ["Item Buster Kit", 3], ["Drift Spinner Kit", 3], ["Panel Combo Kit", 3], ["Comeback Kit", 3], ["Ace Pilot Kit", 3], ["Sea Dog Kit", 3], ["All-Rounder Kit", 3], ["Wisp Hoarder Kit", 3]]],
];

const gadgetList: SonicGadget[] = GADGETS.flatMap(([category, list]) =>
  list.map(([name, slots]) => ({ name, slots, category, kit: category.endsWith("Kit") })));

// Tracks ─────────────────────────────────────────────────────────────────────

/** The eight Grands Prix of the base game (Chao Grand Prix was "Crystal Grand Prix" before 1.2.0). */
const CUPS: [string, [string, string, string]][] = [
  ["Donpa Grand Prix", ["E-Stadium", "Rainbow Garden", "Water Palace"]],
  ["Wisp Grand Prix", ["Metal Harbor", "Sand Road", "Colorful Mall"]],
  ["Boom Boo Grand Prix", ["Mystic Jungle", "Apotos", "Wonder Museum"]],
  ["Pumpkin Grand Prix", ["Crystal Mine", "Ocean View", "Pumpkin Mansion"]],
  ["Coral Grand Prix", ["Urban Canyon", "Market Street", "Coral Town"]],
  ["Chao Grand Prix", ["Blizzard Valley", "Radical Highway", "Chao Park"]],
  ["Egg Grand Prix", ["Donpa Factory", "Aqua Forest", "Eggman Expo"]],
  ["Secret Grand Prix", ["Kronos Island", "Northstar Islands", "White Space"]],
];

/** Season Pass 1's two CrossOver Grands Prix, one track per pack. */
const CROSSOVER: [string, [string, SonicPack][]][] = [
  ["CrossOver Grand Prix 1", [["Minecraft World", "minecraft"], ["Bikini Bottom", "spongebob"], ["PAC-Village & Maze", "pacman"]]],
  ["CrossOver Grand Prix 2", [["Wily Castle", "megaman"], ["New York City", "tmnt"], ["Lion Turtle Island", "avatar"]]],
];

/** Reached through a Travel Ring on lap 2; the leader picks one of two. */
const CROSSWORLDS = [
  "Sky Road", "Roulette Road", "Kraken Bay", "Golden Temple", "Magma Planet", "Hidden World", "Steampunk City", "Dragon Road",
  "Holoska", "Galactic Parade", "Dinosaur Jungle", "Sweet Mountain", "White Cave", "Cyber Space", "Digital Circuit",
];

export const CROSSWORLDS_GAME: SonicGame = {
  slug: "sonic-racing-crossworlds",
  label: "Sonic Racing: CrossWorlds",
  racers: RACERS,
  machines: MACHINES,
  gadgets: gadgetList,
  tracks: [
    ...CUPS.flatMap(([, t]) => t.map((name) => ({ name }))),
    ...CROSSOVER.flatMap(([, t]) => t.map(([name, pack]) => ({ name, pack }))),
    // CrossOver Grand Prix 3 (Season Pass 2): only its Godzilla track is out.
    { name: "Godzilla Escape", pack: "godzilla" },
  ],
  crossWorlds: CROSSWORLDS,
  cups: [
    ...CUPS.map(([name, tracks]) => ({ name, tracks })),
    ...CROSSOVER.map(([name, t]) => ({ name, tracks: t.map(([n]) => n) as [string, string, string], packs: t.map(([, p]) => p) })),
  ],
  // Our own colors for the five types (not the game's).
  stats: [
    { id: "speed", label: "Speed", color: "#1e5bd8" },
    { id: "acceleration", label: "Acceleration", color: "#d9480f" },
    { id: "handling", label: "Handling", color: "#2b8a3e" },
    { id: "power", label: "Power", color: "#c92a2a" },
    { id: "boost", label: "Boost", color: "#7048e8" },
  ],
  packs: [
    { id: "prime", label: "Sonic Prime racers", what: "Nine, Rusty Rose and Dread (Season Pass 1, Digital Deluxe)" },
    { id: "werehog", label: "Werehog", what: "Werehog and the Beast Spike (pre-order bonus)" },
    { id: "minecraft", label: "Minecraft", what: "Steve, Alex, Creeper, the Minecart and Minecraft World" },
    { id: "spongebob", label: "SpongeBob", what: "SpongeBob, Patrick, the Patty Wagon and Bikini Bottom" },
    { id: "pacman", label: "PAC-MAN", what: "PAC-MAN, the Ghosts, the PAC-MAN Mobile and PAC-Village & Maze" },
    { id: "megaman", label: "Mega Man", what: "Mega Man, Proto Man, the Rush Roadstar and Wily Castle" },
    { id: "tmnt", label: "TMNT", what: "The four turtles, the Pizzafire Van and New York City" },
    { id: "avatar", label: "Avatar", what: "Aang, Katara, the Gliding Air and Lion Turtle Island" },
    { id: "godzilla", label: "Godzilla", what: "Godzilla Escape and three machines (Season Pass 2)" },
    { id: "sp2-bonus", label: "Season Pass 2 bonus", what: "The Genesis Tower US, SegaSaturn JP and Dreamcast EU machines" },
    { id: "super-shadow", label: "Super Shadow", what: "Super Shadow and the Super Dark Flare (both season passes)" },
  ],
  plates: [
    { id: "normal", label: "Normal Plate (2 slots)", slots: 2, superSlot: false },
    { id: "bronze", label: "Bronze Plate (3 slots)", slots: 3, superSlot: false },
    { id: "silver", label: "Silver Plate (4 slots)", slots: 4, superSlot: false },
    { id: "gold", label: "Gold Plate (5 slots)", slots: 5, superSlot: false },
    { id: "master", label: "Master Plate (6 slots)", slots: 6, superSlot: false },
    { id: "grand-master", label: "Grand Master Plate (6 slots + Super Slot)", slots: 6, superSlot: true },
  ],
};
