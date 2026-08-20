/**
 * GameShuffle Discord gateway worker.
 *
 * The main app (Vercel) is HTTP-interactions only, so it can't receive the
 * Gateway events these features need. This always-on service holds the
 * WebSocket and handles:
 *   - Emoji REACTION roles   (MessageReactionAdd / Remove)  → discord_reaction_roles
 *   - Auto-assign on JOIN     (GuildMemberAdd)               → discord_autoroles
 *
 * It authenticates as the same bot (DISCORD_BOT_TOKEN) and reads config from
 * Supabase with the service-role key. Config is written by the Next app.
 *
 * Env: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Requires the "Server Members Intent" enabled in the Discord dev portal
 * (Bot → Privileged Gateway Intents) for join autorole.
 */

import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import { createClient } from "@supabase/supabase-js";

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
    GatewayIntentBits.GuildMembers, // privileged — for GuildMemberAdd (autorole)
    GatewayIntentBits.GuildMessageReactions,
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

/** Find the role mapped to a (message, emoji), tolerant of stored format. */
async function findReactionRole(messageId, emoji) {
  const { data, error } = await supabase
    .from("discord_reaction_roles")
    .select("role_id, emoji, guild_id")
    .eq("message_id", messageId);
  if (error || !data?.length) return null;
  const key = emojiKey(emoji);
  return (
    data.find((r) => r.emoji === key) ??
    (emoji.id ? data.find((r) => r.emoji.includes(`:${emoji.id}>`)) : data.find((r) => r.emoji === emoji.name)) ??
    null
  );
}

async function toggleReactionRole(reaction, user, add) {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    const row = await findReactionRole(reaction.message.id, reaction.emoji);
    if (!row) return;
    const guild = reaction.message.guild ?? (await client.guilds.fetch(row.guild_id));
    const member = await guild.members.fetch(user.id);
    if (add) await member.roles.add(row.role_id);
    else await member.roles.remove(row.role_id);
    console.log(`[worker] ${add ? "added" : "removed"} role ${row.role_id} for ${user.id}`);
  } catch (err) {
    console.error("[worker] reaction role error:", err?.message ?? err);
  }
}

client.on(Events.MessageReactionAdd, (reaction, user) => toggleReactionRole(reaction, user, true));
client.on(Events.MessageReactionRemove, (reaction, user) => toggleReactionRole(reaction, user, false));

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const { data } = await supabase
      .from("discord_autoroles")
      .select("role_id")
      .eq("guild_id", member.guild.id);
    for (const r of data ?? []) {
      await member.roles.add(r.role_id).catch((e) => console.error("[worker] autorole add failed:", e?.message ?? e));
    }
    if (data?.length) console.log(`[worker] applied ${data.length} autorole(s) to ${member.id}`);
  } catch (err) {
    console.error("[worker] guildMemberAdd error:", err?.message ?? err);
  }
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
