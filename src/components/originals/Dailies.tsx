"use client";

/**
 * The dailies together (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/7AXQ8c8LmnSHHvMAsqQVWZ): the today bar under each
 * daily's header, "Next up" on its end screen, one share for everything
 * played today, and the streak cards. State lives in src/lib/originals/dailies.ts:
 * each game reports itself to the browser, and signed in /api/dailies fills in
 * games played elsewhere. Inside the Discord Activity the bar switches games
 * instead of navigating (`onPick`).
 */

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert, Button, Card, SubNav } from "@empac/cascadeds";
import { IconUserPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { DAILIES_GLYPHS, DailiesCards } from "@/components/originals/DailiesCards";
import { guestRequestId } from "@/components/originals/DailyBoard";
import { OriginalsLink } from "@/components/originals/OriginalsHost";
import { captureReferral, referralLink, storedReferral, updateReferral, withReferral, type StoredReferral } from "@/lib/originals/referral";
import type { ReferralGame, ReferralInfo } from "@/lib/referrals/types";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  DAILIES, barStatus, combinedShareText, currentDay, dailiesShown, dailiesSnapshot, mergeDailies, nextUp, readDailiesStore, sharedToday, subscribeDailies,
  type DailiesEntries, type DailiesId,
} from "@/lib/originals/dailies";

interface DailiesState {
  current: DailiesId;
  shown: DailiesId[];
  entries: DailiesEntries;
  /** null until the server answers. */
  signedIn: boolean | null;
  /** Signed in on the site: your invite code and the amounts. */
  referral: ReferralInfo | null;
  /** A friend's link this browser came in on (first link wins, a week). */
  invitedBy: StoredReferral | null;
}

const noop = () => () => {};
const DailiesContext = createContext<DailiesState | null>(null);

function useDailiesState(current: DailiesId, enabled: boolean): DailiesState {
  const { api, activity } = useOriginalsHost();
  // A friend's ?r= link, noted once per page (and taken out of the address).
  const [invitedBy, setInvitedBy] = useState<StoredReferral | null>(null);
  useEffect(() => {
    if (!enabled || activity) return;
    const r = captureReferral();
    void Promise.resolve().then(() => setInvitedBy(r));
  }, [enabled, activity]);
  const raw = useSyncExternalStore(enabled ? subscribeDailies : noop, dailiesSnapshot, () => "");
  const store = useMemo(() => readDailiesStore(raw || "null"), [raw]);
  const shown = useMemo(() => dailiesShown(current), [current]);
  const [server, setServer] = useState<{ signedIn: boolean; entries: DailiesEntries | null; referral: ReferralInfo | null } | null>(null);
  // A game finishing here: ask the server again once its save has landed (streaks, the last two weeks).
  const doneKey = shown.filter((id) => store.entries[id]?.state === "done" && store.entries[id]?.day === currentDay(id)).join(",");

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => api("/api/dailies", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: { signedIn?: boolean; entries?: DailiesEntries; referral?: ReferralInfo | null } | null) => {
      if (alive && d) setServer({ signedIn: !!d.signedIn, entries: d.entries ?? null, referral: d.referral ?? null });
    }).catch(() => { /* the browser's own numbers still show */ });
    const t = window.setTimeout(load, doneKey ? 1500 : 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [api, enabled, doneKey]);

  // Signed in after coming from a friend's link: the sign-up bonus, asked for once.
  const signedIn = server?.signedIn ?? null;
  useEffect(() => {
    if (!enabled || activity || !signedIn) return;
    const r = storedReferral();
    if (!r || r.claimed) return;
    updateReferral({ claimed: true });
    void api("/api/referrals/claim", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": guestRequestId() }, body: JSON.stringify({ code: r.code }) }).catch(() => {});
  }, [enabled, activity, signedIn, api]);

  const entries = useMemo(() => mergeDailies(store.entries, server?.entries ?? null, store.history), [store, server]);
  return { current, shown, entries, signedIn, referral: activity ? null : server?.referral ?? null, invitedBy };
}

/**
 * A finished game from a friend's link: told to the server once per game (it
 * pays the friend's referrer if this is someone new). Not inside Discord.
 */
