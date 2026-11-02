import "server-only";

/**
 * GIFs: players' own uploads (gifs-m1.sql). Upload = shrink + check + store; private until shared; Community =
 * shared GIFs that passed the check. Attachments on comments and messages point at a GIF (yours or a shared one)
 * or a sticker. Staff allow a held GIF or remove one (its fingerprint is kept so it can't come back).
 */

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { isBlockedText } from "@/lib/text/filter";
import { checkGifFrames } from "@/lib/moderation/imageCheck";
import { writeModerationAudit } from "@/lib/moderation/audit";
import { deleteFromR2, isR2Configured, keyFromPublicUrl, uploadToR2 } from "@/lib/storage/r2";
import { processGif } from "./process";
import {
  DHASH_SAME, cleanAlt, cleanTags, dhashDistance, gifLimit, parseAttachment,
  type Attachment, type AttachmentView, type CommunityGif, type GifView, type MyGif,
} from "./rules";

type Row = {
  id: string; owner_user_id: string; url: string; still_url: string; width: number; height: number; alt: string;
  tags: string[]; shared: boolean; status: "ok" | "held" | "removed" | "deleted"; check_reason: string | null; uses: number;
  created_at: string; sha256: string; dhash: string | null;
};
const COLS = "id, owner_user_id, url, still_url, width, height, alt, tags, shared, status, check_reason, uses, created_at, sha256, dhash";

const view = (r: Row): GifView => ({ id: r.id, url: r.url, still: r.still_url, width: r.width, height: r.height, alt: r.alt });
const mine = (r: Row): MyGif => ({
  ...view(r), tags: r.tags ?? [], shared: r.shared, status: r.status === "held" ? "held" : "ok",
  reason: r.status === "held" ? r.check_reason : null, uses: r.uses, createdAt: r.created_at,
});

/** Missing table = the migration hasn't run: GIFs say "coming soon" instead of failing. */
let ready: boolean | null = null;
export async function gifsReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("gifs").select("id").limit(1);
  ready = !error;
  return ready;
}

export async function gifAllowance(userId: string): Promise<{ used: number; limit: number }> {
  const admin = createServiceClient();
  const [{ count }, pro] = await Promise.all([
    admin.from("gifs").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).in("status", ["ok", "held"]),
    isProUser(userId, admin),
  ]);
  return { used: count ?? 0, limit: gifLimit(pro) };
}

export type UploadError = "storage_off" | "bad_file" | "too_many_frames" | "full" | "blocked" | "refused";

/** Shrinks, checks and keeps one upload. A refusal is never stored. The same file twice returns the first. */
export async function createGif(userId: string, file: Buffer): Promise<{ ok: true; gif: MyGif; again: boolean } | { ok: false; error: UploadError; reason?: string }> {
  if (!isR2Configured()) return { ok: false, error: "storage_off" };
  const done = await processGif(file);
  if ("error" in done) return { ok: false, error: done.error };
  const admin = createServiceClient();

  const { data: same } = await admin.from("gifs").select(COLS).eq("owner_user_id", userId).eq("sha256", done.sha256).in("status", ["ok", "held"]).maybeSingle();
  if (same) return { ok: true, gif: mine(same as Row), again: true };

  const { data: blocked } = await admin.from("gif_blocked").select("sha256, dhash");
  const hit = ((blocked ?? []) as { sha256: string; dhash: string | null }[])
    .some((b) => b.sha256 === done.sha256 || (b.dhash && dhashDistance(b.dhash, done.dhash) <= DHASH_SAME));
  if (hit) return { ok: false, error: "blocked" };

  const { used, limit } = await gifAllowance(userId);
  if (used >= limit) return { ok: false, error: "full" };

  const check = await checkGifFrames(done.sheet, { userId, capKey: userId });
  if (check.verdict === "refuse") return { ok: false, error: "refused", reason: check.reason };

  const id = randomUUID();
  let url: string, still: string;
  try {
    [url, still] = await Promise.all([
      uploadToR2(`gifs/${userId}/${id}.webp`, new Uint8Array(done.anim), "image/webp"),
      uploadToR2(`gifs/${userId}/${id}-still.webp`, new Uint8Array(done.still), "image/webp"),
    ]);
  } catch (err) {
    console.error("[gifs] storage refused the upload:", err instanceof Error ? err.message : err);
    await Promise.all([deleteFromR2(`gifs/${userId}/${id}.webp`), deleteFromR2(`gifs/${userId}/${id}-still.webp`)]);
    return { ok: false, error: "storage_off" };
  }
  const alt = cleanAlt(check.alt);
  const { data, error } = await admin.from("gifs").insert({
    id, owner_user_id: userId, url, still_url: still, width: done.width, height: done.height,
    bytes: done.anim.length, frames: done.frames, alt: isBlockedText(alt) ? "" : alt,
    status: check.verdict === "ok" ? "ok" : "held", check_reason: check.verdict === "ok" ? null : check.reason,
    sha256: done.sha256, dhash: done.dhash,
  }).select(COLS).single();
  if (error || !data) {
    await Promise.all([deleteFromR2(`gifs/${userId}/${id}.webp`), deleteFromR2(`gifs/${userId}/${id}-still.webp`)]);
    throw error ?? new Error("gif insert failed");
  }
  return { ok: true, gif: mine(data as Row), again: false };
}

