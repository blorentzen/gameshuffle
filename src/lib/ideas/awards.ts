import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { IDEA_AWARDS } from "./constants";

/**
 * Idempotent idea award — a ceiling-exempt platform mint (Phase 0 D2). Written
 * straight to the ledger (balance is derived), keyed by `idea:{id}:{kind}` on
 * `token_events.idempotency_key` so a status re-write can never double-pay (§5.4).
 *
 * Credits the author's linked economy identity if one exists; skips gracefully
 * otherwise (D4 — the economy's identity CHECK is twitch/discord only, and
 * attribution is the stronger motivator anyway per §5.5).
 */
export async function awardIdea(args: {
  authorId: string;
  ideaId: string;
  kind: "accepted" | "shipped";
}): Promise<{ awarded: boolean; reason?: string }> {
  const admin = createServiceClient();

  // Any linked identity credits the account (balance sums across them).
  const { data: idents } = await admin
    .from("gs_identities")
    .select("id")
    .eq("gs_account_id", args.authorId)
    .order("created_at", { ascending: false })
    .limit(1);
  const identityId = (idents ?? [])[0]?.id as string | undefined;
  if (!identityId) return { awarded: false, reason: "no_identity" };

  const amount = args.kind === "accepted" ? IDEA_AWARDS.accepted : IDEA_AWARDS.shipped;
  const type = args.kind === "accepted" ? "idea_accept" : "idea_ship";

  const { error } = await admin.from("token_events").insert({
    identity_id: identityId,
    community_id: null,
    amount,
    type,
    ref_id: args.ideaId,
    meta: { source: "idea", idea_id: args.ideaId, award: args.kind },
    idempotency_key: `idea:${args.ideaId}:${args.kind}`,
  });

  // A unique-violation on the idempotency key means it was already paid — that's
  // the guarantee working, not an error.
  if (error && !/duplicate key|unique/i.test(error.message)) {
    throw new Error(`awardIdea failed: ${error.message}`);
  }
  return { awarded: true };
}
