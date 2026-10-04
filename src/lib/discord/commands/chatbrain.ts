/**
 * Chat Brain in Discord: the fastest place to seed boards.
 *
 *   /gs-brain [category]   server managers post an open question to the channel;
 *                          anyone else gets one just for them (ephemeral)
 *   Answer button          custom_id `brain:{promptId}` → a one-line form
 *   form submit            custom_id `brainm:{promptId}` → brain_answers,
 *                          source `discord`, one per Discord account (gs_identity)
 *   Answer another         custom_id `brainnext:{category}` → the next question
 *                          this person hasn't answered, just for them
 *
 * The daily post (/api/cron/chat-brain-discord) uses the same message. Free for
 * every server: answers are what make boards. Individual answers are never
 * shown back in Discord, only that yours was saved.
 */

import { resolveIdentity } from "@/lib/economy/identity";
import { MAX_ANSWER_LENGTH, sameLine } from "@/lib/chatbrain/rules";
import { ChatBrainNotReady, getPublicPrompt, hasAnswered, listOpenPrompts, promptNeedingAnswers, submitAnswer } from "@/lib/chatbrain/store";
import type { DiscordEmbed } from "@/lib/adapters/discord/adapter";
import { ephemeralMessage } from "../respond";

export const BRAIN_ANSWER_PREFIX = "brain:";
export const BRAIN_MODAL_PREFIX = "brainm:";
export const BRAIN_NEXT_PREFIX = "brainnext:";

const SITE = "https://www.gameshuffle.co";
const COLOR = 0x4f46e5;
const MANAGE_GUILD = BigInt(32);
const ADMINISTRATOR = BigInt(8);
const ZERO = BigInt(0);

interface DiscordUser { id: string; username?: string; global_name?: string | null }

function callerFrom(interaction: Record<string, unknown>): DiscordUser | null {
  const member = interaction.member as { user?: DiscordUser } | undefined;
  return member?.user ?? (interaction.user as DiscordUser | undefined) ?? null;
}

function canManage(interaction: Record<string, unknown>): boolean {
  const perms = (interaction.member as { permissions?: string } | undefined)?.permissions;
  if (!perms) return false;
  try {
    const bits = BigInt(perms);
    return (bits & MANAGE_GUILD) !== ZERO || (bits & ADMINISTRATOR) !== ZERO;
  } catch {
    return false;
  }
}

async function identityFor(user: DiscordUser): Promise<string> {
  const r = await resolveIdentity({ platform: "discord", platformId: user.id, displayName: user.global_name ?? user.username ?? null });
  return r.identityId;
}

function moreLink(): string {
  return `${SITE}/chat-brain?src=discord`;
}

/** The question card: embed + an Answer button + a link to more questions. */
export function brainQuestionMessage(prompt: { id: string; text: string }, opts: { title?: string } = {}): { embeds: DiscordEmbed[]; components: unknown[] } {
  return {
    embeds: [{
      title: opts.title ?? "Chat Brain",
      description: `**${prompt.text}**\n\nTap **Answer** and say the first thing that comes to mind. Once enough people answer, the top answers become a board you can play on GameShuffle.`,
      color: COLOR,
      footer: { text: "Chat Brain · a GameShuffle Original" },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: "Answer", custom_id: `${BRAIN_ANSWER_PREFIX}${prompt.id}` },
        { type: 2, style: 5, label: "More questions", url: moreLink() },
      ],
    }],
  };
}

function reply(data: Record<string, unknown>, ephemeral: boolean): Response {
  return Response.json({ type: 4, data: { ...data, allowed_mentions: { parse: [] }, ...(ephemeral ? { flags: 64 } : {}) } });
}

/** The next question this person hasn't answered, as a message just for them. */
async function personalQuestion(user: DiscordUser, category: string | null): Promise<Response> {
  const identityId = await identityFor(user);
  const open = await listOpenPrompts({ category, who: { identityId }, limit: 20 });
  const next = open.find((p) => !p.answered && p.familySafe);
  if (!next) {
    return ephemeralMessage(`You've answered every open question${category ? " in that category" : ""}. New ones arrive often, or play the finished boards: ${moreLink()}`);
  }
  return reply(brainQuestionMessage(next), true);
}

