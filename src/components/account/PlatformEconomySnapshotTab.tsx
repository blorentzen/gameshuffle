"use client";

/**
 * Platform ▸ Token economy ▸ Overview (`part="overview"`) and ▸ History
 * (`part="history"`), staff/admin only. Both read GET /api/admin/economy-snapshot:
 * the live ecosystem-wide snapshot (`liveSnapshot(null)`) plus the last 30
 * persisted daily snapshots (`gs_economy_snapshots`).
 *
 *   Overview  how many tokens exist right now, where they came from, how many
 *             were burned and how evenly they're spread (counted live).
 *   History   the latest snapshot for each day. Children (the activity tables
 *             from TokenEconomyPanels) render inside the same screen, so the
 *             History tab stays one screen with one h1.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Button, EmptyState, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconArrowsExchange, IconCalendarStats, IconChartPie, IconCoins, IconCrown, IconFlame, IconRefresh, IconScale, IconStairsUp, IconTrendingUp, IconUsers, IconWallet } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminSection, AdminStats, AdminTable, AdminUpdated } from "@/components/account/admin/AdminKit";

interface SnapshotRow {
  community_id: string | null;
  total_supply: number;
  minted_free: number;
  minted_paid: number;
  burned: number;
  net_inflation: number;
  minted_total: number;
  wagered_volume: number;
  active_identities: number;
  gini: number | null;
  p50_balance: number | null;
  p90_balance: number | null;
  p99_balance: number | null;
}

interface ApiResponse {
  ok: true;
  live: SnapshotRow;
  history: Array<SnapshotRow & { taken_at: string }>;
  fetchedAt: string;
}

const PAGE = 25;
const tokenFormat = new Intl.NumberFormat("en-US");

function tokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return tokenFormat.format(value);
}

/** Net change with its sign, so "up" and "down" read without colour. */
function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value > 0 ? `+${tokenFormat.format(value)}` : tokenFormat.format(value);
}

function spread(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value.toFixed(2);
}

/** What the spread number means, in words. */
function spreadWord(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not enough wallets to tell";
  if (value < 0.3) return "Fairly even";
  if (value < 0.6) return "Somewhat uneven";
  return "A few wallets hold most of it";
}

const pacificDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

