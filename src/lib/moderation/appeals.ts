import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeModerationAudit } from "./audit";

export async function getOpenAppeal(
  userId: string,
): Promise<{ id: string; createdAt: string } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("moderation_appeals")
    .select("id, created_at")
    .eq("user_id", userId)
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, createdAt: data.created_at as string } : null;
}

/** Submit an appeal. One open appeal per user — repeats are no-ops. */
export async function createAppeal(
  userId: string,
  message: string,
): Promise<{ ok: true; duplicate: boolean }> {
  if (await getOpenAppeal(userId)) return { ok: true, duplicate: true };
  const admin = createServiceClient();
  const { error } = await admin
    .from("moderation_appeals")
    .insert({ user_id: userId, message });
  if (error) throw error;
  return { ok: true, duplicate: false };
}

export interface AppealForReview {
  id: string;
  userId: string;
  message: string;
  status: string;
  createdAt: string;
  user: {
    username: string | null;
    displayName: string | null;
    moderationStatus: string | null;
  } | null;
}

export async function listOpenAppeals(): Promise<AppealForReview[]> {
  const admin = createServiceClient();
  const { data: appeals } = await admin
    .from("moderation_appeals")
    .select("id, user_id, message, status, created_at")
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (appeals ?? []) as Array<{
    id: string;
    user_id: string;
    message: string;
    status: string;
    created_at: string;
  }>;
  if (!rows.length) return [];

  const { data: users } = await admin
    .from("users")
    .select("id, username, display_name, moderation_status")
    .in("id", rows.map((r) => r.user_id));
  const byId = new Map(
    ((users ?? []) as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      moderation_status: string | null;
    }>).map((u) => [u.id, u]),
  );

  return rows.map((r) => {
    const u = byId.get(r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
      user: u
        ? {
            username: u.username,
            displayName: u.display_name,
            moderationStatus: u.moderation_status,
          }
        : null,
    };
  });
}

export async function resolveAppeal(args: {
  appealId: string;
  staffUserId: string;
  status: "granted" | "denied";
  notes?: string | null;
}): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("moderation_appeals")
    .update({
      status: args.status,
      staff_user_id: args.staffUserId,
      staff_notes: args.notes ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", args.appealId);
  await writeModerationAudit({
    actorUserId: args.staffUserId,
    targetUserId: null,
    action: `appeal_${args.status}`,
    detail: args.appealId,
  });
}
