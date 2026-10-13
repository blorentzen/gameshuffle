import "server-only";

/**
 * Trivia on stream, in Discord: the streamer's servers that route the opt-in
 * `trivia` category get each question as it opens, with a live countdown and
 * answer buttons (one per choice) or an Answer button that opens a box. At the
 * reveal the post shows the answer and how many got it. Answers count in the
 * same scoreboard as Twitch chat and the live page.
 *
 * Who's who: a Discord user whose GameShuffle account has Twitch linked plays
 * as that Twitch account (the same player as in chat); an account without
 * Twitch plays as the site account (the same player as on /live); anyone else
 * plays as their Discord account.
 *
 * The current question's posts are kept on the game (`settings.discordPosts`)
 * so the reveal can edit them. Button handlers: src/lib/discord/commands/trivia.ts.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { postComponentsToCategory } from "@/lib/adapters/discord";
import { editComponentsMessage, type DiscordEmbed } from "@/lib/adapters/discord/adapter";
import { activityLive } from "@/lib/discord/activityLaunch";
import { questionOf, roundOf, type GameRow } from "./store";
import type { Viewer } from "./stream";

export const TRIVIA_PICK_PREFIX = "trivp:";
export const TRIVIA_ANSWER_PREFIX = "triva:";
export const TRIVIA_MODAL_PREFIX = "trivm:";

const SITE = "https://www.gameshuffle.co";
const COLOR = 0x4f46e5;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface DiscordPosts { round: number; question: number; posts: { messageId: string; channelId: string }[] }

/** `{gameId}:{round}:{question}`: which question a button belongs to, so a late tap on an old post can't answer the next one. */
export const questionRef = (g: GameRow) => `${g.id}:${g.round_index}:${g.question_index}`;

export function parseRef(rest: string): { gameId: string; round: number; question: number; tail: string } | null {
  const [gameId, round, question, ...tail] = rest.split(":");
  if (!/^[0-9a-f-]{36}$/i.test(gameId ?? "") || !/^\d+$/.test(round ?? "") || !/^\d+$/.test(question ?? "")) return null;
  return { gameId, round: Number(round), question: Number(question), tail: tail.join(":") };
}

export function questionEmbed(game: GameRow, opts: { revealed?: { answer: string; gotIt: number; answered: number } } = {}): DiscordEmbed {
  const round = roundOf(game);
  const q = questionOf(game);
  const n = round ? `${round.title} · question ${game.question_index + 1} of ${round.questions.length}` : "Trivia";
  const options = q?.kind === "choice" && q.options?.length ? `\n\n${q.options.map((o, i) => `**${LETTERS[i]}.** ${o}`).join("\n")}` : "";
  const closes = game.closes_at ? Math.floor(Date.parse(game.closes_at) / 1000) : null;
  const status = opts.revealed
    ? `\n\n✅ **${opts.revealed.answer}**. ${opts.revealed.gotIt} of ${opts.revealed.answered} got it.`
    : closes ? `\n\nTime's up <t:${closes}:R>. Answers stay hidden until the reveal.` : "";
  const picture = q?.imageUrl ? (q.imageUrl.startsWith("/") ? `${SITE}/api/trivia/pic/${game.code}?r=${game.round_index}&q=${game.question_index}` : q.imageUrl) : null;
  return {
    title: `❓ ${q?.prompt ?? "Trivia"}`.slice(0, 256),
    description: `${n}${options}${status}`.slice(0, 4000),
    color: opts.revealed ? 0x1f8a4c : COLOR,
    ...(picture && !opts.revealed ? { image: { url: picture } } : {}),
    footer: { text: `${game.title} · Trivia on stream · GameShuffle` },
  };
}

/** A green button that opens GameShuffle inside Discord on the Trivia tab (the same game, with the
 *  countdown, pictures and standings). `activity:` is ACTIVITY_PLAY_PREFIX (channelCard.ts, not
 *  imported here: it pulls in the card renderer). Gone when the Activity is switched off. */
