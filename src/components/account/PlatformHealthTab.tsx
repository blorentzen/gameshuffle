"use client";

/**
 * Platform admin ▸ Overview ▸ Health: what's happening on GameShuffle right
 * now. Live counts, who's been on the site, chat viewers, 30-day trends and
 * the hero roster check. Token numbers live in Token economy; this screen
 * keeps one line pointing there.
 *
 * Refreshes every 30 seconds while the tab is visible, so staff can leave it
 * open during a busy stream.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AreaChart, BarChart, Button, StatCard } from "@empac/cascadeds";
import {
  IconBroadcast, IconCoins, IconFlag, IconMessages, IconRefresh, IconTrophy, IconUserCheck, IconUserPlus, IconUsersGroup,
} from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { HeroRosterCard } from "@/components/account/HeroRosterCard";
import { AdminHeader, AdminSection, AdminStats, AdminUpdated } from "@/components/account/admin/AdminKit";

interface HealthPayload {
  rightNow: { activeSessions: number; activeStreams: number; activeTournaments: number };
  audience: {
    totalAccounts: number;
    totalIdentities: number;
    twitchIdentities: number;
    discordIdentities: number;
    totalCommunities: number;
    dau: number;
    wau: number;
    mau: number;
  };
  people?: { onlineNow: number; seenToday: number; seenWeek: number; seenMonth: number };
  throughput: { tokenEventsLastHour: number; tokenVolumeLastHour: number; engagementSignalsLastHour: number };
  growth: { signupsToday: number; signupsThisWeek: number; signupsThisMonth: number };
  /** 30 zero-filled daily buckets, oldest first. */
  series?: { day: string; signups: number; tournaments: number; nights: number; tokenEvents: number }[];
  fetchedAt: string;
}

const AUTO_REFRESH_MS = 30_000;
const fmt = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("en-US"));
const ICON = 20;

