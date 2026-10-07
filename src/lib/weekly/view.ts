/**
 * What the Weekly Challenge page shows, and saving a play (server only).
 * Shared by /api/weekly (the site) and /api/activity/weekly (the Discord
 * Activity), so both read and save exactly the same way.
 */

import "server-only";
import { addWeeks, revealAt, scorePredictions, weekNumber, weekOf } from "@/lib/originals/weekly";
import { agendaCard, countEntries, ensureWeek, getEntry, getWeek, leaderboard, revealDue, saveBallot, saveSurvey } from "@/lib/weekly/store";
import { personAnswer } from "@/lib/chatbrain/store";

/** This week (and your play, if signed in) plus last week's reveal. Also reveals last week if nobody has yet. */
export async function weeklyView(userId: string | null) {
  await revealDue().catch((err) => console.error("[weekly] reveal failed:", err));
  const thisWeek = weekOf();
  const week = await ensureWeek(thisWeek);
  const agenda = agendaCard(week.agenda_card_id);
  const mine = userId ? await getEntry(thisWeek, userId) : null;
  // The week's question is also an open Chat Brain question: an answer given
  // there (on Discord, say) prefills the Weekly, since it's the same one answer.
  const answeredInBrain = userId && week.kind === "survey" && week.prompt_id && !mine?.answer
    ? (await personAnswer(week.prompt_id, { userId }).catch(() => null))?.raw ?? null
    : null;
  const lastWeek = addWeeks(thisWeek, -1);
  const last = await getWeek(lastWeek);
  const lastMine = userId && last?.status === "revealed" ? await getEntry(lastWeek, userId) : null;
  return {
    current: {
      week: thisWeek,
      number: weekNumber(thisWeek),
      kind: week.kind ?? "tier",
      title: week.title,
      items: week.items,
      agenda: agenda ? { title: agenda.title, text: agenda.text } : null,
      players: await countEntries(thisWeek),
      revealAt: revealAt(thisWeek),
      myBallot: mine?.ballot ?? null,
      myAnswer: mine?.answer ?? null,
      myPredictions: mine?.predictions ?? null,
      answeredInBrain,
    },
    last: last?.status === "revealed" ? {
      week: lastWeek,
      number: weekNumber(lastWeek),
      kind: last.kind ?? "tier",
      surveyBoard: last.board ?? null,
      title: last.title,
      items: last.items,
      crowd: last.crowd ?? {},
      players: last.players,
      board: await leaderboard(lastWeek, 25),
      me: lastMine ? {
        rank: lastMine.rank, total: lastMine.total, tierScore: lastMine.tier_score, agendaPoints: lastMine.agenda_points, ballot: lastMine.ballot,
        surveyScore: lastMine.survey_score ?? null, answer: lastMine.answer ?? null, predictions: lastMine.predictions ?? null,
        hits: last.board ? scorePredictions(lastMine.predictions ?? null, last.board).hits : [],
      } : null,
    } : null,
  };
}

/** Saves a ranking ({ ballot }) or a survey play ({ answer, predictions }) for this week. */
export async function saveWeeklyPlay(userId: string, body: { ballot?: unknown; answer?: unknown; predictions?: unknown } | null): Promise<Record<string, unknown> & { ok: boolean }> {
  if (body && "predictions" in body) {
    const s = await saveSurvey(userId, body.answer, body.predictions);
    if (!s.ok) return { ok: false, error: s.error };
    return { ok: true, answer: s.answer, predictions: s.predictions, players: await countEntries(weekOf()) };
  }
  const r = await saveBallot(userId, body?.ballot);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ballot: r.ballot, players: await countEntries(weekOf()) };
}
