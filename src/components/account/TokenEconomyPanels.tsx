"use client";

/**
 * Token economy ▸ Streamers (allowance use, communities, chat activity) and the
 * activity tables under ▸ History (events by day, new-community bonuses). Both
 * read /api/admin/economy/dashboard. These used to live on /staff/economy.
 *
 * TokenActivityPanel renders as its own screen, or with `embedded` as sections
 * inside another screen (History puts it under the daily totals).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, EmptyState, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconActivity, IconAlertTriangle, IconBuildingCommunity, IconCoins, IconGift, IconMessages, IconRefresh, IconUsers } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import type { CommunityEconomyRow, EconomyDashboard } from "@/lib/economy/policy/dashboard";

const PAGE = 25;
const n = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("en-US"));
const snapshotDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
/** `YYYY-MM-DD` day keys from the API, shown without a timezone shift. */
const dayKey = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : d);

const EVENT_LABEL: Record<string, string> = {
  bet: "Bets on predictions", chaos_burn: "Chaos burns", award_mint: "Streamer awards", grant_start: "Welcome grants", earn_newcommunity: "New-community bonuses",
  earn_t1: "In-game earns", earn_t2: "Chat earns", give: "Gifts between viewers", transfer_out: "Transfers", bust_recovery: "Bust recovery", grant_bust: "Bust recovery",
  grant_onboarding: "Getting-started rewards", shop_purchase: "Shop purchases", payout: "Prediction payouts", refund: "Refunds",
};
const eventLabel = (type: string) => EVENT_LABEL[type] ?? (type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " "));

function useDashboard() {
  const [data, setData] = useState<EconomyDashboard | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/economy/dashboard", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (d?.ok) { setData(d); setError(false); } else setError(true);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { data, error, loading, load };
}

/** First 25 rows, then "Show more". */
function usePaged<T>(rows: T[]) {
  const [limit, setLimit] = useState(PAGE);
  const more = rows.length > limit
    ? <div className="admin-money-more"><Button variant="ghost" size="small" onClick={() => setLimit((x) => x + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more of {rows.length}</Button></div>
    : null;
  return { shown: rows.slice(0, limit), more };
}

function CommunityName({ c }: { c: { displayName: string | null; slug: string } }) {
  return <>{c.displayName ?? c.slug}{c.displayName && c.displayName.toLowerCase() !== c.slug.toLowerCase() && <span className="admin-table__sub">{c.slug}</span>}</>;
}

const usedPct = (c: CommunityEconomyRow) => (c.allowance && c.allowance.ceiling > 0 ? Math.round((c.allowance.consumed / c.allowance.ceiling) * 100) : null);

export function TokenStreamersPanel() {
  const { data, error, loading, load } = useDashboard();
  const header = (
    <AdminHeader
      title="Streamers"
      intro="How much of each streamer's monthly award allowance is used, what each community holds, and where chat was busiest this week."
      actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} aria-label="Refresh" loading={loading} disabled={loading} onClick={() => void load()}>Refresh</Button>}
    />
  );
  if (error && !data) return <div className="account-card admin-screen admin-money">{header}<Alert variant="error">Couldn&apos;t load the streamer numbers. Try Refresh in a minute.</Alert></div>;
  if (!data) return <div className="account-card admin-screen admin-money">{header}<LoadingLines label="Loading the streamer numbers" /></div>;
  return <div className="account-card admin-screen admin-money">{header}<StreamerSections data={data} /></div>;
}

