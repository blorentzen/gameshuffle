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
import { Badge, Button, Card, EmptyState } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime, formatDuration } from "@/lib/time/relative";
import { HubFilterControls } from "@/components/hub/HubFilterControls";
import { HubTestSessionControl } from "@/components/hub/HubTestSessionControl";
import type { SessionStatus } from "@/lib/sessions/types";
import { createServiceClient } from "@/lib/supabase/admin";
import { WRAP_UP_DURATION_MS } from "@/lib/sessions/constants";
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
  created_at: string;
}

interface PageSearchParams {
  status?: string | string[];
  platform?: string | string[];
  sort?: string | string[];
  limit?: string | string[];
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

  // Query gs_sessions filtered to the owner. Apply status filter at the DB
  // level; platform filter is a JSONB walk so we filter in JS.
  let query = supabase
    .from("gs_sessions")
    .select(
      "id, name, slug, status, scheduled_at, activated_at, ended_at, feature_flags, platforms, created_at"
    )
    .eq("owner_user_id", user.id);

  if (statusFilter.length > 0 && statusFilter.length < ALL_STATUSES.length) {
    query = query.in("status", statusFilter);
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

  // Test-session control: surface only when no active/ending/test session
  // exists, regardless of the active filter view. The check runs against
  // *all* sessions, not just the visible filter — otherwise a status
  // filter could show "Start test session" while a real one is running.
  //
  // For sessions in the wrap-up window (status='ending'), the control
  // renders disabled with a countdown so the user knows when the next
  // session can be started instead of seeing it just disappear.
  const admin = createServiceClient();
  const [{ data: liveRows }, { data: connectionRow }] = await Promise.all([
    admin
      .from("gs_sessions")
      .select("id, status")
      .eq("owner_user_id", user.id)
      .in("status", ["active", "ending"])
      .order("activated_at", { ascending: false, nullsFirst: false })
      .limit(1),
    admin
      .from("twitch_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const liveRow = (liveRows ?? [])[0] as
    | { id: string; status: string }
    | undefined;
  const hasActiveSession = liveRow?.status === "active";
  const hasTwitchConnection = !!connectionRow;

  // Look up when the ending session entered wrap-up so the control can
  // render a precise countdown (entered_ending_at + WRAP_UP_DURATION_MS
  // + ~60s cron buffer = the earliest the next session can start).
  let endingSessionEnableAt: string | null = null;
  if (liveRow?.status === "ending") {
    const { data: enterEvent } = await admin
      .from("session_events")
      .select("created_at")
      .eq("session_id", liveRow.id)
      .eq("event_type", "state_change")
      .filter("payload->>to", "eq", "ending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (enterEvent?.created_at) {
      const enteredMs = Date.parse(enterEvent.created_at as string);
      if (Number.isFinite(enteredMs)) {
        endingSessionEnableAt = new Date(
          enteredMs + WRAP_UP_DURATION_MS + 60_000
        ).toISOString();
      }
    }
  }

  return (
    <div className="hub-page">
      <header className="hub-page__header">
        <div className="hub-page__heading">
          <p className="hub-page__eyebrow">Hub</p>
          <h1 className="hub-page__title">Sessions</h1>
        </div>
        <div className="hub-page__header-actions">
          <Link href="/hub/sessions/new" scroll={false}>
            <Button variant="primary">New session</Button>
          </Link>
        </div>
      </header>

      <HubTestSessionControl
        hasTwitchConnection={hasTwitchConnection}
        hasActiveSession={hasActiveSession}
        endingSessionEnableAt={endingSessionEnableAt}
      />

      <HubFilterControls
        statusOptions={ALL_STATUSES}
        platformOptions={[
          { value: "twitch", label: "Twitch" },
          { value: "discord", label: "Discord" },
        ]}
        initialStatus={statusFilter}
        initialPlatform={platformFilter}
        initialSort={sort}
      />

      {visible.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="When you go live in a supported game, GameShuffle will open a session here. You can also start a test session above to flip the bot on without going live."
        />
      ) : (
        <div className="hub-page__list">
          {visible.map((row) => (
            <SessionListCard key={row.id} row={row} />
          ))}
        </div>
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

function SessionListCard({ row }: { row: SessionRow }) {
  const isActive = row.status === "active" || row.status === "ending";
  const isTest = !!row.feature_flags?.test_session;
  const platformType = row.platforms?.streaming?.type;
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

  return (
    <Card variant="outlined" padding="medium" interactive href={`/hub/sessions/${row.slug}`}>
      <div className="hub-card">
        <div className="hub-card__main">
          <div className="hub-card__title-row">
            <span className="hub-card__title">{row.name}</span>
            <SessionStatusBadge status={row.status} testSession={isTest} />
          </div>
          <div className="hub-card__meta">
            {platformType === "twitch" && (
              <Badge variant="default" size="small">Twitch</Badge>
            )}
            {row.scheduled_at && (
              <span className="hub-card__meta-item">
                scheduled <strong>{formatRelativeTime(row.scheduled_at)}</strong>
              </span>
            )}
            {isActive && (
              <span className="hub-card__meta-item">
                started <strong>{formatRelativeTime(startTime)}</strong>
              </span>
            )}
            {row.status === "ended" && durationSeconds !== null && (
              <span className="hub-card__meta-item">
                lasted <strong>{formatDuration(durationSeconds)}</strong>
              </span>
            )}
            {!isActive && row.status !== "ended" && row.status !== "cancelled" && (
              <span className="hub-card__meta-item">
                created <strong>{formatRelativeTime(row.created_at)}</strong>
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SessionStatusBadge({
  status,
  testSession,
}: {
  status: SessionStatus;
  testSession: boolean;
}) {
  const variant: "success" | "warning" | "error" | "info" | "default" =
    status === "active"
      ? "success"
      : status === "ending"
        ? "warning"
        : status === "cancelled"
          ? "error"
          : status === "scheduled" || status === "ready"
            ? "info"
            : "default";
  const label =
    testSession && (status === "active" || status === "ending")
      ? "TEST"
      : status;
  return (
    <Badge variant={variant} size="small">
      {label}
    </Badge>
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
