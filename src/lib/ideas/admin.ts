import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { IDEA_LIMITS } from "./constants";
import { awardIdea } from "./awards";
import type { IdeaCycle } from "./types";

/**
 * Idea Board admin transitions (§4, §5.2, §6.5). Every state change is
 * service-role only (routes gate on isStaffRole), logs to gs_moderation_actions,
 * and fires the author notification / token award where the lifecycle calls for
 * it. Terminal states are terminal — callers re-check current status first.
 */

type Result = { ok: boolean; reason?: string };

async function logAction(
  actorId: string,
  ideaId: string,
  action: string,
  reason?: string | null,
): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_moderation_actions").insert({
    actor_id: actorId,
    target_type: "idea",
    target_id: ideaId,
    action,
    reason: reason ?? null,
  });
}

async function notifyAuthor(
  authorId: string,
  actorId: string,
  type: "idea_accepted" | "idea_in_review" | "idea_verdict" | "idea_shipped",
  title: string,
  ideaId: string,
): Promise<void> {
  await createNotification({
    userId: authorId,
    type,
    title,
    actorUserId: actorId,
    link: `/ideas/${ideaId}`,
    data: { ideaId },
  });
}

async function getIdeaRow(ideaId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_ideas")
    .select("id, author_id, title, status")
    .eq("id", ideaId)
    .maybeSingle();
  return data as { id: string; author_id: string; title: string; status: string } | null;
}

// ---------------------------------------------------------------------------
// Eligibility review: submitted → public | rejected
// ---------------------------------------------------------------------------

export async function approveIdea(ideaId: string, actorId: string): Promise<Result> {
  const idea = await getIdeaRow(ideaId);
  if (!idea) return { ok: false, reason: "not_found" };
  if (idea.status !== "submitted") return { ok: false, reason: "bad_state" };

  const admin = createServiceClient();
  const now = new Date();
  const expires = new Date(now.getTime() + IDEA_LIMITS.expiryDays * 24 * 60 * 60 * 1000);
  await admin
    .from("gs_ideas")
    .update({ status: "public", published_at: now.toISOString(), expires_at: expires.toISOString() })
    .eq("id", ideaId);

  await awardIdea({ authorId: idea.author_id, ideaId, kind: "accepted" });
  await notifyAuthor(idea.author_id, actorId, "idea_accepted", `Your idea "${idea.title}" is live on the board`, ideaId);
  await logAction(actorId, ideaId, "approve");
  return { ok: true };
}

export async function rejectIdea(ideaId: string, actorId: string, reason: string): Promise<Result> {
  const idea = await getIdeaRow(ideaId);
  if (!idea) return { ok: false, reason: "not_found" };
  if (idea.status !== "submitted") return { ok: false, reason: "bad_state" };

  const admin = createServiceClient();
  // Reject reason lives in moderation_note — shown to the author only (§4/§7).
  await admin.from("gs_ideas").update({ status: "rejected", moderation_note: reason }).eq("id", ideaId);
  await logAction(actorId, ideaId, "reject", reason);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Review cycles (§5.2) — manual advance, never a cron
// ---------------------------------------------------------------------------

export async function createCycle(args: {
  name: string;
  slots?: number;
  opensAt?: string | null;
  closesAt?: string | null;
}): Promise<{ ok: boolean; id?: string }> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_idea_cycles")
    .insert({
      name: args.name,
      slots: args.slots ?? IDEA_LIMITS.defaultCycleSlots,
      opens_at: args.opensAt ?? null,
      closes_at: args.closesAt ?? null,
      status: "voting",
    })
    .select("id")
    .single();
  return { ok: !!data, id: (data as { id: string } | null)?.id };
}

export async function listCycles(): Promise<IdeaCycle[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_idea_cycles")
    .select("id, name, opens_at, closes_at, status, slots")
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<{
    id: string;
    name: string;
    opens_at: string | null;
    closes_at: string | null;
    status: IdeaCycle["status"];
    slots: number;
  }>).map((c) => ({
    id: c.id,
    name: c.name,
    opensAt: c.opens_at,
    closesAt: c.closes_at,
    status: c.status,
    slots: c.slots,
  }));
}

