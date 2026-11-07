"use client";

/**
 * The signed-in homepage's client pieces (personalization picks 2026-11-05; the room itself is HomeRoom.tsx). In the
 * header: whose view it is ("Showing: … · Change", the interest tiles in a window), the five worlds and "Pick up" (the
 * last three places, from this browser). Below the tiles: "You might like" (three with pictures, each dismissible,
 * remembered in this browser) and one plan line. HomeVisit writes the visit cookie the next load reads.
 */

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@empac/cascadeds";
import { UserAvatar, type UserAvatarUser } from "@/components/UserAvatar";
import { useToast } from "@/components/toast/ToastProvider";
import {
  IconBroadcast, IconCards, IconClock, IconCoffee, IconCopy, IconShare, IconDice5, IconFlag, IconFlame, IconHeart, IconMessageCircle, IconPokeball,
  IconQuestionMark, IconSitemap, IconSofa, IconSparkles, IconTrophy, IconX, type Icon,
} from "@tabler/icons-react";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { GameCover } from "@/components/games/GameCover";
import { VISIT_COOKIE, setHomeCookie } from "@/lib/home/visit";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { InterestSettings } from "@/components/interests/InterestPicker";
import { useRecentPlaces } from "@/components/layout/RecentPlaces";
import { PILLARS, type PillarId } from "@/lib/nav/pillars";
import type { PlanLine, Suggestion, SuggestionArt } from "@/lib/home/forYou";
import type { Interest } from "@/lib/interests/rules";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/home-you.css";

const WORLD: Record<PillarId, { icon: Icon; tone: TileTone }> = {
  play: { icon: IconDice5, tone: "violet" }, pokemon: { icon: IconPokeball, tone: "red" }, compete: { icon: IconFlag, tone: "blue" },
  host: { icon: IconSofa, tone: "magenta" }, stream: { icon: IconBroadcast, tone: "teal" },
};

// ─── in the greeting band ────────────────────────────────────────────────────

/**
 * One link under your name (home cleanup picks 2026-11-07, 1A): "Change what you see" opens the interest tiles in a
 * window (what you follow is there); the page follows once it closes.
 */
export function ShowingLine({ showing, interests }: { showing: string | null; interests: Interest[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const close = () => { setOpen(false); router.refresh(); };
  return (
    <span className="home-you__showing">
      <Button variant="ghost" size="small" className="home-you__change" onClick={() => setOpen(true)}>{showing ? "Change what you see" : "Pick what you're here for"}</Button>
      <Modal isOpen={open} onClose={close} title="What you're here for" size="large" primaryAction={{ label: "Done", onClick: close }}>
        <p className="home-you__modal-note">Pick any. Your home, your menus and your account follow it.</p>
        <InterestSettings initial={interests} />
      </Modal>
    </span>
  );
}

/** The five worlds (unless the band shows them as its tabs), then the last three places from this browser. */
export function WorldsAndPickUp({ worlds = true }: { worlds?: boolean }) {
  const places = useRecentPlaces(3);
  return (
    <div className="home-you__nav">
      {worlds && <nav className="home-you__worlds" aria-label="The five worlds">
        {PILLARS.map((p) => {
          const look = WORLD[p.id];
          const Glyph = look.icon;
          return (
            <Link key={p.id} href={p.href} className={`home-you__world home-you__world--${look.tone}`}>
              <Glyph size={18} stroke={2} aria-hidden="true" />{p.label}
            </Link>
          );
        })}
      </nav>}
      {places.length > 0 && (
        <p className="home-you__pickup">
          <span>Pick up:</span>
          {places.map((pl) => <Link key={pl.path} href={pl.path}>{pl.title}</Link>)}
        </p>
      )}
    </div>
  );
}

// ─── you might like, and the plan line ───────────────────────────────────────

/** Writes the visit cookie (src/lib/home/visit.ts) once the page is up. */
export function HomeVisit({ value }: { value: string }) {
  useEffect(() => { setHomeCookie(VISIT_COOKIE, value); }, [value]);
  return null;
}

const ART_ICON: Record<Extract<SuggestionArt, { kind: "icon" }>["icon"], Icon> = {
  pokeball: IconPokeball, flame: IconFlame, trophy: IconTrophy, clock: IconClock, card: IconCards, question: IconQuestionMark,
  dice: IconDice5, chat: IconMessageCircle, coffee: IconCoffee, cards: IconCards, bracket: IconSitemap,
};

function LikeArt({ art }: { art: SuggestionArt }) {
  if (art.kind === "img") {
    // eslint-disable-next-line @next/next/no-img-element -- our own pictures (public/images)
    return <img className={`home-like__img${art.light ? " home-like__img--light" : ""}`} src={art.src} alt="" loading="lazy" style={art.focus ? { objectPosition: art.focus } : undefined} />;
  }
  if (art.kind === "cover") return <span className="home-like__box"><GameCover slug={art.slug} name={art.name} /></span>;
  return <span className={`home-like__glyph home-like__glyph--${art.tone}`}><IconTile icon={ART_ICON[art.icon]} tone={art.tone as TileTone} /></span>;
}

const DISMISS_KEY = "gs-home-dismissed";
const noop = () => () => {};
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) ?? "[]"; } catch { return "[]"; } };

