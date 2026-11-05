/**
 * Register Discord slash commands.
 *
 *   npx tsx scripts/register-discord-commands.ts --dev   the dev bot (DEV_DISCORD_APPLICATION_ID + DEV_DISCORD_BOT_TOKEN)
 *   npx tsx scripts/register-discord-commands.ts         DISCORD_APPLICATION_ID + DISCORD_BOT_TOKEN
 *   npx tsx scripts/register-discord-commands.ts --app comp --dry   prints the commands it would register, sends nothing
 *   npx tsx scripts/register-discord-commands.ts --app comp
 *                                                        GameShuffle Competitive (NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID +
 *                                                        DISCORD_COMP_BOT_TOKEN): /tt, /mmr, /room, Save to GameShuffle
 *
 * GameShuffle Competitive (picks 2026-10-30) gets the competitive commands under short names, built from the
 * main app's definitions below, and can be added to a person's own account as well as to servers. The main
 * app keeps /gs-tt, /gs-mmr and /gs-room until COMP_MOVE_ENDS (src/lib/discord/appIds.ts).
 *
 * For the production bot, run without --dev with the production values set in
 * the shell (they win over .env.local), e.g.
 *   DISCORD_APPLICATION_ID=<prod app id> DISCORD_BOT_TOKEN=<prod bot token> npx tsx scripts/register-discord-commands.ts
 *
 * A bot token only works on its own application. The script checks that before
 * calling Discord, because the error Discord returns otherwise (403, code 20012,
 * "not authorized to perform this action on this application") doesn't say which.
 *
 * Discord Activity: once Activities are turned on for an app, Discord gives it
 * a Launch entry point command (type 4), and a bulk update that leaves it out
 * fails with error 50240. So the script reads the app's current commands first
 * and keeps any entry point it finds. `--activity` adds one if there isn't one
 * yet (only for an app with Activities turned on).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { COMP_MOVE_ENDS } from "../src/lib/discord/appIds";
import { gsDayStart } from "../src/lib/time/gsClock";

const DEV = process.argv.includes("--dev");
const DRY = process.argv.includes("--dry");
const appArg = process.argv.indexOf("--app");
/** /tt's vehicle choices: every vehicle board (each time keeps the vehicle only when its game has that board). */
const TT_VEHICLE_CHOICES = [
  { name: "Any vehicle", value: "any" }, { name: "Inside drift bike", value: "inside_drift" },
  { name: "Teddy Buggy", value: "teddy" }, { name: "Biddybuggy", value: "biddybuggy" }, { name: "Mr. Scooty", value: "scooty" }, { name: "Swoop, R.O.B.-HOG (World)", value: "rob_hog" },
];
const COMP = appArg >= 0 && process.argv[appArg + 1] === "comp";
const APPLICATION_ID = COMP ? process.env.NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID : DEV ? process.env.DEV_DISCORD_APPLICATION_ID : process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = COMP ? process.env.DISCORD_COMP_BOT_TOKEN : DEV ? process.env.DEV_DISCORD_BOT_TOKEN : process.env.DISCORD_BOT_TOKEN;
const ID_VAR = COMP ? "NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID" : DEV ? "DEV_DISCORD_APPLICATION_ID" : "DISCORD_APPLICATION_ID";

if (!DRY && (!APPLICATION_ID || !BOT_TOKEN)) {
  console.error(`Missing ${COMP ? "NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID or DISCORD_COMP_BOT_TOKEN" : DEV ? "DEV_DISCORD_APPLICATION_ID or DEV_DISCORD_BOT_TOKEN" : "DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN"} in environment`);
  process.exit(1);
}

/** The first part of a bot token is the bot's user id (= its application id), base64. */
function tokenOwner(token: string): string | null {
  try {
    return Buffer.from(token.split(".")[0], "base64").toString("utf8");
  } catch {
    return null;
  }
}
const owner = BOT_TOKEN ? tokenOwner(BOT_TOKEN) : null;
if (owner && owner !== APPLICATION_ID) {
  console.error(`That bot token belongs to a different Discord application than ${ID_VAR}.`);
  console.error(DEV ? "Check the DEV_ values in .env.local." : "For the dev bot, run with --dev. For production, set the production app id and token in the shell (see the top of this file).");
  process.exit(1);
}

