/**
 * /hub — Hub home / session list view.
 *
 * Per gs-pro-v1-phase-4a-spec.md §4. Server-rendered list of every
 * session owned by the current user across all lifecycle states, with
 * URL-state-driven filters + sort + pagination.
 *
 * URL params:
 *   - status=draft,scheduled,...  (multi-value, comma-separated)
 *   - platform=twitch,discord     (multi-value, comma-separated; 4A only sees twitch)
 *   - sort=newest|oldest|name     (default newest)
 *   - limit=50                    (default 50; "Load more" doubles in 50-session increments)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, EmptyState } from "@empac/cascadeds";
import { PlatformBadge } from "@/components/hub/PlatformBadge";
import { GameArtwork } from "@/components/hub/GameArtwork";
import { getGameName } from "@/data/game-registry";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime, formatDuration } from "@/lib/time/relative";
import { HubFilterControls } from "@/components/hub/HubFilterControls";
import { NewSessionButton } from "@/components/hub/NewSessionButton";
import { StreamInfoButton } from "@/components/hub/StreamInfoButton";
import { statusLabel, type SessionStatus } from "@/lib/sessions/types";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireHubAccess } from "@/lib/capabilities/hub-access";

export const metadata: Metadata = {
  title: "Hub",
  robots: { index: false, follow: false },
};

const ALL_STATUSES: SessionStatus[] = [
  "draft",
  "scheduled",
  "ready",
  "active",
  "ending",
  "ended",
  "cancelled",
];
const DEFAULT_LIMIT = 50;

interface SessionRow {
  id: string;
  name: string;
  slug: string;
  status: SessionStatus;
  scheduled_at: string | null;
  activated_at: string | null;
  ended_at: string | null;
  feature_flags: { test_session?: boolean } | null;
  platforms: { streaming?: { type?: string } | null } | null;
  config: { game?: string | null } | null;
  configured_games: string[] | null;
  active_game: string | null;
  created_at: string;
}

interface PageSearchParams {
  status?: string | string[];
  platform?: string | string[];
  sort?: string | string[];
  limit?: string | string[];
  /** Real-vs-test view toggle. Default `real` so test runs don't muddy
   *  the streamer's session history. */
  view?: string | string[];
}

type HubView = "real" | "test" | "all";

function parseView(raw: string | string[] | undefined): HubView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "test" || v === "all") return v;
  return "real";
}

