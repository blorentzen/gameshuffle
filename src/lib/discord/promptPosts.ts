/**
 * Who has answered, on the bot's own posts (server only).
 *
 * When the bot posts a Chat Brain question or the Weekly card in a server, the
 * message is kept (discord_prompt_posts). When someone in that server answers
 * (the post's buttons, the Weekly form, or the Activity launched there), they
 * are noted for that server (discord_prompt_answerers) and every post of that
 * question in the server is edited to show a live line: "12 answered here:
 * Sam, Riley, Jordan and 9 more". Names only, never answers.
 *
 * The Weekly's survey question is a Chat Brain question, so both use the same
 * topic (prompt:<id>:<edition>) and one answer shows on both kinds of post. A
 * person is their account when they have one (u:<id>), so answering the Weekly
 * on Discord and the question in the Activity is still one name.
 *
 * Best effort: missing tables (supabase/discord-prompt-posts-m1.sql not run
 * yet) or a failed edit never reach the player.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { editComponentsMessage } from "@/lib/adapters/discord/adapter";
import { personKeys, type AnswerIdentity } from "@/lib/chatbrain/store";

const MISSING = new Set(["42P01", "PGRST205"]);
let warned = false;
function missingTables(err: { code?: string } | null): boolean {
  if (!err?.code || !MISSING.has(err.code)) return false;
  if (!warned) { console.warn("[promptPosts] tables missing: run supabase/discord-prompt-posts-m1.sql"); warned = true; }
  return true;
}

/** How many names the line shows before "and N more". */
const NAMES_SHOWN = 6;
/** Posts older than this aren't edited any more. */
const POST_WINDOW_DAYS = 14;

export interface AnsweredHere { count: number; names: string[] }

/** "Sam, Riley, Jordan and 9 more": the names half of the line. */
export function answeredNames(a: AnsweredHere): string {
  const more = a.count - a.names.length;
  return more > 0 ? `${a.names.join(", ")} and ${more} more` : a.names.join(", ");
}

/** The topic for a Chat Brain question's current edition. */
export async function promptTopic(promptId: string): Promise<string> {
  const { data } = await createServiceClient().from("brain_prompts").select("edition").eq("id", promptId).maybeSingle();
  return `prompt:${promptId}:${(data as { edition: number } | null)?.edition ?? 1}`;
}

/** The topic for a Weekly: its Chat Brain question on survey weeks, else the week itself. */
export async function weekTopic(week: { kind?: string | null; prompt_id?: string | null; week_start: string }): Promise<string> {
  return week.kind === "survey" && week.prompt_id ? promptTopic(week.prompt_id) : `week:${week.week_start}`;
}

/** One person, whichever way they answered: their account if they have one. */
export async function personFor(who: AnswerIdentity): Promise<string | null> {
  if ("userId" in who) return `u:${who.userId}`;
  if (!("identityId" in who)) return null;
  const keys = await personKeys(who).catch(() => null);
  return keys?.userId ? `u:${keys.userId}` : `i:${who.identityId}`;
}

/** The name to show for whoever sent a Discord interaction: server nickname, then display name, then username. */
export function interactionName(interaction: Record<string, unknown>): string {
  const member = interaction.member as { nick?: string | null; user?: { global_name?: string | null; username?: string } } | undefined;
  const user = (member?.user ?? interaction.user) as { global_name?: string | null; username?: string } | undefined;
  return (member?.nick || user?.global_name || user?.username || "A player").slice(0, 80);
}

export interface PromptPost {
  messageId: string;
  channelId: string;
  guildId: string;
  topic: string;
  kind: "brain" | "weekly";
  /** The prompt id (brain) or the week's start date (weekly). */
  ref: string;
  /** What the post was built with: { text, header } for brain, { footerLine, showPlayers } for weekly. */
  payload?: Record<string, unknown>;
}

export async function recordPromptPost(post: PromptPost): Promise<void> {
  const { error } = await createServiceClient().from("discord_prompt_posts").upsert({
    message_id: post.messageId, channel_id: post.channelId, guild_id: post.guildId,
    topic: post.topic, kind: post.kind, ref: post.ref, payload: post.payload ?? {},
  }, { onConflict: "message_id", ignoreDuplicates: true });
  if (error && !missingTables(error)) console.warn("[promptPosts] post not recorded:", error.message);
}

