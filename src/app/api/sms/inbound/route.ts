/**
 * POST /api/sms/inbound — Twilio inbound webhook (Messaging Service).
 *
 * Handles the carrier-mandated keywords. Twilio's Advanced Opt-Out already
 * blocks further messages on STOP; this mirrors the state into our own consent
 * table so the app knows, and answers HELP with something useful. Replies are
 * TwiML so Twilio sends them from the same sender.
 *
 * Signature-verified (X-Twilio-Signature). Never trust an unsigned request.
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateTwilioSignature } from "@/lib/sms/client";
import { applyKeyword } from "@/lib/sms/consent";
import { getBaseUrl } from "@/lib/env";

export const runtime = "nodejs";

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "yes", "unstop"]);
const HELP_WORDS = new Set(["help", "info"]);

function twiml(message: string | null): NextResponse {
  const body = message ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>` : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;

  const url = `${getBaseUrl()}/api/sms/inbound`;
  if (!validateTwilioSignature(req.headers.get("x-twilio-signature"), url, params)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 403 });
  }

  const from = params.From ?? "";
  const word = (params.Body ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";

  if (STOP_WORDS.has(word)) {
    await applyKeyword(from, "stop").catch(() => {});
    // Twilio's Advanced Opt-Out sends its own confirmation; stay quiet.
    return twiml(null);
  }
  if (START_WORDS.has(word)) {
    await applyKeyword(from, "start").catch(() => {});
    return twiml(null);
  }
  if (HELP_WORDS.has(word)) {
    await applyKeyword(from, "help").catch(() => {});
    return twiml("GameShuffle: event reminders and organizer messages. Manage or turn these off at gameshuffle.co/account. Reply STOP to opt out. Msg&data rates may apply.");
  }
  // Anything else: we don't run a two-way service yet.
  return twiml("GameShuffle doesn't read replies here. Manage your texts at gameshuffle.co/account. Reply STOP to opt out.");
}
