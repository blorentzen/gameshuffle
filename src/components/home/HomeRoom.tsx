/**
 * "Your room": the signed-in homepage's top (home look picks 2026-11-05, https://claude.ai/artifact/8QB79Y4WaNih8MRX2XEeB7,
 * all A). The header wears your banner, picture and colors (the brand navy when you have none); one "Since you were
 * here" line; then live tiles from src/lib/home/forYou.ts in a 12-column grid (phones stack them in the same order):
 * the lead interest's tile beside Today, then three to a row. Tiles rise in on the first visit of the day and your
 * numbers roll from your last visit (both drawn on the server from the `gs-home` cookie, so nothing flashes); all of
 * it is still for reduced motion.
 */

import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { Badge, Container } from "@empac/cascadeds";
import {
  IconCalendarEvent, IconChartBar, IconClock, IconConfetti, IconDeviceTv, IconFlame,
  IconEye, IconHeartFilled, IconMessageCircle, IconPlus, IconQuestionMark, IconRoute, IconSparkles, IconStarFilled, IconThumbUp, IconTournament, IconUsersGroup, type Icon,
} from "@tabler/icons-react";
import { UserAvatar } from "@/components/UserAvatar";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { GameCover } from "@/components/games/GameCover";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { MmrCard } from "@/components/mmr/MmrCard";
import { MmrSince } from "@/components/mmr/MmrLive";
import { RollNum } from "./RollNum";
import { TodayBoard, TodayLive, TodayLiveProvider } from "./TodayCarousel";
import { QuickStartButtons } from "./QuickStart";
import { StickyRail } from "./StickyRail";
import { PeopleList } from "@/components/people/PersonRow";
import { PostLines } from "@/components/social/PostLines";
import { HappeningBand } from "./HappeningBand";
import { ProfileEye } from "./ProfileEye";
import type { ProfileSectionKey } from "@/lib/profile/layout";
import { HomeVisit, InviteLink, MightLike, PlanRow, ShowingLine, WorldsAndPickUp } from "./HomeForYou";
import { gsDay } from "@/lib/time/gsClock";
import { boxArt, findGame } from "@/data/game-catalog";
import { wideArt } from "@/lib/home/art";
import { cardFor, liveFor } from "@/lib/mmr/store";
import { DEFAULT_LOOK, type MmrLook } from "@/lib/mmr/look";
import { demoSource, viewOf } from "@/lib/mmr/rules";
import { mmrSeenFor, type Room, type RoomHead, type SinceLine, type Ticket, type Tile } from "@/lib/home/forYou";
import type { GameCard } from "@/lib/home/yourGames";
import { PILLARS } from "@/lib/nav/pillars";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { createServiceClient } from "@/lib/supabase/admin";
import "@/styles/mmr-card.css";
import "@/styles/home-room.css";
import "@/styles/home-today.css";
import "@/styles/duel-art.css";

type TileOf<K extends Tile["kind"]> = Extract<Tile, { kind: K }>;

// ─── the header ──────────────────────────────────────────────────────────────

export function RoomHeader({ head, showing, interests, band }: { head: RoomHead; showing: Room["showing"]; interests: Room["interests"]; band: Room["band"] }) {
  return (
    <header className={`room-head${head.banner ? " room-head--banner" : ""}`} style={head.theme}>
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
            {head.status && <p className="room-head__status"><IconMessageCircle size={16} stroke={1.9} aria-hidden="true" />{head.status}</p>}
            <div className="room-head__showing"><ShowingLine showing={showing} interests={interests} /></div>
            {(head.supporter || head.username) && (
              <div className="room-head__extras">
                {head.supporter && <Link href="/account?tab=support" className="room-head__heart"><IconHeartFilled size={14} aria-hidden="true" />Supporter since {head.supporter.since}</Link>}
                {head.username && <Link href={`/u/${head.username}`} className="room-head__window"><IconEye size={16} aria-hidden="true" />See my front window</Link>}
              </div>
            )}
          </div>
        </div>
        {band.length > 0 && <HappeningBand worlds={band} tone="dark" signedIn interests={interests} />}
        <WorldsAndPickUp worlds={band.length === 0} />
      </div>
      </Container>
    </header>
  );
}