function playAlongRow(label: string): unknown[] {
  return activityLive() ? [{ type: 1, components: [{ type: 2, style: 3, label, custom_id: "activity:trivia" }] }] : [];
}

export function questionButtons(game: GameRow): unknown[] {
  const q = questionOf(game);
  const ref = questionRef(game);
  if (q?.kind === "choice" && q.options?.length) {
    // Discord fits five buttons in a row.
    const buttons = q.options.slice(0, LETTERS.length).map((_, i) => ({ type: 2, style: 2, label: LETTERS[i], custom_id: `${TRIVIA_PICK_PREFIX}${ref}:${LETTERS[i]}` }));
    return [...[buttons.slice(0, 5), buttons.slice(5)].filter((row) => row.length).map((components) => ({ type: 1, components })), ...playAlongRow("Play along")];
  }
  return [{ type: 1, components: [{ type: 2, style: 1, label: "Answer", custom_id: `${TRIVIA_ANSWER_PREFIX}${ref}` }] }, ...playAlongRow("Play along")];
}

/** The question just opened: post it to every server routing `trivia`, and keep the posts for the reveal. */
export async function postQuestion(game: GameRow): Promise<number> {
  const r = await postComponentsToCategory({ ownerUserId: game.host_user_id, category: "trivia", requireRoute: true, embed: questionEmbed(game), components: questionButtons(game) });
  const posts: DiscordPosts = { round: game.round_index, question: game.question_index, posts: r.ok ? r.posts.map((p) => ({ messageId: p.messageId, channelId: p.channelId })) : [] };
  await createServiceClient().from("trivia_games").update({ settings: { ...(game.settings ?? {}), discordPosts: posts } }).eq("id", game.id);
  return posts.posts.length;
}

/** The reveal: every post for this question shows the answer, without buttons. */
export async function revealQuestion(game: GameRow, counts: { gotIt: number; answered: number }): Promise<void> {
  const posts = (game.settings as { discordPosts?: DiscordPosts } | null)?.discordPosts;
  const q = questionOf(game);
  if (!posts || !q || posts.round !== game.round_index || posts.question !== game.question_index) return;
  const embed = questionEmbed(game, { revealed: { answer: q.answer, ...counts } });
  await Promise.all(posts.posts.map((p) => editComponentsMessage({ channelId: p.channelId, messageId: p.messageId, embeds: [embed], components: [] })
    .catch((err) => console.error("[trivia/discord] reveal edit failed:", err))));
}

/** The final standings, to the same channels. */
export async function postFinal(game: GameRow, standings: { name: string; score: number }[]): Promise<void> {
  const [first, ...rest] = standings;
  await postComponentsToCategory({
    ownerUserId: game.host_user_id, category: "trivia", requireRoute: true,
    embed: {
      title: "🏆 Trivia's over!",
      description: first
        ? `**${first.name}** wins with ${first.score} point${first.score === 1 ? "" : "s"}.${rest.length ? `\n\n${rest.slice(0, 4).map((s, i) => `${i + 2}. ${s.name} · ${s.score}`).join("\n")}` : ""}`
        : "Thanks for playing!",
      color: 0xb7791f,
      footer: { text: `${game.title} · Trivia on stream · GameShuffle` },
    },
    components: playAlongRow("Play more trivia"),
  }).catch((err) => console.error("[trivia/discord] final post failed:", err));
}

/** Who a Discord user plays as (see the file comment). */
export async function viewerForDiscord(user: { id: string; name: string }): Promise<Viewer> {
  const { data } = await createServiceClient().from("users").select("id, twitch_id").eq("discord_id", user.id).maybeSingle();
  const row = data as { id: string; twitch_id: string | null } | null;
  if (row?.twitch_id) return { platform: "twitch", id: row.twitch_id, name: user.name };
  if (row?.id) return { platform: "site", id: row.id, name: user.name };
  return { platform: "discord", id: user.id, name: user.name };
}