export function sendReferralFinish(api: (path: string, init?: RequestInit) => Promise<Response>, game: ReferralGame, day: string, guesses: string[] | null) {
  const r = storedReferral();
  if (!r || !r.fresh || r.sent?.includes(game)) return;
  updateReferral({ sent: [...(r.sent ?? []), game] });
  void api("/api/referrals/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-daily-guest": guestRequestId() },
    body: JSON.stringify({ code: r.code, game, day, guesses, fresh: true }),
  }).catch(() => {});
}

/** One shared state for a page's bar, Next up, share and cards (one request, not four). */
export function DailiesProvider({ current, children }: { current: DailiesId; children: ReactNode }) {
  const value = useDailiesState(current, true);
  return <DailiesContext.Provider value={value}>{children}</DailiesContext.Provider>;
}

export function useDailies(current: DailiesId): DailiesState {
  const ctx = useContext(DailiesContext);
  const own = useDailiesState(current, !ctx);
  return ctx ?? own;
}

/** The friend's note above the game: who sent the link and what finishing it does. */
function InvitedNote({ current }: { current: DailiesId }) {
  const { invitedBy, referral, entries } = useDailies(current);
  const [from, setFrom] = useState<{ name: string; finish: number; start: number } | null>(null);
  const code = invitedBy?.fresh && invitedBy.code !== referral?.code ? invitedBy.code : null;
  useEffect(() => {
    if (!code) return;
    let alive = true;
    void fetch(`/api/referrals/code/${code}`).then((r) => (r.ok ? r.json() : null)).then((d: { name?: string | null; finish?: number; start?: number } | null) => {
      if (alive && d?.name) setFrom({ name: d.name, finish: d.finish ?? 0, start: d.start ?? 0 });
    }).catch(() => {});
    return () => { alive = false; };
  }, [code]);
  if (!code || !from || entries[current]?.state === "done") return null;
  const game = current === "dex" ? "Daily Dex" : current === "weekly" ? "Weekly" : "Daily";
  return (
    <Alert variant="success" title={`${from.name} sent you today's ${game}`} className="dailies-invited">
      Finish it and {from.name} earns {from.finish} tokens.{from.start ? ` Make a free account and you start with ${from.start.toLocaleString("en-US")}.` : ""}
    </Alert>
  );
}

/** The today bar: every daily with done / playing / left, the one you're on outlined in its color. */
export function DailiesBar({ current, onPick }: { current: DailiesId; onPick?: (id: DailiesId) => void }) {
  const { shown, entries } = useDailies(current);
  return (
    <>
    <div className={`dailies-bar dailies-bar--${shown.length}`} style={{ "--dailies-n": shown.length } as React.CSSProperties}>
      <SubNav
        variant="pills"
        className="dailies-bar__nav"
        items={shown.map((id) => ({
          label: DAILIES[id].tab,
          href: onPick ? "#" : DAILIES[id].href,
          active: id === current,
          badge: barStatus(id, entries[id], id === current),
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (onPick) e.preventDefault();
            if (id === current) { e.preventDefault(); return; }
            track(EVENTS.dailiesSwitched, { to: id, from: current, via: "bar" });
            onPick?.(id);
          },
        }))}
      />
    </div>
    {!onPick && <InvitedNote current={current} />}
    </>
  );
}

/** On an end screen: the next daily you haven't played, or that you've done them all. */
export function DailiesNext({ current, onPick }: { current: DailiesId; onPick?: (id: DailiesId) => void }) {
  const { shown, entries } = useDailies(current);
  const next = nextUp(entries, shown, current);
  if (!next) {
    if (shown.length < 2) return null;
    return <p className="party-muted dailies-next__done">That&apos;s every daily for today. New puzzles at midnight Pacific.</p>;
  }
  const g = DAILIES[next];
  const Glyph = DAILIES_GLYPHS[next];
  const streak = entries[next]?.stats?.streak ?? 0;
  const go = () => track(EVENTS.dailiesSwitched, { to: next, from: current, via: "next" });
  const label = next === "weekly" ? "Play this week" : "Play";
  return (
    <Card variant="outlined" padding="medium" className={`dailies-next dailies--${next}`}>
      <span className="dailies-next__tile" aria-hidden><Glyph size={24} stroke={2} /></span>
      <span className="dailies-next__eyebrow">Next up</span>
      <h2 className="dailies-next__title">{g.name}</h2>
      <p className="dailies-next__text">{g.pitch}{streak ? ` Your streak: ${streak}.` : ""}</p>
      {onPick
        ? <Button variant="secondary" onClick={() => { go(); onPick(next); }}>{label}</Button>
        : <Link href={g.href} onClick={go} className="dailies-next__link"><Button variant="secondary">{label}</Button></Link>}
    </Card>
  );
}