// ─── since you were here ─────────────────────────────────────────────────────

const SINCE_ICON: Record<SinceLine["icon"], Icon> = { times: IconClock, streak: IconFlame, mmr: IconChartBar, road: IconRoute, event: IconCalendarEvent };
const SINCE_TONE = { times: "blue", streak: "orange", mmr: "blue", road: "red", event: "violet" } as const;

function Since({ since, sweep }: { since: SinceLine; sweep: boolean }) {
  return (
    <aside className={`room-since${sweep ? " room-since--sweep" : ""}`} aria-label="Since you were here">
      <IconTile icon={SINCE_ICON[since.icon]} tone={SINCE_TONE[since.icon]} />
      <span className="room-since__text">
        <Link href={since.href} className="room-since__title">{since.title}</Link>
        <span>{since.line}</span>
      </span>
      {since.sample && <Badge variant="warning" size="small">Sample</Badge>}
      <span className="room-btn room-btn--ghost" aria-hidden="true">{since.action}</span>
    </aside>
  );
}

// ─── the tiles ───────────────────────────────────────────────────────────────

function TileBox({ tile, i, className, children, label, labelId }: { tile: Tile; i: number; className?: string; children: ReactNode; label?: string; labelId?: string }) {
  return (
    <section
      className={`room-tile room-tile--${tile.kind}${className ? ` ${className}` : ""}`}
      style={{ "--span": tile.span, "--i": i } as CSSProperties}
      data-span={tile.span}
      aria-label={label}
      aria-labelledby={labelId}
    >
      {children}
    </section>
  );
}

/** The competitive tile's MMR card: the account's own, in its look, rolled from the last visit. Loads after the page. */
async function MmrCardBit({ userId, who, sample }: { userId: string; who: string; sample: boolean }) {
  if (sample) {
    const look: MmrLook = { ...DEFAULT_LOOK, game: "mk8dx", brand: "off" };
    return <div className="mmr-frame" role="region" aria-label="Sample MMR card"><MmrCard view={viewOf(demoSource("mk8dx", "Sample player"))} look={look} fit="frame" /></div>;
  }
  const card = await cardFor(userId).catch(() => null);
  const live = card ? await liveFor(card, { country: false }).catch(() => null) : null;
  if (!live?.ok) return <p className="room-compete__none">The lounge isn&apos;t answering right now. Your card shows here when it does.</p>;
  // On our own page the "Built by GameShuffle" line says what the page already does; a rolling bar is a stream's.
  const look: MmrLook = { ...live.look, brand: "off", layout: live.look.layout === "rolling" ? "deck" : live.look.layout };
  const since = await mmrSeenFor(who);
  // The card scales to the space it has, so the whole card is always in view.
  return <div className="mmr-frame" role="region" aria-label="Your card as it shows on stream"><MmrSince initial={live} since={since} who={who} look={look} /></div>;
}

