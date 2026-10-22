"use client";

/**
 * The dailies together (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/7AXQ8c8LmnSHHvMAsqQVWZ): the today bar under each
 * daily's header, "Next up" on its end screen, one share for everything
 * played today, and the streak cards. Shuffle, Dex and Fire Round share the bar;
 * the Weekly sits on a line under it (Britton, 2026-10-19). State lives in src/lib/originals/dailies.ts:
 * each game reports itself to the browser, and signed in /api/dailies fills in
 * games played elsewhere. Inside the Discord Activity the bar switches games
 * instead of navigating (`onPick`).
 */

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert, Button, Card, SubNav } from "@empac/cascadeds";
import { IconArrowRight, IconUserPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { DAILIES_GLYPHS, DailiesCards } from "@/components/originals/DailiesCards";
import { guestRequestId } from "@/components/originals/DailyBoard";
import { OriginalsLink } from "@/components/originals/OriginalsHost";
import { captureReferral, referralLink, storedReferral, updateReferral, withReferral, type StoredReferral } from "@/lib/originals/referral";
import { ShareButton } from "@/components/share/ShareButton";
import { useChallengeShareLabel } from "@/components/share/ShareChallenge";
import type { ShareRequest } from "@/lib/share/types";
import type { ReferralGame, ReferralInfo } from "@/lib/referrals/types";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  DAILIES, barStatus, combinedShareText, currentDay, dailiesShown, dailiesSnapshot, mergeDailies, nextUp, readDailiesStore, sharedToday, subscribeDailies, weeklyLine,
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
/** The games the Discord Activity can switch to (Fire Round and the Duel aren't in it, so they never reach `onPick`). */
type ActivityGame = Exclude<DailiesId, "fire" | "duel">;
const pickable = (id: DailiesId): ActivityGame | null => (id === "fire" || id === "duel" ? null : id);
const DailiesContext = createContext<DailiesState | null>(null);

function useDailiesState(current: DailiesId, enabled: boolean, invite?: string | null): DailiesState {
  const { api, activity } = useOriginalsHost();
  // A friend's ?r= link, noted once per page (and taken out of the address).
  const [invitedBy, setInvitedBy] = useState<StoredReferral | null>(null);
  useEffect(() => {
    if (!enabled || activity) return;
    const r = captureReferral(7, invite);
    void Promise.resolve().then(() => setInvitedBy(r));
  }, [enabled, activity, invite]);
  const raw = useSyncExternalStore(enabled ? subscribeDailies : noop, dailiesSnapshot, () => "");
  const store = useMemo(() => readDailiesStore(raw || "null"), [raw]);
  // Fire Round isn't in the Discord Activity (it has only the puzzles).
  const shown = useMemo(() => dailiesShown(current, { fire: !activity, duel: !activity }), [current, activity]);
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
export function DailiesProvider({ current, invite, children }: {
  current: DailiesId;
  /** The sharer's invite code on a shared result page (counts like a ?r= link). */
  invite?: string | null;
  children: ReactNode;
}) {
  const value = useDailiesState(current, true, invite);
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
  // Fire Round doesn't pay referrals (only the puzzles and the Weekly do).
  if (!code || !from || current === "fire" || entries[current]?.state === "done") return null;
  const game = current === "dex" ? "Daily Dex" : current === "weekly" ? "Weekly" : "Daily";
  return (
    <Alert variant="success" title={`${from.name} sent you today's ${game}`} className="dailies-invited">
      Finish it and {from.name} earns {from.finish} tokens.{from.start ? ` Make a free account and you start with ${from.start.toLocaleString("en-US")}.` : ""}
    </Alert>
  );
}

/**
 * The today bar: the dailies (Shuffle, Dex, Fire Round) with done / playing /
 * new, the one you're on outlined in its color, and the Weekly on a plain line
 * under it (not on the Weekly's own page).
 */
export function DailiesBar({ current, onPick, afterPlayed }: {
  current: DailiesId;
  onPick?: (id: ActivityGame) => void;
  /** Only once today's game here is done (a shared result page keeps to one game until then). */
  afterPlayed?: boolean;
}) {
  const { shown, entries } = useDailies(current);
  if (afterPlayed && !(entries[current]?.state === "done" && entries[current]?.day === currentDay(current))) return null;
  const cells = shown.filter((id) => id !== "weekly");
  const vars: Record<string, string | number> = { "--dailies-n": cells.length };
  cells.forEach((id, i) => { vars[`--dailies-c${i + 1}`] = `var(--ink-${id})`; });
  return (
    <>
    <div className={`dailies-bar dailies-bar--${cells.length}`} style={vars as React.CSSProperties}>
      <SubNav
        variant="pills"
        className="dailies-bar__nav"
        items={cells.map((id) => ({
          label: DAILIES[id].tab,
          href: onPick ? "#" : DAILIES[id].href,
          active: id === current,
          badge: barStatus(id, entries[id], id === current),
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (onPick) e.preventDefault();
            if (id === current) { e.preventDefault(); return; }
            track(EVENTS.dailiesSwitched, { to: id, from: current, via: "bar" });
            const to = pickable(id);
            if (to) onPick?.(to);
          },
        }))}
      />
      {shown.includes("weekly") && current !== "weekly" && <DailiesWeekLine current={current} onPick={onPick} />}
    </div>
    {!onPick && <InvitedNote current={current} />}
    </>
  );
}

/** The Weekly's line under the bar: what's left of its week, or that you're locked in. */
function DailiesWeekLine({ current, onPick }: { current: DailiesId; onPick?: (id: ActivityGame) => void }) {
  const { entries } = useDailies(current);
  const { status, action } = weeklyLine(entries.weekly);
  const go = () => track(EVENTS.dailiesSwitched, { to: "weekly", from: current, via: "week-line" });
  const button = <Button variant="ghost" size="small" iconAfter={IconArrowRight} onClick={onPick ? () => { go(); onPick("weekly"); } : undefined}>{action}<span className="sr-only"> the Weekly Challenge</span></Button>;
  return (
    <p className="dailies-week dailies--weekly">
      <span className="dailies-week__text"><b>Weekly Challenge</b> · {status}</span>
      {onPick ? button : <Link href={DAILIES.weekly.href} onClick={go} className="dailies-week__go">{button}</Link>}
    </p>
  );
}

/** On an end screen: the next daily you haven't played, or that you've done them all. */
export function DailiesNext({ current, onPick }: { current: DailiesId; onPick?: (id: ActivityGame) => void }) {
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
  const label = next === "weekly" ? "Play this week" : next === "fire" ? "Play today's round" : "Play";
  return (
    <Card variant="outlined" padding="medium" className={`dailies-next dailies--${next}`}>
      <span className="dailies-next__tile" aria-hidden><Glyph size={24} stroke={2} /></span>
      <span className="dailies-next__eyebrow">Next up</span>
      <h2 className="dailies-next__title">{g.name}</h2>
      <p className="dailies-next__text">{g.pitch}{streak ? ` Your streak: ${streak}.` : ""}</p>
      {onPick
        ? <Button variant="secondary" onClick={() => { go(); const to = pickable(next); if (to) onPick(to); }}>{label}</Button>
        : <Link href={g.href} onClick={go} className="dailies-next__link"><Button variant="secondary">{label}</Button></Link>}
    </Card>
  );
}

/**
 * Next up as one button beside the share button (the Shuffle and the Dex,
 * Britton's pick 2026-10-19: the card took 250px on a phone). The today bar
 * above still shows every daily. When they're all done, a short line instead.
 */
export function DailiesNextButton({ current, onPick }: { current: DailiesId; onPick?: (id: ActivityGame) => void }) {
  const { shown, entries } = useDailies(current);
  const next = nextUp(entries, shown, current);
  if (!next) {
    if (shown.length < 2) return null;
    return <p className="party-muted dailies-next__done">That&apos;s every daily for today. New puzzles at midnight Pacific.</p>;
  }
  const g = DAILIES[next];
  const go = () => track(EVENTS.dailiesSwitched, { to: next, from: current, via: "next" });
  const label = next === "weekly" ? "Next: this week's Weekly" : next === "fire" ? "Next: today's Fire Round" : `Next: ${g.short}`;
  return onPick
    ? <Button variant="secondary" iconAfter={IconArrowRight} onClick={() => { go(); const to = pickable(next); if (to) onPick(to); }}>{label}</Button>
    : <Link href={g.href} onClick={go} className="dailies-next__link"><Button variant="secondary" iconAfter={IconArrowRight}>{label}</Button></Link>;
}

/** Today's guesses a daily saved in this browser (the day card judges them again on the server). */
function localGuesses(key: string, day: string): string[] | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null") as { day?: string; guesses?: string[] } | null;
    return s?.day === day && Array.isArray(s.guesses) && s.guesses.length ? s.guesses : undefined;
  } catch {
    return undefined;
  }
}
/** A shared text with its last line (the link) swapped for the card's link. */
export const withLink = (text: string, url: string) => [...text.split("\n").slice(0, -1), url].join("\n");

