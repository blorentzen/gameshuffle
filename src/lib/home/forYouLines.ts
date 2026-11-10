/**
 * Home in five blocks (picks 2026-11-09, all as recommended): Today, For you, Play next, Your games, One thing to try.
 * Home stays about two phone screens whatever you play, so the tiles that each took a block (your next event, your
 * stream, your road, your MMR, your people, "since you were here") become candidate lines, and For you shows the three
 * that matter most right now: something live or today first, then what changed since your last visit, then the rest.
 * One thing to try is a single slot for the nudges (get set up, bring your crew, make your MMR card, set up your
 * stream), first unfinished first. Client-safe and pure.
 */

import type { Room, Tile } from "./forYou";

export type ForYouIcon = "event" | "live" | "clock" | "streak" | "mmr" | "road" | "post" | "people" | "tonight";
export type ForYouTone = "blue" | "violet" | "teal" | "orange" | "red" | "magenta";

export interface ForYouLine {
  id: string;
  icon: ForYouIcon;
  tone: ForYouTone;
  title: string;
  line: string | null;
  href: string;
  /** Lower comes first: 1 live or today, 2 since your last visit, 3 your road and people, 4 later this week. */
  rank: number;
}

export interface OneThing { id: string; title: string; line: string; href: string; icon: "people" | "games" | "cards" | "crew" | "mmr" | "stream" }

/** At most this many lines; the rest are one tap away in Inbox. */
export const FOR_YOU_MAX = 3;

const tileOf = <K extends Tile["kind"]>(room: Room, kind: K) => room.tiles.find((t): t is Extract<Tile, { kind: K }> => t.kind === kind) ?? null;

export function forYouLines(room: Room): ForYouLine[] {
  const out: ForYouLine[] = [];

  const stream = tileOf(room, "stream");
  if (stream && !stream.sample && stream.status === "live") out.push({ id: "stream", icon: "live", tone: "red", title: "You're live", line: stream.gameName ? `${stream.title} · ${stream.gameName}` : stream.title, href: stream.href, rank: 1 });
  else if (stream && !stream.sample && stream.status === "next" && stream.when) out.push({ id: "stream", icon: "live", tone: "violet", title: "Your next stream", line: `${stream.when}${stream.gameName ? ` · ${stream.gameName}` : ""}`, href: stream.href, rank: 4 });

  const tickets = [...(tileOf(room, "ticket")?.sample ? [] : [tileOf(room, "ticket")?.ticket]), ...((tileOf(room, "events")?.sample ? [] : tileOf(room, "events")?.tickets) ?? [])]
    .filter((t): t is NonNullable<typeof t> => !!t);
  const seen = new Set<string>();
  for (const t of tickets) {
    if (seen.has(t.href)) continue;
    seen.add(t.href);
    const soon = t.running || /^(Today|Happening now|Tonight)/i.test(t.when);
    out.push({ id: `event:${t.href}`, icon: "event", tone: "violet", title: t.title, line: `${t.when} · ${t.role}`, href: t.href, rank: soon ? 1 : 4 });
  }

  if (room.since && !room.since.sample) {
    const icon: ForYouIcon = room.since.icon === "times" ? "clock" : room.since.icon === "streak" ? "streak" : room.since.icon === "mmr" ? "mmr" : room.since.icon === "road" ? "road" : "event";
    out.push({ id: "since", icon, tone: "blue", title: room.since.title, line: room.since.line, href: room.since.href, rank: 2 });
  }

  const road = tileOf(room, "road");
  if (road?.encounter) out.push({ id: "road", icon: "road", tone: "red", title: `${road.encounter.villain} is blocking your road`, line: road.encounter.regionName, href: road.encounter.href, rank: 3 });
  else if (road?.next) out.push({ id: "road", icon: "road", tone: "red", title: `Next on your road: ${road.next.name}`, line: road.next.label, href: road.next.href, rank: 3 });

  const post = room.posts[0];
  if (post) out.push({ id: `post:${post.id}`, icon: "post", tone: "teal", title: `${post.author.name} posted${post.game ? ` in ${post.game.name}` : ""}`, line: post.text || null, href: post.href, rank: 3 });

  const playing = room.people && !room.people.sample ? room.people.data.people.find((p) => p.online && p.status) : null;
  if (playing) out.push({ id: `people:${playing.id}`, icon: "people", tone: "magenta", title: playing.name, line: playing.status, href: playing.action.href, rank: 3 });

  const compete = tileOf(room, "compete");
  if (compete && !compete.sample && compete.lounge?.mmr != null) out.push({ id: "mmr", icon: "mmr", tone: "blue", title: `${compete.lounge.name}: ${compete.lounge.mmr.toLocaleString("en-US")} MMR`, line: compete.lounge.worldRank ? `#${compete.lounge.worldRank.toLocaleString("en-US")} in the world` : null, href: compete.lounge.href, rank: 4 });

  const tonight = tileOf(room, "tonight")?.picks[0];
  if (tonight) out.push({ id: `tonight:${tonight.href}`, icon: "tonight", tone: "orange", title: tonight.title, line: tonight.line, href: tonight.href, rank: 4 });

  return out.sort((a, b) => a.rank - b.rank).slice(0, FOR_YOU_MAX);
}

/** The one nudge Home shows, first unfinished first; null once there's nothing left to suggest. */
export function oneThing(room: Room): OneThing | null {
  if (room.setup.includes("games")) return { id: "games", title: "Pick your games", line: "They sit on Home, one tap to play.", href: "/account?tab=games", icon: "games" };
  if (room.setup.includes("people")) return { id: "people", title: "Follow a few players", line: "See what they're up to and join in.", href: "/players", icon: "people" };
  const stream = tileOf(room, "stream");
  if (stream?.setup?.next && !stream.sample) return { id: "stream", title: "Finish setting up your stream", line: `${stream.setup.done} of ${stream.setup.total} done · next: ${stream.setup.next.label}`, href: stream.setup.next.href, icon: "stream" };
  const compete = tileOf(room, "compete");
  if (compete && !compete.sample && !compete.card) return { id: "mmr", title: "Make your MMR card", line: "Your lounge MMR on stream and on your profile.", href: "/mmr-card", icon: "mmr" };
  if (room.setup.includes("cards")) return { id: "cards", title: "Add your Pokémon cards", line: "Your collection and deck lists in one place.", href: "/account/pokemon?tab=my-cards", icon: "cards" };
  const invite = room.people?.data.invite;
  if (invite && invite.joined.length === 0) return { id: "crew", title: "Bring your crew", line: "Share your link: you both get tokens when they join.", href: "/settings/invite", icon: "crew" };
  return null;
}
