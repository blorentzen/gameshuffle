/**
 * The relay's webhook (phase 1 contract, "Webhook: relay → site"). The relay posts every attempt event here:
 *   POST { relayId, event, state }, header x-relay-signature = hex HMAC-SHA256(SPEEDRUN_RELAY_SECRET, raw body)
 * A wrong signature is 401; an unknown runner 404 (the relay doesn't retry those); a database hiccup 500 (it retries
 * once). Events are idempotent per attempt and event (see recordRelayEvent). The "PB this run" prediction moves on
 * the same events after the response (src/lib/speedrun/prediction.ts).
 */

import { NextResponse, type NextRequest } from "next/server";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { verifyBody, isRelayId } from "@/lib/speedrun/tokens";
import { cleanTimerInfo, isRelayState } from "@/lib/speedrun/rules";
import { recordRelayEvent, speedrunReady } from "@/lib/speedrun/store";
import type { RelayEvent, RelayWebhookBody } from "@/lib/speedrun/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The prediction's steps run after the response and wait out the stream delay (60 seconds at most).
export const maxDuration = 90;

const EVENTS = new Set<RelayEvent>(["start", "split", "skip", "undo", "reset", "finish", "connect", "disconnect", "info"]);
const MAX_BODY = 256 * 1024;

export async function POST(req: NextRequest) {
  const env = speedrunEnvOrNull();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!(await verifyBody(env.secret, raw, req.headers.get("x-relay-signature")))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  let body: RelayWebhookBody;
  try { body = JSON.parse(raw) as RelayWebhookBody; } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  if (!body || !isRelayId(body.relayId) || !EVENTS.has(body.event) || !isRelayState(body.state)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!(await speedrunReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  // The desktop add-on's info rides along with "info" only; anything else about it is ignored.
  body.timer = body.event === "info" ? cleanTimerInfo(body.timer) ?? undefined : undefined;
  const res = await recordRelayEvent(body);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, did: res.did });
}
