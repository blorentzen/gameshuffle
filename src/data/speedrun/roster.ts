/**
 * The speedrun roster (roster picks 2026-11-11, all as recommended): split templates for ten games people run and
 * race, our own lists from each game's levels, chapters, stars and bosses in the order runners split, checked against
 * runners' guides (sources per list). Where the game has no name for a split point (a toad star, a hub door), the label
 * is the one runners use, and the notes say so. Routes change: a template is a starting point, and runners can type
 * their own or bring a LiveSplit file. Researched 2026-11-11 (`ROSTER_CHECKED`).
 *
 * Used by the setup page's templates (src/lib/speedrun/templates.ts) and the splits pages (/speedrun/splits/<game>).
 * `groups` are LiveSplit subsplit groups (null = not in a group). Client-safe; keep it data only.
 */

import type { SplitGroup } from "@/lib/speedrun/splitGroups";

export const ROSTER_CHECKED = "2026-11-11";

export interface RosterCategory {
  id: string;
  name: string;
  /** How sure the list is: high = matches the guides as written; medium = the guides agree but a detail is our reading. */
  confidence: "high" | "medium" | "low";
  sources: string[];
  /** What varies (routes, versions) and which labels are runners' own. */
  notes: string;
  groups: SplitGroup[];
}

export interface RosterGame {
  /** The catalog slug (src/data/game-catalog.ts). */
  key: string;
  /** The game's name as speedrun boards use it. */
  title: string;
  platforms: string[];
  /** How runs are timed on the boards: real time, or load-removed (in-game) time. */
  timing: "RTA" | "LRT";
  timingNote: string;
  categories: RosterCategory[];
}

