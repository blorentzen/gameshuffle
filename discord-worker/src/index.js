/**
 * GameShuffle Discord gateway worker.
 *
 * The main app (Vercel) is HTTP-interactions only, so it can't receive the
 * Gateway events these features need. This always-on service holds the
 * WebSocket and handles:
 *   - Emoji REACTION roles   (MessageReactionAdd / Remove)  → discord_reaction_roles
 *   - Auto-assign on JOIN     (GuildMemberAdd)               → discord_autoroles
 *   - Server LOGGING          (message delete/edit, member join/leave, role
 *                              change) → discord_guilds.log_channel_id/_events
 *   - Server removed / re-added (GuildDelete / GuildCreate) → discord_guilds.removed_at
 *   - Races typed in a war's channel, as GameShuffle Competitive (a second connection, off until its env is set)
 *
 * Each server's settings live on its discord_guilds row (one account per
 * server, up to 5 with GS Pro). Logging, the Pro role and autoroles are GS Pro
 * tools: they run only while the server's owner has Pro (an account without
 * Pro keeps only its main server, and that server's Pro tools pause).
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

// --- Per-server settings ---------------------------------------------------
// One row per server in discord_guilds, cached per server (60s) so busy
// servers don't hit the DB on every event.
const SERVER_CACHE_MS = 60_000;
const serverCache = new Map(); // guildId → { config, expires }

/** Same rule as effectiveTier() in the app (src/lib/subscription.ts): staff,
 *  admin and beta roles, a Pro subscription (legacy member/creator too), or an
 *  active Circuit 256, which bundles Pro. */
function isProRow(acct) {
  return !!acct && (
    ["staff", "admin", "beta"].includes(acct.role)
    || ["pro", "member", "creator"].includes(acct.subscription_tier)
    || (acct.circuit_tier === "circuit_256" && ["trialing", "active", "past_due"].includes(acct.circuit_status))
  );
}

/** The server's settings, and whether its Pro tools are on (connected + the owner has Pro). */
async function serverConfig(guildId) {
  const cached = serverCache.get(guildId);
  if (cached && Date.now() < cached.expires) return cached.config;
  const { data: row } = await supabase
    .from("discord_guilds")
    .select("owner_user_id, removed_at, pro_role_id, log_channel_id, log_events")
    .eq("guild_id", guildId)
    .maybeSingle();
  let config = null;
  if (row && !row.removed_at) {
    const { data: owner } = await supabase
      .from("users")
      .select("subscription_tier, role, circuit_tier, circuit_status")
      .eq("id", row.owner_user_id)
      .maybeSingle();
    config = {
      proTools: isProRow(owner),
      proRoleId: row.pro_role_id ?? null,
      log: row.log_channel_id ? { channelId: row.log_channel_id, events: row.log_events ?? {} } : null,
    };
  }
  serverCache.set(guildId, { config, expires: Date.now() + SERVER_CACHE_MS });
  return config;
}

// The bot was removed from a server (not an outage: those arrive with
// available === false), or added back: keep discord_guilds.removed_at in step
// so the Discord Bot tab can say so.
client.on(Events.GuildDelete, async (guild) => {
  if (guild.available === false) return;
  serverCache.delete(guild.id);
  const { error } = await supabase.from("discord_guilds").update({ removed_at: new Date().toISOString() }).eq("guild_id", guild.id).is("removed_at", null);
  if (error) console.error("[worker] marking server removed failed:", error.message);
  else console.log(`[worker] bot removed from server ${guild.id}`);
});

client.on(Events.GuildCreate, async (guild) => {
  serverCache.delete(guild.id);
  const { error } = await supabase.from("discord_guilds").update({ removed_at: null, guild_name: guild.name }).eq("guild_id", guild.id).not("removed_at", "is", null);
  if (error) console.error("[worker] marking server back failed:", error.message);
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await logEvent(member.guild.id, "member_join", `👋 **Member joined** — ${member.user?.tag ?? member.id}`);

    const server = await serverConfig(member.guild.id);
    if (!server?.proTools) return; // autoroles and the Pro role are GS Pro tools

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
    const proRoleId = server.proRoleId;
    if (proRoleId) {
      const { data: acct } = await supabase
        .from("users")
        .select("subscription_tier, role, circuit_tier, circuit_status")
        .eq("discord_id", member.id)
        .maybeSingle();
      if (isProRow(acct)) {
        await member.roles.add(proRoleId).catch((e) => console.error("[worker] pro-role add failed:", e?.message ?? e));
        console.log(`[worker] granted GS Pro role to ${member.id}`);
      }
    }
  } catch (err) {
    console.error("[worker] guildMemberAdd error:", err?.message ?? err);
  }
});

// --- Server logging -------------------------------------------------------
// Post message deletes/edits, joins/leaves, and role changes to the server's
// chosen log channel (serverConfig, cached 60s).
async function getLogConfig(guildId) {
  const server = await serverConfig(guildId);
  return server?.proTools ? server.log : null;
}

const truncate = (s, n = 500) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? "");