function CompeteTile({ tile, i, userId, who, mmrFrom, eye }: { tile: TileOf<"compete">; i: number; userId: string; who: string; mmrFrom: number | null; eye: ReactNode }) {
  const l = tile.lounge;
  if (!tile.card && !l) {
    // Nothing to show yet: the game's art and the one step that fills the tile.
    return (
      <TileBox tile={tile} i={i} className="room-tile--art" labelId="room-compete">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own game art */}
        <img className="room-art room-art--img" src={wideArt("mario-kart-8-deluxe") ?? ""} alt="" />
        <div className="room-art__text">
          <h2 id="room-compete" className="room-kicker room-kicker--light">Your lounge</h2>
          <b className="room-art__title">Your season, on your home</b>
          <span>Confirm your lounge name with Discord: your MMR, world rank and MMR card show here.</span>
          <span className="room-art__actions">
            <Link href="/lounge" className="room-btn room-btn--light">Confirm your lounge name</Link>
            <Link href={tile.times ? "/account/competitive" : "/time-trials/import"} className="room-art__setup">{tile.times ? `${tile.times.toLocaleString("en-US")} ${tile.times === 1 ? "time" : "times"} on the boards` : "Add a time"}</Link>
          </span>
        </div>
      </TileBox>
    );
  }
  return (
    <TileBox tile={tile} i={i} className={tile.card ? "room-tile--bare" : undefined} labelId="room-compete">
      <div className="room-tile__head">
        <h2 id="room-compete">{tile.card ? "Your MMR card" : "Your lounge"}</h2>
        {tile.sample && <Badge variant="warning" size="small">Sample</Badge>}
        {eye}
        {tile.card && <ArrowLink href="/mmr-card" className="room-tile__more">Open the studio</ArrowLink>}
      </div>
      {tile.card ? (
        <div className="room-compete__card">
          <Suspense fallback={<div className="room-compete__wait" role="status">Loading your MMR card</div>}>
            <MmrCardBit userId={userId} who={who} sample={tile.sample} />
          </Suspense>
        </div>
      ) : l && (
        <dl className="room-nums">
          {l.mmr != null && <div><dt>MMR</dt><dd><RollNum value={l.mmr} from={mmrFrom} /></dd></div>}
          {l.worldRank ? <div><dt>World</dt><dd>#{l.worldRank.toLocaleString("en-US")}</dd></div> : null}
          <div><dt>Times on the boards</dt><dd>{tile.times.toLocaleString("en-US")}</dd></div>
        </dl>
      )}
      {tile.card && !tile.pro && !tile.sample && <ProChip href="/gs-pro?from=home-mmr">With GS Pro: tonight&apos;s goal on your card</ProChip>}
      <ul className="room-links">
        {l ? <li><Link href={l.href}>{l.name}: your lounge page</Link></li> : <li><Link href="/lounge">Confirm your lounge name</Link></li>}
        {!tile.card && <li><Link href="/mmr-card">Make your MMR card</Link></li>}
        <li>{tile.times ? <Link href="/account/competitive">{tile.times.toLocaleString("en-US")} {tile.times === 1 ? "time" : "times"} on the boards</Link> : <Link href="/time-trials/import">Add a time</Link>}</li>
      </ul>
    </TileBox>
  );
}

function RoadTile({ tile, i, eye }: { tile: TileOf<"road">; i: number; eye: ReactNode }) {
  const e = tile.encounter;
  const n = tile.next;
  const picture = e?.picture ?? n?.picture ?? null;
  const href = e?.href ?? n?.href ?? "/pokemon-trainers";
  return (
    <TileBox tile={tile} i={i} className={`room-tile--art${e ? " room-road--blocked" : ""}`} labelId="room-road">
      {picture && <TrainerArt picture={picture} shape="banner" className="room-art" />}
      {eye}
      <Link href={href} className="room-art__text">
        <h2 id="room-road" className="room-kicker room-kicker--gold">{e ? "Blocking your road" : "Next on your road"}</h2>
        <b className="room-art__title">{e ? e.name : n ? n.name : "Trainer Road"}</b>
        <span>{e ? `Beat them to keep going in ${e.regionName}` : n ? `${n.regionName} · ${n.label}` : "Duel every Gym Leader with their own team"}</span>
        {n && !e && n.kind === "gym" && (
          <span className="room-badges" aria-label={`${tile.badges} of ${tile.gyms} badges`}>
            {Array.from({ length: tile.gyms }, (_, k) => <i key={k} className={k < tile.badges ? "on" : undefined} />)}
          </span>
        )}
        <span className="room-art__meta">
          Level {tile.level}
          {tile.stars > 0 && <> · <IconStarFilled size={14} aria-hidden="true" /> <RollNum value={tile.stars} from={tile.starsFrom} /> this month</>}
        </span>
      </Link>
    </TileBox>
  );
}

async function CardsFan({ userId }: { userId: string }) {
  const { data } = await createServiceClient().from("gs_user_cards").select("card:tcg_cards(name, image_small_path, images)").eq("user_id", userId).order("added_at", { ascending: false }).limit(3);
  const cards = ((data ?? []) as { card: { name: string; image_small_path: string | null; images: { small?: string } | null } | { name: string; image_small_path: string | null; images: { small?: string } | null }[] | null }[])
    .map((r) => (Array.isArray(r.card) ? r.card[0] : r.card))
    .map((c) => (c ? { name: c.name, src: c.image_small_path ?? c.images?.small ?? null } : null))
    .filter((c): c is { name: string; src: string } => !!c?.src);
  if (!cards.length) return null;
  return (
    <span className="room-fan" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- Scrydex card images, small size, never rewritten */}
      {cards.map((c, k) => <img key={k} src={c.src} alt="" loading="lazy" style={{ "--k": k } as CSSProperties} />)}
    </span>
  );
}

