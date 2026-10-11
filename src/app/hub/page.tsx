/**
 * /hub: the Stream hub home (rebuilt 2026-10-10, audit + mockups
 * https://claude.ai/artifact/4npmxxzygb6MWZemkxtQ54).
 *
 * What a streamer opens the hub for, in order: the stream that's live now
 * (one big card with the control room button), then what's coming up
 * (scheduled streams and drafts as short rows), this month in numbers, and
 * past streams as a list they can search. Test streams stay out of the
 * past list unless asked for. A setup problem (no Twitch, the bot can't
 * post, missing EventSub) shows once at the top with a link to fix it.
 *
 * URL params: q (search past streams by name), test=1 (include test
 * streams in the past list), limit (past streams shown, default 25).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, EmptyState, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { getGameName } from "@/data/game-registry";
import { GameCover } from "@/components/games/GameCover";
import { NewSessionButton } from "@/components/hub/NewSessionButton";
import { PlatformBadge } from "@/components/hub/PlatformBadge";
import { TokenAllowanceBadge } from "@/components/hub/TokenAllowanceBadge";
import { formatDuration } from "@/lib/time/relative";
import { formatEventShort } from "@/lib/time/format";
import { gsMonthStart } from "@/lib/time/gsClock";
import type { SessionStatus } from "@/lib/sessions/types";

export const metadata: Metadata = {
  title: "Stream hub",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;
/** EventSub subscriptions a healthy connection has (twitch/eventsub.ts). */
const EXPECTED_SUBS = 4;
const ROLL_EVENTS = ["shuffle", "race_randomized"];

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

const COLS = "id, name, slug, status, scheduled_at, activated_at, ended_at, feature_flags, platforms, config, configured_games, active_game, created_at";

interface PageSearchParams {
  q?: string;
  test?: string;
  limit?: string;
}

const isTest = (r: SessionRow) => !!r.feature_flags?.test_session;
const gameOf = (r: SessionRow, live = false) =>
  (live ? r.active_game : null) ?? r.configured_games?.[0] ?? r.config?.game ?? null;
/** Seconds since a time (for a live stream's running length). */
function elapsed(from: string | null): number | null {
  return seconds(from, Date.now());
}
const seconds = (from: string | null, to: string | null | number) => {
  if (!from) return null;
  const end = typeof to === "number" ? to : to ? Date.parse(to) : NaN;
  const ms = end - Date.parse(from);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
};