export async function handleGsBrain(interaction: Record<string, unknown>): Promise<Response> {
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  const opts = ((interaction.data as { options?: { name: string; value?: string }[] }).options ?? []);
  const category = (opts.find((o) => o.name === "category")?.value as string | undefined) || null;
  try {
    if (interaction.guild_id && canManage(interaction)) {
      const prompt = await promptNeedingAnswers({ category });
      if (!prompt) return ephemeralMessage("No questions are open right now. Check back soon.");
      return reply(brainQuestionMessage(prompt), false);
    }
    return await personalQuestion(user, category);
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return ephemeralMessage("Chat Brain isn't open yet. Check back soon.");
    throw err;
  }
}

/** Answer button → the one-line form (or a note if it's closed or already answered). */
export async function handleBrainAnswerButton(interaction: Record<string, unknown>): Promise<Response> {
  const promptId = (interaction.data as { custom_id: string }).custom_id.slice(BRAIN_ANSWER_PREFIX.length);
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  const prompt = await getPublicPrompt(promptId);
  if (!prompt?.open) return nextButtons("This question has closed. Try another one.", prompt?.category ?? null);
  if (await hasAnswered(promptId, { identityId: await identityFor(user) })) {
    return nextButtons("You already answered this one.", prompt.category);
  }
  // Labels cap at 45 characters and placeholders at 100, so a long question
  // rides in the placeholder (the card behind the form shows it in full).
  const label = prompt.text.length <= 45 ? prompt.text : "Your answer";
  const placeholder = prompt.text.length <= 45 ? "First thing that comes to mind" : prompt.text.length <= 100 ? prompt.text : `${prompt.text.slice(0, 99)}…`;
  return Response.json({
    type: 9,
    data: {
      custom_id: `${BRAIN_MODAL_PREFIX}${promptId}`,
      title: "Chat Brain",
      components: [{
        type: 1,
        components: [{ type: 4, custom_id: "answer", style: 1, label, placeholder, min_length: 1, max_length: MAX_ANSWER_LENGTH, required: true }],
      }],
    },
  });
}

/** A short note plus "Answer another" (just for them) and the site link. */
function nextButtons(text: string, category: string | null): Response {
  return reply({
    content: text,
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: "Answer another", custom_id: `${BRAIN_NEXT_PREFIX}${category ?? ""}` },
        { type: 2, style: 5, label: "Play Chat Brain", url: moreLink() },
      ],
    }],
  }, true);
}

/** Pull the text input's value from a modal submit (classic rows or newer label components). */
function modalValue(data: { components?: unknown[] }, id: string): string {
  for (const c of (data.components ?? []) as { components?: { custom_id?: string; value?: string }[]; component?: { custom_id?: string; value?: string } }[]) {
    for (const inner of [...(c.components ?? []), ...(c.component ? [c.component] : [])]) {
      if (inner.custom_id === id) return inner.value ?? "";
    }
  }
  return "";
}

export async function handleBrainModalSubmit(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { custom_id: string; components?: unknown[] };
  const promptId = data.custom_id.slice(BRAIN_MODAL_PREFIX.length);
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  const raw = modalValue(data, "answer");
  const prompt = await getPublicPrompt(promptId);
  const result = await submitAnswer({ promptId, raw, who: { identityId: await identityFor(user) }, source: "discord" });
  if (result.ok) return nextButtons(`Got it: **${raw.trim().slice(0, MAX_ANSWER_LENGTH)}**. ${sameLine(result.same)} Once enough people answer, the board goes up on GameShuffle.`, prompt?.category ?? null);
  const why: Record<string, string> = {
    empty: "That answer was empty. Tap Answer to try again.",
    too_long: `Keep it short: ${MAX_ANSWER_LENGTH} characters or less.`,
    blocked: "That answer isn't allowed here. Tap Answer to try a different one.",
    closed: "This question closed before your answer arrived.",
    not_found: "This question closed before your answer arrived.",
    already_answered: "You already answered this one.",
  };
  return nextButtons(why[result.error] ?? "Couldn't save your answer. Try again in a moment.", prompt?.category ?? null);
}

export async function handleBrainNext(interaction: Record<string, unknown>): Promise<Response> {
  const category = (interaction.data as { custom_id: string }).custom_id.slice(BRAIN_NEXT_PREFIX.length) || null;
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  try {
    return await personalQuestion(user, category);
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return ephemeralMessage("Chat Brain isn't open yet. Check back soon.");
    throw err;
  }
}