export default async function HubHomePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  await requireHubAccess("/hub");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const statusFilter = parseList(params.status, ALL_STATUSES);
  const platformFilter = parseList(params.platform, ["twitch", "discord"]);
  const sort = parseSort(params.sort);
  const limit = parseLimit(params.limit);
  const view = parseView(params.view);

  // Query gs_sessions filtered to the owner. Apply status filter at the DB
  // level; platform filter is a JSONB walk so we filter in JS.
  let query = supabase
    .from("gs_sessions")
    .select(
      "id, name, slug, status, scheduled_at, activated_at, ended_at, feature_flags, platforms, config, configured_games, active_game, created_at"
    )
    .eq("owner_user_id", user.id);

  if (statusFilter.length > 0 && statusFilter.length < ALL_STATUSES.length) {
    query = query.in("status", statusFilter);
  }

  // View filter — real / test / all. Default real keeps test sessions
  // out of the streamer's session history; the toggle exposes them
  // explicitly when wanted.
  if (view === "real") {
    // feature_flags->>test_session is null OR != 'true'
    query = query.or(
      "feature_flags->>test_session.is.null,feature_flags->>test_session.neq.true"
    );
  } else if (view === "test") {
    query = query.eq("feature_flags->>test_session", "true");
  }

  if (sort === "newest") {
    query = query.order("created_at", { ascending: false });
  } else if (sort === "oldest") {
    query = query.order("created_at", { ascending: true });
  } else {
    query = query.order("name", { ascending: true });
  }

  // Fetch one extra so we know whether "Load more" should render.
  query = query.limit(limit + 1);

  const { data: rows } = await query;
  const allRows = (rows ?? []) as SessionRow[];

  // Apply platform filter (JSONB walk)
  const filtered = filterByPlatform(allRows, platformFilter);
  const hasMore = filtered.length > limit;
  const visible = filtered.slice(0, limit);

  // Total counts for the view-toggle chips. Two cheap head-only counts;
  // the labels surface "Sessions (12) · Test streams (3)" so the
  // streamer sees the size of each bucket.
  const adminCounts = createServiceClient();
  const [realCountResult, testCountResult] = await Promise.all([
    adminCounts
      .from("gs_sessions")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id)
      .or(
        "feature_flags->>test_session.is.null,feature_flags->>test_session.neq.true"
      ),
    adminCounts
      .from("gs_sessions")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id)
      .eq("feature_flags->>test_session", "true"),
  ]);
  const viewCounts = {
    real: realCountResult.count ?? 0,
    test: testCountResult.count ?? 0,
  };

  // Stream-info modal needs the streamer's overlay token + connection
  // existence so the header CTA can show / hide. Live-view link on
  // active session cards needs the public-facing slug.
  const admin = createServiceClient();
  const [{ data: connectionRow }, { data: profileRow }] = await Promise.all([
    admin
      .from("twitch_connections")
      .select("id, overlay_token")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("users")
      .select("username, twitch_username")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const hasTwitchConnection = !!connectionRow;
  const overlayToken = (connectionRow?.overlay_token as string | null) ?? null;
  // Streamer's public live-view slug — username first, twitch_username
  // fallback. Mirrors /live/[streamer-slug] resolution. Null when
  // neither is set; the "Live view" link on active-session cards
  // hides in that case.
  const liveSlug =
    (profileRow?.username as string | null) ??
    (profileRow?.twitch_username as string | null) ??
    null;

  return (
    <div className="hub-page">
      <header className="hub-page__header">
        <div className="hub-page__heading">
          <p className="hub-page__eyebrow">Hub</p>
          <h1 className="hub-page__title">
            {view === "test"
              ? "Test streams"
              : view === "all"
                ? "All sessions"
                : "Sessions"}
          </h1>
        </div>
        <div className="hub-page__header-actions">
          {hasTwitchConnection && (
            <StreamInfoButton overlayToken={overlayToken} />
          )}
          <NewSessionButton defaultTest={view === "test"} />
        </div>
      </header>

      <HubFilterControls
        statusOptions={ALL_STATUSES}
        platformOptions={[
          { value: "twitch", label: "Twitch" },
          { value: "discord", label: "Discord" },
        ]}
        initialStatus={statusFilter}
        initialPlatform={platformFilter}
        initialSort={sort}
        initialView={view}
        counts={viewCounts}
      />

      {visible.length === 0 ? (
        <EmptyState
          title={
            view === "test"
              ? "No test streams yet"
              : "No sessions yet"
          }
          description={
            view === "test"
              ? "Test streams are draft → configure → activate runs that mimic the real flow but skip auto-end + wrap-up. Create one above to rehearse without affecting your session history."
              : "When you go live in a supported game, GameShuffle will open a session here. You can also create a test stream above to rehearse without going live."
          }
        />
      ) : (
        <>
          <StatusLegend />
          <SessionGroupedList rows={visible} liveSlug={liveSlug} />
        </>
      )}

      {hasMore && (
        <div className="hub-page__load-more">
          <Link
            href={buildLoadMoreHref(params, limit + DEFAULT_LIMIT)}
            scroll={false}
          >
            <Button variant="secondary">Load more</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

interface SessionGroup {
  key: "in_progress" | "drafts" | "scheduled" | "completed";
  label: string;
  description: string;
  rows: SessionRow[];
}

const GROUP_LABELS: Record<SessionGroup["key"], { label: string; description: string }> = {
  in_progress: {
    label: "In progress",
    description: "Live or wrapping up — the bot is responding to chat.",
  },
  drafts: {
    label: "Drafts",
    description: "Created but not yet activated. Activate from the session detail page.",
  },
  scheduled: {
    label: "Scheduled",
    description: "Set to activate at a future time, or inside an open eligibility window.",
  },
  completed: {
    label: "Completed",
    description: "Ended or cancelled. Recaps are available for finished sessions.",
  },
};

function bucketFor(status: SessionStatus): SessionGroup["key"] {
  if (status === "active" || status === "ending") return "in_progress";
  if (status === "draft") return "drafts";
  if (status === "scheduled" || status === "ready") return "scheduled";
  return "completed"; // ended | cancelled
}

function SessionGroupedList({
  rows,
  liveSlug,
}: {
  rows: SessionRow[];
  liveSlug: string | null;
}) {
  // Bucket by lifecycle phase. Within each bucket, the parent query
  // already applied the user's chosen sort, so order is preserved.
  const buckets: Record<SessionGroup["key"], SessionRow[]> = {
    in_progress: [],
    drafts: [],
    scheduled: [],
    completed: [],
  };
  for (const row of rows) {
    buckets[bucketFor(row.status)].push(row);
  }

  // Display order: most-actionable first.
  const order: SessionGroup["key"][] = [
    "in_progress",
    "drafts",
    "scheduled",
    "completed",
  ];

  return (
    <div className="hub-page__groups">
      {order.map((key) => {
        const groupRows = buckets[key];
        if (groupRows.length === 0) return null;
        const meta = GROUP_LABELS[key];
        return (
          <section key={key} className="hub-page__group">
            <header className="hub-page__group-header">
              <div>
                <h2 className="hub-page__group-title">
                  {meta.label}{" "}
                  <span className="hub-page__group-count">{groupRows.length}</span>
                </h2>
                <p className="hub-page__group-description">{meta.description}</p>
              </div>
            </header>
            <div className="hub-page__list">
              {groupRows.map((row) => (
                <SessionListCard key={row.id} row={row} liveSlug={liveSlug} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SessionListCard({
  row,
  liveSlug,
}: {
  row: SessionRow;
  liveSlug: string | null;
}) {
  const isActive = row.status === "active" || row.status === "ending";
  const isTest = !!row.feature_flags?.test_session;
  const platformType = row.platforms?.streaming?.type;
  // Multi-game spec: prefer the live `active_game` pointer when the
  // session is active, fall back to `configured_games[0]`, then
  // `config.game` (legacy single-game). Card artwork shows GS Queue
  // when none of these are set.
  const cardArtworkSlug = isActive
    ? row.active_game ?? row.configured_games?.[0] ?? row.config?.game ?? null
    : row.configured_games?.[0] ?? row.config?.game ?? null;
  const gameSlug = cardArtworkSlug;
  const gameLabel = gameSlug ? getGameName(gameSlug) : null;
  const isMultiGame =
    Array.isArray(row.configured_games) && row.configured_games.length > 1;
  const startTime = row.activated_at ?? row.created_at;
  const durationSeconds =
    row.activated_at && row.ended_at
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(row.ended_at) - Date.parse(row.activated_at)) / 1000
          )
        )
      : null;

  // Text hierarchy: title (primary) → game (secondary) → platforms
  // (chips) → time/duration meta (tertiary). Only render rows that
  // have data so empty fields don't show as blank lines.
  //
  // Live-view link sits OUTSIDE the clickable Card so clicks on it
  // don't race the card's outer navigation to the session detail.
  return (
    <div
      className={`hub-card-wrapper hub-card-wrapper--${row.status}${isTest ? " hub-card-wrapper--test" : ""}`}
      data-status={row.status}
    >
      <Card variant="outlined" padding="medium" interactive href={`/hub/sessions/${row.slug}`}>
        <div className="hub-card">
          <div className="hub-card__artwork">
            <GameArtwork slug={cardArtworkSlug} size="thumb" />
          </div>
          <div className="hub-card__main">
            <div className="hub-card__title-row">
              <span className="hub-card__title">{row.name}</span>
              {isTest && (
                <span className="hub-card__test-flag" title="Test stream">
                  TEST
                </span>
              )}
            </div>
            {gameLabel && (
              <span className="hub-card__game">
                {gameLabel}
                {isMultiGame && row.configured_games && (
                  <span className="hub-card__game-extra">
                    {" "}+ {row.configured_games.length - 1} more
                  </span>
                )}
              </span>
            )}
            {platformType && (
              <div className="hub-card__platforms">
                <PlatformBadge platform={platformType} />
              </div>
            )}
            <div className="hub-card__meta">
              {row.scheduled_at && (
                <span className="hub-card__meta-item">
                  scheduled <strong>{formatDateTimeShort(row.scheduled_at)}</strong>
                  {" · "}
                  {formatRelativeTime(row.scheduled_at)}
                </span>
              )}
              {isActive && (
                <span className="hub-card__meta-item">
                  started <strong>{formatDateTimeShort(startTime)}</strong>
                  {" · "}
                  {formatRelativeTime(startTime)}
                </span>
              )}
              {(row.status === "ended" || row.status === "cancelled") && (
                <span className="hub-card__meta-item">
                  {row.status === "ended" ? "ended" : "cancelled"}{" "}
                  <strong>{formatDateShort(row.ended_at ?? row.created_at)}</strong>
                  {row.status === "ended" && durationSeconds !== null && (
                    <> · lasted {formatDuration(durationSeconds)}</>
                  )}
                </span>
              )}
              {!isActive &&
                row.status !== "ended" &&
                row.status !== "cancelled" &&
                !row.scheduled_at && (
                  <span className="hub-card__meta-item">
                    created <strong>{formatDateShort(row.created_at)}</strong>
                    {" · "}
                    {formatRelativeTime(row.created_at)}
                  </span>
                )}
            </div>
          </div>
        </div>
      </Card>
      {isActive && liveSlug && (
        <a
          href={`/live/${encodeURIComponent(liveSlug)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hub-card__live-link"
        >
          Live view ↗
        </a>
      )}
    </div>
  );
}

/**
 * Status legend rendered above the session list. Replaces per-card
 * Badges with a single shared key so the cards stay clean and the
 * accent stripe colors carry their meaning.
 */
const LEGEND_STATUSES: SessionStatus[] = [
  "active",
  "scheduled",
  "ready",
  "draft",
  "ending",
  "ended",
  "cancelled",
];

function StatusLegend() {
  return (
    <div className="hub-legend" role="list" aria-label="Session status legend">
      {LEGEND_STATUSES.map((s) => (
        <span key={s} className="hub-legend__item" role="listitem">
          <span
            className={`hub-legend__swatch hub-legend__swatch--${s}`}
            aria-hidden="true"
          />
          {statusLabel(s)}
        </span>
      ))}
    </div>
  );
}

// ---- helpers --------------------------------------------------------------

function parseList<T extends string>(
  raw: string | string[] | undefined,
  validValues: readonly T[]
): T[] {
  if (!raw) return [];
  const flat = Array.isArray(raw) ? raw.join(",") : raw;
  return flat
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is T => (validValues as readonly string[]).includes(v));
}

function parseSort(raw: string | string[] | undefined): "newest" | "oldest" | "name" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "oldest" || v === "name") return v;
  return "newest";
}

function parseLimit(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, 500);
}

function filterByPlatform(rows: SessionRow[], platforms: string[]): SessionRow[] {
  if (platforms.length === 0) return rows;
  return rows.filter((row) => {
    const t = row.platforms?.streaming?.type;
    return t ? platforms.includes(t) : false;
  });
}

function buildLoadMoreHref(
  params: PageSearchParams,
  newLimit: number
): string {
  const out = new URLSearchParams();
  if (params.status) out.set("status", asString(params.status));
  if (params.platform) out.set("platform", asString(params.platform));
  if (params.sort) out.set("sort", asString(params.sort));
  out.set("limit", String(newLimit));
  return `/hub?${out.toString()}`;
}

function asString(v: string | string[]): string {
  return Array.isArray(v) ? v.join(",") : v;
}

/** Short date like "Apr 24". Anchors the timeline on the card alongside
 *  the relative-time cue. */
function formatDateShort(input: string | null | undefined): string {
  if (!input) return "—";
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Short date+time like "Apr 24, 8:00 PM". For scheduled/started events
 *  where the exact time matters. */
function formatDateTimeShort(input: string | null | undefined): string {
  if (!input) return "—";
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
