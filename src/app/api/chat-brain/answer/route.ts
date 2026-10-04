/**
 * POST /api/chat-brain/answer
 * Body: { promptId, answer, anonId?, source?, turnstileToken? }
 *
 * One answer per prompt per person. Signed-in players answer as their account.
 * Signed-out players answer as their browser (anonId, hashed server-side); the
 * first answer from a browser passes Turnstile, which sets a signed cookie so
 * the rest of their answers don't ask again. `source` records where the answer
 * came from (a share link's ?src=, for example).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { rateLimit } from "@/lib/ratelimit";
import { ChatBrainNotReady, submitAnswer, type AnswerIdentity } from "@/lib/chatbrain/store";

export const runtime = "nodejs";

const COOKIE = "gs_brain_ok";
const MESSAGES: Record<string, string> = {
  empty: "Type an answer first.",
  too_long: "Keep it short: 40 characters at most.",
  blocked: "Let's keep it clean. Try another answer.",
  already_answered: "You've already answered this one.",
  closed: "This one isn't taking answers anymore.",
  not_found: "That prompt doesn't exist.",
  failed: "That didn't save. Try again.",
  captcha: "Please complete the check and try again.",
};

function sign(anonId: string): string {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "chat-brain";
  return createHmac("sha256", secret).update(`brain-ok:${anonId}`).digest("base64url").slice(0, 32);
}
function cookieOk(value: string | undefined, anonId: string): boolean {
  if (!value) return false;
  const a = Buffer.from(value), b = Buffer.from(sign(anonId));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`brain-answer:${ip}`, { max: 40, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited", message: "Slow down a little and try again in a few minutes." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { promptId?: string; answer?: string; anonId?: string; source?: string; turnstileToken?: string };
  if (!body.promptId || typeof body.answer !== "string") return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let who: AnswerIdentity;
  let setCookie: string | null = null;
  if (user) {
    who = { userId: user.id };
  } else {
    const anonId = String(body.anonId ?? "");
    if (!/^[0-9a-f-]{16,64}$/i.test(anonId)) return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
    if (!cookieOk(req.cookies.get(COOKIE)?.value, anonId)) {
      if (!(await verifyTurnstileToken(body.turnstileToken, ip))) {
        return NextResponse.json({ ok: false, error: "captcha", needsCaptcha: true, message: MESSAGES.captcha }, { status: 403 });
      }
      setCookie = sign(anonId);
    }
    who = { anonId };
  }

  try {
    const r = await submitAnswer({ promptId: body.promptId, raw: body.answer, who, source: body.source });
    const res = r.ok
      ? NextResponse.json({ ok: true, same: r.same })
      : NextResponse.json({ ok: false, error: r.error, message: MESSAGES[r.error] }, { status: r.error === "failed" ? 500 : 409 });
    if (setCookie) res.cookies.set(COOKIE, setCookie, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: false, error: "not_ready", message: "Chat Brain isn't open yet." }, { status: 503 });
    throw err;
  }
}
