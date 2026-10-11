import "server-only";

/**
 * Trivia questions drafted by Claude for the host to check (GS Pro, counted
 * against the AI allowance). Rules from the plan: AI drafts, a person
 * approves; every question names where to check it and says when a fact can
 * change; drafts never reach players until the host approves them.
 *
 * Claude can't browse here, so its sources are references to check, not
 * proof: the studio says so next to every draft.
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";
import { gsDay } from "@/lib/time/gsClock";
import type { QuestionInput } from "./store";

const SCHEMA = z.object({
  questions: z.array(z.object({
    prompt: z.string().describe("The question as the host reads it out. One sentence, under 200 characters."),
    answer: z.string().describe("The answer as it appears on the reveal. Short."),
    accept: z.array(z.string()).describe("Other ways of writing the same answer that should count: short forms, common spellings, nicknames."),
    ask_about: z.array(z.string()).describe("Answers the host should rule on: partly right, too vague, or arguably right."),
    reject: z.array(z.string()).describe("Close but wrong answers people will give, which must not count."),
    kind: z.enum(["text", "number"]).describe("number when the answer is a number or a year."),
    difficulty: z.enum(["easy", "medium", "hard"]),
    category: z.string().describe("A short category, like Gaming, Movies, Science, Geography."),
    sources: z.array(z.object({ title: z.string(), url: z.string().nullable() })).describe("One or two well-known references where the host can check this fact (official sites, encyclopedias, the series wiki)."),
    changeable: z.boolean().describe("true when the fact could change over time (records, counts, current holders, latest releases)."),
  })),
});

export interface DraftRequest {
  theme: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  familySafe: boolean;
  /** Questions the host already has, so drafts don't repeat them. */
  avoid: string[];
}

export async function draftTriviaQuestions(req: DraftRequest): Promise<AiResult<QuestionInput[]>> {
  const today = gsDay();
  const system = [
    "You write questions for live trivia nights: a host reads each one out, teams answer on their phones, and answers are judged from an answer line.",
    "Accuracy matters more than anything. Only write questions whose answer you are certain of and that a reference would confirm. Skip anything disputed, anything that depends on a definition, and claims with \"only\", \"first\" or \"most\" unless they are textbook facts.",
    "One clear answer per question. No trick questions, no riddles, no questions where two answers are equally right.",
    "Make the answer line generous with real alternatives (accept), honest about grey areas (ask_about) and specific about tempting wrong answers (reject).",
    "Name one or two references for each fact. If the fact could change, set changeable to true; it will be dated today.",
    "Vary the questions: no two about the same fact, and spread the difficulty unless told otherwise. Easy means most tables get it; hard means one or two tables do.",
    req.familySafe ? "Everything must be family friendly." : "Keep it suitable for a general adult audience: no explicit content.",
    "Write in plain English. Don't use em dashes or en dashes.",
  ].join(" ");
  const prompt = [
    `Theme: ${req.theme}`,
    `Write ${req.count} questions, difficulty: ${req.difficulty === "mixed" ? "a mix of easy, medium and hard" : req.difficulty}.`,
    req.avoid.length ? `The host already has these questions; don't repeat their facts:\n${req.avoid.slice(0, 80).map((q) => `- ${q}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const res = await draftStructured({ system, prompt, schema: SCHEMA, effort: "medium", maxTokens: 6000 });
  if (!res.ok) return res;
  const questions = res.data.questions
    .filter((q) => !isBlockedText(q.prompt) && !isBlockedText(q.answer))
    .slice(0, req.count)
    .map<QuestionInput>((q) => ({
      prompt: q.prompt,
      answer: q.answer,
      accept: q.accept,
      askAbout: q.ask_about,
      reject: q.reject,
      kind: q.kind,
      difficulty: q.difficulty,
      category: q.category,
      sources: q.sources.map((s) => ({ title: s.title, url: s.url })),
      asOf: q.changeable ? today : null,
      changeable: q.changeable,
      familySafe: req.familySafe,
    }));
  return { ok: true, data: questions };
}