function StreamerSections({ data }: { data: EconomyDashboard }) {
  // Allowance: the communities closest to their limit first, then the rest as listed.
  const withAllowance = data.communities.filter((c) => c.allowance);
  const byUse = [...withAllowance].sort((a, b) => (usedPct(b) ?? -1) - (usedPct(a) ?? -1));
  const nearLimit = withAllowance.filter((c) => (usedPct(c) ?? 0) >= 90).length;
  const awarded = withAllowance.reduce((sum, c) => sum + (c.allowance?.consumed ?? 0), 0);
  const allowance = usePaged(byUse);
  const communities = usePaged(data.communities);
  const busiest = data.streamerBoard.filter((r) => r.engagementEvents > 0);

  return (
    <>
      <AdminStats label="Streamers at a glance" columns={3}>
        <StatCard label="Communities" value={n(data.communities.length)} source={`${n(withAllowance.length)} with an allowance this month`} icon={<IconBuildingCommunity size={20} />} />
        <StatCard label="Awarded this month" value={n(awarded)} source="Tokens streamers gave out from their allowance" icon={<IconCoins size={20} />} />
        <StatCard label="Near their limit" value={n(nearLimit)} source="Used 90% or more of this month's allowance" icon={<IconAlertTriangle size={20} />} variant={nearLimit > 0 ? "accent" : "default"} />
      </AdminStats>

      <AdminSection title="Award allowance this month" icon={<IconCoins size={20} />} intro="Tokens each streamer can award this month, closest to the limit first. A streamer near the limit may need a bigger allowance (the default is on Levers).">
        {byUse.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconCoins size={28} />} title="No allowances this month yet" description="A community gets this month's allowance the first time its streamer awards tokens." />
        ) : (
          <>
            <AdminTable label="Award allowance this month">
              <Table variant="striped" dense>
                <TableHeader><TableRow><TableHead>Community</TableHead><TableHead align="right">Allowance</TableHead><TableHead align="right">Used</TableHead><TableHead align="right">Left</TableHead><TableHead align="right">Used %</TableHead></TableRow></TableHeader>
                <TableBody>
                  {allowance.shown.map((c) => {
                    const a = c.allowance!;
                    const pct = usedPct(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell><CommunityName c={c} /></TableCell>
                        <TableCell align="right" className="admin-num">{n(a.ceiling)}</TableCell>
                        <TableCell align="right" className="admin-num">{n(a.consumed)}</TableCell>
                        <TableCell align="right" className="admin-num">{n(Math.max(0, a.ceiling - a.consumed))}</TableCell>
                        <TableCell align="right" className="admin-num">{pct == null ? "No limit set" : pct >= 90 ? <Badge variant="warning" size="small">{`${pct}%`}</Badge> : `${pct}%`}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTable>
            {allowance.more}
          </>
        )}
      </AdminSection>

      <AdminSection title="Communities" icon={<IconUsers size={20} />} intro="Each community's tokens from its latest daily snapshot. Spread runs from 0 (even) to 1 (one wallet holds it all).">
        {data.communities.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconUsers size={28} />} title="No communities yet" description="A community appears here once a streamer connects Twitch." />
        ) : (
          <>
            <AdminTable label="Communities and their tokens">
              <Table variant="striped" dense>
                <TableHeader><TableRow><TableHead>Community</TableHead><TableHead align="right">Tokens</TableHead><TableHead align="right">Wallets</TableHead><TableHead align="right">Spread</TableHead><TableHead align="right">Typical wallet</TableHead><TableHead align="right">Top 10% from</TableHead><TableHead>Snapshot</TableHead></TableRow></TableHeader>
                <TableBody>
                  {communities.shown.map((c) => {
                    const s = c.latestSnapshot;
                    return (
                      <TableRow key={c.id}>
                        <TableCell><CommunityName c={c} /></TableCell>
                        <TableCell align="right" className="admin-num">{s ? n(s.total_supply) : "-"}</TableCell>
                        <TableCell align="right" className="admin-num">{s ? n(s.active_identities) : "-"}</TableCell>
                        <TableCell align="right" className="admin-num">{s && s.gini != null ? s.gini.toFixed(2) : "-"}</TableCell>
                        <TableCell align="right" className="admin-num">{s ? n(s.p50_balance) : "-"}</TableCell>
                        <TableCell align="right" className="admin-num">{s ? n(s.p90_balance) : "-"}</TableCell>
                        <TableCell className="admin-money-nowrap">{s ? snapshotDay(s.taken_at) : "None yet"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTable>
            {communities.more}
          </>
        )}
      </AdminSection>

      <AdminSection title="Busiest chats, last 7 days" icon={<IconMessages size={20} />} intro="Ranked by how many bets and chaos burns happened, not by tokens spent.">
        {busiest.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconMessages size={28} />} title="No chat activity this week" description="Communities show here once their chat bets on predictions or uses chaos." />
        ) : (
          <AdminTable label="Busiest chats, last 7 days">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead align="right">Rank</TableHead><TableHead>Community</TableHead><TableHead align="right">Bets and chaos</TableHead><TableHead align="right">People</TableHead></TableRow></TableHeader>
              <TableBody>
                {busiest.map((r, i) => (
                  <TableRow key={r.communityId}>
                    <TableCell align="right" className="admin-num">{i + 1}</TableCell>
                    <TableCell><CommunityName c={r} /></TableCell>
                    <TableCell align="right" className="admin-num">{n(r.engagementEvents)}</TableCell>
                    <TableCell align="right" className="admin-num">{n(r.distinctParticipants)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>
    </>
  );
}

export function TokenActivityPanel({ embedded = false }: { embedded?: boolean }) {
  const { data, error, loading, load } = useDashboard();
  const body: ReactNode = error && !data
    ? <Alert variant="error">Couldn&apos;t load the token activity. Try again in a minute.</Alert>
    : !data ? <LoadingLines label="Loading the token activity" /> : <ActivitySections data={data} />;
  if (embedded) return <>{body}</>;
  return (
    <div className="account-card admin-screen admin-money">
      <AdminHeader
        title="Activity"
        intro="What happened with tokens each day, and how many new-community bonuses went out."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} aria-label="Refresh" loading={loading} disabled={loading} onClick={() => void load()}>Refresh</Button>}
      />
      {body}
    </div>
  );
}

function ActivitySections({ data }: { data: EconomyDashboard }) {
  const events = usePaged(data.velocity);
  return (
    <>
      <AdminSection title="What happened each day, last 14 days" icon={<IconActivity size={20} />} intro="How many times each kind of token event happened. Bets and chaos burns are the signs of a lively chat economy.">
        {data.velocity.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconActivity size={28} />} title="No token events in the last 14 days" description="Rows appear as viewers earn, bet, burn and get awards." />
        ) : (
          <>
            <AdminTable label="Token events by day, last 14 days">
              <Table variant="striped" dense>
                <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>What happened</TableHead><TableHead align="right">Times</TableHead></TableRow></TableHeader>
                <TableBody>
                  {events.shown.map((r) => (
                    <TableRow key={`${r.day}-${r.type}`}>
                      <TableCell className="admin-money-nowrap">{dayKey(r.day)}</TableCell>
                      <TableCell>{eventLabel(r.type)}</TableCell>
                      <TableCell align="right" className="admin-num">{n(r.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
            {events.more}
          </>
        )}
      </AdminSection>

      <AdminSection title="New-community bonuses, last 30 days" icon={<IconGift size={20} />} intro="Tokens viewers get the first time they join another streamer's community. Watch for it heating up as more streamers join.">
        {data.newCommunityBonus.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconGift size={28} />} title="No new-community bonuses yet" description="They show here once a viewer joins a second streamer's community." />
        ) : (
          <AdminTable label="New-community bonuses, last 30 days">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Day</TableHead><TableHead align="right">Bonuses</TableHead><TableHead align="right">Tokens</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.newCommunityBonus.map((r) => (
                  <TableRow key={r.day}>
                    <TableCell className="admin-money-nowrap">{dayKey(r.day)}</TableCell>
                    <TableCell align="right" className="admin-num">{n(r.bonuses)}</TableCell>
                    <TableCell align="right" className="admin-num">{n(r.minted)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>
    </>
  );
}
