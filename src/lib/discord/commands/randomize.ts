import { randomizeKartCombo } from "@/lib/randomizer";
import { resolveCdnUrl } from "@/lib/assets";
import type { GameData, KartCombo } from "@/data/types";
import mk8dxData from "@/data/mk8dx-data.json";
import {
  channelMessage,
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

function formatCombo(combo: KartCombo): string {
  return `${combo.character.name} · ${combo.vehicle.name} · ${combo.wheels.name} · ${combo.glider.name}`;
}

export function handleRandomize(interaction: Record<string, unknown>): Response {
  const data = interaction.data as { options?: { name: string; value: string | number }[] };
  const opts = parseOptions(data?.options);

  const game = opts.game || "mario-kart-8-deluxe";
  const playerCount = Math.max(1, Math.min(12, opts.players || 4));

  if (game !== "mario-kart-8-deluxe") {
    return ephemeralMessage(`Game \`${game}\` is not yet supported. Available: \`mario-kart-8-deluxe\``);
  }

  // Generate combos
  const combos: KartCombo[] = [];
  for (let i = 0; i < playerCount; i++) {
    combos.push(randomizeKartCombo(gameData, [], []));
  }

  // Build embed
  const fields = combos.map((combo, i) => ({
    name: `Player ${i + 1}`,
    value: formatCombo(combo),
    inline: playerCount <= 6,
  }));

  const settingsId = `${game}|${playerCount}|${opts.mode || "casual"}`;

  return channelMessage(
    undefined,
    [
      {
        title: "MK8DX Kart Randomizer",
        description: `${opts.mode === "competitive" ? "Competitive" : "Casual"} · ${playerCount} Player${playerCount > 1 ? "s" : ""}`,
        color: COLORS.PRIMARY,
        fields,
        thumbnail: {
          url: resolveCdnUrl("https://cdn.empac.co/gameshuffle/images/mk8dx/cups/mushroom.png"),
        },
        footer: { text: "GameShuffle · gameshuffle.co" },
      },
    ],
    [
      actionRow(
        button("Re-roll", `reroll:${settingsId}`, 1, "🎲"),
        linkButton("Open in GameShuffle", "https://gameshuffle.co/randomizers/mario-kart-8-deluxe", "🔗"),
      ),
    ]
  );
}

export function handleReroll(customId: string): Response {
  // Parse settings from custom_id: "reroll:game|players|mode"
  const parts = customId.replace("reroll:", "").split("|");
  const game = parts[0] || "mario-kart-8-deluxe";
  const playerCount = Math.max(1, Math.min(12, Number(parts[1]) || 4));
  const mode = parts[2] || "casual";

  if (game !== "mario-kart-8-deluxe") {
    return ephemeralMessage("Unsupported game.");
  }

  const combos: KartCombo[] = [];
  for (let i = 0; i < playerCount; i++) {
    combos.push(randomizeKartCombo(gameData, [], []));
  }

  const fields = combos.map((combo, i) => ({
    name: `Player ${i + 1}`,
    value: formatCombo(combo),
    inline: playerCount <= 6,
  }));

  const settingsId = `${game}|${playerCount}|${mode}`;

  // Type 7: update the original message
  return Response.json({
    type: 7,
    data: {
      embeds: [
        {
          title: "MK8DX Kart Randomizer",
          description: `${mode === "competitive" ? "Competitive" : "Casual"} · ${playerCount} Player${playerCount > 1 ? "s" : ""}`,
          color: COLORS.PRIMARY,
          fields,
          thumbnail: {
            url: "https://cdn.empac.co/gameshuffle/images/mk8dx/cups/mushroom.png",
          },
          footer: { text: "GameShuffle · gameshuffle.co" },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: "Re-roll", custom_id: `reroll:${settingsId}`, emoji: { name: "🎲" } },
            { type: 2, style: 5, label: "Open in GameShuffle", url: "https://gameshuffle.co/randomizers/mario-kart-8-deluxe", emoji: { name: "🔗" } },
          ],
        },
      ],
    },
  });
}
