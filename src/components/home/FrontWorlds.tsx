/**
 * The front page's worlds (front page picks 2026-11-07, all A): under each world's live cards in the chooser, four
 * rows of its main tools. Free tools sit in Play, the card store in Pokémon, Discord in Stream. Server-rendered and
 * passed to HappeningBand as `extra`, so the rows are plain links in the page's HTML.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  IconArrowsShuffle, IconBrandDiscord, IconBroadcast, IconBuildingStore, IconCalendarEvent, IconCards, IconChartLine,
  IconClockHour4, IconConfetti, IconDeviceTv, IconId, IconMessageCircle, IconPokeball, IconQuestionMark, IconRoute,
  IconSparkles, IconTools, IconTournament, type Icon,
} from "@tabler/icons-react";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { TCG_SHOP_URL } from "@/data/shop";
import { DAILY_DEX_PUBLIC, ROAD_PUBLIC } from "@/lib/games-visibility";
import type { PillarId } from "@/lib/nav/pillars";
import { gsDay } from "@/lib/time/gsClock";
import { EVENTS, tagged } from "@/lib/analytics/events";
import "@/styles/front.css";

interface Row { title: string; line: string; href: string; icon: Icon; tone: TileTone; external?: boolean }

function Rows({ world, rows }: { world: PillarId; rows: Row[] }) {
  return (
    <ul className="front-rows">
      {rows.slice(0, 4).map((r) => (
        <li key={r.href}>
          <IconTile icon={r.icon} tone={r.tone} />
          <span className="front-rows__text">
            {r.external
              ? <a href={r.href} target="_blank" rel="noopener noreferrer" className={`front-rows__title ${tagged(EVENTS.homeSectionClicked, { to: `front-${world}` })}`}>{r.title}</a>
              : <Link href={r.href} className={`front-rows__title ${tagged(EVENTS.homeSectionClicked, { to: `front-${world}` })}`}>{r.title}</Link>}
            <span>{r.line}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The chooser's worlds, Play first (front page picks 2026-11-07, 3A); the Welcome page uses the same (7A). */
export const FRONT_ORDER: PillarId[] = ["play", "pokemon", "compete", "host", "stream"];

/** The holiday party page while its season runs (Pacific days). */
function seasonalNow(): { label: string; href: string } | null {
  const md = gsDay().slice(5);
  return md >= "10-01" && md <= "10-31" ? { label: "Halloween party games", href: "/game-nights/halloween-party-games" }
    : md >= "11-15" && md <= "12-31" ? { label: "Christmas party games", href: "/game-nights/christmas-party-games" } : null;
}

export function frontWorldRows(): Partial<Record<PillarId, ReactNode>> {
  const seasonal = seasonalNow();
  const rows: Record<PillarId, Row[]> = {
    play: [
      { title: "Today's daily games", line: "Guess the character, the Pokémon, rapid trivia and a card duel. New ones at midnight.", href: "/daily", icon: IconCalendarEvent, tone: "violet" },
      { title: "Randomizers for 18 games", line: "Characters, karts, tracks and rules for Mario Kart, Mario Party, Smash and more.", href: "/randomizers", icon: IconArrowsShuffle, tone: "blue" },
      { title: "Party games on everyone's phones", line: "Odd One Out, Most Likely To, Tier Wars and trivia, with the TV.", href: "/game-nights/tools", icon: IconDeviceTv, tone: "magenta" },
      { title: "Free tools", line: "A wheel spinner, dice, a tier list maker, bingo cards and truth or dare.", href: "/tools", icon: IconTools, tone: "orange" },
    ],
    pokemon: [
      ...(DAILY_DEX_PUBLIC ? [{ title: "The Daily Dex", line: "Guess today's Pokémon from all 1,025.", href: "/daily-dex", icon: IconPokeball, tone: "orange" as const }] : []),
      ...(ROAD_PUBLIC ? [{ title: "Trainer Road", line: "Duel every Gym Leader and Champion with their own teams.", href: "/pokemon-trainers", icon: IconRoute, tone: "violet" as const }] : []),
      { title: "TCG Companion", line: "Damage, conditions and prizes for real cards at the table.", href: "/pokemon-tcg-companion", icon: IconCards, tone: "red" },
      { title: "Our card store", line: "Pokémon singles from our TCGplayer store.", href: TCG_SHOP_URL, icon: IconBuildingStore, tone: "teal", external: true },
    ],
    compete: [
      { title: "Time trials", line: "Every track's best times, on GameShuffle and in Discord.", href: "/time-trials", icon: IconClockHour4, tone: "blue" },
      { title: "Lounge stats", line: "Any lounge player's season, from MKCentral.", href: "/lounge", icon: IconChartLine, tone: "violet" },
      { title: "Your MMR card", line: "Your lounge MMR on stream, live after every event.", href: "/mmr-card", icon: IconId, tone: "orange" },
      { title: "Tournaments", line: "Brackets, Swiss and random rounds, guests welcome.", href: "/tournament", icon: IconTournament, tone: "teal" },
    ],
    host: [
      { title: "Game nights near you", line: "Public nights with RSVPs, or host your own.", href: "/game-nights", icon: IconCalendarEvent, tone: "teal" },
      { title: "Trivia nights", line: "Ready-made rounds; teams answer on their phones.", href: "/trivia", icon: IconQuestionMark, tone: "violet" },
      { title: "Plan a night", line: "A lineup from the games you own, for your group.", href: "/game-nights/tools/night-planner", icon: IconSparkles, tone: "orange" },
      seasonal
        ? { title: seasonal.label, line: "Free games for the party, ready to play.", href: seasonal.href, icon: IconConfetti, tone: "red" }
        : { title: "Run a tournament", line: "Any game, any format, with live scores.", href: "/tournament/create", icon: IconTournament, tone: "blue" },
    ],
    stream: [
      { title: "Games for your chat", line: "Rolls, polls, bingo and trivia on your overlay, with GS Pro.", href: "/for-streamers", icon: IconBroadcast, tone: "magenta" },
      { title: "Twitch chat games", line: "Games your chat can play, and how to start each one.", href: "/twitch-chat-games", icon: IconMessageCircle, tone: "violet" },
      { title: "GameShuffle for Discord", line: "The dailies, trivia and go-live alerts in your server.", href: "/discord", icon: IconBrandDiscord, tone: "blue" },
      { title: "Just starting out", line: "What to set up first for your first streams.", href: "/for-streamers/aspiring", icon: IconSparkles, tone: "teal" },
    ],
  };
  return Object.fromEntries((Object.keys(rows) as PillarId[]).map((id) => [id, <Rows key={id} world={id} rows={rows[id]} />]));
}