export const SPEEDRUN_ROSTER: RosterGame[] = [
  {
    key: "super-mario-64",
    title: "Super Mario 64",
    platforms: ["Nintendo 64", "Wii Virtual Console", "Wii U Virtual Console", "Nintendo Switch"],
    timing: "RTA",
    timingNote: "speedrun.com default time is real time. Runs are timed from the frame the game starts to the final Bowser star grab.",
    categories: [
      { id: "16-star", name: "16 Star", confidence: "high", sources: ["https://ukikipedia.net/wiki/16_Star", "https://www.speedrun.com/sm64?h=16_Star"], notes: "Standard no-LBLJ route: Lakitu skip, MIPS clip past the 30 star door and the backwards long jumps up the Endless Stairs are movement, not splits. Beginners swap the Bowser in the Dark World red coins for Swimming Beast in the Cavern. Advanced runners use the LBLJ route (skips Bob-omb Battlefield, Cool, Cool Mountain, Chip off Whomp's Block and To the Top of the Fortress; adds Inside the Ancient Pyramid, Red-Hot Log Rolling, Boil the Big Bully and Hot-Foot-It into the Volcano or Elevator Tour in the Volcano, plus Swimming Beast in the Cavern). Bowser in the Fire Sea and Bowser in the Sky are done without red coins. 'Toad (Hazy Maze Cave)' and the Bowser red coin stars have no star name in the game; the label is ours.", groups: [{"group": null, "names": ["Behind Chain Chomp's Gate", "Blast Away the Wall", "Shoot into the Wild Blue", "Chip off Whomp's Block", "To the Top of the Fortress", "Fall onto the Caged Island", "Wall Kicks Will Work", "Li'l Penguin Lost", "Bowser in the Dark World Red Coins", "Bowser in the Dark World", "In the Talons of the Big Bird", "Shining Atop the Pyramid", "8-Coin Puzzle with 15 Pieces", "Toad (Hazy Maze Cave)", "A-Maze-ing Emergency Exit", "Watch for Rolling Rocks", "Board Bowser's Sub", "Bowser in the Fire Sea", "Bowser in the Sky"]}] },
      { id: "70-star", name: "70 Star", confidence: "medium", sources: ["https://ukikipedia.net/wiki/RTA_Guide/70_Star", "https://ukikipedia.net/wiki/RTA_Guide/Whomp%27s_Fortress", "https://www.speedrun.com/sm64?h=70_Star"], notes: "Ukikipedia's standard 'HMC Late' route at the Advanced tier (TTC 100 coins, CCM17, no Island Hop): 70 stars plus the three Bowser fights. Tiers vary: Beginner skips TTC 100 coins and takes Shell Shreddin' for Red Coins in Snowman's Land instead; Beginner and Intermediate (CCM18) take Slip Slidin' Away, Big Penguin Race and its 100 coin star in Cool, Cool Mountain and drop Pyramid Puzzle; Expert (Island Hop) moves Shoot to the Island in the Sky to the start of the run. 'HMC Early' does Hazy Maze Cave on the first basement trip. A 100 coin star does not end the course, so it is listed before the named star of the same visit. Toad, MIPS, Secret Slide, 100 coin and Bowser red coin stars have no star name in the game; those labels are ours. BLJs and MIPS clips are banned in 70 Star.", groups: [{"group": "Bob-omb Battlefield", "names": ["Behind Chain Chomp's Gate"]}, {"group": "The Princess's Secret Slide", "names": ["The Princess's Secret Slide (box)"]}, {"group": "Whomp's Fortress", "names": ["Blast Away the Wall", "Fall onto the Caged Island", "Whomp's Fortress 100 Coins", "Red Coins on the Floating Isle", "Shoot into the Wild Blue", "Chip off Whomp's Block", "To the Top of the Fortress"]}, {"group": "Castle", "names": ["The Princess's Secret Slide (under 21 seconds)", "Tower of the Wing Cap"]}, {"group": "Bowser in the Dark World", "names": ["Bowser in the Dark World Red Coins", "Bowser in the Dark World"]}, {"group": "Bob-omb Battlefield", "names": ["Shoot to the Island in the Sky"]}, {"group": "Cool, Cool Mountain", "names": ["Wall Kicks Will Work", "Li'l Penguin Lost", "Cool, Cool Mountain 100 Coins", "Slip Slidin' Away"]}, {"group": "Big Boo's Haunt", "names": ["Big Boo's Balcony", "Secret of the Haunted Books"]}, {"group": "Basement", "names": ["MIPS (first star)"]}, {"group": "Shifting Sand Land", "names": ["Pyramid Puzzle", "Inside the Ancient Pyramid", "In the Talons of the Big Bird", "Shining Atop the Pyramid"]}, {"group": "Lethal Lava Land", "names": ["Red-Hot Log Rolling", "8-Coin Puzzle with 15 Pieces", "Boil the Big Bully", "Bully the Bullies", "Hot-Foot-It into the Volcano", "Elevator Tour in the Volcano"]}, {"group": "Dire, Dire Docks", "names": ["Chests in the Current", "Board Bowser's Sub", "The Manta Ray's Reward"]}, {"group": "Bowser in the Fire Sea", "names": ["Bowser in the Fire Sea Red Coins", "Bowser in the Fire Sea"]}, {"group": "Wet-Dry World", "names": ["Wet-Dry World 100 Coins", "Secrets in the Shallows & Sky", "Express Elevator--Hurry Up!", "Shocking Arrow Lifts!", "Top o' the Town"]}, {"group": "Tiny-Huge Island", "names": ["Five Itty Bitty Secrets", "Pluck the Piranha Flower", "The Tip Top of the Huge Island"]}, {"group": "Upstairs", "names": ["Toad (upstairs)"]}, {"group": "Tall, Tall Mountain", "names": ["Scale the Mountain", "Breathtaking View from Bridge", "Blast to the Lonely Mushroom", "Scary 'Shrooms, Red Coins", "Mysterious Mountainside"]}, {"group": "Snowman's Land", "names": ["Snowman's Big Head", "In the Deep Freeze", "Whirl from the Freezing Pond", "Chill with the Bully"]}, {"group": "Basement", "names": ["MIPS (second star)", "Toad (Hazy Maze Cave)"]}, {"group": "Hazy Maze Cave", "names": ["Swimming Beast in the Cavern", "Metal-Head Mario Can Move!", "A-Maze-ing Emergency Exit", "Watch for Rolling Rocks"]}, {"group": "Rainbow Ride", "names": ["Cruiser Crossing the Rainbow", "Tricky Triangles!", "Coins Amassed in a Maze", "Swingin' in the Breeze"]}, {"group": "Tippy", "names": ["Toad (Tick Tock Clock)"]}, {"group": "Tick Tock Clock", "names": ["Tick Tock Clock 100 Coins", "Stomp on the Thwomp", "Roll into the Cage", "The Pit and the Pendulums", "Get a Hand", "Timed Jumps on Moving Bars", "Stop Time for Red Coins"]}, {"group": "Bowser in the Sky", "names": ["Bowser in the Sky"]}] },
    ],
  },
  {
    key: "minecraft",
    title: "Minecraft: Java Edition",
    platforms: ["PC (Windows, macOS, Linux)"],
    timing: "LRT",
    timingNote: "speedrun.com default is in-game time, read from the SpeedRunIGT mod (rules A.5.13). Random seed runs start on world load; set seed runs start on first input. A run ends when the credits begin after entering the exit portal.",
    categories: [
      { id: "any-glitchless-random-seed-1-16plus", name: "Any% Glitchless, Random Seed (1.16+)", confidence: "medium", sources: ["https://rawcdn.githack.com/Minecraft-Java-Edition-Speedrunning/rules/main/pub/pdf/rules_v2.pdf", "https://www.speedrun.com/mc", "https://modrinth.com/mod/mcsr-ranked"], notes: "Split labels are the milestones runners split on; 'advancements' gives the in-game advancement that fires at each one (Leave Nether, also called 'blind' or 'blind travel', has no advancement). Some seeds go Fortress before Bastion, or skip the Bastion. All 1.16+ RSG runs share one board (speedrun.com files them under 1.16-1.19); nearly every top run is on 1.16.1. Pre-1.16 versions (1.9-1.15, 1.8, pre-1.8) have no Bastion and no blind travel, so their splits differ.", groups: [{"group": "Overworld", "names": ["Enter Nether"]}, {"group": "Nether", "names": ["Enter Bastion", "Enter Fortress", "Leave Nether"]}, {"group": "Stronghold", "names": ["Enter Stronghold"]}, {"group": "The End", "names": ["Enter End", "Free the End"]}] },
    ],
  },
  {
    key: "celeste",
    title: "Celeste",
    platforms: ["PC", "Nintendo Switch", "PlayStation 4", "Xbox One", "Google Stadia (closed)"],
    timing: "LRT",
    timingNote: "speedrun.com default is in-game time (the file timer). Any% = unlock the Epilogue from a new file.",
    categories: [
      { id: "any", name: "Any%", confidence: "high", sources: ["https://celeste.ink/wiki/Mirror_Temple", "https://celeste.ink/wiki/Reflection", "https://github.com/koralreeef/anypercent-cuecollection"], notes: "One split per chapter. The optimal route grabs the cassette in Mirror Temple (Depths) and Reflection (Hollows), then clears the B-Side instead of the rest of the A-Side; clearing a B-Side unlocks the next chapter. Many runners still play the whole Reflection A-Side (Start, Lake, Hollows, Reflection, Rock Bottom, Resolution), which is only seconds slower. Either way the split names stay the same.", groups: [{"group": null, "names": ["Prologue", "Forsaken City", "Old Site", "Celestial Resort", "Golden Ridge", "Mirror Temple", "Reflection", "The Summit"]}] },
      { id: "any-checkpoints", name: "Any% (checkpoints)", confidence: "medium", sources: ["https://docs.google.com/spreadsheets/d/1HsFtpz_wfA4yrMuZOMX-f69O6ZEZph8db1ReKX8SNIY", "https://celeste.ink/wiki/The_Summit", "https://celeste.ink/wiki/Mirror_Temple"], notes: "One split per checkpoint, using the game's checkpoint names, on the 5B/6B route (A-Side to the cassette, then the B-Side). For the full 6A route, replace the two Reflection groups with Start, Lake, Hollows, Reflection, Rock Bottom, Resolution. 'Start' repeats in every chapter, so show the chapter (group) name beside it. The speedrun.com resources page hosts official checkpoint split files for the 5A and 5B routes.", groups: [{"group": "Prologue", "names": ["Prologue"]}, {"group": "Forsaken City", "names": ["Start", "Crossing", "Chasm"]}, {"group": "Old Site", "names": ["Start", "Intervention", "Awake"]}, {"group": "Celestial Resort", "names": ["Start", "Huge Mess", "Elevator Shaft", "Presidential Suite"]}, {"group": "Golden Ridge", "names": ["Start", "Shrine", "Old Trail", "Cliff Face"]}, {"group": "Mirror Temple (cassette)", "names": ["Start", "Depths"]}, {"group": "Mirror Temple B-Side", "names": ["Start", "Central Chamber", "Through the Mirror", "Mix Master"]}, {"group": "Reflection (cassette)", "names": ["Start", "Lake", "Hollows"]}, {"group": "Reflection B-Side", "names": ["Start", "Reflection", "Rock Bottom", "Reprieve"]}, {"group": "The Summit", "names": ["Start", "500 M", "1000 M", "1500 M", "2000 M", "2500 M", "3000 M"]}] },
    ],
  },
  {
    key: "super-mario-bros",
    title: "Super Mario Bros.",
    platforms: ["NES / Famicom", "Famicom Disk System", "Wii, Wii U and 3DS Virtual Console", "Nintendo Switch Online", "NES Classic"],
    timing: "RTA",
    timingNote: "SDA standard: start on the frame '400' appears after selecting 1 player; end on the frame all sprites vanish after touching the axe in 8-4.",
    categories: [
      { id: "any", name: "Any%", confidence: "high", sources: ["https://www.speedrun.com/smb1/guides/frxdu", "https://www.speedrun.com/smb1?h=Any"], notes: "Warp zones in 1-2 (to World 4) and 4-2 (wrong warp to World 8). The route never changes; only strats per level do (flagpole glitch, bullet bill in 8-2, Bowser patterns).", groups: [{"group": null, "names": ["1-1", "1-2", "4-1", "4-2", "8-1", "8-2", "8-3", "8-4"]}] },
      { id: "warpless", name: "Warpless", confidence: "high", sources: ["https://www.speedrun.com/smb1/guides/vx9vh", "https://www.speedrun.com/smb1?h=Warpless"], notes: "All 32 levels in order, no warp zones. Runners split per level or per world (one split at each castle: 1-4, 2-4 ... 8-4); the groups give the per-world version. Small Mario vs Fire Mario routes play the same levels.", groups: [{"group": "World 1", "names": ["1-1", "1-2", "1-3", "1-4"]}, {"group": "World 2", "names": ["2-1", "2-2", "2-3", "2-4"]}, {"group": "World 3", "names": ["3-1", "3-2", "3-3", "3-4"]}, {"group": "World 4", "names": ["4-1", "4-2", "4-3", "4-4"]}, {"group": "World 5", "names": ["5-1", "5-2", "5-3", "5-4"]}, {"group": "World 6", "names": ["6-1", "6-2", "6-3", "6-4"]}, {"group": "World 7", "names": ["7-1", "7-2", "7-3", "7-4"]}, {"group": "World 8", "names": ["8-1", "8-2", "8-3", "8-4"]}] },
    ],
  },
  {
    key: "super-mario-odyssey",
    title: "Super Mario Odyssey",
    platforms: ["Nintendo Switch", "Nintendo Switch 2"],
    timing: "RTA",
    timingNote: "Timing starts when selecting Start on a new file and ends when Mario shoots out of the electric wire in the escape. Runs under two hours are RTA with no pauses.",
    categories: [
      { id: "any", name: "Any%", confidence: "high", sources: ["https://docs.google.com/spreadsheets/d/1tXeQcBRnHSoUhTzh-3ujDbN5ol86AymDGKBONI6lIXI", "https://docs.google.com/spreadsheets/d/1OBCcowBCHOL7LOcI8_gGFUpkRFs72MeiHFJxl92Fw10", "https://www.speedrun.com/smo"], notes: "One split per kingdom, in route order, split when leaving the kingdom (the black fadeout as the Odyssey takes off), except Cloud, Lost and Ruined, which split on their cutscene. Snow before Seaside is the standard order. A 16-split version cuts Metro in two (night and day) and Bowser's Kingdom in two (Broodals, then RoboBrood). 1P and 2P mode are separate boards, as are Switch 1 and Switch 2.", groups: [{"group": null, "names": ["Cap Kingdom", "Cascade Kingdom", "Sand Kingdom", "Lake Kingdom", "Wooded Kingdom", "Cloud Kingdom", "Lost Kingdom", "Metro Kingdom", "Snow Kingdom", "Seaside Kingdom", "Luncheon Kingdom", "Ruined Kingdom", "Bowser's Kingdom", "Moon Kingdom"]}] },
    ],
  },
  {
    key: "zelda-breath-of-the-wild",
    title: "The Legend of Zelda: Breath of the Wild",
    platforms: ["Wii U", "Nintendo Switch", "Nintendo Switch 2"],
    timing: "RTA",
    timingNote: "speedrun.com default is real time: from gaining control of Link to the last arrow hitting Dark Beast Ganon.",
    categories: [
      { id: "any", name: "Any%", confidence: "medium", sources: ["https://zeldaspeedruns.com/botw/routes-10-17/any-160", "https://www.zeldaspeedruns.com/botw/routes-19-s1-edition/any-normal-mode", "https://www.speedrun.com/botw"], notes: "Splits follow the ZeldaSpeedRuns route sections: the four Great Plateau shrines (Bombs/Ja Baij first, then Magnesis/Oman Au, Stasis/Owa Daim, Cryonis/Keh Namut, entered with windbombs and clips), the paraglider, then straight to Hyrule Castle. Runners often label the first split 'Bombs'. Version matters: the main board is 1.0-1.7 (most top runs on 1.6, amiibo allowed or not), with separate 1.9 Switch 1 and Switch 2 Edition boards; the split points are the same. Exact split labels vary between runners, so treat the names as ours built from the in-game rune, item and boss names.", groups: [{"group": "Great Plateau", "names": ["Remote Bomb", "Magnesis", "Stasis", "Cryonis", "Paraglider"]}, {"group": "Hyrule Castle", "names": ["Hyrule Castle", "Calamity Ganon", "Dark Beast Ganon"]}] },
    ],
  },
  {
    key: "portal",
    title: "Portal",
    platforms: ["PC", "Xbox 360", "PlayStation 3", "Nintendo Switch (Portal: Companion Collection)"],
    timing: "LRT",
    timingNote: "speedrun.com default is real time without loads (LiveSplit's load remover / demo time). Timing starts when the crosshair appears and ends when it disappears after GLaDOS dies.",
    categories: [
      { id: "glitchless", name: "Glitchless", confidence: "high", sources: ["https://docs.google.com/document/d/1H7AHqiSTRzJE2xfqPCGBsUXZay1g9wdUfCbPXoz8S3c", "https://www.speedrun.com/portal?h=Glitchless"], notes: "One split per map, which is how the autosplitter splits (map transitions): 00-01, 02-03, 04-05, 06-07 and 11-12 share a map. 'Escape 00/01' are the map names of the escape after Chamber 19; the last split is the GLaDOS fight (escape_02). Most runners start from the vault save to skip the intro.", groups: [{"group": "Test Chambers", "names": ["Chambers 00-01", "Chambers 02-03", "Chambers 04-05", "Chambers 06-07", "Chamber 08", "Chamber 09", "Chamber 10", "Chambers 11-12", "Chamber 13", "Chamber 14", "Chamber 15", "Chamber 16", "Chamber 17", "Chamber 18", "Chamber 19"]}, {"group": "Escape", "names": ["Escape 00", "Escape 01", "GLaDOS"]}] },
      { id: "inbounds", name: "Inbounds", confidence: "high", sources: ["https://docs.google.com/document/d/1H7AHqiSTRzJE2xfqPCGBsUXZay1g9wdUfCbPXoz8S3c", "https://www.speedrun.com/portal?h=Inbounds"], notes: "Same 18 map splits as Glitchless. Inbounds allows save-load glitches and most movement tech as long as nothing leaves the map, so chambers go much faster but the split points do not change. Inbounds No SLA uses the same splits too.", groups: [{"group": "Test Chambers", "names": ["Chambers 00-01", "Chambers 02-03", "Chambers 04-05", "Chambers 06-07", "Chamber 08", "Chamber 09", "Chamber 10", "Chambers 11-12", "Chamber 13", "Chamber 14", "Chamber 15", "Chamber 16", "Chamber 17", "Chamber 18", "Chamber 19"]}, {"group": "Escape", "names": ["Escape 00", "Escape 01", "GLaDOS"]}] },
    ],
  },
  {
    key: "cuphead",
    title: "Cuphead",
    platforms: ["PC", "macOS", "Xbox One", "Nintendo Switch", "PlayStation 4", "Xbox Series X|S", "PlayStation 5"],
    timing: "LRT",
    timingNote: "speedrun.com stores the time in its real-time field, but the community guide says boards are sorted by loadless time from the LiveSplit load remover (the 'Loadless?' variable marks it). Timing starts on file select and, on Regular, ends on the Devil's knockout screen.",
    categories: [
      { id: "any-version-1-1plus-regular", name: "Any% (Version 1.1+, Regular)", confidence: "medium", sources: ["https://docs.google.com/spreadsheets/d/1xHwgDSSaUlgRLiEDr-aCo5Hmmy3OWyL70qGQfOGWW0g", "https://www.speedrun.com/cuphead/guides/m7mfl", "https://docs.google.com/document/d/1ucyANIrtNijyi0NJc0foCTJ8V16hefsZORM4Nin2oIA"], notes: "Every Isle 1-3 boss is required because King Dice only opens with all soul contracts, so Any% is the old 'All Bosses' run: there is no separate All Bosses category today. Forest Follies is only in routes that buy weapons with its coins (Lobber/Roundabout or Lobber/Spread); the Peashooter/Spread route skips it. King Dice's board (which minibosses you land on) varies by roll. Order from the community best-times sheet and the legacy route guide, which agree; current 1.1+ routes may swap neighbors within an isle. Legacy 1.0 and DLC are separate boards. Simple difficulty ends on entering King Dice's level.", groups: [{"group": "Inkwell Isle One", "names": ["Forest Follies", "The Root Pack", "Ribby and Croaks", "Goopy Le Grande", "Hilda Berg", "Cagney Carnation"]}, {"group": "Inkwell Isle Two", "names": ["Baroness Von Bon Bon", "Wally Warbles", "Djimmi the Great", "Beppi the Clown", "Grim Matchstick"]}, {"group": "Inkwell Isle Three", "names": ["Rumor Honeybottoms", "Dr. Kahl's Robot", "Sally Stageplay", "Werner Werman", "Captain Brineybeard", "Cala Maria", "Phantom Express"]}, {"group": "Inkwell Hell", "names": ["King Dice", "The Devil"]}] },
    ],
  },
  {
    key: "hollow-knight",
    title: "Hollow Knight",
    platforms: ["PC (Windows, macOS, Linux)", "Nintendo Switch", "PlayStation 4", "Xbox One", "PlayStation 5", "Xbox Series X|S", "Nintendo Switch 2"],
    timing: "LRT",
    timingNote: "speedrun.com default is real time without loads (the community load-removing autosplitter).",
    categories: [
      { id: "any-no-major-glitches", name: "Any% No Major Glitches", confidence: "high", sources: ["https://github.com/slaurent22/hk-split-maker/blob/main/src/asset/hollowknight/categories/any.json", "https://github.com/hk-speedrunning/HK-Route-Notes/blob/main/Any%25%20(1.2.2.1).md", "https://www.speedrun.com/hollowknight"], notes: "Split list from hksplitmaker's Any% NMG preset (updated 2026-08 to match the community sum of best) on patch 1.2.2.1, the usual NMG patch (lever skip). The splits follow the three Dreamers: Lurien (Watcher Knights at the Watcher's Spire), Monomon (Uumuu at the Teacher's Archives, after Lumafly Lantern and Crystal Heart), Herrah (Beast's Den, reached through Queen's Gardens). 'Chandelier' (dropping it on a Watcher Knight), 'Rafters' (a City of Tears room) and 'Trap Bench' (in Beast's Den) are runners' names for split points, not in-game names; 'Black Egg Temple' splits when the Hollow Knight's chains break. 1.4.3.2+ NMG is its own board and splits on Mantis Claw itself (not the menu after it) and on Gruz Mother instead of Blue Lake.", groups: [{"group": "Early game", "names": ["Vengeful Spirit", "Greenpath", "Mothwing Cloak", "Mantis Claw", "Blue Lake", "Dream Nail"]}, {"group": "Lurien", "names": ["Chandelier", "Watcher Knights"]}, {"group": "Monomon", "names": ["Rafters", "Lumafly Lantern", "Crystal Heart", "Uumuu"]}, {"group": "Herrah", "names": ["Queen's Gardens", "Trap Bench", "Herrah"]}, {"group": "Black Egg Temple", "names": ["Black Egg Temple", "The Hollow Knight"]}] },
    ],
  },
  {
    key: "super-mario-world",
    title: "Super Mario World",
    platforms: ["Super Nintendo (SNES)", "Wii, Wii U and 3DS Virtual Console", "Nintendo Switch Online", "SNES Classic"],
    timing: "RTA",
    timingNote: "Time begins the frame Mario appears in the opening cutscene (about 2.2 s after selecting 1 player game) and ends the frame Peach appears outside Bowser's Clown Car.",
    categories: [
      { id: "11-exit", name: "11 Exit", confidence: "high", sources: ["https://www.smwspeedruns.com/11_Exit", "https://docs.google.com/document/d/1-hr9I_sI8nJsbLXTbQvJujZfzEN2bBRhsChqexm4al8", "https://www.speedrun.com/smw?h=11_Exit"], notes: "The 11 exits are the first eleven levels; Front Door (Bowser) ends the run and adds no exit. Donut Plains 1, Donut Secret 1, Donut Secret House and all four Star World levels use their secret (key) exits. Cloud and Glitchless (no orb/cloud) runs play this list; the Orb route adds Yoshi's Island 1 after Yoshi's Island 2.", groups: [{"group": "Yoshi's Island", "names": ["Yoshi's Island 2", "Yoshi's Island 3", "Yoshi's Island 4", "#1 Iggy's Castle"]}, {"group": "Donut Plains", "names": ["Donut Plains 1", "Donut Secret 1", "Donut Secret House"]}, {"group": "Star World", "names": ["Star World 1", "Star World 2", "Star World 3", "Star World 4"]}, {"group": "Valley of Bowser", "names": ["Front Door"]}] },
      { id: "no-starworld", name: "No Starworld", confidence: "high", sources: ["https://www.smwspeedruns.com/No_Starworld", "https://www.speedrun.com/smw?h=No_Starworld"], notes: "32 levels without Star World or the Star Road. Secret exits: Donut Plains 1, Vanilla Dome 1, Forest of Illusion 3, Chocolate Island 2 and Valley of Bowser 2; Lemmy's and Larry's castles are skipped and the run ends at the Back Door. No orb/cloud and no submap warp in this category.", groups: [{"group": "Yoshi's Island", "names": ["Yoshi's Island 2", "Yoshi's Island 3", "Yoshi's Island 4", "#1 Iggy's Castle"]}, {"group": "Donut Plains", "names": ["Donut Plains 1", "Donut Secret 1", "Donut Ghost House", "Donut Plains 3", "Donut Plains 4", "#2 Morton's Castle"]}, {"group": "Vanilla Dome", "names": ["Vanilla Dome 1", "Vanilla Secret 1", "Vanilla Secret 2", "Vanilla Secret 3", "Vanilla Fortress"]}, {"group": "Twin Bridges", "names": ["Butter Bridge 1", "Butter Bridge 2", "#4 Ludwig's Castle"]}, {"group": "Forest of Illusion", "names": ["Forest of Illusion 1", "Forest of Illusion 2", "Forest of Illusion 3", "#5 Roy's Castle"]}, {"group": "Chocolate Island", "names": ["Chocolate Island 1", "Choco-Ghost House", "Chocolate Island 2", "Chocolate Secret", "#6 Wendy's Castle", "Sunken Ghost Ship"]}, {"group": "Valley of Bowser", "names": ["Valley of Bowser 1", "Valley of Bowser 2", "Valley Fortress", "Back Door"]}] },
    ],
  },
];

