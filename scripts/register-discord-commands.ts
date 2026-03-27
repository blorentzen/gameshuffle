/**
 * Register Discord slash commands.
 * Run: npx tsx scripts/register-discord-commands.ts
 *
 * Requires DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in .env.local
 */

import "dotenv/config";

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error("Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN in environment");
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
        description: "Number of players (1-12)",
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 12,
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
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
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