export async function listMine(userId: string): Promise<MyGif[]> {
  const { data } = await createServiceClient().from("gifs").select(COLS)
    .eq("owner_user_id", userId).in("status", ["ok", "held"]).order("created_at", { ascending: false }).limit(300);
  return ((data ?? []) as Row[]).map(mine);
}

/** Shared GIFs that passed the check. `q` matches a tag exactly or the description. Popular = most used first. */
export async function listCommunity(args: { q?: string; sort?: "popular" | "new"; offset?: number; limit?: number }): Promise<CommunityGif[]> {
  const admin = createServiceClient();
  const limit = Math.min(Math.max(args.limit ?? 48, 1), 96);
  let query = admin.from("gifs").select(COLS).eq("shared", true).eq("status", "ok");
  const q = (args.q ?? "").toLowerCase().replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (q) query = query.or(`tags.cs.{"${q.replace(/"/g, "")}"},alt.ilike.%${q}%`);
  query = args.sort === "new"
    ? query.order("created_at", { ascending: false })
    : query.order("uses", { ascending: false }).order("created_at", { ascending: false });
  const { data } = await query.range(args.offset ?? 0, (args.offset ?? 0) + limit - 1);
  const rows = (data ?? []) as Row[];
  const owners = [...new Set(rows.map((r) => r.owner_user_id))];
  const { data: users } = owners.length
    ? await admin.from("users").select("id, display_name, username").in("id", owners)
    : { data: [] };
  const names = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[])
    .map((u) => [u.id, u.display_name || u.username || "A player"]));
  return rows.map((r) => ({ ...view(r), tags: r.tags ?? [], by: names.get(r.owner_user_id) ?? "A player", uses: r.uses }));
}

/** The most used tags on shared GIFs, for the Community chips. */
export async function communityTags(max = 8): Promise<string[]> {
  const { data } = await createServiceClient().from("gifs").select("tags, uses").eq("shared", true).eq("status", "ok").order("uses", { ascending: false }).limit(300);
  const score = new Map<string, number>();
  for (const r of (data ?? []) as { tags: string[]; uses: number }[]) for (const t of r.tags ?? []) score.set(t, (score.get(t) ?? 0) + 1 + r.uses);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
}

export type EditError = "not_found" | "blocked_words";

export async function updateGif(userId: string, id: string, patch: { alt?: unknown; tags?: unknown; shared?: unknown }): Promise<{ ok: true; gif: MyGif } | { ok: false; error: EditError }> {
  const admin = createServiceClient();
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.alt !== undefined) {
    const alt = cleanAlt(patch.alt);
    if (isBlockedText(alt)) return { ok: false, error: "blocked_words" };
    set.alt = alt;
  }
  if (patch.tags !== undefined) {
    const tags = cleanTags(patch.tags);
    if (tags.some(isBlockedText)) return { ok: false, error: "blocked_words" };
    set.tags = tags;
  }
  if (patch.shared !== undefined) set.shared = patch.shared === true;
  const { data } = await admin.from("gifs").update(set).eq("id", id).eq("owner_user_id", userId).in("status", ["ok", "held"]).select(COLS).maybeSingle();
  return data ? { ok: true, gif: mine(data as Row) } : { ok: false, error: "not_found" };
}

async function dropFiles(r: Pick<Row, "url" | "still_url">): Promise<void> {
  await Promise.all([r.url, r.still_url].map((u) => keyFromPublicUrl(u)).filter((k): k is string => !!k).map(deleteFromR2));
}

/** Your own GIF, gone for good (comments that used it say the GIF was removed). */
export async function deleteGif(userId: string, id: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin.from("gifs").update({ status: "deleted", shared: false, updated_at: new Date().toISOString() })
    .eq("id", id).eq("owner_user_id", userId).in("status", ["ok", "held"]).select("url, still_url").maybeSingle();
  if (!data) return false;
  await dropFiles(data as Row);
  return true;
}

// ── Attachments ───────────────────────────────────────────────────────────────

/**
 * An attachment someone wants to post, checked: a sticker in the catalog, or a GIF that passed the check and is
 * theirs or shared. Counts a use for the GIF.
 */
export async function attachmentFor(userId: string, raw: unknown): Promise<Attachment | null> {
  const att = parseAttachment(raw);
  if (!att || att.kind === "sticker") return att;
  const admin = createServiceClient();
  const { data } = await admin.from("gifs").select("owner_user_id, shared, status").eq("id", att.id).maybeSingle();
  const r = data as { owner_user_id: string; shared: boolean; status: string } | null;
  if (!r || r.status !== "ok" || (r.owner_user_id !== userId && !r.shared)) return null;
  await admin.rpc("gs_gif_used", { p_id: att.id });
  return att;
}