export function PlatformEconomySnapshotTab({ part = "overview", children }: { part?: "overview" | "history"; children?: ReactNode }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [round, setRound] = useState(0);

  const load = useCallback(async () => {
    setLoadError(null);
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/economy-snapshot", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("This screen is for staff only. Sign in with a staff account.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("Couldn't count the tokens. Try Refresh in a moment.");
        return;
      }
      setData(body as ApiResponse);
    } catch {
      setLoadError("Couldn't reach the server. Check your connection and try Refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const history = part === "history";
  const refresh = <Button variant="secondary" size="small" iconBefore={IconRefresh} aria-label="Refresh" loading={refreshing} disabled={refreshing} onClick={() => { setRound((r) => r + 1); void load(); }}>Refresh</Button>;

  return (
    <div className="account-card admin-screen admin-money">
      <AdminHeader
        title={history ? "History" : "Token economy"}
        intro={history
          ? "The token totals at the end of each day, then what happened with tokens day by day."
          : "How many tokens exist right now, where they came from, how many were burned and how evenly they're spread. Counted live, so it includes anything since today's daily snapshot."}
        actions={refresh}
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {data === null ? (
        !loadError && <LoadingLines label="Loading the token numbers" />
      ) : history ? (
        <HistorySection rows={data.history} limit={limit} onMore={() => setLimit((x) => x + PAGE)} />
      ) : (
        <>
          <AdminStats label="Tokens right now">
            <StatCard label="Tokens in wallets" value={tokens(data.live.total_supply)} source="Every token viewers hold" icon={<IconCoins size={20} />} variant="accent" />
            <StatCard label="Viewers holding tokens" value={tokens(data.live.active_identities)} source="Wallets with at least one token" icon={<IconUsers size={20} />} />
            <StatCard label="Net change" value={signed(data.live.net_inflation)} source="New tokens minus burned. Near zero or a little above is healthy." icon={<IconTrendingUp size={20} />} />
            <StatCard label="Spread" value={spread(data.live.gini)} source={`${spreadWord(data.live.gini)}. 0 is even, 1 is one holder.`} icon={<IconScale size={20} />} />
          </AdminStats>

          <AdminSection title="Where tokens came from and went" icon={<IconArrowsExchange size={20} />} intro="All-time totals. If streamer awards grow faster than burning, the award allowance is adding too many tokens.">
            <AdminStats label="Token flows, all time">
              <StatCard label="Earned and welcome grants" value={tokens(data.live.minted_free)} source="Welcome grants, recoveries and chat and in-game earns" icon={<IconWallet size={20} />} />
              <StatCard label="Awarded by streamers" value={tokens(data.live.minted_paid)} source="From streamers' monthly award allowance" icon={<IconCoins size={20} />} />
              <StatCard label="Burned" value={tokens(data.live.burned)} source="Spent on chaos and in the shop, gone for good" icon={<IconFlame size={20} />} />
              <StatCard label="Bet on predictions" value={tokens(data.live.wagered_volume)} source="Tokens put into prediction markets" icon={<IconChartPie size={20} />} />
            </AdminStats>
          </AdminSection>

          <AdminSection title="Wallet sizes" icon={<IconWallet size={20} />} intro="How many tokens a typical viewer holds, and where the biggest wallets start.">
            <AdminStats label="Wallet sizes" columns={3}>
              <StatCard label="Typical wallet" value={tokens(data.live.p50_balance)} source="Half of viewers hold less than this" icon={<IconWallet size={20} />} />
              <StatCard label="Top 10% start at" value={tokens(data.live.p90_balance)} source="The biggest tenth of wallets" icon={<IconStairsUp size={20} />} />
              <StatCard label="Top 1% start at" value={tokens(data.live.p99_balance)} source="The biggest wallets of all" icon={<IconCrown size={20} />} />
            </AdminStats>
          </AdminSection>
        </>
      )}

      {/* Remounted on Refresh so the activity tables fetch again too. */}
      {history && <Fragment key={round}>{children}</Fragment>}

      {data && <AdminUpdated at={data.fetchedAt} />}
    </div>
  );
}

function HistorySection({ rows, limit, onMore }: { rows: Array<SnapshotRow & { taken_at: string }>; limit: number; onMore: () => void }) {
  // The snapshot job can run more than once a day (it's scheduled at both
  // Pacific offsets); rows come newest first, so keep the first one per day.
  const seen = new Set<string>();
  const days = rows.filter((r) => {
    const d = pacificDay(r.taken_at);
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
  return (
    <AdminSection title="Totals at the end of each day" icon={<IconCalendarStats size={20} />} intro="Running totals from the latest snapshot each day. Earned includes welcome grants. Net change is earned plus awarded, minus burned. Holders are viewers with at least one token.">
      {days.length === 0 ? (
        <EmptyState variant="bordered" icon={<IconCalendarStats size={28} />} title="No daily snapshots yet" description="A snapshot is taken once a day. The live numbers on Overview are up to date in the meantime." />
      ) : (
        <>
          <AdminTable label="Token totals by day">
            <Table variant="striped" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead align="right">In wallets</TableHead>
                  <TableHead align="right">Earned</TableHead>
                  <TableHead align="right">Awarded</TableHead>
                  <TableHead align="right">Burned</TableHead>
                  <TableHead align="right">Net change</TableHead>
                  <TableHead align="right">Holders</TableHead>
                  <TableHead align="right">Spread</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.slice(0, limit).map((row) => (
                  <TableRow key={row.taken_at}>
                    <TableCell className="admin-money-nowrap">{dayLabel(row.taken_at)}</TableCell>
                    <TableCell align="right" className="admin-num">{tokens(row.total_supply)}</TableCell>
                    <TableCell align="right" className="admin-num">{tokens(row.minted_free)}</TableCell>
                    <TableCell align="right" className="admin-num">{tokens(row.minted_paid)}</TableCell>
                    <TableCell align="right" className="admin-num">{tokens(row.burned)}</TableCell>
                    <TableCell align="right" className={`admin-num${row.net_inflation > 0 ? " admin-money-positive" : row.net_inflation < 0 ? " admin-money-negative" : ""}`}>{signed(row.net_inflation)}</TableCell>
                    <TableCell align="right" className="admin-num">{tokens(row.active_identities)}</TableCell>
                    <TableCell align="right" className="admin-num">{spread(row.gini)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
          {days.length > limit && (
            <div className="admin-money-more"><Button variant="ghost" size="small" onClick={onMore}>Show {Math.min(PAGE, days.length - limit)} more of {days.length}</Button></div>
          )}
        </>
      )}
    </AdminSection>
  );
}