/** One game's share, from its own page: the card request, its text (ending in the link it's given) and the plain link. */
export interface ShareOne { request: ShareRequest; text: (url: string) => string; fallbackUrl: string }

/**
 * The share buttons on an end screen. On the site (Britton's picks, 2026-10-19): one Share
 * button with a picture of the result (src/components/share); once more than one daily is done
 * today, "Share today's results" (the day card) and "Share just this one". Inside the Discord
 * Activity, Discord's own share as before ("Share today's results" / "Share just this one").
 */
export function DailiesShare({ current, shareOne, oneText, one }: { current: DailiesId; shareOne: () => void; oneText: string; one?: ShareOne }) {
  const toast = useToast();
  const { activity } = useOriginalsHost();
  const { shown, entries, referral } = useDailies(current);
  // From a friend's shared result today: "Send yours to Nova".
  const challengeLabel = useChallengeShareLabel(current);
  const ids = sharedToday(entries, shown);
  const combined = ids.length >= 2 && ids.includes(current);
  const verb = activity?.share ? "Share" : "Copy";
  if (!activity && one) {
    if (!combined) return <span className="party-row"><ShareButton request={one.request} text={one.text} game={current} fallbackUrl={one.fallbackUrl} label={challengeLabel} /></span>;
    const day = currentDay("shuffle");
    const dayRequest: ShareRequest = {
      kind: "day",
      shuffle: current === "shuffle" ? one.request.shuffle : localGuesses("gs-daily-shuffle", day),
      dex: current === "dex" ? one.request.dex : localGuesses("gs-daily-dex", day),
    };
    const dailyLink = withReferral("https://www.gameshuffle.co/daily", referral?.code);
    return (
      <span className="party-row">
        <ShareButton request={dayRequest} text={(url) => withLink(combinedShareText(entries, shown), url)} game="day" fallbackUrl={dailyLink} label="Share today's results" title="My GameShuffle dailies" />
        <ShareButton request={one.request} text={one.text} game={current} fallbackUrl={one.fallbackUrl} label="Share just this one" variant="secondary" />
      </span>
    );
  }
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

/** The streak cards on an end screen; `only` = just this game's, as a strip (the Shuffle and the Dex). */
export function DailiesYours({ current, only = false }: { current: DailiesId; only?: boolean }) {
  const { shown, entries, signedIn } = useDailies(current);
  const { activity } = useOriginalsHost();
  if (only) return <DailiesCards entries={entries} shown={[current]} current={current} heading={null} strip />;
  return <DailiesCards entries={entries} shown={shown} current={current} signedIn={!!signedIn || !!activity} everyDaily />;
}

/**
 * On an end screen: your invite link and what it earns (signed in), or a nudge
 * to sign in for one. Not inside Discord.
 */
export function DailiesInvite({ current, nudge = true }: { current: DailiesId; /** Signed out: the "sign in for a link" line (the dailies fold it into their own sign-in line). */ nudge?: boolean }) {
  const toast = useToast();
  const { activity } = useOriginalsHost();
  const { referral, signedIn } = useDailies(current);
  if (activity || signedIn === null) return null;
  if (!referral?.code) {
    if (signedIn || !nudge) return null;
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