export default async function HubHomePage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  await requireHubAccess("/hub");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const q = (params.q ?? "").trim().slice(0, 80);
  const showTest = params.test === "1";
  const limit = Math.min(Math.max(parseInt(params.limit ?? "", 10) || PAGE_SIZE, PAGE_SIZE), 500);
  const admin = createServiceClient();

  // Live and coming up: never many, so read them whole.
  const { data: openRows } = await supabase.from("gs_sessions").select(COLS)
    .eq("owner_user_id", user.id).in("status", ["active", "ending", "scheduled", "ready", "draft"])
    .order("created_at", { ascending: false });
  const open = (openRows ?? []) as SessionRow[];
  const live = open.filter((r) => r.status === "active" || r.status === "ending");
  const comingUp = open
    .filter((r) => r.status === "scheduled" || r.status === "ready" || r.status === "draft")
    .sort((a, b) => (a.scheduled_at ? Date.parse(a.scheduled_at) : Infinity) - (b.scheduled_at ? Date.parse(b.scheduled_at) : Infinity));

  // Past streams: ended or cancelled, newest first, searchable, test ones only when asked.
  let pastQuery = supabase.from("gs_sessions").select(COLS)
    .eq("owner_user_id", user.id).in("status", ["ended", "cancelled"])
    .order("ended_at", { ascending: false, nullsFirst: false }).limit(limit + 1);
  if (!showTest) pastQuery = pastQuery.or("feature_flags->>test_session.is.null,feature_flags->>test_session.neq.true");
  if (q) pastQuery = pastQuery.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  const { data: pastRows } = await pastQuery;
  const pastAll = (pastRows ?? []) as SessionRow[];
  const hasMore = pastAll.length > limit;
  const past = pastAll.slice(0, limit);

  // Who played: viewers (not the streamer) per session, for the live card and the past list.
  const countIds = [...live, ...past].map((r) => r.id);
  const players = new Map<string, number>();
  const lobbyNow = new Map<string, number>();
  if (countIds.length) {
    const { data: parts } = await admin.from("session_participants")
      .select("session_id, left_at").in("session_id", countIds).eq("is_broadcaster", false);
    for (const p of (parts ?? []) as { session_id: string; left_at: string | null }[]) {
      players.set(p.session_id, (players.get(p.session_id) ?? 0) + 1);
      if (!p.left_at) lobbyNow.set(p.session_id, (lobbyNow.get(p.session_id) ?? 0) + 1);
    }
  }
  const openRounds = new Set<string>();
  if (live.length) {
    const { data: rounds } = await admin.from("session_picks_bans_rounds")
      .select("session_id").in("session_id", live.map((r) => r.id)).eq("status", "open");
    for (const r of (rounds ?? []) as { session_id: string }[]) openRounds.add(r.session_id);
  }

  // This month (Pacific), real streams only.
  const monthStart = gsMonthStart();
  const { data: monthRows } = await admin.from("gs_sessions").select("id")
    .eq("owner_user_id", user.id).gte("activated_at", monthStart)
    .or("feature_flags->>test_session.is.null,feature_flags->>test_session.neq.true");
  const monthIds = ((monthRows ?? []) as { id: string }[]).map((r) => r.id);
  let monthPlayers = 0;
  let monthRolls = 0;
  if (monthIds.length) {
    const [{ data: mp }, { count: rolls }] = await Promise.all([
      admin.from("session_participants").select("platform, platform_user_id").in("session_id", monthIds).eq("is_broadcaster", false),
      admin.from("session_events").select("id", { count: "exact", head: true }).in("session_id", monthIds).in("event_type", ROLL_EVENTS),
    ]);
    monthPlayers = new Set(((mp ?? []) as { platform: string; platform_user_id: string }[]).map((p) => `${p.platform}:${p.platform_user_id}`)).size;
    monthRolls = rolls ?? 0;
  }

  // Setup health, said once.
  const [{ data: profile }, { data: conn }, { count: enabledSubs }] = await Promise.all([
    admin.from("users").select("username, twitch_username, timezone").eq("id", user.id).maybeSingle(),
    admin.from("twitch_connections").select("bot_authorized").eq("user_id", user.id).maybeSingle(),
    admin.from("twitch_eventsub_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "enabled"),
  ]);
  const tz = (profile?.timezone as string | null) ?? null;
  const liveSlug = (profile?.username as string | null) ?? (profile?.twitch_username as string | null) ?? null;
  const setupProblem = !conn
    ? { title: "Connect Twitch so GameShuffle can follow your streams", body: "It opens a stream here when you go live and runs your chat commands.", action: "Connect Twitch" }
    : !conn.bot_authorized
      ? { title: "The bot can't post in your chat yet", body: "Reconnect Twitch to let the GameShuffle bot reply, then send a test message.", action: "Fix in Setup" }
      : (enabledSubs ?? 0) < EXPECTED_SUBS
        ? { title: "GameShuffle isn't hearing everything from Twitch", body: "Going live, game changes or chat may be missed. Setup can repair it in one click.", action: "Fix in Setup" }
        : null;

  const nothingYet = live.length === 0 && comingUp.length === 0 && past.length === 0 && !q && !showTest;

  return (
    <div className="hub-page hub-home">
      <header className="hub-home__head">
        <div className="hub-home__title">
          <h1 className="hub-page__title">Stream hub</h1>
          <TokenAllowanceBadge ownerUserId={user.id} />
        </div>
        <div className="hub-page__header-actions">
          <Link href="/account/streaming"><Button variant="secondary">Stream settings</Button></Link>
          <NewSessionButton />
        </div>
      </header>

      {setupProblem && (
        <Alert variant="warning" title={setupProblem.title}>
          <span className="hub-home__alert-body">
            {setupProblem.body}{" "}
            <Link href="/account/streaming?tab=integrations">{setupProblem.action}</Link>
          </span>
        </Alert>
      )}

      {nothingYet ? (
        <EmptyState
          variant="bordered"
          title="No streams yet"
          description="Go live on Twitch in a game GameShuffle supports and a stream opens here on its own. Or start one now to set up games, picks and bans, and your stream tools ahead of time."
          action={<NewSessionButton />}
        />
      ) : (
        <>
          {live.map((r) => {
            const game = gameOf(r, true);
            const dur = elapsed(r.activated_at);
            return (
              <section key={r.id} className="hub-live" aria-label="Live now">
                <span className="hub-live__cover">{game && <GameCover slug={game} name={getGameName(game)} />}</span>
                <div className="hub-live__main">
                  <div className="hub-live__badges">
                    <span className="hub-live__pill">
                      {r.status === "ending" ? "Wrapping up" : "Live"}
                      {/* A session left open for days reads better as a date than as 414h. */}
                      {dur ? (dur > 12 * 3600 ? ` · since ${formatEventShort(r.activated_at, tz).split(" · ")[0]}` : ` · ${formatDuration(dur)}`) : ""}
                    </span>
                    {isTest(r) && <span className="hub-live__tag">Test</span>}
                  </div>
                  <h2 className="hub-live__name">{r.name}</h2>
                  <p className="hub-live__meta">
                    {[game ? getGameName(game) : null, `${lobbyNow.get(r.id) ?? 0} in the lobby`, openRounds.has(r.id) ? "picks and bans open" : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="hub-live__actions">
                  {liveSlug && <Link href={`/live/${encodeURIComponent(liveSlug)}`} target="_blank" rel="noopener noreferrer"><Button variant="secondary">Live page ↗</Button></Link>}
                  <Link href={`/hub/sessions/${r.slug}`}><Button variant="primary">Open control room</Button></Link>
                </div>
              </section>
            );
          })}

          <div className="hub-home__row">
            <section className="hub-panel" aria-labelledby="hub-coming">
              <h2 id="hub-coming" className="hub-panel__title">Coming up <span className="hub-page__group-count">{comingUp.length}</span></h2>
              {comingUp.length === 0 ? (
                <p className="hub-panel__empty">Nothing planned. Schedule a stream and GameShuffle opens it and announces it for you.</p>
              ) : (
                <ul className="hub-rows">
                  {comingUp.map((r) => {
                    const game = gameOf(r);
                    const platform = r.platforms?.streaming?.type;
                    return (
                      <li key={r.id} className="hub-rows__row">
                        <span className="hub-rows__cover">{game && <GameCover slug={game} name={getGameName(game)} />}</span>
                        <div className="hub-rows__main">
                          <Link href={`/hub/sessions/${r.slug}`} className="hub-rows__name">{r.name}</Link>
                          <span className="hub-rows__meta">
                            {r.status === "draft" ? <span className="hub-rows__tag">Draft</span> : null}
                            {isTest(r) ? <span className="hub-rows__tag">Test</span> : null}
                            {r.scheduled_at ? formatEventShort(r.scheduled_at, tz) : r.status === "draft" ? "Not scheduled yet" : ""}
                            {platform ? <PlatformBadge platform={platform} /> : null}
                          </span>
                        </div>
                        <Link href={`/hub/sessions/${r.slug}`}><Button variant="secondary" size="small">{r.status === "draft" ? "Continue" : "Edit"}</Button></Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="hub-panel" aria-labelledby="hub-month">
              <h2 id="hub-month" className="hub-panel__title">This month</h2>
              <div className="hub-stats">
                <div className="hub-stats__item"><span className="hub-stats__label">Streams</span><span className="hub-stats__value">{monthIds.length}</span></div>
                <div className="hub-stats__item"><span className="hub-stats__label">Viewers who played</span><span className="hub-stats__value">{monthPlayers}</span></div>
                <div className="hub-stats__item"><span className="hub-stats__label">Rolls</span><span className="hub-stats__value">{monthRolls}</span></div>
              </div>
            </section>
          </div>

          <section className="hub-panel" aria-labelledby="hub-past">
            <div className="hub-panel__head">
              <h2 id="hub-past" className="hub-panel__title">Past streams</h2>
              <Link className="hub-panel__link" href={showTest ? `/hub${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/hub?test=1${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
                {showTest ? "Hide test streams" : "Show test streams"}
              </Link>
            </div>
            <form method="get" action="/hub" className="hub-panel__search" role="search">
              {showTest && <input type="hidden" name="test" value="1" />}
              <Input type="search" name="q" defaultValue={q} placeholder="Search past streams" aria-label="Search past streams" fullWidth />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            {past.length === 0 ? (
              <p className="hub-panel__empty">{q ? `No past streams match "${q}".` : "Streams you finish show up here, with what happened on each."}</p>
            ) : (
              <div className="hub-table" role="region" aria-label="Past streams table" tabIndex={0}>
                <Table hoverable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stream</TableHead>
                      <TableHead>Game</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Length</TableHead>
                      <TableHead align="right">Viewers who played</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {past.map((r) => {
                      const game = gameOf(r);
                      const dur = seconds(r.activated_at, r.ended_at);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Link href={`/hub/sessions/${r.slug}`} className="hub-table__name">{r.name}</Link>
                            {isTest(r) && <span className="hub-rows__tag">Test</span>}
                            {r.status === "cancelled" && <span className="hub-rows__tag">Cancelled</span>}
                          </TableCell>
                          <TableCell>{game ? getGameName(game) : "-"}</TableCell>
                          <TableCell>{formatEventShort(r.ended_at ?? r.created_at, tz).split(" · ")[0]}</TableCell>
                          <TableCell>{dur ? formatDuration(dur) : "-"}</TableCell>
                          <TableCell align="right">{players.get(r.id) ?? 0}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && (
              <div className="hub-page__load-more">
                <Link href={`/hub?limit=${limit + PAGE_SIZE}${showTest ? "&test=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`} scroll={false}>
                  <Button variant="secondary">Show more</Button>
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
