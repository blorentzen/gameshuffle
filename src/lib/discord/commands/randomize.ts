import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomizeKartCombo } from "@/lib/randomizer";
import type { GameData, KartCombo } from "@/data/types";
import mk8dxData from "@/data/mk8dx-data.json";
import {
  ephemeralMessage,
  deferredResponse,
  followUp,
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
  rerollLimit: number;
  taggedUsers: { id: string; username: string }[];
}

interface SessionCombo {
  name: string;
  character: { name: string; img: string };
  vehicle: { name: string; img: string };
  wheels: { name: string; img: string };
  glider: { name: string; img: string };
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function parseOptions(
  options: { name: string; type: number; value: string | number }[] | undefined,
  resolved: Record<string, Record<string, { username: string; global_name?: string }>> | undefined
): ParsedOptions {
  const opts: ParsedOptions = {
    game: "mario-kart-8-deluxe",
    players: 1,
    playersExplicit: false,
    mode: "casual",
    rerollLimit: 1,
    taggedUsers: [],
  };
  if (!options) return opts;

  const users: { slot: number; id: string; username: string }[] = [];

  for (const opt of options) {
    if (opt.name === "game") opts.game = String(opt.value);
    else if (opt.name === "players") { opts.players = Number(opt.value); opts.playersExplicit = true; }
    else if (opt.name === "mode") opts.mode = String(opt.value);
    else if (opt.name === "rerolls") opts.rerollLimit = Number(opt.value);
    else if (opt.name.startsWith("player") && opt.type === 6) {
      const slot = parseInt(opt.name.replace("player", ""), 10);
      const userId = String(opt.value);
      const resolvedUser = resolved?.users?.[userId];
      const displayName = resolvedUser?.global_name || resolvedUser?.username || "Unknown";
      users.push({ slot, id: userId, username: displayName });
    }
  }

  users.sort((a, b) => a.slot - b.slot);
  opts.taggedUsers = users;
  return opts;
}

function comboToSession(combo: KartCombo, playerName: string): SessionCombo {
  return {
    name: playerName,
    character: { name: combo.character.name, img: combo.character.img },
    vehicle: { name: combo.vehicle.name, img: combo.vehicle.img },
    wheels: { name: combo.wheels.name, img: combo.wheels.img },
    glider: { name: combo.glider.name, img: combo.glider.img },
  };
}

function buildEmbeds(combos: SessionCombo[], taggedUsers: { id: string; username: string }[], mode: string) {
  const modeLabel = mode === "competitive" ? "Competitive" : "Casual";

  const headerEmbed = {
    title: "🎮  MK8DX Kart Randomizer",
    description: `${modeLabel} · ${combos.length} Player${combos.length > 1 ? "s" : ""}`,
    color: COLORS.PRIMARY,
    footer: { text: "GameShuffle · gameshuffle.co" },
  };

  const playerEmbeds = combos.map((combo, i) => {
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

  return [headerEmbed, ...playerEmbeds].slice(0, 10);
}

function buildDiscordLink(combos: SessionCombo[]): string {
  // Encode minimal data — names only, no image URLs (page looks them up)
  const players = combos.map((c) => ({
    n: c.name,
    c: c.character.name,
    v: c.vehicle.name,
    w: c.wheels.name,
    g: c.glider.name,
  }));
  const encoded = Buffer.from(JSON.stringify(players)).toString("base64url");
  const url = `https://gameshuffle.co/randomizers/mario-kart-8-deluxe?d=${encoded}`;
  // Discord link buttons have a 512-char URL limit
  if (url.length > 512) return "https://gameshuffle.co/randomizers/mario-kart-8-deluxe";
  return url;
}

function buildComponents(
  sessionId: string,
  combos: SessionCombo[],
  taggedUsers: { id: string; username: string }[],
  rerollLimit: number,
  rerollCounts: Record<string, number>
) {
  const rows = [];

  // Per-player re-roll buttons (only if there are tagged users and re-rolls allowed)
  if (taggedUsers.length > 0 && rerollLimit !== 0) {
    const playerButtons = combos.slice(0, 5).map((combo, i) => {
      const used = rerollCounts[String(i)] || 0;
      const remaining = rerollLimit === -1 ? "∞" : String(rerollLimit - used);
      const disabled = rerollLimit !== -1 && used >= rerollLimit;
      return {
        type: 2 as const,
        style: (disabled ? 2 : 2) as 1 | 2 | 3 | 4 | 5,
        label: `🎲 ${combo.name.split(" ")[0]} (${remaining})`,
        custom_id: `pr:${sessionId}:${i}`,
        disabled,
      };
    });
    if (playerButtons.length > 0) {
      rows.push({ type: 1 as const, components: playerButtons });
    }

    // Second row for players 6-9
    if (combos.length > 5) {
      const moreButtons = combos.slice(5, 9).map((combo, i) => {
        const idx = i + 5;
        const used = rerollCounts[String(idx)] || 0;
        const remaining = rerollLimit === -1 ? "∞" : String(rerollLimit - used);
        const disabled = rerollLimit !== -1 && used >= rerollLimit;
        return {
          type: 2 as const,
          style: 2 as 1 | 2 | 3 | 4 | 5,
          label: `🎲 ${combo.name.split(" ")[0]} (${remaining})`,
          custom_id: `pr:${sessionId}:${idx}`,
          disabled,
        };
      });
      if (moreButtons.length > 0) {
        rows.push({ type: 1 as const, components: moreButtons });
      }
    }
  }

  // Global actions row
  rows.push(
    actionRow(
      button("Re-roll All", `ra:${sessionId}`, 1, "🎲"),
      linkButton("Open in GameShuffle", buildDiscordLink(combos), "🔗"),
    )
  );

  return rows;
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
    if (invoker && !opts.taggedUsers.some((u) => u.id === invoker.id)) {
      opts.taggedUsers.unshift({ id: invoker.id, username: invoker.global_name || invoker.username });
    }
    opts.players = opts.taggedUsers.length;
  } else if (!opts.playersExplicit && invoker) {
    opts.taggedUsers = [{ id: invoker.id, username: invoker.global_name || invoker.username }];
    opts.players = 1;
  }
  opts.players = Math.max(1, Math.min(9, opts.players));

  // Generate combos (pure logic, instant)
  const combos: SessionCombo[] = [];
  for (let i = 0; i < opts.players; i++) {
    const kc = randomizeKartCombo(gameData, [], []);
    const playerName = opts.taggedUsers[i]?.username || `Player ${i + 1}`;
    combos.push(comboToSession(kc, playerName));
  }

  const embeds = buildEmbeds(combos, opts.taggedUsers, opts.mode);

  // Generate session ID and save after response
  const sessionId = crypto.randomUUID();

  after(async () => {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("discord_randomizer_sessions")
      .insert({
        id: sessionId,
        game: opts.game,
        mode: opts.mode,
        combos,
        tagged_users: opts.taggedUsers,
        reroll_limit: opts.rerollLimit,
        reroll_counts: {},
        invoker_id: invoker?.id || null,
      });
    if (error) console.error("Session save failed:", error);
  });

  const gsLink = buildDiscordLink(combos);
  const components = [
    actionRow(
      button("Re-roll All", `ra:${sessionId}`, 1, "🎲"),
      linkButton("Open in GameShuffle", gsLink, "🔗"),
    ),
  ];

  return Response.json({
    type: 4,
    data: { embeds, components },
  });
}

export async function handleRerollAll(customId: string): Promise<Response> {
  const sessionId = customId.replace("ra:", "");
  const supabase = getSupabase();

  const { data: session } = await supabase
    .from("discord_randomizer_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return ephemeralMessage("Session expired.");

  const taggedUsers = (session.tagged_users || []) as { id: string; username: string }[];
  const combos: SessionCombo[] = [];
  const count = (session.combos as SessionCombo[]).length;

  for (let i = 0; i < count; i++) {
    const kc = randomizeKartCombo(gameData, [], []);
    const playerName = taggedUsers[i]?.username || `Player ${i + 1}`;
    combos.push(comboToSession(kc, playerName));
  }

  // Reset re-roll counts and update combos
  await supabase
    .from("discord_randomizer_sessions")
    .update({ combos, reroll_counts: {} })
    .eq("id", sessionId);

  const embeds = buildEmbeds(combos, taggedUsers, session.mode);
  const components = buildComponents(sessionId, combos, taggedUsers, session.reroll_limit, {});

  return Response.json({
    type: 7,
    data: { embeds, components },
  });
}

export async function handlePlayerReroll(customId: string, interactionUser: { id: string }): Promise<Response> {
  // custom_id format: "pr:sessionId:slotIndex"
  const parts = customId.split(":");
  const sessionId = parts[1];
  const slotIndex = parseInt(parts[2], 10);

  const supabase = getSupabase();
  const { data: session } = await supabase
    .from("discord_randomizer_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return ephemeralMessage("Session expired.");

  const taggedUsers = (session.tagged_users || []) as { id: string; username: string }[];
  const combos = session.combos as SessionCombo[];
  const rerollCounts = (session.reroll_counts || {}) as Record<string, number>;
  const rerollLimit = session.reroll_limit as number;

  // Check if this user is allowed to re-roll this slot
  const taggedUser = taggedUsers[slotIndex];
  const isInvoker = interactionUser.id === session.invoker_id;
  const isSlotOwner = taggedUser && taggedUser.id === interactionUser.id;

  if (!isInvoker && !isSlotOwner) {
    return ephemeralMessage("You can only re-roll your own slot.");
  }

  // Check re-roll limit
  const used = rerollCounts[String(slotIndex)] || 0;
  if (rerollLimit !== -1 && used >= rerollLimit) {
    return ephemeralMessage("No re-rolls remaining for this slot.");
  }

  // Re-roll this slot
  const kc = randomizeKartCombo(gameData, [], []);
  const playerName = taggedUsers[slotIndex]?.username || `Player ${slotIndex + 1}`;
  combos[slotIndex] = comboToSession(kc, playerName);
  rerollCounts[String(slotIndex)] = used + 1;

  // Update session
  await supabase
    .from("discord_randomizer_sessions")
    .update({ combos, reroll_counts: rerollCounts })
    .eq("id", sessionId);

  const embeds = buildEmbeds(combos, taggedUsers, session.mode);
  const components = buildComponents(sessionId, combos, taggedUsers, rerollLimit, rerollCounts);

  return Response.json({
    type: 7,
    data: { embeds, components },
  });
}