function CardsTile({ tile, i, userId }: { tile: TileOf<"cards">; i: number; userId: string }) {
  return (
    <TileBox tile={tile} i={i} labelId="room-cards">
      <div className="room-tile__head">
        <h2 id="room-cards">My Cards</h2>
        {tile.sample && <Badge variant="warning" size="small">Sample</Badge>}
      </div>
      <div className="room-cards">
        {!tile.sample && tile.cards > 0 && <Suspense fallback={null}><CardsFan userId={userId} /></Suspense>}
        <dl className="room-nums">
          <div><dt>Cards</dt><dd>{tile.cards.toLocaleString("en-US")}</dd></div>
          <div><dt>{tile.decks === 1 ? "Deck list" : "Deck lists"}</dt><dd>{tile.decks}</dd></div>
        </dl>
      </div>
      {!tile.pro && tile.cards >= 200 && <ProChip href="/gs-pro?from=home-cards">With GS Pro: keep more than 250 cards</ProChip>}
      <ul className="room-links">
        <li><Link href="/account/pokemon?tab=my-cards">{tile.cards ? "Open My Cards" : "Add your cards"}</Link></li>
        <li><Link href="/account/pokemon?tab=tcg-decks">{tile.decks ? "Your deck lists" : "Paste a deck list"}</Link></li>
      </ul>
    </TileBox>
  );
}

function ShelfTile({ tile, i, eye }: { tile: TileOf<"shelf">; i: number; eye: ReactNode }) {
  return (
    <TileBox tile={tile} i={i} labelId="room-shelf">
      <div className="room-tile__head">
        <h2 id="room-shelf">Your games</h2>
        {tile.games.length > 0 && eye}
        <ArrowLink href="/account?tab=games" className="room-tile__more">{tile.games.length ? "Change" : "Pick them"}</ArrowLink>
      </div>
      {tile.games.length ? (
        <ul className="room-shelf">
          {tile.games.map((g) => {
            const inner = (
              <>
                <GameCover name={g.name} className="room-shelf__cover" />
                <span className="sr-only">{g.name}</span>
                {g.action && <span className="room-shelf__act" aria-hidden="true">{g.action}</span>}
              </>
            );
            return <li key={g.name}>{g.href ? <Link href={g.href} aria-label={`${g.action} ${g.name}`}>{inner}</Link> : <span>{inner}</span>}</li>;
          })}
          {tile.games.length < 6 && (
            <li><Link href="/account?tab=games" className="room-shelf__add"><span className="room-shelf__slot"><IconPlus size={26} stroke={1.8} aria-hidden="true" /></span><span className="room-shelf__act">Add a game</span></Link></li>
          )}
        </ul>
      ) : (
        <p className="room-tile__note">Pick the games you play and they sit here as a shelf: tap one to roll it.</p>
      )}
    </TileBox>
  );
}

const TICKET_ICON = { trivia: IconQuestionMark, party: IconUsersGroup, event: IconTournament } as const;

function TicketArt({ art }: { art: Ticket["art"] }) {
  if (art.kind === "img") {
    // eslint-disable-next-line @next/next/no-img-element -- the event's own cover from our storage
    return <img className="room-ticket__img" src={art.src} alt="" loading="lazy" />;
  }
  if (art.kind === "icon") {
    const Glyph = TICKET_ICON[art.icon];
    return <span className="room-ticket__glyph"><Glyph size={40} stroke={1.6} aria-hidden="true" /></span>;
  }
  const wide = wideArt(art.slug);
  if (wide) {
    // eslint-disable-next-line @next/next/no-img-element -- the game's key art (ours or our CDN)
    return <img className="room-ticket__img" src={wide} alt="" loading="lazy" />;
  }
  const box = boxArt(findGame(art.slug, art.name));
  if (!box) {
    // A game we have no art for: a photo of people playing, never a lettered tile this big.
    // eslint-disable-next-line @next/next/no-img-element -- our own photo
    return <img className="room-ticket__img" src="/images/lifestyle/hero-game-nights.96d98118.jpg" alt="" loading="lazy" />;
  }
  return (
    <span className="room-ticket__box" style={{ "--box": `url(${box})` } as CSSProperties}>
      <GameCover slug={art.slug} name={art.name || "Event"} className="room-ticket__cover" />
    </span>
  );
}

