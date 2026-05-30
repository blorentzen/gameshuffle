/**
 * Lurk-state helpers — Spec 03 §2.2.
 *
 * `!lurk` writes a `gs_command_state` row keyed `'lurk'` for the
 * caller's (identity, community) pair. The next chat message from
 * that identity in that community clears the row and triggers a
 * "welcome back" reply.
 *
 * The check runs ahead of command parsing in the webhook so it
 * fires regardless of whether the returning message is a command.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface LurkActivation {
  ok: boolean;
  /** True when no row existed yet (first `!lurk` of this session). */
  isNew: boolean;
}

export async function setLurk(args: {
  identityId: string;
  communityId: string;
}): Promise<LurkActivation> {
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("gs_command_state")
    .select("identity_id")
    .eq("identity_id", args.identityId)
    .eq("community_id", args.communityId)
    .eq("key", "lurk")
    .maybeSingle();
  const { error } = await admin
    .from("gs_command_state")
    .upsert(
      {
        identity_id: args.identityId,
        community_id: args.communityId,
        key: "lurk",
        payload: { started_at: new Date().toISOString() },
      },
      { onConflict: "identity_id,community_id,key" },
    );
  if (error) {
    return { ok: false, isNew: false };
  }
  return { ok: true, isNew: !existing };
}

/**
 * Check + clear the lurk state for an identity. Returns the previous
 * lurk-payload when present (so the caller can compute "you lurked
 * for X minutes" if desired), or null when the identity wasn't
 * lurking. Atomic delete-then-return via DELETE ... RETURNING.
 */
export async function consumeLurk(args: {
  identityId: string;
  communityId: string;
}): Promise<{ startedAt: string } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_command_state")
    .delete()
    .eq("identity_id", args.identityId)
    .eq("community_id", args.communityId)
    .eq("key", "lurk")
    .select("payload")
    .maybeSingle();
  const payload = (data as { payload?: { started_at?: string } } | null)?.payload;
  if (!payload?.started_at) return null;
  return { startedAt: payload.started_at };
}
