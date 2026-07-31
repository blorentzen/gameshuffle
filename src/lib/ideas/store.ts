import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { listBlockedByUser } from "@/lib/moderation/blocks";
import { can } from "@/lib/moderation/standing";
import { IDEA_LIMITS, PUBLIC_IDEA_STATUSES, type IdeaCategory } from "./constants";
import type { Idea, IdeaAuthor, IdeaCycle, IdeaSort } from "./types";

/**
 * Idea Board data access (server-only, service client). RLS is defense-in-depth
 * for any direct client reads; because the service client BYPASSES RLS, every
 * rule the board depends on (public-status gating, vote-only-when-public,
 * content freeze after publish) is ALSO enforced here in code.
 *
 * Public payloads never include internal columns (`moderation_note`,
 * `reviewed_by`) — we select an explicit allowlist, never `*` (§7).
 */

// Public/author-safe column allowlist — no moderation_note / reviewed_by.
const IDEA_COLS =
  "id, author_id, title, body, category, status, vote_count, submitted_at, published_at, expires_at, cycle_id, verdict, verdict_note, shipped_ref";
// Author-only variant: adds the reject reason, exposed to the author (§4).
const IDEA_COLS_AUTHOR = `${IDEA_COLS}, moderation_note`;

interface IdeaRow {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: IdeaCategory;
  status: Idea["status"];
  vote_count: number;
  submitted_at: string;
  published_at: string | null;
  expires_at: string | null;
  cycle_id: string | null;
  verdict: "planned" | "declined" | null;
  verdict_note: string | null;
  shipped_ref: string | null;
}

function rowToIdea(
  r: IdeaRow,
  author: IdeaAuthor | null,
  hasVoted?: boolean,
  moderationNote?: string | null,
): Idea {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    status: r.status,
    voteCount: r.vote_count,
    submittedAt: r.submitted_at,
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    cycleId: r.cycle_id,
    verdict: r.verdict,
    verdictNote: r.verdict_note,
    shippedRef: r.shipped_ref,
    author,
    hasVoted,
    moderationNote,
  };
}

async function hydrateAuthors(ids: string[]): Promise<Map<string, IdeaAuthor>> {
  const map = new Map<string, IdeaAuthor>();
  const unique = [...new Set(ids)];
  if (!unique.length) return map;
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("id, display_name, username, discord_avatar, twitch_avatar")
    .in("id", unique);
  for (const u of (data ?? []) as Array<{
    id: string;
    display_name: string | null;
    username: string | null;
    discord_avatar: string | null;
    twitch_avatar: string | null;
  }>) {
    map.set(u.id, {
      id: u.id,
      name: u.display_name || u.username || "Player",
      username: u.username,
      avatar: u.discord_avatar || u.twitch_avatar || null,
    });
  }
  return map;
}

/** Which of these idea ids the viewer has voted on. */
async function votedSet(viewerId: string | null, ideaIds: string[]): Promise<Set<string>> {
  if (!viewerId || !ideaIds.length) return new Set();
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_idea_votes")
    .select("idea_id")
    .eq("user_id", viewerId)
    .in("idea_id", ideaIds);
  return new Set(((data ?? []) as { idea_id: string }[]).map((r) => r.idea_id));
}

// ---------------------------------------------------------------------------
// Public board
// ---------------------------------------------------------------------------

export async function listPublicIdeas(opts: {
  viewerId?: string | null;
  category?: IdeaCategory | null;
  status?: Idea["status"] | null;
  sort?: IdeaSort;
  limit?: number;
}): Promise<Idea[]> {
  const admin = createServiceClient();
  const viewerId = opts.viewerId ?? null;
  const nowIso = new Date().toISOString();

  let q = admin.from("gs_ideas").select(IDEA_COLS);

  if (opts.status && PUBLIC_IDEA_STATUSES.includes(opts.status)) {
    q = q.eq("status", opts.status);
  } else {
    q = q.in("status", PUBLIC_IDEA_STATUSES as unknown as string[]);
  }
  if (opts.category) q = q.eq("category", opts.category);

  // Lazy expiry filter (§5.3): a public row past its window is not listed.
  q = q.or(`status.neq.public,expires_at.is.null,expires_at.gt.${nowIso}`);

  q = opts.sort === "new"
    ? q.order("published_at", { ascending: false, nullsFirst: false })
    : q.order("vote_count", { ascending: false });

  q = q.limit(opts.limit ?? 100);

  const { data } = await q;
  let rows = (data ?? []) as IdeaRow[];

  // Exclude ideas authored by anyone the viewer has blocked (§6.1).
  if (viewerId) {
    const blocked = new Set((await listBlockedByUser(viewerId)).map((b) => b.userId));
    if (blocked.size) rows = rows.filter((r) => !blocked.has(r.author_id));
  }

  const authors = await hydrateAuthors(rows.map((r) => r.author_id));
  const voted = await votedSet(viewerId, rows.map((r) => r.id));
  return rows.map((r) => rowToIdea(r, authors.get(r.author_id) ?? null, voted.has(r.id)));
}