function TicketCard({ t, compact = false }: { t: Ticket; compact?: boolean }) {
  return (
    <Link href={t.href} className={`room-ticket${compact ? " room-ticket--compact" : ""}${t.running ? " room-ticket--live" : ""}`}>
      <span className="room-ticket__art" aria-hidden="true">
        <TicketArt art={t.art} />
        <span className="room-ticket__when">{t.when}</span>
      </span>
      <span className="room-ticket__body">
        <span className="room-kicker">{t.role}</span>
        <b>{t.title}</b>
        {t.line && <span className="room-ticket__line">{t.line}</span>}
        {!compact && <span className="room-btn">{t.action}</span>}
        <span className="sr-only">{t.when}</span>
      </span>
    </Link>
  );
}

function TicketTile({ tile, i }: { tile: TileOf<"ticket">; i: number }) {
  return (
    <TileBox tile={tile} i={i} className="room-tile--flush" label="Your next event">
      <TicketCard t={tile.ticket} />
    </TileBox>
  );
}

function EventsTile({ tile, i }: { tile: TileOf<"events">; i: number }) {
  return (
    <TileBox tile={tile} i={i} labelId="room-events">
      <div className="room-tile__head">
        <h2 id="room-events">Your events</h2>
        {tile.sample && <Badge variant="warning" size="small">Sample</Badge>}
        <ArrowLink href="/account/events" className="room-tile__more">All of them</ArrowLink>
      </div>
      {tile.tickets.length ? (
        <ul className="room-tickets">
          {tile.tickets.map((t) => <li key={t.href}><TicketCard t={t} compact /></li>)}
        </ul>
      ) : <p className="room-tile__note">Nothing on yet.</p>}
      <ul className="room-links">
        <li><Link href="/tournament/create">Run a tournament</Link></li>
        <li><Link href="/trivia/leagues/new">Start a trivia league</Link></li>
      </ul>
    </TileBox>
  );
}

function StreamTile({ tile, i }: { tile: TileOf<"stream">; i: number }) {
  const s = tile.setup;
  return (
    <TileBox tile={tile} i={i} className="room-tile--art room-tile--stream" labelId="room-stream">
      {tile.art
        // eslint-disable-next-line @next/next/no-img-element -- the game's key art
        ? <img className="room-art room-art--img" src={tile.art} alt="" />
        : tile.game ? <span className="room-art room-art--box" style={{ "--box": `url(${boxArt(findGame(tile.game, tile.gameName)) ?? ""})` } as CSSProperties} /> : <span className="room-art room-art--plain" />}
      <div className="room-art__text">
        <h2 id="room-stream" className="room-kicker room-kicker--light">
          {tile.status === "live" ? <span className="room-live">Live</span> : "Your stream"}
          {tile.sample && <Badge variant="warning" size="small">Sample</Badge>}
        </h2>
        <b className="room-art__title">{tile.title}</b>
        <span>{tile.status === "none" ? (tile.pro ? "Your lobby, rolls and live games in one place" : "Chat games, the overlay and a Discord bot, with GS Pro") : [tile.gameName, tile.when].filter(Boolean).join(" · ")}</span>
        <span className="room-art__actions">
          <Link href={tile.status === "none" && !tile.pro ? "/gs-pro?from=home-stream" : tile.href} className="room-btn room-btn--light">{tile.action}</Link>
          {s && s.next && <Link href={s.next.href} className="room-art__setup">Setup {s.done} of {s.total}: {s.next.label}</Link>}
        </span>
      </div>
    </TileBox>
  );
}

const TONIGHT_ICON = { tv: IconDeviceTv, party: IconUsersGroup, vote: IconThumbUp, trivia: IconQuestionMark, holiday: IconConfetti } as const;

