/**
 * POST   /api/account/mods/[id]/invite  — generate or regenerate an
 *                                         invite token for a pending /
 *                                         invited mod. Returns the new
 *                                         token so the Hub can build
 *                                         the magic link to copy.
 * DELETE /api/account/mods/[id]/invite  — cancel an outstanding invite
 *                                         (clears the token; row stays
 *                                         in `pending` so the streamer
 *                                         can re-invite later).
 *
 * Distinct from the parent route's DELETE (which fully revokes the mod
 * row). Cancel-invite is the "I changed my mind about sending the link
 * but want to keep this person in the pending list" surface.
 */

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  const admin = createServiceClient();
  const inviteToken = crypto.randomUUID();
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { data, error } = await admin
    .from("streamer_mods")
    .update({
      status: "invited",
      invite_token: inviteToken,
      invite_expires_at: inviteExpiresAt,
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("streamer_user_id", user.id)
    .in("status", ["pending", "invited"]) // never reinvite an active or revoked mod
    .select("id, invite_token, invite_expires_at")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "PGRST116") {
      // No matching row — either wrong id or wrong status.
      return NextResponse.json(
        { ok: false, error: "mod_not_eligible" },
        { status: 404 },
      );
    }
    console.error("[account/mods/invite] regenerate failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  const row = data as {
    id: string;
    invite_token: string;
    invite_expires_at: string;
  };
  return NextResponse.json({
    ok: true,
    inviteToken: row.invite_token,
    inviteExpiresAt: row.invite_expires_at,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  const admin = createServiceClient();
  const { error } = await admin
    .from("streamer_mods")
    .update({
      status: "pending",
      invite_token: null,
      invite_expires_at: null,
      invited_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("streamer_user_id", user.id)
    .eq("status", "invited"); // only cancel outstanding invites
  if (error) {
    console.error("[account/mods/invite] cancel failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
