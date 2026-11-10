/**
 * "Your room", the signed-in homepage, in five blocks (Home and dailies picks 2026-11-09, all as recommended): Today
 * (your dailies and the Weekly), For you (up to three lines: something live or today, what changed since your last
 * visit, your road, your people), Play next (two picks), Your games, and One thing to try (a single nudge). Home stays
 * about two phone screens whatever you play: a new game or feature never adds a block; it shows up in For you, Play
 * next, Your games or Games. The header wears your banner, picture and colors (the brand navy when you have none).
 * The data comes from src/lib/home/forYou.ts; src/lib/home/forYouLines.ts picks the lines and the nudge.
 */

import Link from "next/link";
import { type CSSProperties } from "react";
import { Container } from "@empac/cascadeds";
import {
  IconBroadcast, IconCalendarEvent, IconCards, IconChartBar, IconChevronRight, IconClock, IconConfetti, IconDeviceGamepad2,
  IconDeviceTv, IconFlame, IconMessage2, IconPlus, IconRoute, IconUserPlus, IconUsers, IconUsersGroup, type Icon,
} from "@tabler/icons-react";
import { UserAvatar } from "@/components/UserAvatar";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { PlayNext, TodayLive, TodayLiveProvider } from "./TodayCarousel";
import { TodayChoose } from "./TodayChoose";
import type { DailyPicksSeed } from "@/components/originals/DailyPicks";
import { HomeVisit, PlanRow, ShowingLine, StatusBubble } from "./HomeForYou";
import { gsDay } from "@/lib/time/gsClock";
import type { Room, RoomHead } from "@/lib/home/forYou";
import { forYouLines, oneThing, type ForYouIcon, type ForYouLine, type OneThing } from "@/lib/home/forYouLines";
import type { GameCard } from "@/lib/home/yourGames";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { EVENTS, tagged } from "@/lib/analytics/events";
import "@/styles/home-room.css";
import "@/styles/home-today.css";
import "@/styles/duel-art.css";

/** The header: your picture, name and status, and what you follow. The worlds band and its carousel left Home with
 * the five blocks (Play next does that job now). */
export function RoomHeader({ head, showing, interests }: { head: RoomHead; showing: Room["showing"]; interests: Room["interests"] }) {
  return (
    <header className={`room-head room-head--short${head.banner ? " room-head--banner" : ""}`} style={head.theme}>
      {head.banner && (
        // eslint-disable-next-line @next/next/no-img-element -- the account's own banner from our storage (R2), already cropped
        <img className="room-head__banner" src={head.banner} alt="" />
      )}
      <Container>
        <div className="room-head__inner">
          <div className="room-head__who">
            <UserAvatar user={head.avatar} size={84} className="room-head__avatar" />
            <div className="room-head__text">
              <h1>Welcome back, {head.name}</h1>
              <StatusBubble status={head.status ?? null} />
              <div className="room-head__showing"><ShowingLine showing={showing} interests={interests} /></div>
            </div>
          </div>
        </div>
      </Container>
    </header>
  );
}

const LINE_ICON: Record<ForYouIcon, Icon> = {
  event: IconCalendarEvent, live: IconBroadcast, clock: IconClock, streak: IconFlame, mmr: IconChartBar, road: IconRoute,
  post: IconMessage2, people: IconUsers, tonight: IconConfetti,
};

