"use client";

/**
 * Platform admin ▸ Overview ▸ Setup: how many accounts have each tool connected and whether it still works (Twitch,
 * the Discord bot, sign-ins and lounge tools), plus "Needs a look" lists naming the accounts whose setup broke so
 * staff can reach out. Data from /api/admin/setup (src/lib/platform/setup.ts explains each count). Games on Twitch
 * (PlatformTwitchNow) loads on its own at the foot.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, List, ListItem, Progress, StatCard } from "@empac/cascadeds";
import { IconBrandDiscord, IconBrandTwitch, IconCircleCheck, IconHash, IconPlugConnected, IconRefresh, IconUsers } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { AdminHeader, AdminSection, AdminStats, AdminUpdated } from "@/components/account/admin/AdminKit";
import type { SetupProblem, SetupSummary } from "@/lib/platform/setup";
import { PlatformTwitchNow } from "./PlatformTwitchNow";
import "@/styles/admin-setup.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const ICON = 20;
const PAGE = 25;

/** "40%", "under 1%", or nothing when there's nothing to compare with. */
function share(n: number, of: number): string | null {
  if (of <= 0) return null;
  if (n > 0 && n / of < 0.01) return "under 1%";
  return `${Math.round((n / of) * 100)}%`;
}

const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

export function PlatformSetupTab() {
  const [data, setData] = useState<SetupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) { setError("This screen is for staff only."); return; }
      if (!res.ok || !body.ok) { setError("Couldn't load the setup numbers. Try Refresh in a moment."); return; }
      setError(null);
      setData(body.summary as SetupSummary);
    } catch {
      setError("Couldn't reach the server. Check your connection and try Refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const t = data?.twitch;
  const d = data?.discord;
  const p = data?.people;

  return (
    <div className="account-card admin-screen admin-setup">
      <AdminHeader
        title="Setup"
        intro="How many accounts have each tool connected, and whether it still works."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={loading && !!data} disabled={loading} onClick={() => void load()}>Refresh</Button>}
      />

      {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

      {!data || !t || !d || !p ? (
        !error && <LoadingLines label="Loading" />
      ) : (
        <>
          <AdminStats label="Setup at a glance">
            <StatCard label="Twitch connected" value={fmt(t.connected)} source={`+${fmt(t.connectedWeek)} in the last 7 days`} icon={<IconBrandTwitch size={ICON} />} variant="accent" />
            <StatCard label="Twitch working" value={fmt(t.working)} source={t.connected ? `${share(t.working, t.connected)} of connected` : "None connected yet"} icon={<IconPlugConnected size={ICON} />} />
            <StatCard label="Discord servers" value={fmt(d.servers)} source={`+${fmt(d.serversWeek)} in the last 7 days`} icon={<IconBrandDiscord size={ICON} />} />
            <StatCard label="Discord with a channel" value={fmt(d.withChannel)} source={d.servers ? `${share(d.withChannel, d.servers)} of servers` : "No servers yet"} icon={<IconHash size={ICON} />} />
          </AdminStats>

          <div className="admin-setup__part admin-setup__part--twitch">
            <AdminSection
              title="Twitch"
              icon={<IconBrandTwitch />}
              intro="Each bar is a share of everyone who connected Twitch. Working means the bot is allowed in chat and all four kinds of Twitch events are on."
            >
              <Meters
                label="Twitch setup"
                of={t.connected}
                ofName="connected accounts"
                rows={[
                  { label: "Connected Twitch", count: t.connected },
                  { label: "The bot can post in their chat", count: t.bot },
                  { label: "Chat and stream events coming in", count: t.events },
                  { label: "Overlay added in OBS", hint: "It has loaded at least once", count: t.overlay },
                  { label: "Went live in the last 30 days", count: t.liveMonth },
                ]}
              />
              <Counts
                label="Other Twitch tools"
                items={[
                  { label: "Channel points on", count: t.channelPoints },
                  { label: "Chat feed on stream", count: t.chatFeed },
                  { label: "Has mods", count: t.withMods },
                  { label: "YouTube connected", count: t.youtube },
                ]}
              />
              <NeedsALook
                problems={t.problems}
                allGood={t.connected ? "Every Twitch connection is working." : "No one has connected Twitch yet."}
              />
            </AdminSection>
          </div>

          <div className="admin-setup__part admin-setup__part--discord">
            <AdminSection title="Discord bot" icon={<IconBrandDiscord />} intro="Servers the bot is in now, and whether each has a channel to post in.">
              <Meters
                label="Discord bot setup"
                of={d.servers}
                ofName="servers"
                rows={[
                  { label: "Servers with the bot", hint: d.servers ? `Owned by ${plural(d.owners, "account", "accounts")}` : undefined, count: d.servers },
                  { label: "A channel picked for posts", count: d.withChannel },
                ]}
              />
              <Counts
                label="Other Discord tools"
                items={[
                  { label: "Go-live alerts", count: d.liveAlerts },
                  { label: "Question of the Day", count: d.qotd },
                  { label: "Server logs", count: d.logs },
                  { label: "Lounge roles", count: d.loungeRoles },
                  { label: "Bot removed in the last 30 days", count: d.removedMonth },
                ]}
              />
              <NeedsALook
                problems={d.problems}
                allGood={d.servers ? "Every server has what it needs to post." : "The bot isn't in any servers yet."}
              />
            </AdminSection>
          </div>

          <div className="admin-setup__part admin-setup__part--accounts">
            <AdminSection title="Accounts" icon={<IconUsers />} intro={`Out of ${plural(data.accounts, "account", "accounts")}.`}>
              <Meters
                label="Account setup"
                of={data.accounts}
                ofName="accounts"
                rows={[
                  { label: "Signs in with Twitch", count: p.twitchSignIn },
                  { label: "Signs in with Discord", count: p.discordSignIn },
                  { label: "MMR card made", count: p.mmrCards },
                  { label: "Lounge name confirmed", count: p.loungeConfirmed },
                ]}
              />
            </AdminSection>
          </div>

        </>
      )}

      <PlatformTwitchNow />

      {data && <AdminUpdated at={data.generatedAt} />}
    </div>
  );
}

interface MeterRow { label: string; hint?: string; count: number }

/** A count per row with a bar for its share of `of` (CDS Progress, named for screen readers, number written beside it). */
function Meters({ label, rows, of, ofName }: { label: string; rows: MeterRow[]; of: number; ofName: string }) {
  return (
    <ul className="admin-setup__meters" aria-label={label}>
      {rows.map((r) => {
        const pct = share(r.count, of);
        return (
          <li key={r.label} className="admin-setup__meter">
            <span className="admin-setup__meter-text">
              <span className="admin-setup__meter-label">{r.label}</span>
              {r.hint && <span className="admin-setup__meter-hint">{r.hint}</span>}
            </span>
            <span className="admin-setup__meter-nums">
              <span className="admin-setup__meter-count">{fmt(r.count)}</span>
              {pct && <span className="admin-setup__meter-share">{pct}</span>}
            </span>
            <Progress
              value={r.count}
              max={Math.max(of, 1)}
              size="small"
              label={`${r.label}: ${fmt(r.count)} of ${fmt(of)} ${ofName}`}
              className="admin-progress-quiet admin-setup__bar"
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Small counts: a label and its number, no bar. */
function Counts({ label, items }: { label: string; items: { label: string; count: number }[] }) {
  return (
    <dl className="admin-setup__counts" aria-label={label}>
      {items.map((i) => (
        <div key={i.label} className="admin-setup__count">
          <dt>{i.label}</dt>
          <dd>{fmt(i.count)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NeedsALook({ problems, allGood }: { problems: SetupProblem[]; allGood: ReactNode }) {
  const [shown, setShown] = useState(PAGE);
  const rest = problems.length - shown;
  return (
    <div className="admin-setup__look">
      <h3 className="admin-setup__look-title">
        Needs a look
        <Badge variant={problems.length ? "warning" : "success"} size="small">{fmt(problems.length)}</Badge>
      </h3>
      {problems.length === 0 ? (
        <p className="admin-setup__ok"><IconCircleCheck size={18} aria-hidden />{allGood}</p>
      ) : (
        <>
          <List divided className="admin-setup__problems">
            {problems.slice(0, shown).map((row) => (
              <ListItem
                key={row.key}
                className="admin-setup__problem"
                suffix={row.href ? (
                  <ArrowLink href={row.href} target="_blank" rel="noopener noreferrer">
                    Open<span className="sr-only"> {row.name}&apos;s profile (opens in a new tab)</span>
                  </ArrowLink>
                ) : undefined}
              >
                <span className="admin-setup__problem-name">{row.name}</span>
                {row.detail && <span className="admin-setup__problem-detail">{row.detail}</span>}
                {row.reasons.map((r) => <span key={r} className="admin-setup__reason">{r}</span>)}
              </ListItem>
            ))}
          </List>
          {rest > 0 && (
            <div>
              <Button variant="secondary" size="small" onClick={() => setShown((n) => n + PAGE)}>
                Show {fmt(Math.min(rest, PAGE))} more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