/** Close voting: top `slots` public ideas by vote_count → in_review (§5.2). */
export async function promoteCycle(cycleId: string, actorId: string): Promise<Result> {
  const admin = createServiceClient();
  const { data: cycle } = await admin
    .from("gs_idea_cycles")
    .select("id, status, slots")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) return { ok: false, reason: "not_found" };
  const c = cycle as { id: string; status: string; slots: number };
  if (c.status !== "voting") return { ok: false, reason: "bad_state" };

  const nowIso = new Date().toISOString();
  const { data: top } = await admin
    .from("gs_ideas")
    .select("id, author_id, title")
    .eq("status", "public")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("vote_count", { ascending: false })
    .limit(c.slots);

  const winners = (top ?? []) as Array<{ id: string; author_id: string; title: string }>;
  for (const w of winners) {
    await admin.from("gs_ideas").update({ status: "in_review", cycle_id: cycleId }).eq("id", w.id);
    await notifyAuthor(w.author_id, actorId, "idea_in_review", `Your idea "${w.title}" entered review`, w.id);
    await logAction(actorId, w.id, "promote");
  }
  await admin.from("gs_idea_cycles").update({ status: "in_review" }).eq("id", cycleId);
  return { ok: true };
}

/** Record a verdict on an in-review idea: planned | declined (§5.2). */
export async function recordVerdict(args: {
  ideaId: string;
  actorId: string;
  verdict: "planned" | "declined";
  note?: string | null;
}): Promise<Result> {
  const idea = await getIdeaRow(args.ideaId);
  if (!idea) return { ok: false, reason: "not_found" };
  if (idea.status !== "in_review") return { ok: false, reason: "bad_state" };
  const note = (args.note ?? "").trim();
  if (args.verdict === "declined" && !note) return { ok: false, reason: "note_required" };

  const admin = createServiceClient();
  await admin
    .from("gs_ideas")
    .update({
      status: args.verdict,
      verdict: args.verdict,
      verdict_note: note || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: args.actorId,
    })
    .eq("id", args.ideaId);

  const label = args.verdict === "planned" ? "is on the roadmap" : "was reviewed";
  await notifyAuthor(idea.author_id, args.actorId, "idea_verdict", `Your idea "${idea.title}" ${label}`, args.ideaId);
  await logAction(args.actorId, args.ideaId, `verdict:${args.verdict}`, note || null);
  return { ok: true };
}

/** Close a cycle — only once every in-review idea in it has a verdict (§5.2). */
export async function closeCycle(cycleId: string): Promise<Result> {
  const admin = createServiceClient();
  const { count } = await admin
    .from("gs_ideas")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId)
    .eq("status", "in_review");
  if ((count ?? 0) > 0) return { ok: false, reason: "unresolved" };
  await admin.from("gs_idea_cycles").update({ status: "closed" }).eq("id", cycleId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ship: planned → shipped (§4)
// ---------------------------------------------------------------------------

export async function shipIdea(
  ideaId: string,
  actorId: string,
  shippedRef?: string | null,
): Promise<Result> {
  const idea = await getIdeaRow(ideaId);
  if (!idea) return { ok: false, reason: "not_found" };
  if (idea.status !== "planned") return { ok: false, reason: "bad_state" };

  const admin = createServiceClient();
  await admin
    .from("gs_ideas")
    .update({ status: "shipped", shipped_ref: shippedRef ?? null })
    .eq("id", ideaId);

  await awardIdea({ authorId: idea.author_id, ideaId, kind: "shipped" });
  await notifyAuthor(idea.author_id, actorId, "idea_shipped", `Your idea "${idea.title}" shipped 🎉`, ideaId);
  await logAction(actorId, ideaId, "ship", shippedRef ?? null);
  return { ok: true };
}
