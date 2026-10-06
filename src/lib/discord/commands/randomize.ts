import { collectionsForDiscordUsers } from "@/lib/collection/server";
import { applyToKartData } from "@/lib/collection/core";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomizeKartCombo } from "@/lib/randomizer";
import type { GameData, KartCombo } from "@/data/types";
import mk8dxData from "@/data/mk8dx-data.json";
import mkworldData from "@/data/mkworld-data.json";
import { getChatGame, type ChatGame } from "@/lib/twitch/chatGames";
import type { ChatRoll } from "@/lib/twitch/chatRoll";
import { SITE_URL } from "@/lib/seo";
import {
  ephemeralMessage,
  deferredResponse,
  followUp,
  actionRow,
  button,
  linkButton,
  COLORS,
} from "../respond";

interface GameEntry {
  data: GameData;
  title: string;
  url: string;
  hasWheels: boolean;
  hasGlider: boolean;
}

const GAMES: Record<string, GameEntry> = {
  "mario-kart-8-deluxe": {
    data: mk8dxData as unknown as GameData,
    title: "MK8DX Kart Randomizer",
    url: "https://gameshuffle.co/randomizers/mario-kart-8-deluxe",
    hasWheels: true,
    hasGlider: true,
  },
  "mario-kart-world": {
    data: mkworldData as unknown as GameData,
    title: "MK World Kart Randomizer",
    url: "https://gameshuffle.co/randomizers/mario-kart-world",
    hasWheels: false,
    hasGlider: false,
  },
};

interface ParsedOptions {
  game: string;
  players: number;
  playersExplicit: boolean;
  mode: string;
  rerollLimit: number;
  /** Overwatch / Marvel Rivals: roll from one role ("tank"). */
  role: string;
  taggedUsers: { id: string; username: string }[];
}

interface SessionCombo {
  name: string;
  character: { name: string; img: string };
  vehicle: { name: string; img: string };
  wheels: { name: string; img: string };
  glider: { name: string; img: string };
}

/**
 * Every game other than Mario Kart 8 Deluxe / World rolls through the same
 * registry as Twitch chat rolls (src/lib/twitch/chatGames.ts), so Discord gives
 * what the site gives. Stored per player with the role it was asked for, so a
 * re-roll asks again.
 */
interface RollCombo {
  name: string;
  roll: ChatRoll;
  arg?: string;
}
type AnyCombo = SessionCombo | RollCombo;
const isRollCombo = (c: AnyCombo): c is RollCombo => "roll" in c;

/** A game this command can roll: Mario Kart's own combos, or a chat-roll game. */
interface ResolvedGame {
  slug: string;
  title: string;
  url: string;
  maxPlayers: number;
  kart: GameEntry | null;
  chat: ChatGame | null;
}

/** Pokémon Stadium 2 rides on the Stadium randomizer page. */
const PAGE_FOR: Record<string, string> = { "pokemon-stadium-2": "pokemon-stadium" };

function resolveGame(slug: string): ResolvedGame | null {
  const kart = GAMES[slug];
  if (kart) return { slug, title: kart.title, url: kart.url, maxPlayers: 9, kart, chat: null };
  const chat = getChatGame(slug);
  if (!chat) return null;
  return {
    slug,
    title: `${chat.title} Randomizer`,
    url: `${SITE_URL}/randomizers/${PAGE_FOR[slug] ?? slug}`,
    maxPlayers: Math.min(9, chat.lobbyCap),
    kart: null,
    chat,
  };
}

/** One player's roll. `taken` keeps Mario Party characters distinct across the table. */
function rollPlayer(game: ResolvedGame, owned: Parameters<typeof applyToKartData>[1], name: string, arg: string, taken: string[]): AnyCombo {
  if (game.kart) return comboToSession(randomizeKartCombo(applyToKartData(game.kart.data, owned), [], []), name);
  return { name, roll: game.chat!.roll({ owned, arg, taken }), ...(arg ? { arg } : {}) };
}

