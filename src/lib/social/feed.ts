import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { resolveNameColor } from "@/data/arcade-items";

/**
 * Social feed (community platform v1) — posts, emoji reactions, threaded
 * comments, comment likes. Block-aware, public-by-default, rate-limited.
 * All access is server-side via the service-role client; API routes gate auth.
 *
 * Reactions/comments/mentions route into the existing notifications system.
 */

const POST_MAX = 2000;
const COMMENT_MAX = 2000;
const POSTS_PER_MIN = 5;
const COMMENTS_PER_MIN = 15;

export interface FeedAuthor {
  id: string;
  name: string;
  username: string | null;
  avatarSource: string | null;
  avatarSeed: string | null;
  avatarOptions: Record<string, unknown> | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;
  /** Equipped Arcade name color (CSS color), if any. */
  nameColor: string | null;
}

/** When a post is authored AS a community (Page-style), who to display. */
export interface FeedPostedAs {
  communityId: string;
  slug: string;
  name: string;
}

export interface FeedReaction {
  emoji: string;
  count: number;
  reacted: boolean;
  /** Names of who reacted (for the CDS hover tooltip); "You" first when the viewer did. */
  users?: string[];
}

/** Structured meta for a post. Fields used depend on `kind`:
 *  - game_night: game / startAt / capacity
 *  - share: entityType / entityId / title / subtitle / url */
export interface PostMeta {
  game?: string | null;
  startAt?: string | null; // ISO; null = "now / open"
  capacity?: number | null;
  entityType?: "tournament" | "session" | null;
  entityId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  url?: string | null;
}

export type RsvpStatus = "going" | "interested";

export interface RsvpSummary {
  going: number;
  interested: number;
  myStatus: RsvpStatus | null;
  attendees: FeedAuthor[]; // a few "going" faces
}

export interface FeedPost {
  id: string;
  body: string;
  kind: string;
  meta: PostMeta | null;
  createdAt: string;
  editedAt: string | null;
  imageUrls: string[];
  author: FeedAuthor;
  /** Set when the post was made AS a community (render this instead of author). */
  postedAs: FeedPostedAs | null;
  /** Topic tags (bubbled below the post; link to /t/[tag]). */
  topics: string[];
  reactions: FeedReaction[];
  commentCount: number;
  rsvp: RsvpSummary | null; // present for game_night posts
  isOwn: boolean;
}

/** CDS-shaped comment node (matches CDS `CommentData`) for direct rendering. */
export interface FeedComment {
  id: string;
  content: string;
  author: { id: string; name: string; avatar?: string; initials?: string };
  /** Full author (username + avatar identity) so the custom comment tree can
   *  link the name to /u and render the real avatar (incl. dicebear). */
  authorFull?: FeedAuthor;
  timestamp: string;
  likes: number;
  likedByMe: boolean;
  isEdited?: boolean;
  replies?: FeedComment[];
}

type UserRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_source: string | null;
  avatar_seed: string | null;
  avatar_options: Record<string, unknown> | null;
  discord_avatar: string | null;
  twitch_avatar: string | null;
  equipped_name_color: string | null;
};

const AUTHOR_COLS =
  "id, display_name, username, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, equipped_name_color";

const POST_COLS = "id, author_id, body, kind, meta, created_at, edited_at, community_id, as_community, image_url, image_urls";
const ATTENDEE_FACES = 5;

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  kind: string;
  meta: PostMeta | null;
  created_at: string;
  edited_at: string | null;
  community_id: string | null;
  as_community: boolean | null;
  image_url: string | null;
  image_urls: string[] | null;
};

function sanitizeMeta(meta: unknown): PostMeta {
  const m = (meta ?? {}) as Record<string, unknown>;
  const game = typeof m.game === "string" ? m.game.slice(0, 100) : null;
  let startAt: string | null = null;
  if (typeof m.startAt === "string") {
    const t = new Date(m.startAt).getTime();
    if (!Number.isNaN(t)) startAt = new Date(t).toISOString();
  }
  let capacity: number | null = null;
  if (typeof m.capacity === "number" && Number.isFinite(m.capacity)) {
    capacity = Math.min(1000, Math.max(1, Math.round(m.capacity)));
  }
  return { game, startAt, capacity };
}

