/**
 * /api/instant/brain: Chat Brain Daily, the Facebook Instant Game (src/lib/chatbrain/instant.ts).
 *   GET  ?anon=<id>                                   → today's question + board (no answers)
 *   POST { action: "answer", promptId, answer, anon } → { same, line }
 *   POST { action: "guess", boardId, guess, found }   → hit / found / miss
 *   POST { action: "reveal", boardId }                → every answer (end of a game)
 *
 * The game is served from Facebook's own hosts (apps-<app id>.fbsbx.com), so
 * this route answers cross-origin requests from *.fbsbx.com (and localhost
 * outside production, for the test build). No cookies or Facebook data: the
 * game sends a random id it keeps in Facebook's player storage.
 */
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { instantIp as ipOf, instantJson as json, instantPreflight } from "@/lib/instant/cors";
import { isCountry } from "@/lib/chatbrain/audience";
import { ChatBrainNotReady } from "@/lib/chatbrain/store";
import { instantAnswer, instantGuess, instantReveal, instantView } from "@/lib/chatbrain/instant";

export const runtime = "nodejs";

const ANON = /^[0-9a-f-]{16,64}$/i;

const MESSAGES: Record<string, string> = {
  empty: "Type an answer first.",
  too_long: "Keep it short: 40 characters at most.",
  blocked: "Let's keep it clean. Try another answer.",
  already_answered: "You've already answered this one.",
  closed: "This question just closed. Pull down to get a new one.",
  not_found: "That question isn't here anymore.",
  failed: "That didn't save. Try again.",
};

export async function OPTIONS(req: NextRequest) {
  return instantPreflight(req);
}

export async function GET(req: NextRequest) {
  const { ok } = await rateLimit(`instant-view:${ipOf(req)}`, { max: 60, windowMs: 60_000 });
  if (!ok) return json(req, { error: "rate_limited" }, 429);
  const anon = req.nextUrl.searchParams.get("anon");
  try {
    return json(req, await instantView(anon && ANON.test(anon) ? anon : null));
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return json(req, { error: "not_ready" }, 503);
    console.error("[instant/brain] view failed:", err);
    return json(req, { error: "failed" }, 500);
  }
}

export async function POST(req: NextRequest) {
  const ip = ipOf(req);
  const body = (await req.json().catch(() => ({}))) as { action?: string; promptId?: unknown; answer?: unknown; anon?: unknown; boardId?: unknown; guess?: unknown; found?: unknown };
  try {
    if (body.action === "answer") {
      const { ok } = await rateLimit(`instant-answer:${ip}`, { max: 20, windowMs: 10 * 60_000 });
      if (!ok) return json(req, { ok: false, error: "rate_limited", message: "Slow down a little and try again in a few minutes." }, 429);
      const anon = typeof body.anon === "string" && ANON.test(body.anon) ? body.anon : null;
      if (!anon || typeof body.promptId !== "string" || typeof body.answer !== "string") return json(req, { ok: false, error: "bad_body" }, 400);
      const country = req.headers.get("x-vercel-ip-country");
      const res = await instantAnswer(body.promptId, body.answer, anon, isCountry(country) ? country!.toUpperCase() : null);
      return res.ok ? json(req, res) : json(req, { ...res, message: MESSAGES[res.error] ?? MESSAGES.failed }, 400);
    }
    if (body.action === "guess") {
      const { ok } = await rateLimit(`instant-guess:${ip}`, { max: 120, windowMs: 10 * 60_000 });
      if (!ok) return json(req, { error: "rate_limited" }, 429);
      if (typeof body.boardId !== "string" || typeof body.guess !== "string" || body.guess.length > 60) return json(req, { error: "bad_body" }, 400);
      const found = Array.isArray(body.found) ? body.found.filter((n): n is number => Number.isInteger(n)).slice(0, 8) : [];
      return json(req, await instantGuess(body.boardId, body.guess, found));
    }
    if (body.action === "reveal") {
      if (typeof body.boardId !== "string") return json(req, { error: "bad_body" }, 400);
      const answers = await instantReveal(body.boardId);
      return answers ? json(req, { answers }) : json(req, { error: "gone" }, 404);
    }
    return json(req, { error: "bad_body" }, 400);
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return json(req, { error: "not_ready" }, 503);
    console.error("[instant/brain] failed:", err);
    return json(req, { error: "failed" }, 500);
  }
}
