"use client";

/**
 * Account ▸ Invite friends (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/EDTipNkH65NYaAqtW8AvKh): your invite link for the
 * dailies, what it has brought, and how it pays. Data from /api/referrals
 * (src/lib/referrals/store.ts). Names show once a friend has an account;
 * guests are "A new player".
 */

import { useEffect, useState } from "react";
import { Button, EmptyState, Input, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCoins, IconPlayerPlay, IconUserPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminScreen, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { EVENTS, track } from "@/lib/analytics/events";
import { referralLink } from "@/lib/originals/referral";
import type { ReferralView } from "@/lib/referrals/types";

const GAME_NAMES = { shuffle: "the Daily", dex: "the Daily Dex", weekly: "the Weekly" } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function InviteFriendsScreen() {
  const toast = useToast();
  const [view, setView] = useState<ReferralView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/referrals", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: ReferralView | null) => {
      if (!alive) return;
      if (d) setView(d); else setFailed(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const intro = "Share the dailies with your link. You earn tokens when someone new plays from it, and more when they make an account.";
  if (failed) return <AdminScreen title="Invite friends" intro={intro}><EmptyState title="Couldn't load your invite link" description="Reload the page to try again." /></AdminScreen>;
  if (!view) return <AdminScreen title="Invite friends" intro={intro}><LoadingLines label="Loading your invite link" /></AdminScreen>;
  if (!view.ready || !view.code) return <AdminScreen title="Invite friends" intro={intro}><EmptyState title="Invite links are almost here" description="They need one more update on our side. Check back soon." /></AdminScreen>;

  const link = referralLink("/daily", view.code);
  const { levers } = view;
  const copy = () => navigator.clipboard.writeText(link).then(
    () => { track(EVENTS.referralLinkCopied, { from: "account" }); toast.success("Invite link copied"); },
    () => toast.error("Couldn't copy the link"),
  );

  return (
    <AdminScreen title="Invite friends" intro={intro}>
      <div className="invite-link">
        <Input value={link} readOnly floatingLabel="Your invite link" fullWidth onFocus={(e) => e.currentTarget.select()} />
        <Button variant="primary" onClick={() => void copy()}>Copy link</Button>
      </div>
      <p className="dbot-muted invite-link__note">Results you share from the Daily Shuffle, Daily Dex and Weekly carry it automatically. Your code is {view.code}.</p>

      <AdminStats columns={3} label="What your link has brought">
        <StatCard label="Played from your link" value={String(view.played)} icon={<IconPlayerPlay size={20} />} />
        <StatCard label="Made an account" value={String(view.accounts)} icon={<IconUserPlus size={20} />} />
        <StatCard label="Tokens earned" value={view.tokens.toLocaleString("en-US")} icon={<IconCoins size={20} />} variant="accent" />
      </AdminStats>

      <AdminSection title="How it pays">
        <ul className="invite-rules">
          <li><strong>{levers.finish} tokens</strong> when someone new finishes a daily from your link.</li>
          <li><strong>{levers.signup} more</strong> when they make a free account, and they get {levers.welcome} extra to start.</li>
          <li>Each person counts once, for the first link they used. Their phone remembers your link for {levers.linkDays} days.</li>
          <li>Up to {levers.perDay} paid players a day. Your own account, browser and network never count.</li>
        </ul>
      </AdminSection>

      <AdminSection title="Who joined">
        {!view.rows.length ? <EmptyState title="Nobody yet" description="Share today's Daily with your link and check back here." /> : (
          <AdminTable label="Who joined from your link">
            <Table variant="striped" dense>
              <TableHeader><TableRow><TableHead>Who</TableHead><TableHead>What</TableHead><TableHead>When</TableHead><TableHead align="right">Tokens</TableHead></TableRow></TableHeader>
              <TableBody>
                {view.rows.map((r, i) => (
                  <TableRow key={`${r.at}-${i}`}>
                    <TableCell>{r.who}</TableCell>
                    <TableCell>{r.what === "signup" ? "Made an account" : `Finished ${r.game ? GAME_NAMES[r.game] : "a daily"}`}</TableCell>
                    <TableCell>{when(r.at)}</TableCell>
                    <TableCell align="right">{r.tokens ? `+${r.tokens}` : "Over the day's limit"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </AdminSection>
    </AdminScreen>
  );
}
