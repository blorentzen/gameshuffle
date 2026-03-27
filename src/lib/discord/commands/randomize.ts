import { randomizeKartCombo } from "@/lib/randomizer";
import type { GameData, KartCombo } from "@/data/types";
import mk8dxData from "@/data/mk8dx-data.json";
import {
  ephemeralMessage,
  actionRow,
  button,
  linkButton,
  COLORS,
} from "../respond";

const gameData = mk8dxData as unknown as GameData;

interface CommandOptions {
  game?: string;
  players?: number;
  mode?: string;
}

function parseOptions(options: { name: string; value: string | number }[] | undefined): CommandOptions {
  const opts: CommandOptions = {};
  if (!options) return opts;
  for (const opt of options) {
    if (opt.name === "game") opts.game = String(opt.value);
    if (opt.name === "players") opts.players = Number(opt.value);
    if (opt.name === "mode") opts.mode = String(opt.value);
  }
  return opts;
}

function buildPlayerEmbeds(combos: KartCombo[], mode: string) {
  return combos.map((combo, i) => ({
    author: { name: `Player ${i + 1}` },
    title: combo.character.name,
    description: [
      `🏎️  **${combo.vehicle.name}**`,
      `🛞  **${combo.wheels.name}**`,
      `🪂  **${combo.glider.name}**`,
    ].join("\n"),
    thumbnail: { url: combo.character.img },
    color: i === 0 ? COLORS.PRIMARY : 0x2b2d31, // First player highlighted, rest dark
  }));
}

function buildResponse(combos: KartCombo[], game: string, playerCount: number, mode: string, responseType: number) {
  const settingsId = `${game}|${playerCount}|${mode}`;
  const modeLabel = mode === "competitive" ? "Competitive" : "Casual";

  const headerEmbed = {
    title: "🎮  MK8DX Kart Randomizer",
    description: `${modeLabel} · ${playerCount} Player${playerCount > 1 ? "s" : ""}`,
    color: COLORS.PRIMARY,
    footer: { text: "GameShuffle · gameshuffle.co" },
  };

  const playerEmbeds = buildPlayerEmbeds(combos, mode);

  // Discord allows max 10 embeds — header + 9 players max
  const embeds = [headerEmbed, ...playerEmbeds].slice(0, 10);

  return Response.json({
    type: responseType,
    data: {
      embeds,
      components: [
        actionRow(
          button("Re-roll All", `reroll:${settingsId}`, 1, "🎲"),
          linkButton("Open in GameShuffle", "https://gameshuffle.co/randomizers/mario-kart-8-deluxe", "��"),
        ),
      ],
    },
  });
}

export function handleRandomize(interaction: Record<string, unknown>): Response {
  const data = interaction.data as { options?: { name: string; value: string | number }[] };
  const opts = parseOptions(data?.options);

  const game = opts.game || "mario-kart-8-deluxe";
  const playerCount = Math.max(1, Math.min(9, opts.players || 4)); // Max 9 (header embed + 9 player embeds = 10)
  const mode = opts.mode || "casual";

  if (game !== "mario-kart-8-deluxe") {
    return ephemeralMessage(`Game \`${game}\` is not yet supported. Available: \`mario-kart-8-deluxe\``);
  }

  const combos: KartCombo[] = [];
  for (let i = 0; i < playerCount; i++) {
    combos.push(randomizeKartCombo(gameData, [], []));
  }

  return buildResponse(combos, game, playerCount, mode, 4); // Type 4: channel message
}

export function handleReroll(customId: string): Response {
  const parts = customId.replace("reroll:", "").split("|");
  const game = parts[0] || "mario-kart-8-deluxe";
  const playerCount = Math.max(1, Math.min(9, Number(parts[1]) || 4));
  const mode = parts[2] || "casual";

  if (game !== "mario-kart-8-deluxe") {
    return ephemeralMessage("Unsupported game.");
  }

  const combos: KartCombo[] = [];
  for (let i = 0; i < playerCount; i++) {
    combos.push(randomizeKartCombo(gameData, [], []));
  }

  return buildResponse(combos, game, playerCount, mode, 7); // Type 7: update message
}
