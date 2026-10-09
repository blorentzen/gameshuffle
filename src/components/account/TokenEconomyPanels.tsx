"use client";

/**
 * Token economy ▸ Streamers (allowance use, communities, chat activity) and the
 * activity tables under ▸ History (events by day, new-community bonuses). Both
 * read /api/admin/economy/dashboard. These used to live on /staff/economy.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { EconomyDashboard } from "@/lib/economy/policy/dashboard";

const n = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("en-US"));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
const EVENT_LABEL: Record<string, string> = {
  bet: "Bets", chaos_burn: "Chaos burns", award_mint: "Streamer awards", grant_start: "Welcome grants", earn_newcommunity: "New-community bonuses",
  earn_t1: "In-game earns", earn_t2: "Chat earns", give: "Gifts between viewers", transfer_out: "Transfers", bust_recovery: "Bust recovery",
};

function useDashboard() {
  const [data, setData] = useState<EconomyDashboard | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/economy/dashboard", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (live) { if (d?.ok) setData(d); else setError(true); } }).catch(() => live && setError(true));
    return () => { live = false; };
  }, []);
  return { data, error };
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="token-panel__section">
      <h3 className="token-panel__h">{title}</h3>
      {intro && <p className="token-panel__intro">{intro}</p>}
      <div className="admin-table">{children}</div>
    </section>
  );
}

export function TokenStreamersPanel() {
  const { data, error } = useDashboard();
  return (
    <div className="account-card token-panel">
      <h2 className="account-tab__heading">Streamers</h2>
      <p className="account-tab__intro">How much of each streamer&apos;s monthly award allowance is used, what each community holds, and where chat was busiest this week.</p>
      {error ? <Alert variant="error">Couldn&apos;t load the streamer numbers. Try again in a minute.</Alert> : !data ? <LoadingLines label="Loading" /> : (
        <>
          <Section title="Award allowance this month" intro="Tokens a streamer can award each month. Near the limit means they may need a bigger allowance.">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Community</TableHead><TableHead align="right">Allowance</TableHead><TableHead align="right">Used</TableHead><TableHead align="right">Left</TableHead><TableHead align="right">Used %</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.communities.length === 0 ? <TableRow><TableCell><TableEmpty title="No communities yet" /></TableCell></TableRow> : data.communities.map((c) => {
                  const a = c.allowance;
                  const pct = a && a.ceiling > 0 ? Math.round((a.consumed / a.ceiling) * 100) : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.displayName ?? c.slug}<span className="admin-table__sub">{c.slug}</span></TableCell>
                      <TableCell align="right">{a ? n(a.ceiling) : "-"}</TableCell>
                      <TableCell align="right">{a ? n(a.consumed) : "-"}</TableCell>
                      <TableCell align="right">{a ? n(Math.max(0, a.ceiling - a.consumed)) : "-"}</TableCell>
                      <TableCell align="right">{pct == null ? "No allowance yet" : pct >= 90 ? <Badge variant="warning" size="small">{`${pct}%`}</Badge> : `${pct}%`}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>
          <Section title="Communities" intro="Each community's tokens from its latest daily snapshot.">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Community</TableHead><TableHead align="right">Tokens</TableHead><TableHead align="right">Active wallets</TableHead><TableHead align="right">Inequality</TableHead><TableHead align="right">Median / top 10%</TableHead><TableHead>Snapshot</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.communities.length === 0 ? <TableRow><TableCell><TableEmpty title="No communities yet" /></TableCell></TableRow> : data.communities.map((c) => {
                  const s = c.latestSnapshot;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.displayName ?? c.slug}<span className="admin-table__sub">{c.slug}</span></TableCell>
                      <TableCell align="right">{s ? n(s.total_supply) : "-"}</TableCell>
                      <TableCell align="right">{s ? n(s.active_identities) : "-"}</TableCell>
                      <TableCell align="right">{s && s.gini != null ? s.gini.toFixed(3) : "-"}</TableCell>
                      <TableCell align="right">{s ? `${n(s.p50_balance)} / ${n(s.p90_balance)}` : "-"}</TableCell>
                      <TableCell>{s ? day(s.taken_at) : "None yet"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>
          <Section title="Busiest chats, last 7 days" intro="Ranked by how many bets and chaos burns happened, not by tokens spent.">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Community</TableHead><TableHead align="right">Bets and chaos</TableHead><TableHead align="right">People</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.streamerBoard.length === 0 ? <TableRow><TableCell><TableEmpty title="No chat activity this week" /></TableCell></TableRow> : data.streamerBoard.map((r, i) => (
                  <TableRow key={r.communityId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{r.displayName ?? r.slug}<span className="admin-table__sub">{r.slug}</span></TableCell>
                    <TableCell align="right">{n(r.engagementEvents)}</TableCell>
                    <TableCell align="right">{n(r.distinctParticipants)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </>
      )}
    </div>
  );
}

export function TokenActivityPanel() {
  const { data, error } = useDashboard();
  return (
    <div className="account-card token-panel">
      <h2 className="account-tab__heading">Activity</h2>
      <p className="account-tab__intro">What happened with tokens each day, and how many new-community bonuses went out.</p>
      {error ? <Alert variant="error">Couldn&apos;t load the activity. Try again in a minute.</Alert> : !data ? <LoadingLines label="Loading" /> : (
        <>
          <Section title="Events by day, last 14 days" intro="Bets and chaos burns are the signs of a lively chat economy.">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>What happened</TableHead><TableHead align="right">Times</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.velocity.length === 0 ? <TableRow><TableCell><TableEmpty title="No token events in the last 14 days" /></TableCell></TableRow> : data.velocity.map((r) => (
                  <TableRow key={`${r.day}-${r.type}`}>
                    <TableCell>{r.day}</TableCell>
                    <TableCell>{EVENT_LABEL[r.type] ?? r.type}{EVENT_LABEL[r.type] ? <span className="admin-table__sub">{r.type}</span> : null}</TableCell>
                    <TableCell align="right">{n(r.count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <Section title="New-community bonuses, last 30 days" intro="Tokens viewers get the first time they join another streamer's community. Watch for it heating up as more streamers join.">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Day</TableHead><TableHead align="right">Bonuses</TableHead><TableHead align="right">Tokens</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.newCommunityBonus.length === 0 ? <TableRow><TableCell><TableEmpty title="No new-community bonuses yet" /></TableCell></TableRow> : data.newCommunityBonus.map((r) => (
                  <TableRow key={r.day}>
                    <TableCell>{r.day}</TableCell>
                    <TableCell align="right">{n(r.bonuses)}</TableCell>
                    <TableCell align="right">{n(r.minted)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </>
      )}
    </div>
  );
}