/** First-part names other players hold (for games that keep picks distinct). */
function heldPicks(combos: AnyCombo[], except = -1): string[] {
  return combos.flatMap((c, i) => (i !== except && isRollCombo(c) && c.roll.slots[0] ? [c.roll.slots[0].name] : []));
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
    role: "",
    taggedUsers: [],
  };
  if (!options) return opts;

  const users: { slot: number; id: string; username: string }[] = [];

  for (const opt of options) {
    if (opt.name === "game") opts.game = String(opt.value);
    else if (opt.name === "players") { opts.players = Number(opt.value); opts.playersExplicit = true; }
    else if (opt.name === "mode") opts.mode = String(opt.value);
    else if (opt.name === "rerolls") opts.rerollLimit = Number(opt.value);
    else if (opt.name === "role") opts.role = String(opt.value);
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

function buildEmbeds(combos: SessionCombo[], taggedUsers: { id: string; username: string }[], mode: string, game: GameEntry) {
  const modeLabel = mode === "competitive" ? "Competitive" : "Casual";

  const headerEmbed = {
    title: `🎮  ${game.title}`,
    description: `${modeLabel} · ${combos.length} Player${combos.length > 1 ? "s" : ""}`,
    color: COLORS.PRIMARY,
    footer: { text: "GameShuffle · gameshuffle.co" },
  };

  const playerEmbeds = combos.map((combo, i) => {
    const tagged = taggedUsers[i];
    const playerLabel = tagged ? `<@${tagged.id}>` : `Player ${i + 1}`;

    const lines = [playerLabel, "", `🏎️  **${combo.vehicle.name}**`];
    if (game.hasWheels) lines.push(`🛞  **${combo.wheels.name}**`);
    if (game.hasGlider) lines.push(`🪂  **${combo.glider.name}**`);

    return {
      author: { name: tagged ? tagged.username : `Player ${i + 1}` },
      title: combo.character.name,
      description: lines.join("\n"),
      thumbnail: { url: combo.character.img },
      color: i === 0 ? COLORS.PRIMARY : 0x2b2d31,
    };
  });

  return [headerEmbed, ...playerEmbeds].slice(0, 10);
}

const absolute = (img: string) => (img.startsWith("/") ? `${SITE_URL}${img}` : img);
const hexColor = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : null);

/** Embeds for a chat-roll game: the first part is the headline, the rest are lines under it. */
function buildRollEmbeds(combos: RollCombo[], taggedUsers: { id: string; username: string }[], mode: string, game: ResolvedGame) {
  const modeLabel = mode === "competitive" ? "Competitive" : "Casual";
  const headerEmbed = {
    title: `🎮  ${game.title}`,
    description: `${modeLabel} · ${combos.length} Player${combos.length > 1 ? "s" : ""}`,
    color: COLORS.PRIMARY,
    footer: { text: "GameShuffle · gameshuffle.co" },
  };
  const playerEmbeds = combos.map((combo, i) => {
    const tagged = taggedUsers[i];
    const playerLabel = tagged ? `<@${tagged.id}>` : `Player ${i + 1}`;
    const slots = combo.roll.slots;
    const first = slots[0];
    const withDetail = (s: { name: string; detail?: string }) => (s.detail ? `${s.name} (${s.detail})` : s.name);
    // A team (Pokémon Stadium) lists every member; otherwise the first part is the title.
    const team = slots.length > 2 && slots.every((s) => s.kind === "text");
    const title = team ? combo.roll.text.split(":")[0] : withDetail(first);
    const lines = team
      ? [playerLabel, "", ...slots.map((s) => `• **${s.name}**${s.detail ? ` (${s.detail})` : ""}`)]
      : [playerLabel, ...(slots.length > 1 ? [""] : []), ...slots.slice(1).map((s) => `**${s.label}:** ${withDetail(s)}`)];
    return {
      author: { name: tagged ? tagged.username : `Player ${i + 1}` },
      title,
      description: lines.join("\n"),
      ...(first?.img && !team ? { thumbnail: { url: absolute(first.img) } } : {}),
      color: hexColor(first?.color) ?? (i === 0 ? COLORS.PRIMARY : 0x2b2d31),
    };
  });
  return [headerEmbed, ...playerEmbeds].slice(0, 10);
}

function embedsFor(combos: AnyCombo[], taggedUsers: { id: string; username: string }[], mode: string, game: ResolvedGame) {
  return game.kart
    ? buildEmbeds(combos as SessionCombo[], taggedUsers, mode, game.kart)
    : buildRollEmbeds(combos as RollCombo[], taggedUsers, mode, game);
}

function buildDiscordLink(combos: SessionCombo[], game: GameEntry): string {
  // Encode minimal data — names only, no image URLs (page looks them up)
  const players = combos.map((c) => ({
    n: c.name,
    c: c.character.name,
    v: c.vehicle.name,
    ...(game.hasWheels ? { w: c.wheels.name } : {}),
    ...(game.hasGlider ? { g: c.glider.name } : {}),
  }));
  const encoded = Buffer.from(JSON.stringify(players)).toString("base64url");
  const url = `${game.url}?d=${encoded}`;
  // Discord link buttons have a 512-char URL limit
  if (url.length > 512) return game.url;
  return url;
}

