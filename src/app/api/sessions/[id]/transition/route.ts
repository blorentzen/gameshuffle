/**
 * POST /api/sessions/[id]/transition
 *
 * Body: { to: SessionStatus, via?: ActivationVia | EndedVia | null }
 *
 * Validates the requested transition against the state machine and writes
 * a session_events audit row. Phase 1: state changes only; no platform
 * side-effects (Phase 3 wires those in).
 */

import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/capabilities/middleware";
import {
  getSession,
  transitionSessionStatus,
  InvalidTransitionError,
  SessionNotFoundError,
} from "@/lib/sessions/service";
import type {
  ActivationVia,
  EndedVia,
  SessionStatus,
} from "@/lib/sessions/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.owner_user_id !== guard.user!.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const to = body.to as SessionStatus | undefined;
  if (!to) return NextResponse.json({ error: "to_required" }, { status: 400 });

  try {
    const updated = await transitionSessionStatus({
      id,
      newStatus: to,
      via: (body.via as ActivationVia | EndedVia | null | undefined) ?? null,
      actorId: guard.user!.id,
      actorType: "streamer",
    });
    return NextResponse.json({ session: updated });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json(
        { error: "invalid_transition", from: err.from, to: err.to },
        { status: 422 }
      );
    }
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
