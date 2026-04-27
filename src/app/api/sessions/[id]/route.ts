/**
 * /api/sessions/[id]
 *
 *   GET    — read a single session (must be owner or staff)
 *   PATCH  — update name/description/config/platforms/scheduling
 *   DELETE — remove the session
 */

import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/capabilities/middleware";
import {
  getSession,
  updateSessionConfig,
  deleteSession,
} from "@/lib/sessions/service";
import type { UpdateSessionInput } from "@/lib/sessions/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Ownership check (staff bypassed via the capability resolution path —
  // staff get session.create capability and are allowed to read anyone).
  if (
    session.owner_user_id !== guard.user!.id &&
    !["staff", "admin"].includes(guard.user!.role ?? "")
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (session.owner_user_id !== guard.user!.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: UpdateSessionInput = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if ("description" in body)
    patch.description = (body.description as string | null) ?? null;
  if (body.platforms && typeof body.platforms === "object") {
    patch.platforms = body.platforms as never;
  }
  if (body.config && typeof body.config === "object") {
    patch.config = body.config as never;
  }
  if ("scheduled_at" in body) {
    patch.scheduled_at = (body.scheduled_at as string | null) ?? null;
  }
  if (typeof body.scheduled_eligibility_window_hours === "number") {
    patch.scheduled_eligibility_window_hours =
      body.scheduled_eligibility_window_hours;
  }

  const updated = await updateSessionConfig(id, patch);
  return NextResponse.json({ session: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const guard = await requireCapability("session.create");
  if (guard.denial) return guard.denial;

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (session.owner_user_id !== guard.user!.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