function sanitizeShareMeta(meta: unknown): PostMeta {
  const m = (meta ?? {}) as Record<string, unknown>;
  const entityType = m.entityType === "tournament" || m.entityType === "session" ? m.entityType : null;
  const entityId = typeof m.entityId === "string" ? m.entityId.slice(0, 100) : null;
  const title = typeof m.title === "string" ? m.title.slice(0, 200) : null;
  const subtitle = typeof m.subtitle === "string" ? m.subtitle.slice(0, 200) : null;
  let url: string | null = null;
  // Only accept internal (same-site) paths to avoid open-redirect-style previews.
  if (typeof m.url === "string" && m.url.startsWith("/") && !m.url.startsWith("//")) {
    url = m.url.slice(0, 300);
  }
  return { entityType, entityId, title, subtitle, url };
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}

function toAuthor(u: UserRow): FeedAuthor {
  return {
    id: u.id,
    name: u.display_name || u.username || "Player",
    username: u.username,
    avatarSource: u.avatar_source,
    avatarSeed: u.avatar_seed,
    avatarOptions: u.avatar_options,
    discordAvatar: u.discord_avatar,
    twitchAvatar: u.twitch_avatar,
    nameColor: resolveNameColor(u.equipped_name_color),
  };
}

/** Usernames referenced with @ in a body (lowercased, unique, max 10). */
function extractMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/@([A-Za-z0-9_]{2,30})/g)) out.add(m[1].toLowerCase());
  return [...out].slice(0, 10);
}

/** Hashtag topics in a body (lowercased, unique, max 10). */
export function extractHashtags(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/#([A-Za-z0-9_]{2,50})/g)) out.add(m[1].toLowerCase());
  return [...out].slice(0, 10);
}

/**
 * Normalize a bubbled topic while preserving the author's formatting — case and
 * spacing survive ("GameShuffle Features" stays "GameShuffle Features"). Only a
 * leading '#' and characters that would break the /t/[tag] route are stripped,
 * runs of whitespace collapse, and it's capped at 50 chars. Returns null if
 * nothing usable is left. Keep in sync with the composer's client-side copy. */
export function normalizeTopic(raw: string): string | null {
  const t = raw
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N} _&+.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  return t.length >= 2 ? t : null;
}

/** Accounts the viewer has blocked OR who have blocked the viewer. */
async function blockedIds(viewerId: string): Promise<Set<string>> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("user_blocks")
    .select("blocker_user_id, blocked_user_id")
    .or(`blocker_user_id.eq.${viewerId},blocked_user_id.eq.${viewerId}`);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ blocker_user_id: string; blocked_user_id: string }>) {
    set.add(r.blocker_user_id === viewerId ? r.blocked_user_id : r.blocker_user_id);
  }
  return set;
}

async function resolveMentionIds(usernames: string[]): Promise<Map<string, string>> {
  if (!usernames.length) return new Map();
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("id, username").in("username", usernames);
  const map = new Map<string, string>();
  for (const u of (data ?? []) as Array<{ id: string; username: string | null }>) {
    if (u.username) map.set(u.username.toLowerCase(), u.id);
  }
  return map;
}

async function recentCount(table: string, authorId: string): Promise<number> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("author_id", authorId)
    .gte("created_at", since);
  return count ?? 0;
}

// ── Posts ──────────────────────────────────────────────────────────────────