export function PlatformHealthTab() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/platform-health", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) { setLoadError("This screen is for staff only."); return; }
      if (!res.ok || !body.ok) { setLoadError("Couldn't load the numbers. Try Refresh in a moment."); return; }
      setLoadError(null);
      setData(body as HealthPayload);
    } catch {
      setLoadError("Couldn't reach the server. Check your connection and try Refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    // Skip the timed pull while the tab is in the background.
    const timer = setInterval(() => { if (!document.hidden) void load(); }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const p = data?.people;
  const series = data?.series ?? [];
  const anySignups = series.some((d) => d.signups > 0);
  const anyEvents = series.some((d) => d.tournaments + d.nights > 0);

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Health"
        intro="What's happening on GameShuffle right now. Refreshes every 30 seconds while this tab is open."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={refreshing} disabled={refreshing} onClick={() => void load()}>Refresh</Button>}
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {data === null ? (
        !loadError && <LoadingLines label="Loading" />
      ) : (
        <>
          <AdminSection title="Right now">
            <AdminStats label="Right now">
              <StatCard label="Online now" value={p ? fmt(p.onlineNow) : "-"} source="Signed in, seen in the last 5 minutes" icon={<IconUserCheck size={ICON} />} variant="accent" />
              <StatCard label="Live streams" value={fmt(data.rightNow.activeStreams)} source="Streamers with a session open" icon={<IconBroadcast size={ICON} />} />
              <StatCard label="Tournaments" value={fmt(data.rightNow.activeTournaments)} source="Taking entries or under way" icon={<IconTrophy size={ICON} />} />
              <StatCard label="Lounge races" value={fmt(data.rightNow.activeSessions)} source="Mario Kart lounge rooms not finished" icon={<IconFlag size={ICON} />} />
            </AdminStats>
          </AdminSection>

          <AdminSection title="People" intro="Accounts, and how many of them have used the site lately.">
            <AdminStats label="People">
              <StatCard
                label="Accounts"
                value={fmt(data.audience.totalAccounts)}
                source={`${fmt(data.growth.signupsToday)} new today · ${fmt(data.growth.signupsThisMonth)} in 30 days`}
                icon={<IconUserPlus size={ICON} />}
              />
              <StatCard label="Seen today" value={p ? fmt(p.seenToday) : "-"} source="Since midnight Pacific" icon={<IconUserCheck size={ICON} />} />
              <StatCard label="Seen this week" value={p ? fmt(p.seenWeek) : "-"} source="Last 7 days" icon={<IconUserCheck size={ICON} />} />
              <StatCard label="Seen this month" value={p ? fmt(p.seenMonth) : "-"} source="Last 30 days" icon={<IconUserCheck size={ICON} />} />
            </AdminStats>
          </AdminSection>

          <AdminSection title="Chat viewers" intro="Viewers who joined in on a streamer's chat (joined a lobby, earned, bet or spent tokens), on Twitch or Discord. Most don't have an account.">
            <AdminStats label="Chat viewers">
              <StatCard label="Active today" value={fmt(data.audience.dau)} source="Last 24 hours" icon={<IconMessages size={ICON} />} />
              <StatCard label="Active this week" value={fmt(data.audience.wau)} source="Last 7 days" icon={<IconMessages size={ICON} />} />
              <StatCard label="Active this month" value={fmt(data.audience.mau)} source={`${fmt(data.audience.totalIdentities)} known: ${fmt(data.audience.twitchIdentities)} Twitch, ${fmt(data.audience.discordIdentities)} Discord`} icon={<IconMessages size={ICON} />} />
              <StatCard label="Communities" value={fmt(data.audience.totalCommunities)} source="Each streamer's chat community" icon={<IconUsersGroup size={ICON} />} />
            </AdminStats>
          </AdminSection>

          {/* Counters answer "how many"; only a series answers "which way is it
              going". Built from the real created_at columns, so there is no
              metrics table to backfill or keep in sync. */}
          {series.length > 0 && (
            <AdminSection title="Last 30 days">
              <div className="admin-charts">
                <div className="admin-chart">
                  <h3 className="admin-chart__title">Signups</h3>
                  {anySignups
                    ? <AreaChart data={series} xAxisKey="day" height={200} showGrid showTooltip fillOpacity={0.22} series={[{ dataKey: "signups", name: "Signups", color: "var(--primary-500)" }]} />
                    : <p className="admin-chart__empty">No signups in the last 30 days.</p>}
                </div>
                <div className="admin-chart">
                  <h3 className="admin-chart__title">Tournaments and game nights created</h3>
                  {anyEvents ? <BarChart
                    data={series}
                    xAxisKey="day"
                    height={200}
                    showXAxis
                    showYAxis
                    showGrid
                    showTooltip
                    showLegend
                    stacked
                    series={[
                      { dataKey: "tournaments", name: "Tournaments", color: "var(--primary-500)" },
                      { dataKey: "nights", name: "Game nights", color: "var(--accent-500)" },
                    ]}
                  /> : <p className="admin-chart__empty">No tournaments or game nights created in the last 30 days.</p>}
                </div>
              </div>
            </AdminSection>
          )}

          <p className="admin-pointer">
            <IconCoins size={18} aria-hidden />
            <span className="admin-pointer__text">
              Tokens in the last hour: <strong>{fmt(data.throughput.tokenEventsLastHour)}</strong> {data.throughput.tokenEventsLastHour === 1 ? "event" : "events"}, <strong>{fmt(data.throughput.tokenVolumeLastHour)}</strong> moved.
            </span>
            <Link href="/account/platform?tab=platform-snapshot">Open Token economy</Link>
          </p>

          <AdminSection title="Checks">
            <HeroRosterCard />
          </AdminSection>

          <AdminUpdated at={data.fetchedAt} every="30 seconds" />
        </>
      )}
    </div>
  );
}