/**
 * Records the bot's reply to a slash command (a manager posting /gs-brain or
 * /gs-weekly publicly). The reply's message id only exists once Discord has it,
 * so call this after the response.
 */
export async function recordInteractionPost(interaction: Record<string, unknown>, post: Omit<PromptPost, "messageId" | "channelId" | "guildId">): Promise<void> {
  const appId = interaction.application_id as string | undefined;
  const token = interaction.token as string | undefined;
  const guildId = interaction.guild_id as string | undefined;
  if (!appId || !token || !guildId) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`).catch(() => null);
    if (res?.ok) {
      const msg = (await res.json().catch(() => null)) as { id?: string; channel_id?: string } | null;
      if (msg?.id && msg.channel_id) await recordPromptPost({ ...post, messageId: msg.id, channelId: msg.channel_id, guildId });
      return;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function answeredHere(guildId: string, topic: string): Promise<AnsweredHere | null> {
  const { data, count, error } = await createServiceClient().from("discord_prompt_answerers")
    .select("display_name", { count: "exact" }).eq("guild_id", guildId).eq("topic", topic)
    .order("answered_at", { ascending: true }).limit(NAMES_SHOWN);
  if (error) { missingTables(error); return null; }
  return count ? { count, names: ((data ?? []) as { display_name: string }[]).map((r) => r.display_name) } : null;
}

/** Notes that someone in this server answered, then refreshes that question's posts there. */
export async function noteAnswer(args: { guildId: string | null | undefined; topic: string; person: string | null; name: string }): Promise<void> {
  if (!args.guildId || !args.person) return;
  const { error } = await createServiceClient().from("discord_prompt_answerers").upsert(
    { guild_id: args.guildId, topic: args.topic, person: args.person, display_name: args.name.slice(0, 80) || "A player" },
    { onConflict: "guild_id,topic,person", ignoreDuplicates: true },
  );
  if (error) { if (!missingTables(error)) console.warn("[promptPosts] answer not noted:", error.message); return; }
  await refreshPosts(args.guildId, args.topic);
}

/** Rebuilds every recent post of a topic in a server with the current "answered here" line. */
export async function refreshPosts(guildId: string, topic: string): Promise<void> {
  const svc = createServiceClient();
  const since = new Date(Date.now() - POST_WINDOW_DAYS * 864e5).toISOString();
  const { data, error } = await svc.from("discord_prompt_posts").select("message_id, channel_id, kind, ref, payload")
    .eq("guild_id", guildId).eq("topic", topic).gte("created_at", since).order("created_at", { ascending: false }).limit(10);
  if (error) { missingTables(error); return; }
  const posts = (data ?? []) as { message_id: string; channel_id: string; kind: "brain" | "weekly"; ref: string; payload: Record<string, unknown> }[];
  if (!posts.length) return;
  const answered = await answeredHere(guildId, topic);
  for (const post of posts) {
    const message = await buildPost(post, answered).catch(() => null);
    if (!message) continue;
    const r = await editComponentsMessage({ channelId: post.channel_id, messageId: post.message_id, embeds: message.embeds, components: message.components });
    // Someone deleted the post (or the bot lost the channel): stop editing it.
    if (!r.ok && /^(403|404):/.test(r.error)) await svc.from("discord_prompt_posts").delete().eq("message_id", post.message_id);
  }
}

async function buildPost(post: { kind: "brain" | "weekly"; ref: string; payload: Record<string, unknown> }, answered: AnsweredHere | null) {
  if (post.kind === "brain") {
    // Imported here: the command modules import this one.
    const { brainQuestionMessage } = await import("@/lib/discord/commands/chatbrain");
    const text = typeof post.payload.text === "string" ? post.payload.text : null;
    if (!text) return null;
    return brainQuestionMessage({ id: post.ref, text }, { title: typeof post.payload.header === "string" ? post.payload.header : undefined, answered });
  }
  const [{ weeklyCardMessage }, { getWeek, countEntries }] = await Promise.all([import("@/lib/discord/commands/weekly"), import("@/lib/weekly/store")]);
  const week = await getWeek(post.ref);
  if (!week) return null;
  return weeklyCardMessage(week, {
    players: post.payload.showPlayers ? await countEntries(week.week_start) : undefined,
    footerLine: typeof post.payload.footerLine === "string" ? post.payload.footerLine : null,
    answered,
  });
}
