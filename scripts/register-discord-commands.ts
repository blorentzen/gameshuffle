/**
 * Register Discord slash commands.
 *
 *   npx tsx scripts/register-discord-commands.ts --dev   the dev bot (DEV_DISCORD_APPLICATION_ID + DEV_DISCORD_BOT_TOKEN)
 *   npx tsx scripts/register-discord-commands.ts         DISCORD_APPLICATION_ID + DISCORD_BOT_TOKEN
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

const DEV = process.argv.includes("--dev");
const APPLICATION_ID = DEV ? process.env.DEV_DISCORD_APPLICATION_ID : process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = DEV ? process.env.DEV_DISCORD_BOT_TOKEN : process.env.DISCORD_BOT_TOKEN;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error(`Missing ${DEV ? "DEV_DISCORD_APPLICATION_ID or DEV_DISCORD_BOT_TOKEN" : "DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN"} in environment`);
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
const owner = tokenOwner(BOT_TOKEN);
if (owner && owner !== APPLICATION_ID) {
  console.error(`That bot token belongs to a different Discord application than ${DEV ? "DEV_DISCORD_APPLICATION_ID" : "DISCORD_APPLICATION_ID"}.`);
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
];

/** The Activity's entry point: Discord launches the Activity itself (handler 2) and posts that it started. */
const ACTIVITY_ENTRY_POINT = {
  name: "launch",
  description: "Play the Daily, the Weekly and Chat Brain",
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
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;
  const entry = await entryPoint(url);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry ? [...commands, entry] : commands),
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