async function logEvent(guildId, eventType, content) {
  if (!guildId) return;
  const config = await getLogConfig(guildId);
  if (!config) return;
  if (config.events[eventType] === false) return; // default ON unless explicitly off
  try {
    const channel = await client.channels.fetch(config.channelId);
    // Never post one server's logs into another server's channel.
    if (channel?.guildId !== guildId) return;
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

/**
 * Fail loudly, in one line.
 *
 * Three different channels can kill this process and each used to print a raw
 * stack (or nothing useful) into the Railway log:
 *   - a bad token REJECTS the login promise,
 *   - disallowed intents are THROWN from the shard's close handler, which
 *     arrives as an uncaughtException and never touches login's .catch(),
 *   - anything else async that escapes a handler is an unhandledRejection.
 * All three exit(1) on purpose: the worker should die so Railway restarts it,
 * but the log has to say why.
 */
function fatal(where, err) {
  const code = err?.code ? ` [${err.code}]` : "";
  console.error(`[worker] FATAL (${where})${code}: ${err?.message ?? err}`);
  if (/disallowed intents/i.test(String(err?.message ?? err))) {
    console.error(
      "[worker] This bot asks for the SERVER MEMBERS and MESSAGE CONTENT " +
      "privileged intents. Enable both in the Discord developer portal " +
      "(Applications -> Bot -> Privileged Gateway Intents). The token is fine " +
      "if you are seeing this: Discord only checks intents after it authenticates.",
    );
  }
  if (/invalid token/i.test(String(err?.message ?? err))) {
    console.error("[worker] DISCORD_BOT_TOKEN is wrong or stale. If the token was rotated, update it here too.");
  }
  process.exit(1);
}

process.on("uncaughtException", (err) => fatal("uncaughtException", err));
process.on("unhandledRejection", (err) => fatal("unhandledRejection", err));

client.login(DISCORD_BOT_TOKEN).catch((err) => fatal("login", err));

/**
 * GameShuffle Competitive: races typed in a war's channel (overrides picks 2026-11-09). A second connection, as the
 * Competitive app, that reads plain messages ONLY in channels with a war going (the list is refreshed from the
 * database every 30 seconds, so nothing else is looked at) and passes short ones to the site, which reads them the
 * way /race does and says what to do: a check mark, a short reply, or nothing.
 *
 * Off unless all three are set: DISCORD_COMP_BOT_TOKEN (the Competitive app's bot token), GS_ORIGIN
 * (https://www.gameshuffle.co) and WARS_TYPED_SECRET (the same value as on Vercel). The Competitive app needs the
 * Message Content intent turned on (Developer Portal → Bot → Privileged Gateway Intents).
 */
const { DISCORD_COMP_BOT_TOKEN, GS_ORIGIN, WARS_TYPED_SECRET } = process.env;
if (DISCORD_COMP_BOT_TOKEN && GS_ORIGIN && WARS_TYPED_SECRET) {
  const comp = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });
  /** Channels with a war going: live, or finished in the last 6 hours (fixes and back after the last race). */
  let warChannels = new Set();
  let warChannelsAt = 0;
  async function channelsWithWars() {
    if (Date.now() - warChannelsAt < 30_000) return warChannels;
    warChannelsAt = Date.now();
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data, error } = await supabase.from("wars").select("channel_id, status, updated_at").or(`status.eq.live,and(status.eq.done,updated_at.gte.${since})`).limit(500);
    if (!error) warChannels = new Set((data ?? []).map((r) => r.channel_id));
    return warChannels;
  }
  comp.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author?.bot || !message.guildId || !message.content) return;
      const text = message.content.trim();
      if (text.length > 60 || text.includes("\n")) return;
      if (!(await channelsWithWars()).has(message.channelId)) return;
      const res = await fetch(`${GS_ORIGIN}/api/discord/comp/typed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-typed-secret": WARS_TYPED_SECRET },
        body: JSON.stringify({ guildId: message.guildId, channelId: message.channelId, authorId: message.author.id, authorName: message.member?.displayName ?? message.author.globalName ?? message.author.username, content: text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const out = await res.json();
      if (out.action === "react" || out.action === "react_reply") await message.react(out.emoji ?? "✅").catch(() => {});
      if ((out.action === "reply" || out.action === "react_reply") && out.text) {
        await message.reply({ content: String(out.text).slice(0, 300), allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});
      }
    } catch (err) {
      console.error("[worker] typed race failed:", err?.message ?? err);
    }
  });
  comp.once(Events.ClientReady, (c) => console.log(`[worker] Competitive ready as ${c.user.tag}: reading typed races in war channels`));
  comp.on(Events.Error, (err) => console.error("[worker] Competitive client error:", err?.message ?? err));
  // A problem with the Competitive connection never stops the main bot's work: it's logged and left off. Discord
  // throws a missing intent from deep inside the connection (it would reach fatal() above and take the whole worker
  // down), so the app's Message Content setting is checked first and the connection only opens when it's on.
  const MESSAGE_CONTENT = (1 << 18) | (1 << 19);
  fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${DISCORD_COMP_BOT_TOKEN}` }, signal: AbortSignal.timeout(8000) })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Discord said ${r.status} for the Competitive token`);
      const app = await r.json();
      if (!((app.flags ?? 0) & MESSAGE_CONTENT)) {
        console.error("[worker] typed races stay off: turn on Message Content for GameShuffle Competitive (Developer Portal -> Bot -> Privileged Gateway Intents)");
        return;
      }
      await comp.login(DISCORD_COMP_BOT_TOKEN);
    })
    .catch((err) => console.error(`[worker] Competitive login failed, typed races stay off: ${err?.message ?? err}`));
} else {
  console.log("[worker] typed races off (set DISCORD_COMP_BOT_TOKEN, GS_ORIGIN and WARS_TYPED_SECRET to read them)");
}