/** The currently-open voting cycle, if any — drives the board banner (§6.1). */
export async function getVotingCycle(): Promise<IdeaCycle | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_idea_cycles")
    .select("id, name, opens_at, closes_at, status, slots")
    .eq("status", "voting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const c = data as {
    id: string;
    name: string;
    opens_at: string | null;
    closes_at: string | null;
    status: IdeaCycle["status"];
    slots: number;
  };
  return { id: c.id, name: c.name, opensAt: c.opens_at, closesAt: c.closes_at, status: c.status, slots: c.slots };
}

/** A single idea for the detail page — public rows for anyone, any-status for the author. */
export async function getIdea(id: string, viewerId: string | null): Promise<Idea | null> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_ideas").select(IDEA_COLS_AUTHOR).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as IdeaRow & { moderation_note: string | null };

  const isAuthor = !!viewerId && viewerId === row.author_id;
  const isPublicStatus = PUBLIC_IDEA_STATUSES.includes(row.status);
  const expired =
    row.status === "public" && row.expires_at != null && new Date(row.expires_at) < new Date();
  if (!isAuthor && (!isPublicStatus || expired)) return null;

  const authors = await hydrateAuthors([row.author_id]);
  const voted = await votedSet(viewerId, [row.id]);
  // Reject reason only ever reaches the author.
  return rowToIdea(row, authors.get(row.author_id) ?? null, voted.has(row.id), isAuthor ? row.moderation_note : undefined);
}

// ---------------------------------------------------------------------------
// Author surfaces
// ---------------------------------------------------------------------------

export async function listMyIdeas(userId: string): Promise<Idea[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_ideas")
    .select(IDEA_COLS_AUTHOR)
    .eq("author_id", userId)
    .order("submitted_at", { ascending: false });
  const rows = (data ?? []) as Array<IdeaRow & { moderation_note: string | null }>;
  const author = (await hydrateAuthors([userId])).get(userId) ?? null;
  return rows.map((r) => rowToIdea(r, author, undefined, r.moderation_note));
}

/** Pending review queue (§6.5) — oldest first. Admin-only (enforced in the route). */
export async function listPendingIdeas(): Promise<Idea[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_ideas")
    .select(IDEA_COLS)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });
  const rows = (data ?? []) as IdeaRow[];
  const authors = await hydrateAuthors(rows.map((r) => r.author_id));
  return rows.map((r) => rowToIdea(r, authors.get(r.author_id) ?? null));
}

export type CreateIdeaResult =
  | { ok: true; id: string }
  | { ok: false; reason: "rate_limited" | "invalid" | "restricted" };

export async function createIdea(args: {
  authorId: string;
  title: string;
  body: string;
  category: IdeaCategory;
}): Promise<CreateIdeaResult> {
  const title = args.title.trim();
  const body = args.body.trim();
  if (!title || !body || title.length > IDEA_LIMITS.titleMax || body.length > IDEA_LIMITS.bodyMax) {
    return { ok: false, reason: "invalid" };
  }
  if (!(await can(args.authorId, "can_submit_ideas"))) return { ok: false, reason: "restricted" };
  const admin = createServiceClient();

  // 24h submission cap (§7) — DB count, since the in-memory limiter isn't
  // durable across serverless instances.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("gs_ideas")
    .select("id", { count: "exact", head: true })
    .eq("author_id", args.authorId)
    .gte("submitted_at", since);
  if ((count ?? 0) >= IDEA_LIMITS.submissionsPer24h) return { ok: false, reason: "rate_limited" };

  const { data, error } = await admin
    .from("gs_ideas")
    .insert({ author_id: args.authorId, title, body, category: args.category, status: "submitted" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: "invalid" };
  return { ok: true, id: (data as { id: string }).id };
}

/** Authors may edit title/body ONLY while still `submitted` (content freeze on publish, §4). */
export async function updateMyIdea(args: {
  id: string;
  authorId: string;
  title: string;
  body: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const title = args.title.trim();
  const body = args.body.trim();
  if (!title || !body || title.length > IDEA_LIMITS.titleMax || body.length > IDEA_LIMITS.bodyMax) {
    return { ok: false, reason: "invalid" };
  }
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("gs_ideas")
    .select("author_id, status")
    .eq("id", args.id)
    .maybeSingle();
  if (!existing) return { ok: false, reason: "not_found" };
  const row = existing as { author_id: string; status: string };
  if (row.author_id !== args.authorId) return { ok: false, reason: "forbidden" };
  if (row.status !== "submitted") return { ok: false, reason: "frozen" };

  await admin.from("gs_ideas").update({ title, body }).eq("id", args.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Voting (§5.1) — one per user, toggle, only while public
// ---------------------------------------------------------------------------

export async function toggleVote(
  ideaId: string,
  userId: string,
): Promise<{ ok: boolean; voted?: boolean; reason?: string }> {
  const admin = createServiceClient();
  const { data: idea } = await admin.from("gs_ideas").select("status").eq("id", ideaId).maybeSingle();
  if (!idea) return { ok: false, reason: "not_found" };
  if ((idea as { status: string }).status !== "public") return { ok: false, reason: "closed" };

  const { data: existing } = await admin
    .from("gs_idea_votes")
    .select("idea_id")
    .eq("idea_id", ideaId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await admin.from("gs_idea_votes").delete().eq("idea_id", ideaId).eq("user_id", userId);
    return { ok: true, voted: false };
  }
  await admin.from("gs_idea_votes").insert({ idea_id: ideaId, user_id: userId });
  return { ok: true, voted: true };
}
