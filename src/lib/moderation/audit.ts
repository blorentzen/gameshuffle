import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/** Append an immutable T&S action to the moderation audit log. */
export async function writeModerationAudit(args: {
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  detail?: string | null;
}): Promise<void> {
  const admin = createServiceClient();
  await admin.from("moderation_audit_log").insert({
    actor_user_id: args.actorUserId,
    target_user_id: args.targetUserId,
    action: args.action,
    detail: args.detail ?? null,
  });
}