const commands = [
  {
    name: "gs-randomize",
    description: "Trigger a GameShuffle randomizer",
    options: [
      {
        name: "game",
        description: "Which randomizer to use",
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
      {
        name: "players",
        description: "Number of players (1-9)",
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 9,
      },
      {
        name: "mode",
        description: "casual or competitive",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "Casual", value: "casual" },
          { name: "Competitive", value: "competitive" },
        ],
      },
      {
        name: "rerolls",
        description: "Re-rolls allowed per player (default 1, 0 = none)",
        type: 4, // INTEGER
        required: false,
        min_value: 0,
        max_value: 5,
      },
      {
        name: "role",
        description: "Overwatch or Marvel Rivals: roll heroes from one role",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "Tank (Overwatch)", value: "tank" },
          { name: "Damage (Overwatch)", value: "damage" },
          { name: "Support (Overwatch)", value: "support" },
          { name: "Vanguard (Marvel Rivals)", value: "vanguard" },
          { name: "Duelist (Marvel Rivals)", value: "duelist" },
          { name: "Strategist (Marvel Rivals)", value: "strategist" },
        ],
      },
      // Player tag options — type 6 = USER
      ...Array.from({ length: 9 }, (_, i) => ({
        name: `player${i + 1}`,
        description: `Tag player ${i + 1}`,
        type: 6, // USER
        required: false,
      })),
    ],
  },
  {
    name: "gs-result",
    description: "Post your most recent GameShuffle session result",
    options: [
      {
        name: "type",
        description: "lounge or tournament",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "Lounge", value: "lounge" },
          { name: "Tournament", value: "tournament" },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------
  // Cross-surface fun commands — pure handler / pool-pick. Same
  // grammar + same answer set as the Twitch chat counterparts
  // (`!coinflip`, `!roll`, `!8ball`) so staff edits flow to both.
  // ---------------------------------------------------------------
  {
    name: "gs-flip",
    description: "Flip a coin (heads or tails).",
  },
  {
    name: "gs-roll",
    description: "Roll dice. /gs-roll → 1d6, /gs-roll 20 → 1d20, /gs-roll 2d6 → two six-siders.",
    options: [
      {
        name: "dice",
        description: "Dice notation. Bare number = die size. Default 1d6.",
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: "gs-8ball",
    description: "Ask the magic 8-ball.",
    options: [
      {
        name: "question",
        description: "Your question (optional — echoed back with the answer).",
        type: 3, // STRING
        required: false,
        max_length: 256,
      },
    ],
  },
  {
    name: "gs-poll",
    description: "Run a live poll (GS Pro). Shows on the stream + /live too.",
    options: [
      {
        name: "open",
        description: "Open a new poll.",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "question",
            description: "What are you asking?",
            type: 3, // STRING
            required: true,
            max_length: 256,
          },
          {
            name: "options",
            description: "Options, separated by commas or | (2–8).",
            type: 3, // STRING
            required: true,
            max_length: 500,
          },
        ],
      },
      {
        name: "close",
        description: "Close the open poll and post the results.",
        type: 1, // SUB_COMMAND
      },
    ],
  },
  {
    name: "gs-brain",
    description: "Answer a Chat Brain survey question. Managers post one for the whole channel.",
    options: [
      {
        name: "category",
        description: "Pick a topic (optional).",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "Game night", value: "game-night" },
          { name: "Gaming", value: "gaming" },
          { name: "Mario Kart", value: "mario-kart" },
          { name: "Food", value: "food" },
          { name: "Family", value: "family" },
          { name: "Streaming", value: "streaming" },
          { name: "School and work", value: "school-work" },
          { name: "Everyday life", value: "everyday" },
        ],
      },
    ],
  },
  {
    name: "gs-daily",
    description: "Play today's Daily Shuffle right here in Discord.",
    integration_types: [0, 1],
    contexts: [0, 1, 2],
  },
  {
    name: "gs-mmr",
    description: "A Mario Kart lounge player's MMR. Leave the name out for your own MMR card.",
    options: [
      { name: "name", description: "Their MKCentral lounge name (optional).", type: 3, required: false, max_length: 40 },
      { name: "versus", description: "A second lounge name for a head-to-head (optional).", type: 3, required: false, max_length: 40 },
      {
        name: "game",
        description: "Which lounge (Mario Kart World 12 players if left out).",
        type: 3,
        required: false,
        choices: [
          { name: "Mario Kart World, 12 players", value: "mkworld12p" },
          { name: "Mario Kart World, 24 players", value: "mkworld24p" },
          { name: "Mario Kart 8 Deluxe", value: "mk8dx" },
        ],
      },
    ],
  },
  {
    name: "gs-tt",
    description: "Mario Kart time trials: add a time, see a track's board or a player's bests.",
    options: [
      {
        name: "add", description: "Add a time trial time with its result screenshot (I read the time from it).", type: 1,
        options: [
          { name: "track", description: "The track (start typing).", type: 3, required: true, autocomplete: true },
          { name: "screenshot", description: "The result screen: your proof, needed for every time. I read the time from it.", type: 11, required: true },
          { name: "time", description: "Your time, like 1:52.384. Leave out to read it from the screenshot.", type: 3, required: false, max_length: 12 },
          { name: "class", description: "Speed class (150cc if left out).", type: 3, required: false, choices: [{ name: "150cc", value: "150" }, { name: "200cc", value: "200" }] },
          { name: "items", description: "Mushrooms or no mushrooms (mushrooms if left out).", type: 3, required: false, choices: [{ name: "Mushrooms", value: "shrooms" }, { name: "No mushrooms", value: "none" }] },
          { name: "vehicle", description: "For a vehicle board (Mario Kart World: Swoop, R.O.B.-HOG; Mario Kart 8 Deluxe: the rest).", type: 3, required: false, choices: TT_VEHICLE_CHOICES },
          { name: "video", description: "A clip of the run's last 30 seconds, so a reviewer can verify it.", type: 3, required: false, max_length: 300 },
        ],
      },
      {
        name: "proof", description: "Add a screenshot to a time you saved without one, like a time from Quaxly.", type: 1,
        options: [
          { name: "track", description: "The track (start typing).", type: 3, required: true, autocomplete: true },
          { name: "screenshot", description: "The result screen. I read the time from it, and it should show your saved time.", type: 11, required: true },
          { name: "class", description: "Speed class (150cc if left out).", type: 3, required: false, choices: [{ name: "150cc", value: "150" }, { name: "200cc", value: "200" }] },
          { name: "items", description: "Mushrooms or no mushrooms (mushrooms if left out).", type: 3, required: false, choices: [{ name: "Mushrooms", value: "shrooms" }, { name: "No mushrooms", value: "none" }] },
        ],
      },
      {
        name: "track", description: "A track's top ten (this server's when it has times there).", type: 1,
        options: [
          { name: "track", description: "The track (start typing).", type: 3, required: true, autocomplete: true },
          { name: "class", description: "Speed class (150cc if left out).", type: 3, required: false, choices: [{ name: "150cc", value: "150" }, { name: "200cc", value: "200" }] },
          { name: "board", description: "Whose times (this server if it has some).", type: 3, required: false, choices: [{ name: "This server", value: "server" }, { name: "Everyone", value: "everyone" }] },
          { name: "items", description: "Mushrooms or no mushrooms (mushrooms if left out).", type: 3, required: false, choices: [{ name: "Mushrooms", value: "shrooms" }, { name: "No mushrooms", value: "none" }] },
          { name: "vehicle", description: "A vehicle board (Mario Kart World: Swoop, R.O.B.-HOG; Mario Kart 8 Deluxe: the rest).", type: 3, required: false, choices: TT_VEHICLE_CHOICES },
          { name: "country", description: "Only players from one country (start typing).", type: 3, required: false, autocomplete: true },
        ],
      },
      {
        name: "country", description: "Set your country for the country boards and national records. Leave it out to see yours.", type: 1,
        options: [
          { name: "country", description: "Your country (start typing).", type: 3, required: false, autocomplete: true },
        ],
      },
      {
        name: "player", description: "A player's best times. Leave the name out for yours.", type: 1,
        options: [
          { name: "name", description: "Their name on GameShuffle (optional).", type: 3, required: false, max_length: 40 },
          { name: "game", description: "Just one game (both if left out).", type: 3, required: false, choices: [{ name: "Mario Kart World", value: "mkworld" }, { name: "Mario Kart 8 Deluxe", value: "mk8dx" }] },
        ],
      },
    ],
  },
  {
    name: "gs-room",
    description: "What each place pays in a lounge room, and who's favored. Paste the room's names.",
    options: [
      { name: "names", description: "The room's lounge names, separated by commas (teams: separated by slashes).", type: 3, required: true, max_length: 1000 },
      { name: "me", description: "Whose read it is (a lounge name in the room).", type: 3, required: false, max_length: 40 },
      {
        name: "format",
        description: "Free-for-all if left out.",
        type: 3,
        required: false,
        choices: [
          { name: "Free-for-all", value: "1" },
          { name: "2v2", value: "2" },
          { name: "3v3", value: "3" },
          { name: "4v4", value: "4" },
          { name: "6v6", value: "6" },
        ],
      },
      {
        name: "game",
        description: "Which lounge (Mario Kart World 12 players if left out).",
        type: 3,
        required: false,
        choices: [
          { name: "Mario Kart World, 12 players", value: "mkworld12p" },
          { name: "Mario Kart World, 24 players", value: "mkworld24p" },
          { name: "Mario Kart 8 Deluxe", value: "mk8dx" },
        ],
      },
    ],
  },
  {
    name: "gs-weekly",
    description: "Play this week's Weekly Challenge. Managers post it for the whole channel.",
  },
  {
    name: "gs-tag",
    description: "Custom text snippets for your server (GS Pro).",
    options: [
      {
        name: "show",
        description: "Post a tag's content.",
        type: 1, // SUB_COMMAND
        options: [
          { name: "name", description: "Tag name.", type: 3, required: true, max_length: 80 },
        ],
      },
      {
        name: "list",
        description: "List all tags.",
        type: 1, // SUB_COMMAND
      },
      {
        name: "set",
        description: "Create or update a tag (managers).",
        type: 1, // SUB_COMMAND
        options: [
          { name: "name", description: "Tag name.", type: 3, required: true, max_length: 80 },
          { name: "content", description: "What the tag says.", type: 3, required: true, max_length: 1900 },
        ],
      },
      {
        name: "delete",
        description: "Delete a tag (managers).",
        type: 1, // SUB_COMMAND
        options: [
          { name: "name", description: "Tag name.", type: 3, required: true, max_length: 80 },
        ],
      },
    ],
  },
  {
    name: "gs-remind",
    description: "Set a reminder (GS Pro). I'll ping you here when it's due.",
    options: [
      {
        name: "in",
        description: "When — e.g. 30s, 10m, 2h, 1d (bare number = minutes).",
        type: 3, // STRING
        required: true,
        max_length: 12,
      },
      {
        name: "message",
        description: "What to remind you about.",
        type: 3, // STRING
        required: true,
        max_length: 1500,
      },
    ],
  },
  {
    name: "gs-profile",
    description: "Share your GameShuffle profile so others can follow + connect.",
  },
  // A message command (Apps menu on a message), for Quaxly's time trials list: reads it and saves your
  // times (migration picks 2026-10-29). Works anywhere the person added GameShuffle to their account.
  {
    name: "Save to GameShuffle",
    type: 3, // MESSAGE
    integration_types: [0, 1],
    contexts: [0, 1, 2],
  },
];

