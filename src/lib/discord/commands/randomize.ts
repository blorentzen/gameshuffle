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

interface ParsedOptions {
  game: string;
  players: number;
  playersExplicit: boolean;
  mode: string;
  taggedUsers: { id: string; username: string }[];
}

function parseOptions(
  options: { name: string; type: number; value: string | number }[] | undefined,
  resolved: Record<string, Record<string, { username: string; global_name?: string }>> | undefined
): ParsedOptions {
  const opts: ParsedOptions = { game: "mario-kart-8-deluxe", players: 1, playersExplicit: false, mode: "casual", taggedUsers: [] };
  if (!options) return opts;

  const users: { slot: number; id: string; username: string }[] = [];

  for (const opt of options) {
    if (opt.name === "game") opts.game = String(opt.value);
    else if (opt.name === "players") { opts.players = Number(opt.value); opts.playersExplicit = true; }
    else if (opt.name === "mode") opts.mode = String(opt.value);
    else if (opt.name.startsWith("player") && opt.type === 6) {
      const slot = parseInt(opt.name.replace("player", ""), 10);
      const userId = String(opt.value);
      const resolvedUser = resolved?.users?.[userId];
      const displayName = resolvedUser?.global_name || resolvedUser?.username || "Unknown";
      users.push({ slot, id: userId, username: displayName });
    }
  }

  // Sort by slot number
  users.sort((a, b) => a.slot - b.slot);
  opts.taggedUsers = users;

  return opts;
}

function buildPlayerEmbeds(combos: KartCombo[], taggedUsers: { id: string; username: string }[]) {
  return combos.map((combo, i) => {
    const tagged = taggedUsers[i];
    const playerLabel = tagged ? `<@${tagged.id}>` : `Player ${i + 1}`;

    return {
      author: { name: tagged ? tagged.username : `Player ${i + 1}` },
      title: combo.character.name,
      description: [
        playerLabel,
        "",
        `🏎️  **${combo.vehicle.name}**`,
        `🛞  **${combo.wheels.name}**`,
        `🪂  **${combo.glider.name}**`,
      ].join("\n"),
      thumbnail: { url: combo.character.img },
      color: i === 0 ? COLORS.PRIMARY : 0x2b2d31,
    };
  });
}

function buildDiscordLink(combos: KartCombo[], taggedUsers: { id: string; username: string }[]): string {
  const players = combos.map((combo, i) => ({
    name: taggedUsers[i]?.username || `Player ${i + 1}`,
    combo: {
      character: { name: combo.character.name, img: combo.character.img },
      vehicle: { name: combo.vehicle.name, img: combo.vehicle.img },
      wheels: { name: combo.wheels.name, img: combo.wheels.img },
      glider: { name: combo.glider.name, img: combo.glider.img },
    },
  }));

  const encoded = Buffer.from(JSON.stringify(players)).toString("base64url");
  return `https://gameshuffle.co/randomizers/mario-kart-8-deluxe?d=${encoded}`;
}

function buildResponse(
  combos: KartCombo[],
  opts: ParsedOptions,
  responseType: number
) {
  const settingsId = `${opts.game}|${opts.players}|${opts.mode}`;
  const modeLabel = opts.mode === "competitive" ? "Competitive" : "Casual";
  const gsLink = buildDiscordLink(combos, opts.taggedUsers);

  const headerEmbed = {
    title: "🎮  MK8DX Kart Randomizer",
    description: `${modeLabel} · ${opts.players} Player${opts.players > 1 ? "s" : ""}`,
    color: COLORS.PRIMARY,
    footer: { text: "GameShuffle · gameshuffle.co" },
  };

  const playerEmbeds = buildPlayerEmbeds(combos, opts.taggedUsers);
  const embeds = [headerEmbed, ...playerEmbeds].slice(0, 10);

  return Response.json({
    type: responseType,
    data: {
      embeds,
      components: [
        actionRow(
          button("Re-roll All", `reroll:${settingsId}`, 1, "🎲"),
          linkButton("Open in GameShuffle", gsLink, "🔗"),
        ),
      ],
    },
  });
}

export function handleRandomize(interaction: Record<string, unknown>): Response {
  const data = interaction.data as {
    options?: { name: string; type: number; value: string | number }[];
    resolved?: Record<string, Record<string, { username: string; global_name?: string }>>;
  };
  const opts = parseOptions(data?.options, data?.resolved);

  if (opts.game !== "mario-kart-8-deluxe") {
    return ephemeralMessage(`Game \`${opts.game}\` is not yet supported. Available: \`mario-kart-8-deluxe\``);
  }

  const invoker = interaction.member
    ? (interaction.member as Record<string, unknown>).user as { id: string; username: string; global_name?: string }
    : interaction.user as { id: string; username: string; global_name?: string };

  if (opts.taggedUsers.length > 0) {
    // Tagged users mode — auto-include invoker if not already tagged
    if (invoker && !opts.taggedUsers.some((u) => u.id === invoker.id)) {
      opts.taggedUsers.unshift({ id: invoker.id, username: invoker.global_name || invoker.username });
    }
    opts.players = opts.taggedUsers.length;
  } else if (!opts.playersExplicit && invoker) {
    // No tags, no explicit count — just the invoker
    opts.taggedUsers = [{ id: invoker.id, username: invoker.global_name || invoker.username }];
    opts.players = 1;
  }
  opts.players = Math.max(1, Math.min(9, opts.players));

  const combos: KartCombo[] = [];
  for (let i = 0; i < opts.players; i++) {
    combos.push(randomizeKartCombo(gameData, [], []));
  }

  return buildResponse(combos, opts, 4);
}

export function handleReroll(customId: string): Response {
  const parts = customId.replace("reroll:", "").split("|");
  const opts: ParsedOptions = {
    game: parts[0] || "mario-kart-8-deluxe",
    players: Math.max(1, Math.min(9, Number(parts[1]) || 1)),
    playersExplicit: true,
    mode: parts[2] || "casual",
    taggedUsers: [], // Can't preserve tags on re-roll (Discord limitation)
  };

  if (opts.game !== "mario-kart-8-deluxe") {
    return ephemeralMessage("Unsupported game.");
  }

  const combos: KartCombo[] = [];
  for (let i = 0; i < opts.players; i++) {
    combos.push(randomizeKartCombo(gameData, [], []));
  }

  return buildResponse(combos, opts, 7);
}