/**
 * The share buttons on an end screen. Once more than one daily is done today:
 * "Copy today's results" (a line per game) and "Copy just this one" (this
 * game's full grid). Otherwise the game's own single button, as before.
 */
export function DailiesShare({ current, shareOne, oneText }: { current: DailiesId; shareOne: () => void; oneText: string }) {
  const toast = useToast();
  const { activity } = useOriginalsHost();
  const { shown, entries, referral } = useDailies(current);
  const ids = sharedToday(entries, shown);
  const combined = ids.length >= 2 && ids.includes(current);
  const verb = activity?.share ? "Share" : "Copy";
  if (!combined) return <span className="party-row"><Button variant="primary" onClick={shareOne}>{oneText}</Button></span>;

  const shareAll = async () => {
    const text = withReferral(combinedShareText(entries, shown), referral?.code);
    if (activity?.share) {
      if (await activity.share(text)) { track(EVENTS.dailiesShared, { games: ids.length, from: current }); toast.success("Shared"); }
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => { track(EVENTS.dailiesShared, { games: ids.length, from: current }); toast.success("Today's results copied"); },
      () => toast.error("Couldn't copy your results"),
    );
  };
  return (
    <span className="party-row">
      <Button variant="primary" onClick={() => void shareAll()}>{verb} today&apos;s results</Button>
      <Button variant="secondary" onClick={shareOne}>{verb} just this one</Button>
    </span>
  );
}

/** The streak cards on an end screen. */
export function DailiesYours({ current }: { current: DailiesId }) {
  const { shown, entries, signedIn } = useDailies(current);
  const { activity } = useOriginalsHost();
  return <DailiesCards entries={entries} shown={shown} current={current} signedIn={!!signedIn || !!activity} />;
}

/**
 * On an end screen: your invite link and what it earns (signed in), or a nudge
 * to sign in for one. Not inside Discord.
 */
export function DailiesInvite({ current }: { current: DailiesId }) {
  const toast = useToast();
  const { activity } = useOriginalsHost();
  const { referral, signedIn } = useDailies(current);
  if (activity || signedIn === null) return null;
  if (!referral?.code) {
    if (signedIn) return null;
    return (
      <p className="party-muted dailies-invite__nudge">
        <OriginalsLink href={`/login?redirect=${DAILIES[current].href}`}>Sign in</OriginalsLink> to get your own invite link: you earn tokens when friends play from it.
      </p>
    );
  }
  const { code, levers } = referral;
  const link = referralLink(DAILIES[current].href, code);
  const copy = () => navigator.clipboard.writeText(link).then(
    () => { track(EVENTS.referralLinkCopied, { from: current }); toast.success("Invite link copied"); },
    () => toast.error("Couldn't copy the link"),
  );
  return (
    <Card variant="outlined" padding="medium" className="dailies-invite">
      <span className="dailies-invite__tile" aria-hidden><IconUserPlus size={22} stroke={2} /></span>
      <span className="dailies-next__eyebrow">Invite friends</span>
      <h2 className="dailies-next__title">Earn {levers.finish} tokens for each new player who finishes from your link</h2>
      <p className="dailies-next__text">And {levers.signup} more if they make a free account, up to {levers.perDay} players a day. Your shared results carry the link too.</p>
      <span className="dailies-invite__link">
        <code>{link.replace("https://www.", "")}</code>
        <Button variant="secondary" size="small" onClick={() => void copy()}>Copy link</Button>
      </span>
      <OriginalsLink href="/account?tab=invite" className="dailies-invite__more">See who joined</OriginalsLink>
    </Card>
  );
}
