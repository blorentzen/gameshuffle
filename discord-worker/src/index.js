/**
 * GameShuffle Discord gateway worker.
 *
 * The main app (Vercel) is HTTP-interactions only, so it can't receive the
 * Gateway events these features need. This always-on service holds the
 * WebSocket and handles:
 *   - Emoji REACTION roles   (MessageReactionAdd / Remove)  → discord_reaction_roles
 *   - Auto-assign on JOIN     (GuildMemberAdd)               → discord_autoroles
 *   - Server LOGGING          (message delete/edit, member join/leave, role
 *                              change) → users.discord_log_channel_id/_events
 *
 * It authenticates as the same bot (DISCORD_BOT_TOKEN) and reads config from
 * Supabase with the service-role key. Config is written by the Next app.
 *
 * Env: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Privileged gateway intents (Discord dev portal → Bot → Privileged Gateway
 * Intents): "Server Members" (join autorole + join/leave/role logging) AND
 * "Message Content" (logged message text for delete/edit).
 */

import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// Node < 22 has no native WebSocket, and @supabase/supabase-js builds its
// realtime client (which needs one) eagerly inside createClient — even though
// this worker only reads the DB. Provide the ws polyfill so it doesn't throw.
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const { DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

for (const [k, v] of Object.entries({ DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) {
    console.error(`[worker] missing required env var: ${k}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged — GuildMemberAdd/Remove/Update (autorole + logging)
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages, // message delete/edit logging
    GatewayIntentBits.MessageContent, // privileged — logged message text (enable in dev portal)
  ],
  // Partials so we still get events on messages/reactions not in the cache
  // (e.g. a reaction on an older role-menu message after a restart).
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

/** Canonical stored form for an emoji: custom → <:name:id> / <a:name:id>,
 *  unicode → the raw character. Matches how the app stores mappings. */
function emojiKey(emoji) {
  if (emoji.id) return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
  return emoji.name ?? "";
}

// Some unicode emojis carry a trailing variation selector (U+FE0F) that may or
// may not be present in the reaction event vs what we stored — compare both ways.
const stripVariation = (s) => (s ?? "").replace(/\uFE0F/g, "");

/** Find the role mapped to a (message, emoji), tolerant of stored format. */
async function findReactionRole(messageId, emoji) {
  const { data, error } = await supabase
    .from("discord_reaction_roles")
    .select("role_id, emoji, guild_id")
    .eq("message_id", messageId);
  if (error || !data?.length) return null;
  const key = emojiKey(emoji);
  const nkey = stripVariation(key);
  return (
    data.find((r) => r.emoji === key) ??
    (emoji.id ? data.find((r) => r.emoji.includes(`:${emoji.id}>`)) : null) ??
    data.find((r) => stripVariation(r.emoji) === nkey) ??
    null
  );
}

async function toggleReactionRole(reaction, user, add) {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    const row = await findReactionRole(reaction.message.id, reaction.emoji);
    if (!row) {
      console.log(`[worker] no role mapping for ${emojiKey(reaction.emoji)} on message ${reaction.message.id}`);
      return;
    }
    const guild = reaction.message.guild ?? (await client.guilds.fetch(row.guild_id));
    const member = await guild.members.fetch(user.id);
    if (add) await member.roles.add(row.role_id);
    else await member.roles.remove(row.role_id);
    console.log(`[worker] ${add ? "added" : "removed"} role ${row.role_id} for ${user.tag ?? user.id}`);
  } catch (err) {
    console.error(
      "[worker] reaction role assign failed (check the bot has Manage Roles AND its role is above the target role):",
      err?.message ?? err,
    );
  }
}

client.on(Events.MessageReactionAdd, (reaction, user) => toggleReactionRole(reaction, user, true));
client.on(Events.MessageReactionRemove, (reaction, user) => toggleReactionRole(reaction, user, false));

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await logEvent(member.guild.id, "member_join", `👋 **Member joined** — ${member.user?.tag ?? member.id}`);

    const { data } = await supabase
      .from("discord_autoroles")
      .select("role_id")
      .eq("guild_id", member.guild.id);
    for (const r of data ?? []) {
      await member.roles.add(r.role_id).catch((e) => console.error("[worker] autorole add failed:", e?.message ?? e));
    }
    if (data?.length) console.log(`[worker] applied ${data.length} autorole(s) to ${member.id}`);

    // GS Pro role: if the streamer configured one and this member's linked GS
    // account is Pro, grant it immediately (the cron reconciles everyone else).
    const { data: streamer } = await supabase
      .from("users")
      .select("discord_pro_role_id")
      .eq("discord_guild_id", member.guild.id)
      .maybeSingle();
    const proRoleId = streamer?.discord_pro_role_id;
    if (proRoleId) {
      const { data: acct } = await supabase
        .from("users")
        .select("subscription_tier, role")
        .eq("discord_id", member.id)
        .maybeSingle();
      const isPro = !!acct && (["staff", "admin"].includes(acct.role) || acct.subscription_tier === "pro");
      if (isPro) {
        await member.roles.add(proRoleId).catch((e) => console.error("[worker] pro-role add failed:", e?.message ?? e));
        console.log(`[worker] granted GS Pro role to ${member.id}`);
      }
    }
  } catch (err) {
    console.error("[worker] guildMemberAdd error:", err?.message ?? err);
  }
});

// --- Server logging -------------------------------------------------------
// Post message deletes/edits, joins/leaves, and role changes to the streamer's
// chosen log channel. Config is cached per guild (60s) so busy servers don't
// hit the DB on every message.
const LOG_CACHE_MS = 60_000;
const logCache = new Map(); // guildId → { config, expires }

async function getLogConfig(guildId) {
  const cached = logCache.get(guildId);
  if (cached && Date.now() < cached.expires) return cached.config;
  const { data } = await supabase
    .from("users")
    .select("discord_log_channel_id, discord_log_events")
    .eq("discord_guild_id", guildId)
    .maybeSingle();
  const config = data?.discord_log_channel_id
    ? { channelId: data.discord_log_channel_id, events: data.discord_log_events ?? {} }
    : null;
  logCache.set(guildId, { config, expires: Date.now() + LOG_CACHE_MS });
  return config;
}

const truncate = (s, n = 500) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? "");

async function logEvent(guildId, eventType, content) {
  if (!guildId) return;
  const config = await getLogConfig(guildId);
  if (!config) return;
  if (config.events[eventType] === false) return; // default ON unless explicitly off
  try {
    const channel = await client.channels.fetch(config.channelId);
    if (channel?.isTextBased?.()) {
      await channel.send({ content: truncate(content, 1900), allowedMentions: { parse: [] } });
    }
  } catch (err) {
    console.error("[worker] log post failed:", err?.message ?? err);
  }
}

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  const who = message.author ? message.author.tag : "unknown";
  const body = message.content ? `: ${truncate(message.content)}` : " _(content unavailable)_";
  await logEvent(message.guild.id, "message_delete", `🗑️ **Message deleted** in <#${message.channelId}> — **${who}**${body}`);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return; // ignore embed/pin-only updates
  const who = newMessage.author?.tag ?? "unknown";
  const before = oldMessage.content ? truncate(oldMessage.content) : "_(unavailable)_";
  await logEvent(
    newMessage.guild.id,
    "message_edit",
    `✏️ **Message edited** in <#${newMessage.channelId}> — **${who}**\n**Before:** ${before}\n**After:** ${truncate(newMessage.content)}`,
  );
});

client.on(Events.GuildMemberRemove, async (member) => {
  await logEvent(member.guild.id, "member_leave", `👋 **Member left** — ${member.user?.tag ?? member.id}`);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const before = new Set(oldMember.roles.cache.keys());
  const after = new Set(newMember.roles.cache.keys());
  const added = [...after].filter((r) => !before.has(r));
  const removed = [...before].filter((r) => !after.has(r));
  if (!added.length && !removed.length) return;
  const parts = [];
  if (added.length) parts.push(`added ${added.map((r) => `<@&${r}>`).join(" ")}`);
  if (removed.length) parts.push(`removed ${removed.map((r) => `<@&${r}>`).join(" ")}`);
  await logEvent(newMember.guild.id, "role_change", `🎭 **Roles changed** — ${newMember.user?.tag ?? newMember.id}: ${parts.join(", ")}`);
});

client.once(Events.ClientReady, (c) => {
  console.log(`[worker] ready as ${c.user.tag} — watching ${c.guilds.cache.size} guild(s)`);
});

client.on(Events.Error, (err) => console.error("[worker] client error:", err?.message ?? err));

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM — shutting down");
  client.destroy();
  process.exit(0);
});

client.login(DISCORD_BOT_TOKEN);
