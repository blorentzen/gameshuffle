import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlocked } from "@/lib/moderation/blocks";
import { createNotification } from "@/lib/social/notifications";

export type InviteKind = "session" | "tournament";

async function displayName(userId: string): Promise<{ name: string; username: string | null }> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();
  return {
    name: (data?.display_name as string | null) || (data?.username as string | null) || "Someone",
    username: (data?.username as string | null) ?? null,
  };
}

/** Create (or re-surface) an invitation + notify the invitee. */
export async function createInvitation(args: {
  inviterId: string;
  inviteeId: string;
  kind: InviteKind;
  targetId: string;
  targetName: string;
  link: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const { inviterId, inviteeId, kind, targetId, targetName, link } = args;
  if (!inviteeId || inviterId === inviteeId) return { ok: false, reason: "invalid" };
  if (await isBlocked(inviterId, inviteeId)) return { ok: false, reason: "blocked" };

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("invitations")
    .select("id, status")
    .eq("inviter_user_id", inviterId)
    .eq("invitee_user_id", inviteeId)
    .eq("kind", kind)
    .eq("target_id", targetId)
    .maybeSingle();
  // Don't spam a still-pending invite.
  if (existing && (existing.status as string) === "pending") return { ok: true };

  const { data: inv } = await admin
    .from("invitations")
    .upsert(
      {
        inviter_user_id: inviterId,
        invitee_user_id: inviteeId,
        kind,
        target_id: targetId,
        status: "pending",
        responded_at: null,
      },
      { onConflict: "inviter_user_id,invitee_user_id,kind,target_id" },
    )
    .select("id")
    .single();

  const { name } = await displayName(inviterId);
  await createNotification({
    userId: inviteeId,
    type: `${kind}_invite`,
    title: `${name} invited you to ${targetName}`,
    actorUserId: inviterId,
    link,
    data: { invitationId: inv?.id, kind, targetId },
  });

  return { ok: true };
}

/** Invitee accepts / declines; notifies the inviter. Idempotent. */
export async function respondInvitation(
  invitationId: string,
  userId: string,
  action: "accept" | "decline",
): Promise<{ ok: boolean; reason?: string }> {
  const admin = createServiceClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("id, inviter_user_id, invitee_user_id, status, kind, target_id")
    .eq("id", invitationId)
    .maybeSingle();
  if (!inv) return { ok: false, reason: "not_found" };
  if ((inv.invitee_user_id as string) !== userId) return { ok: false, reason: "forbidden" };
  if ((inv.status as string) !== "pending") return { ok: true };

  const status = action === "accept" ? "accepted" : "declined";
  await admin
    .from("invitations")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", invitationId);

  const { name, username } = await displayName(userId);
  await createNotification({
    userId: inv.inviter_user_id as string,
    type: "system",
    title: `${name} ${status} your invite`,
    actorUserId: userId,
    link: username ? `/u/${username}` : null,
  });

  return { ok: true };
}