/** GameShuffle Competitive's commands: the competitive ones under short names, usable in servers and, added to
 *  a person's own account, anywhere (submitting a time still needs a server; the handler says so). */
const COMP_FROM: Record<string, string> = { "gs-tt": "tt", "gs-mmr": "mmr", "gs-room": "room" };
/** /tt panel: the time trial panel, competitive app only (picks 2026-10-30, Nn8Qv4EVRDL6zojwHVCcdN). */
const TT_PANEL_SUB = {
  name: "panel", description: "Post the time trial panel in this channel (people who can manage the server).", type: 1,
  options: [{ name: "game", description: "Which game the panel is for.", type: 3, required: true, choices: [
    { name: "Mario Kart 8 Deluxe", value: "mk8dx" }, { name: "Mario Kart World", value: "mkworld" }, { name: "Both games", value: "both" },
  ] }],
};
/** /war (GameShuffle Competitive only, war tools picks 2026-10-31): a war in this channel, scored race by race on its card. */
const WAR_COMMAND = {
  name: "war",
  description: "Start a war in this channel and score it race by race",
  integration_types: [0],
  contexts: [0],
  options: [
    { name: "vs", description: "The other team's tag", type: 3, required: true, autocomplete: true, max_length: 12 },
    { name: "us", description: "Your team's tag (the channel remembers it after the first war)", type: 3, required: false, autocomplete: true, max_length: 12 },
    { name: "game", description: "Which game (the channel remembers it)", type: 3, required: false, choices: [
      { name: "Mario Kart World", value: "mkworld" }, { name: "Mario Kart 8 Deluxe", value: "mk8dx" },
    ] },
    { name: "entry", description: "How races go in (the channel remembers it)", type: 3, required: false, choices: [
      { name: "One person adds each race", value: "scorer" }, { name: "Everyone taps the place they finished", value: "taps" },
    ] },
  ],
};
/** /cans (GameShuffle Competitive only, cans picks 2026-11-04): who can race a war, in everyone's own time zone. */
const CANS_DAYS = [
  { name: "Today", value: "today" }, { name: "Tomorrow", value: "tomorrow" }, { name: "Monday", value: "mon" }, { name: "Tuesday", value: "tue" },
  { name: "Wednesday", value: "wed" }, { name: "Thursday", value: "thu" }, { name: "Friday", value: "fri" }, { name: "Saturday", value: "sat" }, { name: "Sunday", value: "sun" },
];
const CANS_COMMAND = {
  name: "cans",
  description: "Who can race a war: post a time, everyone answers, lock the lineup",
  integration_types: [0],
  contexts: [0],
  options: [
    { name: "post", description: "Post a war time for your team to answer", type: 1, options: [
      { name: "time", description: "The time in your time zone, like 7pm or 19:30", type: 3, required: true, max_length: 10 },
      { name: "day", description: "Which day (today if left out)", type: 3, required: false, choices: CANS_DAYS },
      { name: "vs", description: "The other team's tag", type: 3, required: false, max_length: 12 },
      { name: "size", description: "Players a side (6 if left out)", type: 4, required: false, min_value: 2, max_value: 12 },
      { name: "team", description: "Your team's role (when the server has more than one team)", type: 8, required: false },
    ] },
    { name: "setup", description: "Set up a team's role: pinged for checks (people who manage the server)", type: 1, options: [
      { name: "team", description: "The team's role", type: 8, required: true },
      { name: "tag", description: "The team's tag, like KC", type: 3, required: false, max_length: 12 },
      { name: "remove", description: "Stop using this role as a team", type: 5, required: false },
    ] },
    { name: "timezone", description: "Set the time zone the times you type are in", type: 1, options: [
      { name: "zone", description: "Start typing a city or region", type: 3, required: true, autocomplete: true, max_length: 64 },
    ] },
    { name: "hours", description: "Mark the hours you can usually race (opens the War room)", type: 1 },
  ],
};
/** /logo and /table (GameShuffle Competitive only, war tools step 2). */
const LOGO_COMMAND = {
  name: "logo",
  description: "This server's team logos for war cards, tables and the overlay",
  integration_types: [0],
  contexts: [0],
  options: [
    { name: "add", description: "Add or replace a team's logo", type: 1, options: [
      { name: "tag", description: "The team's tag, like KC", type: 3, required: true, max_length: 12 },
      { name: "image", description: "The logo (PNG, JPEG or WebP)", type: 11, required: true },
      { name: "name", description: "The team's name", type: 3, required: false, max_length: 60 },
    ] },
    { name: "get", description: "Show a team's logo", type: 1, options: [{ name: "tag", description: "The team's tag", type: 3, required: true, autocomplete: true, max_length: 12 }] },
    { name: "list", description: "Every logo in this server", type: 1 },
    { name: "remove", description: "Take a team's logo down", type: 1, options: [{ name: "tag", description: "The team's tag", type: 3, required: true, autocomplete: true, max_length: 12 }] },
  ],
};
const FLAG_COMMAND = {
  name: "flag",
  description: "This server's own flags for war tables (country codes like [us] have theirs already)",
  integration_types: [0],
  contexts: [0],
  options: [
    { name: "add", description: "Add or replace a flag", type: 1, options: [
      { name: "code", description: "The code players type in brackets, like kc or eu", type: 3, required: true, max_length: 14 },
      { name: "image", description: "The flag (PNG, JPEG or WebP)", type: 11, required: true },
      { name: "name", description: "What it stands for", type: 3, required: false, max_length: 60 },
    ] },
    { name: "get", description: "Show a flag", type: 1, options: [{ name: "code", description: "The flag's code", type: 3, required: true, autocomplete: true, max_length: 14 }] },
    { name: "list", description: "Every flag in this server", type: 1 },
    { name: "remove", description: "Take a flag down", type: 1, options: [{ name: "code", description: "The flag's code", type: 3, required: true, autocomplete: true, max_length: 14 }] },
  ],
};
const TABLE_COMMAND = {
  name: "table",
  description: "Make a war table: this channel's last war, a results screenshot, or pasted text",
  integration_types: [0],
  contexts: [0],
};
/** /ranked, GS Ranked (GameShuffle Competitive only, lounge plan step 1; was /ladder): a lounge's ranked board, results first. */
const LADDER_OPT = { name: "lounge", description: "Which lounge (only when the server runs more than one)", type: 3, required: false, autocomplete: true, max_length: 60 };
const LADDER_COMMAND = {
  name: "ranked",
  description: "GS Ranked: submit this lounge's tables, check MMR",
  integration_types: [0],
  contexts: [0],
  options: [
    { name: "submit", description: "Submit a room's table for the updaters to verify", type: 1, options: [LADDER_OPT] },
    { name: "mmr", description: "A player's MMR, division and rank (yours when no name is given)", type: 1, options: [
      { name: "name", description: "The player's name on the lounge", type: 3, required: false, autocomplete: true, max_length: 32 }, LADDER_OPT,
    ] },
    { name: "join", description: "Tie your Discord account to your name on the lounge", type: 1, options: [
      { name: "name", description: "The name you play under", type: 3, required: true, autocomplete: true, max_length: 32 }, LADDER_OPT,
    ] },
    { name: "penalty", description: "Give a player a penalty (updaters)", type: 1, options: [
      { name: "name", description: "The player's name on the lounge", type: 3, required: true, autocomplete: true, max_length: 32 },
      { name: "for", description: "What it's for (sets the lounge's usual MMR and strikes)", type: 3, required: true, choices: [
        { name: "Late", value: "late" }, { name: "Dropped before race 1", value: "drop_before" }, { name: "Dropped during the room", value: "drop_during" },
        { name: "Wrong tag", value: "tag" }, { name: "Something else", value: "other" },
      ] },
      { name: "mmr", description: "MMR to take off (else the lounge's usual amount)", type: 4, required: false, min_value: 0, max_value: 5000 },
      { name: "strikes", description: "Strikes to give (else the lounge's usual number)", type: 4, required: false, min_value: 0, max_value: 5 },
      { name: "reason", description: "Shows on their page", type: 3, required: false, max_length: 300 },
      LADDER_OPT,
    ] },
    { name: "name", description: "Ask for a new name on the lounge", type: 1, options: [
      { name: "new_name", description: "The name you play under now", type: 3, required: true, max_length: 32 }, LADDER_OPT,
    ] },
    { name: "staff", description: "A link to the lounge's staff page (updaters)", type: 1, options: [LADDER_OPT] },
    { name: "queue", description: "Post a queue in this channel (updaters)", type: 1, options: [
      { name: "name", description: "What the queue is called, like Tier A", type: 3, required: true, max_length: 40 },
      { name: "mode", description: "How rooms are made", type: 3, required: true, choices: [{ name: "Always open: a room the moment it's full", value: "open" }, { name: "Rush hour: sorted by MMR at set times", value: "rush" }] },
      { name: "min", description: "Lowest MMR that can join", type: 4, required: false, min_value: 0, max_value: 30000 },
      { name: "max", description: "Highest MMR that can join", type: 4, required: false, min_value: 0, max_value: 30000 },
      { name: "formats", description: "Formats to vote on, like 1,2,3,4,6 (FFA is 1)", type: 3, required: false, max_length: 20 },
      { name: "times", description: "Rush hour times, Pacific, like 20:00, 22:00", type: 3, required: false, max_length: 80 },
      { name: "lowest", description: "Players still placing join here", type: 5, required: false },
      LADDER_OPT,
    ] },
    { name: "setup", description: "Put this server's lounge on GS Ranked (people who can manage the server)", type: 1, options: [
      { name: "name", description: "The lounge's name, like 200cc Lounge", type: 3, required: true, max_length: 60 },
      { name: "address", description: "Its page address: gameshuffle.co/ranked/<address>", type: 3, required: true, max_length: 32 },
      { name: "mode", description: "Sets the game, rooms, divisions and MMR rules (staff can change them after)", type: 3, required: true, choices: [
        { name: "Mario Kart 8 Deluxe 150cc (MKCentral's divisions and model)", value: "mk8dx150" },
        { name: "Mario Kart 8 Deluxe 200cc (200 Lounge rules)", value: "mk8dx200" },
        { name: "Mario Kart World, 12 players", value: "mkw12" },
        { name: "Mario Kart World, 24 players", value: "mkw24" },
        { name: "Knockout Tour (24 places by elimination order)", value: "knockout" },
      ] },
      { name: "updaters", description: "The role that verifies tables", type: 8, required: true },
      { name: "reporters", description: "The role that submits tables (leave it out to let anyone)", type: 8, required: false },
      { name: "results", description: "Where tables go for verifying (else where they're submitted)", type: 7, required: false, channel_types: [0, 5] },
    ] },
  ],
};
const compCommands = [
  ...commands
    .filter((c) => c.name in COMP_FROM)
    .map((c) => ({
      ...c, name: COMP_FROM[c.name], integration_types: [0, 1], contexts: [0, 1, 2],
      ...(c.name === "gs-tt" ? { options: [...((c as { options?: unknown[] }).options ?? []), TT_PANEL_SUB] } : {}),
    })),
  ...commands.filter((c) => c.name === "Save to GameShuffle"),
  WAR_COMMAND,
  CANS_COMMAND,
  LOGO_COMMAND,
  FLAG_COMMAND,
  TABLE_COMMAND,
  LADDER_COMMAND,
];