/** "You might like": the room's last cell (no box of its own; each suggestion is a card). */
export function MightLike({ items, span, i }: { items: Suggestion[]; span: number; i: number }) {
  const stored = useSyncExternalStore(noop, readDismissed, () => "[]");
  const [extra, setExtra] = useState<string[]>([]);
  const dismissed = new Set<string>([...(JSON.parse(stored) as string[]), ...extra]);
  const shown = items.filter((s) => !dismissed.has(s.id)).slice(0, 3);
  if (!shown.length) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-60))); } catch { /* private mode */ }
    setExtra((e) => [...e, id]);
  };
  return (
    <section className="home-you__like room-like" aria-labelledby="home-you-like" data-span={span} style={{ "--span": span, "--i": i } as React.CSSProperties}>
      <h2 id="home-you-like">You might like</h2>
      <ul>
        {shown.map((s) => (
          <li key={s.id}>
            <Link href={s.href} onClick={() => track(EVENTS.homeSectionClicked, { to: `like-${s.id}` })}>
              <LikeArt art={s.art} />
              <span className="home-like__text"><strong>{s.title}</strong><span>{s.line}</span></span>
            </Link>
            <button type="button" className="home-you__dismiss" onClick={() => dismiss(s.id)} aria-label={`Not interested in ${s.title}`}>
              <IconX size={16} stroke={2} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bring your crew (bring-along 4A): your invite link, Copy and Share, and who's joined from it. */
export function InviteLink({ link, joined, bare = false }: {
  link: string; joined: { name: string; username: string | null; avatar: UserAvatarUser }[];
  /** Inside a block that already says "Bring your crew" (the room's rail): no label of its own. */
  bare?: boolean;
}) {
  const toast = useToast();
  const copy = () => navigator.clipboard.writeText(link).then(
    () => { track(EVENTS.referralLinkCopied, { from: "home" }); toast.success("Invite link copied"); },
    () => toast.error("Couldn't copy the link"),
  );
  const share = async () => {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: "GameShuffle", text: "Play today's dailies with me on GameShuffle", url: link }); track(EVENTS.referralLinkCopied, { from: "home-share" }); return; } catch { /* closed */ }
    }
    void copy();
  };
  const names = joined.map((j) => j.name);
  const said = names.length === 0 ? "Nobody's joined from your link yet." : names.length === 1 ? `${names[0]} joined from your link.` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} joined from your link.`;
  return (
    <div className="room-invite">
      {!bare && <span className="room-kicker">Bring your crew</span>}
      <div className="room-invite__row">
        <code className="room-invite__link">{link.replace(/^https:\/\/www\./, "")}</code>
        <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => void copy()}>Copy</Button>
        <Button variant="primary" size="small" iconBefore={IconShare} onClick={() => void share()}>Share</Button>
      </div>
      <p className="room-invite__joined">
        {joined.length > 0 && (
          <span className="room-invite__faces" aria-hidden="true">{joined.slice(0, 4).map((j) => <UserAvatar key={j.avatar.id} user={j.avatar} size={28} />)}</span>
        )}
        <span>{said} You get tokens when a friend signs up.</span>
      </p>
    </div>
  );
}

/** The Support line shows at most once a week (motion + balance 12A); kept in this browser. */
const SUPPORT_KEY = "gs-home-support";
const supportDue = () => { try { return Date.now() - Number(localStorage.getItem(SUPPORT_KEY) ?? 0) > 7 * 86_400_000; } catch { return true; } };

export function PlanRow({ plan }: { plan: PlanLine }) {
  // Server render and first paint: no Support line (it's decided in the browser, once a week).
  const due = useSyncExternalStore(noop, supportDue, () => false);
  const weekly = plan.kind === "support";
  // Decided once for this page view: noting it as shown doesn't hide it while you're here.
  const [shown] = useState(() => due);
  const show = !weekly || due || shown;
  // Noted as shown once you leave the page, so it stays put while you're here.
  useEffect(() => {
    if (!weekly || !show) return;
    const note = () => { try { localStorage.setItem(SUPPORT_KEY, String(Date.now())); } catch { /* private mode */ } };
    window.addEventListener("pagehide", note);
    return () => { window.removeEventListener("pagehide", note); note(); };
  }, [weekly, show]);
  if (!show) return null;
  const label = plan.kind === "pro" ? "GS Pro" : plan.kind === "circuit" ? "GS Circuit" : "Support";
  return (
    <p className={`home-you__plan home-you__plan--${plan.kind}`}>
      {plan.kind === "support" ? <IconHeart size={18} stroke={2} aria-hidden="true" /> : <IconSparkles size={18} stroke={2} aria-hidden="true" />}
      <span><strong>{label}:</strong> {plan.text}</span>
      <ArrowLink href={plan.href}>{plan.cta}</ArrowLink>
    </p>
  );
}
