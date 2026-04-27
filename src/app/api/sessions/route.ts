/**
 * /api/sessions
 *
 *   POST — create a new session (capability-gated)
 *   GET  — list current user's sessions
 *
 * Phase 1 surface. Platform integration arrives in Phase 3; UI in Phase 4.
 */

import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/capabilities/middleware";
import {
  createSession,
  listSessionsForOwner,
} from "@/lib/sessions/service";
import type { SessionStatus } from "@/lib/sessions/types";

export async function POST(request: Request) {
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = (body.name as string | undefined)?.trim();
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const session = await createSession({
    ownerUserId: guard.user!.id,
    name,
    description: (body.description as string | null | undefined) ?? null,
    platforms: (body.platforms as Record<string, unknown> | undefined) as never,
    config: (body.config as Record<string, unknown> | undefined) as never,
    isTestSession: body.isTestSession === true,
  });

  return NextResponse.json({ session }, { status: 201 });
}

export async function GET(request: Request) {
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const statuses = statusParam
    ? (statusParam.split(",") as SessionStatus[])
    : undefined;
  const limit = url.searchParams.has("limit")
    ? Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit")!, 10) || 25))
    : undefined;

  const sessions = await listSessionsForOwner(guard.user!.id, { statuses, limit });
  return NextResponse.json({ sessions });
}