/** From COMP_MOVE_ENDS (midnight Pacific) the main app drops /gs-tt, /gs-mmr and /gs-room: they live on GameShuffle Competitive. */
const MOVED = !!COMP_MOVE_ENDS && Date.now() >= gsDayStart(COMP_MOVE_ENDS).getTime();
const mainCommands = MOVED ? commands.filter((c) => !(c.name in COMP_FROM)) : commands;

/** The Activity's entry point: Discord launches the Activity itself (handler 2) and posts that it started. */
const ACTIVITY_ENTRY_POINT = {
  name: "launch",
  description: COMP ? "Open the War room: score this channel's war together" : "Play the Daily, the Weekly and Chat Brain",
  type: 4, // PRIMARY_ENTRY_POINT
  handler: 2, // DISCORD_LAUNCH_ACTIVITY
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

interface ExistingCommand { name: string; type?: number; description?: string; handler?: number; integration_types?: number[]; contexts?: number[] }

async function entryPoint(url: string): Promise<object | null> {
  const res = await fetch(url, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
  if (!res.ok) {
    console.error(`Couldn't read the current commands (${res.status}); not touching anything.`);
    process.exit(1);
  }
  const existing = ((await res.json()) as ExistingCommand[]).find((c) => c.type === 4);
  if (existing) {
    const { name, type, description, handler, integration_types, contexts } = existing;
    console.log(`Keeping the Activity entry point /${name}.`);
    return { name, type, description, handler, integration_types, contexts };
  }
  if (process.argv.includes("--activity")) {
    console.log("Adding the Activity entry point /launch.");
    return ACTIVITY_ENTRY_POINT;
  }
  return null;
}

async function registerCommands() {
  if (DRY) {
    const list = COMP ? compCommands : mainCommands;
    console.log(JSON.stringify(list.map((c) => ({ name: c.name, type: (c as { type?: number }).type ?? 1, integration_types: (c as { integration_types?: number[] }).integration_types, subcommands: ((c as { options?: { type: number; name: string }[] }).options ?? []).filter((o) => o.type === 1).map((o) => o.name) })), null, 1));
    return;
  }
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;
  const entry = await entryPoint(url);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry ? [...(COMP ? compCommands : mainCommands), entry] : COMP ? compCommands : mainCommands),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`Registered ${data.length} commands:`);
    for (const cmd of data as { name: string; id: string }[]) {
      console.log(`  /${cmd.name} (${cmd.id})`);
    }
  } else {
    const error = await response.text();
    console.error(`Failed to register commands: ${response.status}`);
    console.error(error);
  }
}

registerCommands();
