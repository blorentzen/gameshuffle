/**
 * Trivia on stream, answered in Discord (posts from src/lib/trivia/discord.ts).
 *
 *   choice button   custom_id `trivp:{gameId}:{round}:{question}:{letter}` → that answer
 *   Answer button   custom_id `triva:{gameId}:{round}:{question}` → a one-line form
 *   form submit     custom_id `trivm:{gameId}:{round}:{question}` → that answer
 *
 * Replies are just for the person who tapped. Answers can change until the
 * question locks, like in chat; the post itself shows nobody's answer.
 */

import { ANSWER_MAX } from "@/lib/trivia/rules";
import { getGame, isStreamGame, questionOf, type GameRow } from "@/lib/trivia/store";
import { answerFromWeb } from "@/lib/trivia/stream";
import { TRIVIA_ANSWER_PREFIX, TRIVIA_MODAL_PREFIX, TRIVIA_PICK_PREFIX, parseRef, viewerForDiscord } from "@/lib/trivia/discord";
import { interactionName } from "@/lib/discord/promptPosts";
import { ephemeralMessage } from "../respond";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function callerId(interaction: Record<string, unknown>): string | null {
  const member = interaction.member as { user?: { id: string } } | undefined;
  return member?.user?.id ?? (interaction.user as { id: string } | undefined)?.id ?? null;
}

/** The game a button belongs to, if that question is still the one in play. */
async function questionInPlay(rest: string): Promise<{ game: GameRow } | { error: string }> {
  const ref = parseRef(rest);
  if (!ref) return { error: "That button doesn't work any more." };
  const game = await getGame(ref.gameId);
  if (!game || !isStreamGame(game) || game.status !== "live") return { error: "This trivia night has ended." };
  if (game.round_index !== ref.round || game.question_index !== ref.question) return { error: "That question has moved on. Catch the next one!" };
  if (game.phase !== "question") return { error: "Time's up for that one. Catch the next question!" };
  return { game };
}

async function save(interaction: Record<string, unknown>, game: GameRow, raw: string, shown: string): Promise<Response> {
  const id = callerId(interaction);
  if (!id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  const viewer = await viewerForDiscord({ id, name: interactionName(interaction) });
  const r = await answerFromWeb(game, viewer, raw);
  if (r.ok) return ephemeralMessage(`Locked in: **${shown}**. You can change it until time's up.`);
  return ephemeralMessage(r.error === "closed" ? "Time's up for that one. Catch the next question!" : "Couldn't save that. Try again.");
}

export async function handleTriviaPick(interaction: Record<string, unknown>): Promise<Response> {
  const rest = (interaction.data as { custom_id: string }).custom_id.slice(TRIVIA_PICK_PREFIX.length);
  const found = await questionInPlay(rest);
  if ("error" in found) return ephemeralMessage(found.error);
  const letter = rest.split(":").pop() ?? "";
  const q = questionOf(found.game);
  const i = LETTERS.indexOf(letter);
  if (i < 0 || !q?.options?.[i]) return ephemeralMessage("That button doesn't work any more.");
  return save(interaction, found.game, letter, `${letter}. ${q.options[i]}`);
}

export async function handleTriviaAnswerButton(interaction: Record<string, unknown>): Promise<Response> {
  const rest = (interaction.data as { custom_id: string }).custom_id.slice(TRIVIA_ANSWER_PREFIX.length);
  const found = await questionInPlay(rest);
  if ("error" in found) return ephemeralMessage(found.error);
  const prompt = questionOf(found.game)?.prompt ?? "";
  // Labels cap at 45 characters and placeholders at 100: a long question rides in the placeholder.
  const label = prompt.length <= 45 ? prompt : "Your answer";
  const placeholder = prompt.length <= 45 ? "Your answer" : prompt.length <= 100 ? prompt : `${prompt.slice(0, 99)}…`;
  return Response.json({
    type: 9,
    data: {
      custom_id: `${TRIVIA_MODAL_PREFIX}${rest}`,
      title: "Trivia",
      components: [{ type: 1, components: [{ type: 4, custom_id: "answer", style: 1, label, placeholder, min_length: 1, max_length: Math.min(ANSWER_MAX, 100), required: true }] }],
    },
  });
}

/** The text input's value from a modal submit (classic rows or newer label components). */
function modalValue(data: { components?: unknown[] }, id: string): string {
  for (const c of (data.components ?? []) as { components?: { custom_id?: string; value?: string }[]; component?: { custom_id?: string; value?: string } }[]) {
    for (const inner of [...(c.components ?? []), ...(c.component ? [c.component] : [])]) {
      if (inner.custom_id === id) return inner.value ?? "";
    }
  }
  return "";
}

export async function handleTriviaModalSubmit(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { custom_id: string; components?: unknown[] };
  const found = await questionInPlay(data.custom_id.slice(TRIVIA_MODAL_PREFIX.length));
  if ("error" in found) return ephemeralMessage(found.error);
  const raw = modalValue(data, "answer").trim().slice(0, ANSWER_MAX);
  if (!raw) return ephemeralMessage("That answer was empty. Tap Answer to try again.");
  return save(interaction, found.game, raw, raw);
}