/** For you: up to three lines, the most pressing first; Inbox holds the rest. */
function ForYouBlock({ lines }: { lines: ForYouLine[] }) {
  return (
    <section className="room-block" aria-labelledby="room-foryou-title">
      <div className="room-block__head">
        <h2 id="room-foryou-title">For you</h2>
        <ArrowLink href="/comms" className="room-tile__more">See all</ArrowLink>
      </div>
      <ul className="room-lines">
        {lines.map((l) => (
          <li key={l.id}>
            <Link href={l.href} className="room-line">
              <IconTile icon={LINE_ICON[l.icon]} tone={l.tone} />
              <span className="room-line__text">
                <b>{l.title}</b>
                {l.line && <span>{l.line}</span>}
              </span>
              <IconChevronRight size={18} className="room-line__go" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const NUDGE_ICON: Record<OneThing["icon"], Icon> = { people: IconUserPlus, games: IconDeviceGamepad2, cards: IconCards, crew: IconUsersGroup, mmr: IconChartBar, stream: IconDeviceTv };

/** One thing to try: a single nudge, never a list. */
function OneThingRow({ thing }: { thing: OneThing }) {
  return (
    <section className="room-block room-block--one" aria-label="One thing to try">
      <Link href={thing.href} className="room-line room-line--one">
        <IconTile icon={NUDGE_ICON[thing.icon]} tone="orange" />
        <span className="room-line__text">
          <span className="room-line__kick">One thing to try</span>
          <b>{thing.title}</b>
          <span>{thing.line}</span>
        </span>
        <IconChevronRight size={18} className="room-line__go" aria-hidden="true" />
      </Link>
    </section>
  );
}

/**
 * Your games (journeys picks 2026-11-06, 7A): a card per game space you've joined. Box art, the space's pick of the
 * day, one line of what's new; the card opens the space. The last card adds a game.
 */
function YourGames({ games }: { games: GameCard[] }) {
  return (
    <section className="room-games" aria-labelledby="room-games-title">
      <div className="room-games__head">
        <h2 id="room-games-title">Your games</h2>
        <ArrowLink href="/games" className="room-tile__more">All game spaces</ArrowLink>
      </div>
      <ResponsiveCarousel className="room-games__row" label="Your games">
        {[
          ...games.map((g) => (
            <Link key={g.id} href={g.href} className={`room-game ${tagged(EVENTS.homeGameClicked, { to: g.id })}`} style={{ "--acc": g.accent } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element -- our box art */}
              {g.box ? <img className="room-game__box" src={g.box} alt="" /> : <span className="room-game__box" aria-hidden="true" />}
              <span className="room-game__text">
                <b className="room-game__name">{g.name}</b>
                {g.pick && <span className="room-game__pick">{g.pick.label}: <b>{g.pick.name}</b></span>}
                {g.news && <span className={`room-game__news${g.news.fresh ? " is-fresh" : ""}`}>{g.news.fresh && <i aria-hidden="true" />}{g.news.text}</span>}
              </span>
            </Link>
          )),
          <Link key="add" href="/games" className="room-game room-game--add">
            <IconPlus size={26} stroke={1.8} aria-hidden="true" />
            <span>Add a game</span>
          </Link>,
        ]}
      </ResponsiveCarousel>
    </section>
  );
}

/** The five blocks, then the one plan line (GS Pro, GS Circuit or Support). `picks`: your dailies (Today shows only
 * those; dailyPicksState on the page). */
export function RoomBody({ room, picks }: { room: Room; picks: DailyPicksSeed }) {
  const t = room.today;
  const mine = new Set(picks.picks ?? []);
  const games = mine.size ? t.games.filter((g) => mine.has(g.id)) : t.games;
  const allDone = games.length > 0 && games.every((g) => g.done);
  const lines = forYouLines(room);
  const nudge = oneThing(room);
  return (
    <div className="room room--five" data-rise={room.rise ? "" : undefined}>
      <HomeVisit value={room.visit} />
      <TodayLiveProvider initial={t.live} day={gsDay()}>
        <section className={`room-block room-block--today${allDone ? " room-zone--done" : ""}`} aria-labelledby={allDone ? undefined : "room-today-title"} aria-label={allDone ? "Today" : undefined}>
          {!allDone && (
            <div className="room-block__head">
              <h2 id="room-today-title">Today</h2>
              <TodayChoose seed={picks} />
            </div>
          )}
          <TodayLive games={games} weekly={t.weekly} streak={t.streak} streakFrom={t.streakFrom} picks={[]} resetAt={t.resetAt} />
        </section>
      </TodayLiveProvider>
      {lines.length > 0 && <ForYouBlock lines={lines} />}
      <PlayNext picks={t.picks} />
      {room.games.length > 0 && <YourGames games={room.games} />}
      {nudge && <OneThingRow thing={nudge} />}
      {room.plan && <PlanRow plan={room.plan} />}
    </div>
  );
}
