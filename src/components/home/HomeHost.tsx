/**
 * Homepage: Run the night (Britton's picks, 2026-10-16). Tournaments (with
 * the Circuit line), trivia nights and game nights: where groups come back
 * every week. Signed in, their next event leads (src/lib/home/viewer.ts).
 */

import Link from "next/link";
import { Button, Card } from "@empac/cascadeds";
import { IconCalendarEvent, IconHelpHexagon, IconTournament } from "@tabler/icons-react";
import { EVENTS, tagged } from "@/lib/analytics/events";
import type { NextEvent } from "@/lib/home/viewer";

const CARDS = [
  {
    key: "tournaments", href: "/tournament", Icon: IconTournament, tone: "home-host__icon--blue",
    title: "Tournaments",
    text: "Brackets, Swiss, points or heats, for any game. Free for one full lobby; GS Circuit adds bigger fields and seasons.",
    cta: "Start a tournament", ctaHref: "/tournament/create",
  },
  {
    key: "trivia", href: "/trivia", Icon: IconHelpHexagon, tone: "home-host__icon--violet",
    title: "Trivia nights",
    text: "Office, party, bar or fundraiser, played on phones with the questions on the TV. Leagues for the regulars.",
    cta: "Host a trivia night", ctaHref: "/trivia",
  },
  {
    key: "game-nights", href: "/game-nights", Icon: IconCalendarEvent, tone: "home-host__icon--green",
    title: "Game nights",
    text: "Find a board game or console night near you, or host your own and fill the seats.",
    cta: "Find a night", ctaHref: "/game-nights",
  },
] as const;

export function HomeHost({ next }: { next: NextEvent | null }) {
  return (
    <section className="home-section" aria-labelledby="home-host-title">
      <div className="home-section__head">
        <h2 id="home-host-title" className="home-section__title">Run the night</h2>
        <p className="home-section__aside">Free to host</p>
      </div>
      {next && (
        <Link href={next.href} className="home-next">
          <span className="home-next__label">Your next {next.kind === "tournament" ? "tournament" : "game night"}</span>
          <strong className="home-next__title">{next.title}</strong>
          <span className="home-next__meta">{next.when} · {next.role}</span>
          <span className="home-next__go" aria-hidden>Open →</span>
        </Link>
      )}
      <div className="home-host">
        {CARDS.map((c) => (
          <Card key={c.key} variant="outlined" padding="medium" className="home-host__card">
            <span className={`home-host__icon ${c.tone}`} aria-hidden><c.Icon size={24} stroke={1.75} /></span>
            <h3 className="home-host__title"><Link href={c.href}>{c.title}</Link></h3>
            <p className="home-host__text">{c.text}</p>
            <Link href={c.ctaHref} className={tagged(EVENTS.homeSectionClicked, { to: c.key })}><Button variant="secondary">{c.cta}</Button></Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
