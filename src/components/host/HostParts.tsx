/**
 * The Host pages' pieces (journeys picks 2026-11-06, 5A to 8A): the header (title and tabs, no create buttons: Start
 * something sits at the foot of Home), an event row with its kind, what needs you, a league or season with its top
 * three, and Start something. Server components; they share the Studio's hub classes so both homes read alike.
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBulb, IconCalendarEvent, IconListNumbers, IconTrophy, IconAlertTriangle, type Icon } from "@tabler/icons-react";
import { GameCover } from "@/components/games/GameCover";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { ARROW_HOST_CLASS, ArrowCue } from "@/components/ui/ArrowLink";
import { getGameName } from "@/data/game-registry";
import { formatEventShort } from "@/lib/time/format";
import type { HostEvent, HostKind, HostSeason, NeedsYou } from "@/lib/host/home";
import { HostNav } from "./HostNav";

export const KIND: Record<HostKind, { label: string; icon: Icon; tone: TileTone }> = {
  tournament: { label: "Tournament", icon: IconTrophy, tone: "orange" },
  night: { label: "Game night", icon: IconCalendarEvent, tone: "teal" },
  trivia: { label: "Trivia", icon: IconBulb, tone: "violet" },
};

export function HostHeader({ sub }: { sub?: string }) {
  return (
    <header className="studio-head">
      <div className="studio-head__top">
        <div className="studio-head__title">
          <h1>Host</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <HostNav />
    </header>
  );
}

function Cover({ game, cover, kind }: { game: string | null; cover: string | null; kind: HostKind | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- the organizer's own cover, or a game's box art
  if (cover) return <img className="host-cover" src={cover} alt="" />;
  if (game) return <GameCover slug={game} name={getGameName(game)} />;
  const k = kind ? KIND[kind] : null;
  return k ? <IconTile icon={k.icon} tone={k.tone} /> : null;
}

export function HostEventRow({ e, tz, action = "Manage" }: { e: HostEvent; tz: string | null; action?: string }) {
  // A draft whose date has gone by isn't coming up on that date: it says so, and Continue picks a new one (2026-11-08).
  const when = e.datePassed ? "Date passed" : e.at ? formatEventShort(e.at, tz) : e.stage === "draft" ? "No date yet" : "";
  return (
    <li className="hub-rows__row">
      <span className="hub-rows__cover host-rows__cover"><Cover game={e.game} cover={e.cover} kind={e.kind} /></span>
      <div className="hub-rows__main">
        <Link href={e.href} className="hub-rows__name">{e.title}</Link>
        <span className="hub-rows__meta">
          <span className="hub-rows__tag">{KIND[e.kind].label}</span>
          {e.stage === "draft" && <span className="hub-rows__tag">Draft</span>}
          {when && <span>{when}</span>}
          {e.line && <span>{e.line}</span>}
        </span>
      </div>
      <Link href={e.href}><Button variant="secondary" size="small">{action}</Button></Link>
    </li>
  );
}

/** What needs you, the first few; the rest wait on the Events tab, grouped by what's wrong. */
const NEEDS_SHOWN = 5;

export function NeedsYouList({ needs }: { needs: NeedsYou[] }) {
  const more = needs.length - NEEDS_SHOWN;
  return (
    <section className="hub-panel host-needs" aria-labelledby="host-needs">
      <div className="hub-panel__head">
        <h2 id="host-needs" className="hub-panel__title"><IconAlertTriangle size={20} stroke={2} aria-hidden="true" className="host-needs__icon" />Needs you <span className="hub-page__group-count">{needs.length}</span></h2>
      </div>
      <ul className="hub-rows">
        {needs.slice(0, NEEDS_SHOWN).map((n) => (
          <li key={n.key} className="hub-rows__row">
            <span className="hub-rows__cover host-rows__cover"><Cover game={n.game} cover={n.cover} kind={n.kind} /></span>
            <div className="hub-rows__main">
              <span className="hub-rows__name">{n.title}</span>
              <span className="host-needs__line">{n.line}</span>
            </div>
            <Link href={n.action.href}><Button variant="secondary" size="small">{n.action.label}</Button></Link>
          </li>
        ))}
      </ul>
      {more > 0 && <Link className="hub-panel__link" href="/host/events">{more} more on the Events tab</Link>}
    </section>
  );
}

export function RunningCard({ e, tz }: { e: HostEvent; tz: string | null }) {
  return (
    <section className="hub-live" aria-label={`Running now: ${e.title}`}>
      <span className="hub-live__cover host-live__cover"><Cover game={e.game} cover={e.cover} kind={e.kind} /></span>
      <div className="hub-live__main">
        <div className="hub-live__badges">
          <span className="hub-live__pill">Running now</span>
          <span className="hub-live__tag">{KIND[e.kind].label}</span>
        </div>
        <h2 className="hub-live__name">{e.title}</h2>
        <p className="hub-live__meta">{[e.at ? formatEventShort(e.at, tz) : null, e.line].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="hub-live__actions">
        <Link href={e.href}><Button variant="primary">{e.kind === "trivia" ? "Open the console" : "Run it"}</Button></Link>
      </div>
    </section>
  );
}

export function SeasonCard({ s }: { s: HostSeason }) {
  return (
    <Link href={s.href} className={`host-season ${ARROW_HOST_CLASS}`}>
      <span className="host-season__head">
        <IconTile icon={s.key.startsWith("l-") ? IconBulb : IconListNumbers} tone={s.key.startsWith("l-") ? "violet" : "orange"} />
        <span className="host-season__words"><b>{s.title}</b><small>{s.line}</small></span>
      </span>
      {s.top.length > 0 ? (
        <ol className="host-season__top" aria-label="Top three">
          {s.top.map((t, i) => <li key={`${t.name}-${i}`}><span>{t.name}</span><b>{t.points} pts</b></li>)}
        </ol>
      ) : (
        <span className="host-season__none">{s.key.startsWith("l-") ? "No nights played yet." : "Standings show on the season page."}</span>
      )}
      <ArrowCue>Manage</ArrowCue>
    </Link>
  );
}

const START: { key: string; label: string; line: string; href: string; icon: Icon; tone: TileTone }[] = [
  { key: "tournament", label: "A tournament", line: "Brackets, Swiss or points, for any game.", href: "/tournament/create", icon: IconTrophy, tone: "orange" },
  { key: "night", label: "A game night", line: "At home or online, with RSVPs and reminders.", href: "/game-nights/create", icon: IconCalendarEvent, tone: "teal" },
  { key: "trivia", label: "A trivia night", line: "Teams answer on their phones, the TV shows the rest.", href: "/trivia", icon: IconBulb, tone: "violet" },
  { key: "league", label: "A trivia league", line: "Weekly nights with standings across a season.", href: "/trivia/leagues/new", icon: IconListNumbers, tone: "blue" },
];

export function StartSomething() {
  return (
    <section className="host-start" aria-labelledby="host-start">
      <h2 id="host-start" className="hub-panel__title">Start something</h2>
      <ul className="host-start__grid">
        {START.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={`host-start__card ${ARROW_HOST_CLASS}`}>
              <IconTile icon={s.icon} tone={s.tone} />
              <span className="host-start__words"><b>{s.label}</b><small>{s.line}</small></span>
              <ArrowCue>Start</ArrowCue>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