function buildComponents(
  sessionId: string,
  combos: AnyCombo[],
  taggedUsers: { id: string; username: string }[],
  rerollLimit: number,
  rerollCounts: Record<string, number>,
  game: ResolvedGame
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
      // Mario Kart's link loads these exact combos; other games open their randomizer.
      linkButton("Open in GameShuffle", game.kart ? buildDiscordLink(combos as SessionCombo[], game.kart) : game.url, "🔗"),
    )
  );

  return rows;
}

export async function handleRandomize(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as {
    options?: { name: string; type: number; value: string | number }[];
    resolved?: Record<string, Record<string, { username: string; global_name?: string }>>;
  };
  const opts = parseOptions(data?.options, data?.resolved);

  const game = resolveGame(opts.game);
  if (!game) {
    return ephemeralMessage(`GameShuffle doesn't have a randomizer for \`${opts.game}\` yet. Start typing a game name to see the ones it has.`);
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
  opts.players = Math.max(1, Math.min(game.maxPlayers, opts.players));

  // Generate combos. Players with a linked GameShuffle account only roll what
  // they own (their collection); one batched lookup keeps us inside Discord's 3s.
  const owned = await collectionsForDiscordUsers(opts.taggedUsers.map((u) => u.id), opts.game);
  const combos: AnyCombo[] = [];
  for (let i = 0; i < opts.players; i++) {
    const playerName = opts.taggedUsers[i]?.username || `Player ${i + 1}`;
    const taken = game.chat?.unique ? heldPicks(combos) : [];
    combos.push(rollPlayer(game, owned.get(opts.taggedUsers[i]?.id ?? "") ?? null, playerName, opts.role, taken));
  }

  const embeds = embedsFor(combos, opts.taggedUsers, opts.mode, game);

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

  const components = buildComponents(sessionId, combos, opts.taggedUsers, opts.rerollLimit, {}, game);

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

  const game = resolveGame(session.game as string) ?? resolveGame("mario-kart-8-deluxe")!;
  const taggedUsers = (session.tagged_users || []) as { id: string; username: string }[];
  const previous = session.combos as AnyCombo[];
  const combos: AnyCombo[] = [];

  const owned = await collectionsForDiscordUsers(taggedUsers.map((u) => u.id), session.game as string);
  for (let i = 0; i < previous.length; i++) {
    const playerName = taggedUsers[i]?.username || `Player ${i + 1}`;
    const prev = previous[i];
    const taken = game.chat?.unique ? heldPicks(combos) : [];
    combos.push(rollPlayer(game, owned.get(taggedUsers[i]?.id ?? "") ?? null, playerName, prev && isRollCombo(prev) ? prev.arg ?? "" : "", taken));
  }

  // Reset re-roll counts and update combos
  await supabase
    .from("discord_randomizer_sessions")
    .update({ combos, reroll_counts: {} })
    .eq("id", sessionId);

  const embeds = embedsFor(combos, taggedUsers, session.mode, game);
  const components = buildComponents(sessionId, combos, taggedUsers, session.reroll_limit, {}, game);

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
  const combos = session.combos as AnyCombo[];
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
  const game = resolveGame(session.game as string) ?? resolveGame("mario-kart-8-deluxe")!;
  const owned = await collectionsForDiscordUsers([taggedUsers[slotIndex]?.id ?? ""], session.game as string);
  const playerName = taggedUsers[slotIndex]?.username || `Player ${slotIndex + 1}`;
  const prev = combos[slotIndex];
  const taken = game.chat?.unique ? heldPicks(combos, slotIndex) : [];
  combos[slotIndex] = rollPlayer(game, owned.get(taggedUsers[slotIndex]?.id ?? "") ?? null, playerName, prev && isRollCombo(prev) ? prev.arg ?? "" : "", taken);
  rerollCounts[String(slotIndex)] = used + 1;

  // Update session
  await supabase
    .from("discord_randomizer_sessions")
    .update({ combos, reroll_counts: rerollCounts })
    .eq("id", sessionId);

  const embeds = embedsFor(combos, taggedUsers, session.mode, game);
  const components = buildComponents(sessionId, combos, taggedUsers, rerollLimit, rerollCounts, game);

  return Response.json({
    type: 7,
    data: { embeds, components },
  });
}