/** How Minecraft's set seed races get their seed (researched 2026-11-11): none is fixed, so a race's room shows one. */
export const MINECRAFT_SEED_NOTE = "Set Seed Glitchless has no fixed seed. The community rules only require the runner to type a seed into the seed box (not 0 before 1.18.2) and forbid the Recreate button from 1.16 on (rules v2, C.1.1-C.1.2), and every submission must name its seed (A.6.1). In practice runners converge on the fastest known seed per version: in November 2026 the top three 1.16-1.19 SSG runs all use -6405782700478242821 (on 1.16.1) and the top 1.20+ runs use -1950884254474434485 (on 1.21.1). Random Seed runs must leave the seed box blank, so on speedrun.com each runner plays their own world. Racetime.gg has a Minecraft: Java Edition category with goals 'Random Seed Glitchless (1.16)', '(1.9-1.15)', '(Pre 1.9)', 'Set Seed Glitchless (1.9+)' and Bingo; its category page shows no shared-seed feature, so RSG racers there each generate their own random world (not confirmed beyond the empty category info). MCSR Ranked (a Fabric mod for 1.16.1) does give both players the same seed in separate worlds: ranked matches use filtered seeds ('every seed has a good overworld and nether'), with standardized piglin trades, blaze rates and flint drops, and its Weekly Race uses one handpicked seed per week. Version split: speedrun.com's Any% Glitchless boards split into Pre 1.8, 1.8, 1.9-1.12, 1.13-1.15, 1.16-1.19 and 1.20+, but all 1.16+ random seed runs are filed under 1.16-1.19 (nearly all on 1.16.1, where bastions plus piglin bartering make the 'blind' route); set seed keeps 1.16-1.19 and 1.20+ apart because generation changed.";

export const rosterGame = (key: string | null | undefined): RosterGame | null => SPEEDRUN_ROSTER.find((g) => g.key === key) ?? null;