/** What each stored attachment shows, in one read for all the GIFs among them. */
export async function attachmentViews(list: unknown[]): Promise<(AttachmentView | null)[]> {
  const parsed = list.map(parseAttachment);
  const ids = [...new Set(parsed.flatMap((a) => (a?.kind === "gif" ? [a.id] : [])))];
  const gifs = new Map<string, GifView>();
  if (ids.length) {
    const { data } = await createServiceClient().from("gifs").select(COLS).in("id", ids).eq("status", "ok");
    for (const r of (data ?? []) as Row[]) gifs.set(r.id, view(r));
  }
  return parsed.map((a) => {
    if (!a) return null;
    if (a.kind === "sticker") return a;
    const g = gifs.get(a.id);
    return g ? { kind: "gif", gif: g } : { kind: "gone" };
  });
}

// ── Staff ─────────────────────────────────────────────────────────────────────

export interface StaffGif extends GifView {
  owner: { id: string; name: string; username: string | null };
  status: "ok" | "held";
  shared: boolean;
  reason: string | null;
  tags: string[];
  reports: { id: string; reason: string; details: string | null; createdAt: string }[];
  createdAt: string;
}

/** Held GIFs and GIFs with open reports, oldest first. */
export async function staffQueue(): Promise<StaffGif[]> {
  const admin = createServiceClient();
  const [{ data: held }, { data: reports }] = await Promise.all([
    admin.from("gifs").select(COLS).eq("status", "held").order("created_at", { ascending: true }).limit(100),
    admin.from("reports").select("id, target_id, reason, details, created_at").eq("target_type", "gif").in("status", ["open", "reviewing"]).order("created_at", { ascending: true }).limit(300),
  ]);
  const reportRows = (reports ?? []) as { id: string; target_id: string; reason: string; details: string | null; created_at: string }[];
  const reportedIds = [...new Set(reportRows.map((r) => r.target_id))].filter((id) => !((held ?? []) as Row[]).some((h) => h.id === id));
  const { data: reported } = reportedIds.length
    ? await admin.from("gifs").select(COLS).in("id", reportedIds).in("status", ["ok", "held"])
    : { data: [] };
  const rows = [...((held ?? []) as Row[]), ...((reported ?? []) as Row[])];
  const owners = [...new Set(rows.map((r) => r.owner_user_id))];
  const { data: users } = owners.length ? await admin.from("users").select("id, display_name, username").in("id", owners) : { data: [] };
  const who = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = who.get(r.owner_user_id);
    return {
      ...view(r),
      owner: { id: r.owner_user_id, name: u?.display_name || u?.username || "A player", username: u?.username ?? null },
      status: r.status === "held" ? "held" : "ok",
      shared: r.shared,
      reason: r.check_reason,
      tags: r.tags ?? [],
      reports: reportRows.filter((x) => x.target_id === r.id).map((x) => ({ id: x.id, reason: x.reason, details: x.details, createdAt: x.created_at })),
      createdAt: r.created_at,
    };
  });
}

async function closeReports(gifId: string, staffId: string, status: "actioned" | "dismissed", action: string): Promise<void> {
  await createServiceClient().from("reports").update({
    status, staff_user_id: staffId, action_taken: action, resolved_at: new Date().toISOString(),
  }).eq("target_type", "gif").eq("target_id", gifId).in("status", ["open", "reviewing"]);
}

export async function staffAllow(staffId: string, id: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin.from("gifs").update({ status: "ok", reviewed_by: staffId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).in("status", ["ok", "held"]).select("owner_user_id").maybeSingle();
  if (!data) return false;
  await closeReports(id, staffId, "dismissed", "gif_allowed");
  await writeModerationAudit({ actorUserId: staffId, targetUserId: (data as { owner_user_id: string }).owner_user_id, action: "gif_allowed", detail: id });
  return true;
}

/** Takes a GIF down: off every page, its files deleted, its fingerprint kept so it can't be uploaded again. */
export async function staffRemove(staffId: string, id: string, reason: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin.from("gifs").update({ status: "removed", shared: false, reviewed_by: staffId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).in("status", ["ok", "held"]).select("owner_user_id, url, still_url, sha256, dhash").maybeSingle();
  const r = data as (Pick<Row, "owner_user_id" | "url" | "still_url" | "sha256" | "dhash">) | null;
  if (!r) return false;
  await admin.from("gif_blocked").upsert({ sha256: r.sha256, dhash: r.dhash, gif_id: id, reason: reason.slice(0, 200), removed_by: staffId }, { onConflict: "sha256" });
  await dropFiles(r);
  await closeReports(id, staffId, "actioned", "gif_removed");
  await writeModerationAudit({ actorUserId: staffId, targetUserId: r.owner_user_id, action: "gif_removed", detail: `${id}: ${reason}`.slice(0, 300) });
  return true;
}