function TonightTile({ tile, i }: { tile: TileOf<"tonight">; i: number }) {
  return (
    <TileBox tile={tile} i={i} labelId="room-tonight">
      <div className="room-tile__head">
        <h2 id="room-tonight">Tonight</h2>
        <ArrowLink href="/game-nights/tools" className="room-tile__more">Game night tools</ArrowLink>
      </div>
      <ul className="room-list">
        {tile.picks.map((p) => (
          <li key={p.href}>
            <IconTile icon={TONIGHT_ICON[p.icon]} tone={p.tone} />
            <span className="room-list__text">
              <Link href={p.href} className="room-list__title">{p.title}</Link>
              <span>{p.line}</span>
            </span>
          </li>
        ))}
      </ul>
    </TileBox>
  );
}

/** A plan, where it would improve the tile it sits on (motion + balance 11A). */
function ProChip({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="room-prochip"><IconSparkles size={15} aria-hidden="true" />{children}</Link>;
}

// ─── the people rail ─────────────────────────────────────────────────────────

/**
 * Your people (context picks 4A): who's live (a red ring, Watch), hosting (Join), online (a green dot) or around lately,
 * a friend marked. The rail's twin on the profile is its narrow column.
 */
function RailPeople({ people }: { people: NonNullable<Room["people"]> }) {
  const d = people.data;
  return (
    <section className="room-tile room-rail__block" aria-labelledby="room-people">
      <div className="room-tile__head">
        <h2 id="room-people">Your people</h2>
        {people.sample && <Badge variant="warning" size="small">Sample</Badge>}
        <ArrowLink href="/players" className="room-tile__more">Find players</ArrowLink>
      </div>
      {d.people.length ? (
        <PeopleList people={d.people} />
      ) : (
        <p className="room-tile__note">Follow players and they show up here with what they&apos;re up to and a way to join them.</p>
      )}
    </section>
  );
}

/** From your people (game spaces picks 8A): a few posts about a game from people you follow, each naming its game. */
function RailPosts({ posts }: { posts: Room["posts"] }) {
  return (
    <section className="room-tile room-rail__block" aria-labelledby="room-posts">
      <div className="room-tile__head">
        <h2 id="room-posts">From your people</h2>
      </div>
      <PostLines label="Posts from people you follow" posts={posts} />
    </section>
  );
}

/** Bring your crew: your invite link (who's joined from it), and a night with friends in one tap. */
function RailCrew({ invite }: { invite: NonNullable<Room["people"]>["data"]["invite"] | null }) {
  return (
    <section className="room-tile room-rail__block room-rail__crew" aria-labelledby="room-crew">
      <div className="room-tile__head">
        <h2 id="room-crew">Bring your crew</h2>
      </div>
      {invite && <InviteLink link={invite.link} joined={invite.joined} bare />}
      <div className="room-together">
        <span className="room-kicker">Start a night together</span>
        <QuickStartButtons from="home-people" />
      </div>
    </section>
  );
}

// ─── the room ────────────────────────────────────────────────────────────────

/**
 * Below the header (context + rooms picks 2026-11-05, https://claude.ai/artifact/APK5x7mRj9Ldvt7a8J7g4T, all A): since,
 * then the room in two zones on the 12-column grid. Your things take 8 (Today, then your tiles two to a row, a wide one
 * across); your people take a rail of 4 that stays put as you scroll (your people, today's board, bring your crew).
 * Under 1200px it's one column with the people after Today. Then the plan line.
 */
export function RoomBody({ room, userId }: { room: Room; userId: string }) {
  // "On my profile" (bring-along 6A): each tile that has a part on the public profile says whether it shows there.
  const eye = (keys: ProfileSectionKey[], what: string, className?: string) => room.profile && !room.previewing
    ? <ProfileEye keys={keys} on={keys.some((k) => !room.profile!.hidden.includes(k))} what={what} className={className} />
    : null;
  const t = room.today;
  const board = !!t.live && t.live.following > 0;
  const blocks = (room.posts.length ? 1 : 0) + (room.people ? 1 : 0) + (board ? 1 : 0) + 1;
  return (
    <div className="room" data-rise={room.rise ? "" : undefined}>
      <HomeVisit value={room.visit} />
      {room.since && <Since since={room.since} sweep={room.freshVisit} />}
      {room.games.length > 0 && <YourGames games={room.games} />}
      <TodayLiveProvider initial={t.live} day={gsDay()}>
        <div className="room-zones">
          <div className={`room-zone room-zone--today${t.done ? " room-zone--done" : ""}`}>
            <TodayLive
              games={t.games} weekly={t.weekly} streak={t.streak} streakFrom={t.streakFrom}
              picks={t.picks} race={t.race} resetAt={t.resetAt}
              eye={eye(["dailies"], "Your daily streaks", t.done ? undefined : "room-eye--below")}
            />
          </div>
          <StickyRail blocks={blocks}>
            {room.posts.length > 0 && <RailPosts posts={room.posts} />}
            {room.people && <RailPeople people={room.people} />}
            <TodayBoard games={t.games.map((g) => g.id)} />
            <RailCrew invite={room.people?.data.invite ?? null} />
          </StickyRail>
          {room.tiles.length > 0 && (
            <div className="room-zone room-zone--main room-grid">
              {room.tiles.map((tile, i) => {
                switch (tile.kind) {
                  case "compete": return <CompeteTile key={tile.kind} tile={tile} i={i} userId={userId} who={room.visitKey} mmrFrom={room.mmrFrom} eye={eye(["mmr", "timeTrials"], "Your MMR card and times")} />;
                  case "road": return <RoadTile key={tile.kind} tile={tile} i={i} eye={eye(["road"], "Your trainer card", "room-eye--corner")} />;
                  case "cards": return <CardsTile key={tile.kind} tile={tile} i={i} userId={userId} />;
                  case "shelf": return <ShelfTile key={tile.kind} tile={tile} i={i} eye={eye(["favGames"], "Your games")} />;
                  case "ticket": return <TicketTile key={tile.kind} tile={tile} i={i} />;
                  case "events": return <EventsTile key={tile.kind} tile={tile} i={i} />;
                  case "stream": return <StreamTile key={tile.kind} tile={tile} i={i} />;
                  case "tonight": return <TonightTile key={tile.kind} tile={tile} i={i} />;
                  case "like": return <MightLike key={tile.kind} items={tile.items} span={tile.span} i={i} />;
                  default: return null;
                }
              })}
            </div>
          )}
        </div>
      </TodayLiveProvider>
      {room.plan && <PlanRow plan={room.plan} />}
    </div>
  );
}

// ─── your games ──────────────────────────────────────────────────────────────

/**
 * Your games (journeys picks 2026-11-06, 7A): a card per game space you've joined, leading the room. Box art, the
 * space's pick of the day, one line of what's new; the card opens the space. The last card adds a game.
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

// ─── explore ─────────────────────────────────────────────────────────────────

const EXPLORE: { id: string; line: string; tone: "violet" | "red" | "blue" | "teal" | "magenta"; icon: Icon }[] = [
  { id: "play", line: "Dailies, randomizers, party games", tone: "violet", icon: IconSparkles },
  { id: "pokemon", line: "Dex, Duel, Trainer Road", tone: "red", icon: IconRoute },
  { id: "compete", line: "Lounge, time trials, tournaments", tone: "blue", icon: IconTournament },
  { id: "host", line: "Game nights and trivia", tone: "teal", icon: IconUsersGroup },
  { id: "stream", line: "Chat games and your overlay", tone: "magenta", icon: IconDeviceTv },
];

/**
 * The foot of /home (journeys 7A): the five worlds in one row, where the visitor homepage used to follow the room, and
 * a way back to that front page.
 */
export function ExploreRow() {
  return (
    <section className="room-explore" aria-labelledby="room-explore-title">
      <div className="room-games__head">
        <h2 id="room-explore-title">Explore GameShuffle</h2>
        <ArrowLink href="/?front=1" className="room-tile__more">The front page</ArrowLink>
      </div>
      <ul className="room-explore__row">
        {EXPLORE.map((w) => {
          const p = PILLARS.find((x) => x.id === w.id);
          if (!p) return null;
          return (
            <li key={w.id}>
              <Link href={p.href} className={`room-explore__world ${tagged(EVENTS.homeSectionClicked, { to: `explore-${w.id}` })}`}>
                <IconTile icon={w.icon} tone={w.tone} />
                <span><b>{p.label}</b><small>{w.line}</small></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
