/**
 * POST /api/activity/brain/answer  { promptId, answer }
 * A Chat Brain answer from inside the Discord Activity, saved for the player's
 * Discord identity with source `activity`. No captcha: Discord signed them in.
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { after } from "next/server";
import { ChatBrainNotReady, submitAnswer } from "@/lib/chatbrain/store";
import { noteAnswer, personFor, promptTopic } from "@/lib/discord/promptPosts";

export const runtime = "nodejs";

const MESSAGES: Record<string, string> = {
  empty: "Type an answer first.",
  too_long: "Keep it short: 40 characters at most.",
  blocked: "Let's keep it clean. Try another answer.",
  already_answered: "You've already answered this one.",
  closed: "This one isn't taking answers anymore.",
  not_found: "That prompt doesn't exist.",
  failed: "That didn't save. Try again.",
};

export async function POST(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { promptId?: unknown; answer?: unknown } | null;
  if (typeof body?.promptId !== "string" || typeof body.answer !== "string") return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  try {
    const r = await submitAnswer({ promptId: body.promptId, raw: body.answer, who: { identityId: s.iid }, source: "activity" });
    // Played from a server channel: show it on that server's posts of this question.
    if (s.gid && (r.ok || r.error === "already_answered")) {
      const promptId = body.promptId;
      after(async () => noteAnswer({ guildId: s.gid, topic: await promptTopic(promptId), person: await personFor({ identityId: s.iid }), name: s.name }));
    }
    return r.ok
      ? NextResponse.json({ ok: true, same: r.same })
      : NextResponse.json({ ok: false, error: r.error, message: MESSAGES[r.error] }, { status: r.error === "failed" ? 500 : 409 });
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return NextResponse.json({ ok: false, error: "not_ready", message: "Chat Brain isn't open yet." }, { status: 503 });
    throw err;
  }
}