export async function createPost(args: {
  authorId: string;
  body: string;
  kind?: string;
  meta?: unknown;
  /** When set, the post belongs to this community (shows on /c/[slug] instead
   *  of the global feed). Null/undefined = a global/personal post. */
  communityId?: string | null;
  /** Post AS the community (Page-style). Only honored with a communityId. */
  asCommunity?: boolean;
  /** Optional attached images (public R2 URLs from /api/social/posts/image). */
  imageUrls?: string[] | null;
  /** Topic tags added via the composer's bubbled Topics field (no '#' needed). */
  topics?: string[] | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: "empty" | "rate_limited" }> {
  const body = args.body.trim().slice(0, POST_MAX);
  const imageUrls = (args.imageUrls ?? [])
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    .slice(0, 8);
  // A post needs either text or at least one image.
  if (!body && imageUrls.length === 0) return { ok: false, reason: "empty" };
  if ((await recentCount("gs_posts", args.authorId)) >= POSTS_PER_MIN) {
    return { ok: false, reason: "rate_limited" };
  }
  const kind = args.kind === "game_night" ? "game_night" : args.kind === "share" ? "share" : "text";
  const meta = kind === "game_night" ? sanitizeMeta(args.meta) : kind === "share" ? sanitizeShareMeta(args.meta) : null;
  const asCommunity = !!args.asCommunity && !!args.communityId;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_posts")
    .insert({ author_id: args.authorId, body, kind, meta, community_id: args.communityId ?? null, as_community: asCommunity, image_url: imageUrls[0] ?? null, image_urls: imageUrls })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("post insert failed");
  const postId = data.id as string;

  // Tags come from the bubbled Topics field (formatting preserved) + any
  // #hashtags typed inline. Dedupe case-insensitively but keep the first
  // spelling seen, so "Intro" and "intro" don't both survive on one post.
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of [...extractHashtags(body), ...(args.topics ?? [])]) {
    const t = normalizeTopic(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
    if (tags.length >= 10) break;
  }
  if (tags.length) {
    await admin.from("gs_post_hashtags").insert(tags.map((tag) => ({ post_id: postId, tag })));
  }

  await notifyMentions(body, { actorId: args.authorId, postId, context: "post" });
  return { ok: true, id: postId };
}

/** Hydrate a batch of post rows into FeedPosts (authors + reactions + counts + RSVP). */
async function hydratePosts(rows: PostRow[], viewerId: string): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const admin = createServiceClient();
  const postIds = rows.map((r) => r.id);
  const gameNightIds = rows.filter((r) => r.kind === "game_night").map((r) => r.id);

  const [{ data: reactions }, { data: comments }, { data: rsvps }, { data: tagRows }] = await Promise.all([
    admin.from("gs_post_reactions").select("post_id, emoji, user_id").in("post_id", postIds),
    admin.from("gs_post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null),
    gameNightIds.length
      ? admin.from("gs_post_rsvps").select("post_id, user_id, status").in("post_id", gameNightIds)
      : Promise.resolve({ data: [] as Array<{ post_id: string; user_id: string; status: string }> }),
    admin.from("gs_post_hashtags").select("post_id, tag").in("post_id", postIds),
  ]);

  const tagMap = new Map<string, string[]>();
  for (const t of (tagRows ?? []) as Array<{ post_id: string; tag: string }>) {
    (tagMap.get(t.post_id) ?? tagMap.set(t.post_id, []).get(t.post_id)!).push(t.tag);
  }

  // Fetch author + attendee + reactor profiles together (so reaction tooltips
  // can name who reacted). Reactors/attendees may not be post authors.
  const attendeeIds = ((rsvps ?? []) as Array<{ user_id: string; status: string }>)
    .filter((r) => r.status === "going")
    .map((r) => r.user_id);
  const reactorIds = ((reactions ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  const peopleIds = [...new Set([...rows.map((r) => r.author_id), ...attendeeIds, ...reactorIds])];
  const { data: users } = await admin.from("users").select(AUTHOR_COLS).in("id", peopleIds);

  const authorMap = new Map<string, FeedAuthor>();
  for (const u of (users ?? []) as UserRow[]) authorMap.set(u.id, toAuthor(u));

  // RSVP aggregation per post.
  const rsvpMap = new Map<string, { going: string[]; interested: number; myStatus: RsvpStatus | null }>();
  for (const r of (rsvps ?? []) as Array<{ post_id: string; user_id: string; status: string }>) {
    let agg = rsvpMap.get(r.post_id);
    if (!agg) rsvpMap.set(r.post_id, (agg = { going: [], interested: 0, myStatus: null }));
    if (r.status === "going") agg.going.push(r.user_id);
    else if (r.status === "interested") agg.interested += 1;
    if (r.user_id === viewerId) agg.myStatus = r.status === "going" ? "going" : "interested";
  }

  // Aggregate reactions per post → emoji → {count, reacted, userIds}.
  const reactMap = new Map<string, Map<string, { count: number; reacted: boolean; userIds: string[] }>>();
  for (const r of (reactions ?? []) as Array<{ post_id: string; emoji: string; user_id: string }>) {
    let byEmoji = reactMap.get(r.post_id);
    if (!byEmoji) reactMap.set(r.post_id, (byEmoji = new Map()));
    const cur = byEmoji.get(r.emoji) ?? { count: 0, reacted: false, userIds: [] };
    cur.count += 1;
    cur.userIds.push(r.user_id);
    if (r.user_id === viewerId) cur.reacted = true;
    byEmoji.set(r.emoji, cur);
  }

  const commentCounts = new Map<string, number>();
  for (const c of (comments ?? []) as Array<{ post_id: string }>) {
    commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1);
  }

  const fallbackAuthor = (id: string): FeedAuthor => ({
    id, name: "Player", username: null, avatarSource: null, avatarSeed: null,
    avatarOptions: null, discordAvatar: null, twitchAvatar: null, nameColor: null,
  });

  // Page-style posts: fetch the communities they were posted as.
  const pageCommunityIds = [...new Set(rows.filter((r) => r.as_community && r.community_id).map((r) => r.community_id as string))];
  const communityById = new Map<string, { slug: string; name: string }>();
  if (pageCommunityIds.length) {
    const { data: comms } = await admin
      .from("gs_communities")
      .select("id, slug, display_name")
      .in("id", pageCommunityIds);
    for (const c of (comms ?? []) as Array<{ id: string; slug: string; display_name: string | null }>) {
      communityById.set(c.id, { slug: c.slug, name: c.display_name || `@${c.slug}` });
    }
  }

  return rows.map((r) => {
    let rsvp: RsvpSummary | null = null;
    if (r.kind === "game_night") {
      const agg = rsvpMap.get(r.id) ?? { going: [], interested: 0, myStatus: null };
      rsvp = {
        going: agg.going.length,
        interested: agg.interested,
        myStatus: agg.myStatus,
        attendees: agg.going
          .slice(0, ATTENDEE_FACES)
          .map((id) => authorMap.get(id) ?? fallbackAuthor(id)),
      };
    }
    return {
      id: r.id,
      body: r.body,
      kind: r.kind,
      meta: r.meta ?? null,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      imageUrls: (r.image_urls && r.image_urls.length > 0) ? r.image_urls : (r.image_url ? [r.image_url] : []),
      author: authorMap.get(r.author_id) ?? fallbackAuthor(r.author_id),
      postedAs: r.as_community && r.community_id && communityById.has(r.community_id)
        ? { communityId: r.community_id, ...communityById.get(r.community_id)! }
        : null,
      topics: tagMap.get(r.id) ?? [],
      reactions: [...(reactMap.get(r.id)?.entries() ?? [])]
        .map(([emoji, v]) => ({
          emoji,
          count: v.count,
          reacted: v.reacted,
          // Names for the hover tooltip ("You, Alex, Sam"), viewer first, capped.
          users: v.userIds
            .slice(0, 12)
            .map((uid) => (uid === viewerId ? "You" : authorMap.get(uid)?.name ?? "Player")),
        }))
        .sort((a, b) => b.count - a.count),
      commentCount: commentCounts.get(r.id) ?? 0,
      rsvp,
      isOwn: r.author_id === viewerId,
    };
  });
}

/**
 * The main feed with three scopes:
 *   for_you     — ALL public posts across GameShuffle (global + community). The
 *                 all-up firehose / discovery feed (chronological for now;
 *                 ranking hooks off the engagement counters later).
 *   following   — posts by people the viewer follows (and their own).
 *   communities — posts in the communities the viewer has joined.
 */
export async function listFeed(opts: {
  viewerId: string;
  scope: "for_you" | "following" | "communities";
  before?: string | null;
  limit?: number;
}): Promise<FeedPost[]> {
  const admin = createServiceClient();
  const limit = opts.limit ?? 20;

  let authorFilter: string[] | null = null;
  let communityFilter: string[] | null = null;

  if (opts.scope === "following") {
    const { data: f } = await admin
      .from("follows")
      .select("followee_user_id")
      .eq("follower_user_id", opts.viewerId);
    authorFilter = [
      opts.viewerId,
      ...((f ?? []) as Array<{ followee_user_id: string }>).map((r) => r.followee_user_id),
    ];
    if (authorFilter.length === 0) return [];
  } else if (opts.scope === "communities") {
    const { data: m } = await admin
      .from("community_members")
      .select("community_id")
      .eq("user_id", opts.viewerId);
    communityFilter = ((m ?? []) as Array<{ community_id: string }>).map((r) => r.community_id);
    if (communityFilter.length === 0) return [];
  }

  let q = admin
    .from("gs_posts")
    .select(POST_COLS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit * 2); // over-fetch for block filtering
  if (authorFilter) q = q.in("author_id", authorFilter);
  if (communityFilter) q = q.in("community_id", communityFilter);
  if (opts.before) q = q.lt("created_at", opts.before);

  const { data } = await q;
  let rows = (data ?? []) as PostRow[];

  const blocked = await blockedIds(opts.viewerId);
  rows = rows.filter((r) => !blocked.has(r.author_id)).slice(0, limit);

  return hydratePosts(rows, opts.viewerId);
}

/** Posts tagged with a hashtag topic (newest first). Public read. */
export async function listFeedByTag(opts: {
  tag: string;
  viewerId: string;
  limit?: number;
}): Promise<FeedPost[]> {
  const tag = opts.tag.replace(/^#+/, "").trim();
  if (!tag) return [];
  const admin = createServiceClient();
  const limit = opts.limit ?? 25;
  // Match case-insensitively so "Intro" and "intro" land on the same topic page,
  // while stored tags keep the author's formatting. Escape ilike wildcards
  // (% _ \) so the value matches literally.
  const pattern = tag.replace(/([\\%_])/g, "\\$1");
  const { data: tagRows } = await admin
    .from("gs_post_hashtags")
    .select("post_id")
    .ilike("tag", pattern)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  const postIds = [...new Set(((tagRows ?? []) as { post_id: string }[]).map((r) => r.post_id))];
  if (postIds.length === 0) return [];

  const { data } = await admin
    .from("gs_posts")
    .select(POST_COLS)
    .in("id", postIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  let rows = (data ?? []) as PostRow[];
  if (opts.viewerId) {
    const blocked = await blockedIds(opts.viewerId);
    rows = rows.filter((r) => !blocked.has(r.author_id));
  }
  return hydratePosts(rows.slice(0, limit), opts.viewerId);
}

export interface TrendingTag {
  tag: string;
  count: number;
}

/** Trending hashtags over a recent window (by post count). */
export async function getTrendingTags(limit = 8, windowHours = 72): Promise<TrendingTag[]> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const { data } = await admin
    .from("gs_post_hashtags")
    .select("tag")
    .gte("created_at", since)
    .limit(2000);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { tag: string }[]) counts.set(r.tag, (counts.get(r.tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Feed for a single community's /c home. Public read (community membership is
 * social) — pass the viewer's id for reaction/RSVP state, or an empty string for
 * an anonymous visitor. Block-filtered like the global feed.
 */
export async function listCommunityFeed(opts: {
  communityId: string;
  viewerId: string;
  before?: string | null;
  limit?: number;
}): Promise<FeedPost[]> {
  if (!opts.communityId) return [];
  const admin = createServiceClient();
  const limit = opts.limit ?? 20;

  let q = admin
    .from("gs_posts")
    .select(POST_COLS)
    .is("deleted_at", null)
    .eq("community_id", opts.communityId)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  if (opts.before) q = q.lt("created_at", opts.before);

  const { data } = await q;
  let rows = (data ?? []) as PostRow[];

  if (opts.viewerId) {
    const blocked = await blockedIds(opts.viewerId);
    rows = rows.filter((r) => !blocked.has(r.author_id));
  }
  rows = rows.slice(0, limit);

  return hydratePosts(rows, opts.viewerId);
}

/**
 * Home timeline — one merged feed of the posts from every community the viewer
 * has joined PLUS the global posts of the people they follow (and their own).
 * This is the "there's always something happening" surface: the social home.
 */
export async function listHomeFeed(opts: { viewerId: string; limit?: number }): Promise<FeedPost[]> {
  if (!opts.viewerId) return [];
  const admin = createServiceClient();
  const limit = opts.limit ?? 25;

  const [{ data: memberRows }, { data: followRows }] = await Promise.all([
    admin.from("community_members").select("community_id").eq("user_id", opts.viewerId),
    admin.from("follows").select("followee_user_id").eq("follower_user_id", opts.viewerId),
  ]);
  const communityIds = ((memberRows ?? []) as Array<{ community_id: string }>).map((r) => r.community_id);
  const authorIds = [
    opts.viewerId,
    ...((followRows ?? []) as Array<{ followee_user_id: string }>).map((r) => r.followee_user_id),
  ];

  const [communityPosts, followPosts] = await Promise.all([
    communityIds.length
      ? admin.from("gs_posts").select(POST_COLS).is("deleted_at", null).in("community_id", communityIds)
          .order("created_at", { ascending: false }).limit(limit * 2)
      : Promise.resolve({ data: [] as PostRow[] }),
    admin.from("gs_posts").select(POST_COLS).is("deleted_at", null).is("community_id", null).in("author_id", authorIds)
      .order("created_at", { ascending: false }).limit(limit * 2),
  ]);

  // Merge, dedupe by id, newest first.
  const byId = new Map<string, PostRow>();
  for (const r of [...((communityPosts.data ?? []) as PostRow[]), ...((followPosts.data ?? []) as PostRow[])]) {
    byId.set(r.id, r);
  }
  let rows = [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const blocked = await blockedIds(opts.viewerId);
  rows = rows.filter((r) => !blocked.has(r.author_id)).slice(0, limit);

  return hydratePosts(rows, opts.viewerId);
}

export async function getPost(postId: string, viewerId: string): Promise<FeedPost | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_posts")
    .select(POST_COLS)
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const [post] = await hydratePosts([data as never], viewerId);
  return post ?? null;
}

export async function getPostsByAuthor(authorId: string, viewerId: string, limit = 20): Promise<FeedPost[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_posts")
    .select(POST_COLS)
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return hydratePosts((data ?? []) as never, viewerId);
}

export async function deletePost(postId: string, userId: string, isStaff: boolean): Promise<boolean> {
  const admin = createServiceClient();
  const { data: post } = await admin.from("gs_posts").select("author_id").eq("id", postId).maybeSingle();
  if (!post) return false;
  if ((post as { author_id: string }).author_id !== userId && !isStaff) return false;
  await admin.from("gs_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
  return true;
}

// ── Reactions ────────────────────────────────────────────────────────────────

export async function reactToPost(args: { postId: string; userId: string; emoji: string }): Promise<void> {
  const admin = createServiceClient();
  const { data: post } = await admin.from("gs_posts").select("author_id").eq("id", args.postId).maybeSingle();
  if (!post) return;

  // Was this the user's first reaction on the post? (notify only once)
  const { count: prior } = await admin
    .from("gs_post_reactions")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", args.postId)
    .eq("user_id", args.userId);

  await admin
    .from("gs_post_reactions")
    .upsert({ post_id: args.postId, user_id: args.userId, emoji: args.emoji }, { onConflict: "post_id,user_id,emoji" });

  const authorId = (post as { author_id: string }).author_id;
  if ((prior ?? 0) === 0 && authorId !== args.userId) {
    await createNotification({
      userId: authorId,
      type: "post_reaction",
      title: "reacted to your post",
      actorUserId: args.userId,
      link: `/community/post/${args.postId}`,
      data: { postId: args.postId },
    });
  }
}

export async function removeReaction(args: { postId: string; userId: string; emoji: string }): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("gs_post_reactions")
    .delete()
    .eq("post_id", args.postId)
    .eq("user_id", args.userId)
    .eq("emoji", args.emoji);
}

// ── Game Night RSVP ──────────────────────────────────────────────────────────

export async function setRsvp(args: {
  postId: string;
  userId: string;
  status: RsvpStatus;
}): Promise<void> {
  const admin = createServiceClient();
  const { data: post } = await admin
    .from("gs_posts")
    .select("author_id, kind")
    .eq("id", args.postId)
    .maybeSingle();
  if (!post || (post as { kind: string }).kind !== "game_night") return;

  const { data: prior } = await admin
    .from("gs_post_rsvps")
    .select("status")
    .eq("post_id", args.postId)
    .eq("user_id", args.userId)
    .maybeSingle();

  await admin
    .from("gs_post_rsvps")
    .upsert({ post_id: args.postId, user_id: args.userId, status: args.status }, { onConflict: "post_id,user_id" });

  // Notify the host the first time someone RSVPs (not on going↔interested flips).
  const authorId = (post as { author_id: string }).author_id;
  if (!prior && authorId !== args.userId) {
    await createNotification({
      userId: authorId,
      type: "game_night_rsvp",
      title: args.status === "going" ? "is in for your game night" : "is interested in your game night",
      actorUserId: args.userId,
      link: `/community/post/${args.postId}`,
      data: { postId: args.postId },
    });
  }
}

export async function clearRsvp(postId: string, userId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_post_rsvps").delete().eq("post_id", postId).eq("user_id", userId);
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function listComments(postId: string): Promise<FeedComment[]> {
  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("gs_post_comments")
    .select("id, author_id, parent_comment_id, body, created_at, edited_at")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const comments = (rows ?? []) as Array<{
    id: string; author_id: string; parent_comment_id: string | null; body: string; created_at: string; edited_at: string | null;
  }>;
  if (!comments.length) return [];

  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const commentIds = comments.map((c) => c.id);
  const [{ data: users }, { data: likes }] = await Promise.all([
    admin.from("users").select(AUTHOR_COLS).in("id", authorIds),
    admin.from("gs_comment_likes").select("comment_id, user_id").in("comment_id", commentIds),
  ]);
  const authorMap = new Map<string, FeedAuthor>();
  for (const u of (users ?? []) as UserRow[]) authorMap.set(u.id, toAuthor(u));
  const likeCounts = new Map<string, number>();
  for (const l of (likes ?? []) as Array<{ comment_id: string; user_id: string }>) {
    likeCounts.set(l.comment_id, (likeCounts.get(l.comment_id) ?? 0) + 1);
  }

  const nodes = new Map<string, FeedComment>();
  for (const c of comments) {
    const a = authorMap.get(c.author_id);
    const name = a?.name ?? "Player";
    nodes.set(c.id, {
      id: c.id,
      content: c.body,
      author: { id: c.author_id, name, avatar: a?.discordAvatar || a?.twitchAvatar || undefined, initials: initials(name) },
      authorFull: a ?? undefined,
      timestamp: c.created_at,
      likes: likeCounts.get(c.id) ?? 0,
      likedByMe: false, // filled per-viewer below
      isEdited: !!c.edited_at,
      replies: [],
    });
  }
  const roots: FeedComment[] = [];
  for (const c of comments) {
    const node = nodes.get(c.id)!;
    if (c.parent_comment_id && nodes.has(c.parent_comment_id)) {
      nodes.get(c.parent_comment_id)!.replies!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Set `likedByMe` for a viewer across a comment tree (post-hoc, one query). */
export async function markLiked(postId: string, viewerId: string, tree: FeedComment[]): Promise<FeedComment[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_comment_likes")
    .select("comment_id")
    .eq("user_id", viewerId);
  const liked = new Set(((data ?? []) as Array<{ comment_id: string }>).map((r) => r.comment_id));
  const walk = (nodes: FeedComment[]) => {
    for (const n of nodes) {
      n.likedByMe = liked.has(n.id);
      if (n.replies?.length) walk(n.replies);
    }
  };
  walk(tree);
  return tree;
}

export async function addComment(args: {
  postId: string;
  authorId: string;
  parentId?: string | null;
  body: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: "empty" | "rate_limited" | "not_found" }> {
  const body = args.body.trim().slice(0, COMMENT_MAX);
  if (!body) return { ok: false, reason: "empty" };
  if ((await recentCount("gs_post_comments", args.authorId)) >= COMMENTS_PER_MIN) {
    return { ok: false, reason: "rate_limited" };
  }
  const admin = createServiceClient();
  const { data: post } = await admin.from("gs_posts").select("author_id").eq("id", args.postId).maybeSingle();
  if (!post) return { ok: false, reason: "not_found" };

  const { data, error } = await admin
    .from("gs_post_comments")
    .insert({ post_id: args.postId, author_id: args.authorId, parent_comment_id: args.parentId ?? null, body })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("comment insert failed");
  const commentId = data.id as string;

  const notified = new Set<string>([args.authorId]);
  const postAuthor = (post as { author_id: string }).author_id;

  // Reply → notify the parent comment's author.
  if (args.parentId) {
    const { data: parent } = await admin
      .from("gs_post_comments").select("author_id").eq("id", args.parentId).maybeSingle();
    const pa = (parent as { author_id?: string } | null)?.author_id;
    if (pa && !notified.has(pa)) {
      notified.add(pa);
      await createNotification({
        userId: pa, type: "comment_reply", title: "replied to your comment",
        actorUserId: args.authorId, link: `/community/post/${args.postId}`, data: { postId: args.postId, commentId },
      });
    }
  }
  // Notify the post author (if not already covered).
  if (!notified.has(postAuthor)) {
    notified.add(postAuthor);
    await createNotification({
      userId: postAuthor, type: "post_comment", title: "commented on your post",
      actorUserId: args.authorId, link: "/community", data: { postId: args.postId, commentId },
    });
  }
  await notifyMentions(body, { actorId: args.authorId, postId: args.postId, context: "comment", exclude: notified });

  return { ok: true, id: commentId };
}

export async function deleteComment(commentId: string, userId: string, isStaff: boolean): Promise<boolean> {
  const admin = createServiceClient();
  const { data: c } = await admin.from("gs_post_comments").select("author_id").eq("id", commentId).maybeSingle();
  if (!c) return false;
  if ((c as { author_id: string }).author_id !== userId && !isStaff) return false;
  await admin.from("gs_post_comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId);
  return true;
}

export async function likeComment(commentId: string, userId: string): Promise<void> {
  const admin = createServiceClient();
  // Only notify on the FIRST like (not on re-likes after an unlike toggle).
  const { data: existing } = await admin
    .from("gs_comment_likes")
    .select("user_id")
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .maybeSingle();
  await admin.from("gs_comment_likes").upsert({ comment_id: commentId, user_id: userId }, { onConflict: "comment_id,user_id" });
  if (existing) return;

  const { data: c } = await admin
    .from("gs_post_comments")
    .select("author_id, post_id")
    .eq("id", commentId)
    .maybeSingle();
  const author = (c as { author_id?: string; post_id?: string } | null);
  if (author?.author_id && author.author_id !== userId) {
    await createNotification({
      userId: author.author_id,
      type: "comment_like",
      title: "liked your comment",
      actorUserId: userId,
      link: `/community/post/${author.post_id}`,
      data: { postId: author.post_id, commentId },
    });
  }
}

export async function unlikeComment(commentId: string, userId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);
}

// ── Mentions → notifications ─────────────────────────────────────────────────

async function notifyMentions(
  body: string,
  ctx: { actorId: string; postId: string; context: "post" | "comment"; exclude?: Set<string> },
): Promise<void> {
  const usernames = extractMentions(body);
  if (!usernames.length) return;
  const map = await resolveMentionIds(usernames);
  for (const uid of map.values()) {
    if (uid === ctx.actorId || ctx.exclude?.has(uid)) continue;
    await createNotification({
      userId: uid,
      type: "post_mention",
      title: ctx.context === "post" ? "mentioned you in a post" : "mentioned you in a comment",
      actorUserId: ctx.actorId,
      link: `/community/post/${ctx.postId}`,
      data: { postId: ctx.postId },
    });
  }
}
