/**
 * The tabs only some spaces have (game spaces step 5, phone picks 2A: each game's own tabs): Pokémon's Dailies, Road and
 * Cards, Mario Party's Nights, and the season board for games without time trials or a lounge. Server components; each
 * reuses the piece that already draws its thing (daily boards, Trainer Road's regions and trainer card, the deck guides
 * grid, event cards) instead of drawing it again.
 */

import Link from "next/link";
import { gsDay } from "@/lib/time/gsClock";
import { boardView } from "@/lib/daily/boards";
import type { BoardRow } from "@/lib/daily/boardTypes";
import { duelChallenger } from "@/lib/originals/duel/store";
import { roadProgressView } from "@/lib/originals/duel/roadProgress";
import { roadShown } from "@/lib/games-visibility";
import { getAllDecks } from "@/lib/decks";
import { TCG_SHOP_URL } from "@/data/shop";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import { MARQUEE_BY_DECK } from "@/data/tcg-featured";
import { spaceSeason } from "@/lib/games/spaceData";
import type { GameSpace } from "@/lib/games/spaces";
import type { Happening } from "@/lib/home/happening";
import { RankList, type RankRow } from "@/components/boards/RankList";
import { GhostRows } from "@/components/ui/Ghost";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { UserAvatar } from "@/components/UserAvatar";
import { HappeningCard } from "@/components/home/HappeningBand";
import { RoadRegions } from "@/components/originals/duel/road/RoadRegions";
import { RoadTrainerCard } from "@/components/originals/duel/road/RoadCard";
import { DeckGrid, type DeckCardData } from "@/components/decks/DeckGrid";
import { FeaturedShopCards } from "@/components/tcg/FeaturedShopCards";
import { getPublicFeaturedShopCards } from "@/lib/shop/featuredCards";
import { DAILIES } from "@/lib/originals/dailies";
import { IconTile } from "@/components/ui/IconTile";
import { IconPokeball, IconSwords } from "@tabler/icons-react";
import "@/styles/road-card.css";

const clock = (s: number | null) => (s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function dayRows(rows: BoardRow[], line: (r: BoardRow) => string): RankRow[] {
  return rows.map((r) => ({
    key: `${r.place}-${r.name}`, place: r.place, name: r.name, href: r.profile ?? undefined, you: r.you, line: line(r), value: `${r.points} pts`,
    // eslint-disable-next-line @next/next/no-img-element -- their picture (our storage, Discord or Twitch)
    pic: r.avatar ? <img src={r.avatar} alt="" className="space-face" /> : <span className="space-face space-face--blank" aria-hidden="true">{r.name.charAt(0)}</span>,
  }));
}

/** Pokémon's Dailies: today's Daily Dex and Daily Duel, who's on top of each, and a way in. */
export async function DailiesPanel({ viewerId }: { viewerId: string | null }) {
  const day = gsDay();
  const me = viewerId ? `u:${viewerId}` : null;
  const [dex, duel, challenger] = await Promise.all([
    boardView({ game: "dex", period: "day", day, me, limit: 5 }).catch(() => null),
    boardView({ game: "duel", period: "day", day, me, limit: 5 }).catch(() => null),
    duelChallenger(day).catch(() => null),
  ]);
  const played = (n: number | undefined) => (n ? `${n.toLocaleString("en-US")} played today` : "Nobody has played yet today");
  return (
    <div className="space-two space-two--tiles">
      <section className="room-tile" aria-labelledby="sp-dex">
        <div className="room-tile__head">
          <h2 id="sp-dex">Daily Dex</h2>
          <span className="space-count">{played(dex?.total)}</span>
        </div>
        <p className="room-tile__note">Guess today&apos;s Pokémon from all 1,025.</p>
        {dex?.rows.length ? <RankList label="Today's Daily Dex board" rows={dayRows(dex.rows, (r) => [`${r.guesses} ${r.guesses === 1 ? "guess" : "guesses"}`, clock(r.seconds)].filter(Boolean).join(" · "))} /> : null}
        <div className="space-actions"><Link href="/daily-dex" className="room-btn">Play today&apos;s Dex</Link></div>
      </section>
      <section className="room-tile" aria-labelledby="sp-duel">
        <div className="room-tile__head">
          <h2 id="sp-duel">Daily Duel</h2>
          <span className="space-count">{played(duel?.total)}</span>
        </div>
        <p className="room-tile__note">{challenger ? `Today: ${challenger.name}, ${challenger.title}.` : "Knock out today's trainer with the same six cards as everyone."}</p>
        {duel?.rows.length ? <RankList label="Today's Daily Duel board" rows={dayRows(duel.rows, (r) => [`${r.guesses} turns`, clock(r.seconds)].filter(Boolean).join(" · "))} /> : null}
        <div className="space-actions"><Link href="/daily-duel" className="room-btn">Duel {challenger?.name ?? "today's trainer"}</Link></div>
      </section>
    </div>
  );
}

/** Pokémon's Now (other spaces pass, 2026-11-06): today's two dailies in one tile, how many played and a way in; the
 *  Dailies tab has the boards. */
export async function DailiesToday() {
  const day = gsDay();
  const [dex, duel, challenger] = await Promise.all([
    boardView({ game: "dex", period: "day", day, me: null, limit: 1 }).catch(() => null),
    boardView({ game: "duel", period: "day", day, me: null, limit: 1 }).catch(() => null),
    duelChallenger(day).catch(() => null),
  ]);
  const played = (n: number | undefined) => (n ? `${n.toLocaleString("en-US")} played today` : "Nobody yet today: be the first");
  return (
    <section className="room-tile" aria-labelledby="sp-today">
      <div className="room-tile__head">
        <h2 id="sp-today">Today&apos;s dailies</h2>
        <ArrowLink plain href="?tab=dailies" className="room-tile__more">Today&apos;s boards</ArrowLink>
      </div>
      <ul className="space-dailies">
        <li>
          <IconTile icon={IconPokeball} tone="dex" />
          <span className="space-dailies__words"><b>Daily Dex</b><span>{DAILIES.dex.pitch}</span><span className="space-dailies__count">{played(dex?.total)}</span></span>
          <Link href="/daily-dex" className="room-btn">Play today&apos;s Dex</Link>
        </li>
        <li>
          <IconTile icon={IconSwords} tone="duel" />
          <span className="space-dailies__words"><b>Daily Duel</b><span>{challenger ? `Today: ${challenger.name}, ${challenger.title}.` : DAILIES.duel.pitch}</span><span className="space-dailies__count">{played(duel?.total)}</span></span>
          <Link href="/daily-duel" className="room-btn">{challenger ? `Duel ${challenger.name}` : "Duel today's trainer"}</Link>
        </li>
      </ul>
    </section>
  );
}

/** Pokémon's shelf at the foot of Now: our TCGplayer singles as a carousel, like the merch shelf on the other spaces. */
export async function CardShelf({ className }: { className?: string }) {
  const cards = await getPublicFeaturedShopCards().catch(() => []);
  if (!cards.length) return null;
  return (
    <div className={className}>
      <FeaturedShopCards cards={cards} heading="From our card store" intro="Real singles from the GameShuffle TCG store, shipped fast and protected. Tap a card to get it on TCGplayer." />
    </div>
  );
}

/** Pokémon's Road: your trainer card and where you are, then every region. */
export async function RoadPanel({ viewerId }: { viewerId: string | null }) {
  if (!roadShown()) return <p className="room-tile__note">Trainer Road opens soon.</p>;
  const mine = viewerId ? await roadProgressView(viewerId).catch(() => null) : null;
  return (
    <div className="space-stack">
      {mine ? (
        <section className="room-tile" aria-labelledby="sp-road-you">
          <div className="room-tile__head">
            <h2 id="sp-road-you">Your road</h2>
            {mine.next && <ArrowLink href={mine.next.href} className="room-tile__more">{`Next: ${mine.next.name}`}</ArrowLink>}
          </div>
          <RoadTrainerCard p={mine} regions={false} />
        </section>
      ) : (
        <p className="room-tile__note">{viewerId ? "Beat your first Gym Leader and your trainer card starts here." : "Sign in and the road keeps your badges, stars and level."}</p>
      )}
      {/* The region cards are their own surfaces: they sit on the page, not in a tile (no box in a box). */}
      <section className="space-flat" aria-labelledby="sp-road-regions">
        <div className="room-tile__head">
          <h2 id="sp-road-regions">Regions</h2>
          <ArrowLink href="/pokemon-trainers" className="room-tile__more">Trainer Road</ArrowLink>
        </div>
        <RoadRegions />
      </section>
    </div>
  );
}

/** Pokémon's Cards: the deck guides, then the card tools. */
export async function CardsPanel() {
  const decks = getAllDecks();
  const shopCards = await getPublicFeaturedShopCards().catch(() => []);
  const fans = await Promise.all(decks.map(async (d) => {
    const ids = MARQUEE_BY_DECK[d.frontmatter.slug];
    return ids?.length ? getCatalogCards(ids.slice(0, 4)).catch(() => []) : [];
  }));
  const cards: DeckCardData[] = decks.map((d, i) => ({
    slug: d.frontmatter.slug, archetype: d.frontmatter.archetype, tiers: d.frontmatter.tiers, deck_type: d.frontmatter.deck_type,
    win_rate: d.frontmatter.win_rate, win_rate_source: d.frontmatter.win_rate_source, cost_estimate: d.frontmatter.cost_estimate,
    difficulty: d.frontmatter.difficulty, meta_description: d.frontmatter.meta_description, fan: fans[i],
  }));
  return (
    <div className="space-stack">
      <section className="space-flat" aria-labelledby="sp-decks">
        <div className="room-tile__head">
          <h2 id="sp-decks">Deck guides</h2>
          <ArrowLink href="/pokemon-tcg/decks" className="room-tile__more">All deck guides</ArrowLink>
        </div>
        <DeckGrid decks={cards} />
      </section>
      {/* The singles in one place after the decks (round two picks 8A; Britton: room to breathe, not a button on every deck). */}
      {shopCards.length > 0 && (
        <FeaturedShopCards cards={shopCards} heading="From our card store" intro="Real singles from the GameShuffle TCG store, shipped fast and protected. Tap a card to get it on TCGplayer." />
      )}
      <section className="room-tile" aria-labelledby="sp-card-tools">
        <div className="room-tile__head"><h2 id="sp-card-tools">At the table</h2></div>
        <ul className="space-tools">
          <li><ArrowLink href="/pokemon-tcg-companion">TCG Companion</ArrowLink></li>
          <li><ArrowLink href="/pokemon-tcg/checklists">Card checklists</ArrowLink></li>
          <li><ArrowLink href="/pokemon-tcg/rules">Rules</ArrowLink></li>
          <li><ArrowLink href="/tcg-companion/collection">My cards</ArrowLink></li>
          <li><ArrowLink href={TCG_SHOP_URL} external>Our card store on TCGplayer</ArrowLink></li>
        </ul>
      </section>
    </div>
  );
}

/** Mario Party's Nights: game nights in its games, and ways to start one. */
export function NightsPanel({ nights }: { nights: Happening[] }) {
  return (
    <div className="space-stack">
      <div className="space-actions">
        <Link href="/game-nights/create" className="room-btn">Host a game night</Link>
        <Link href="/game-nights/tools/night-planner" className="room-btn room-btn--ghost">Plan a night</Link>
      </div>
      {nights.length ? (
        <ul className="space-cards">{nights.map((h, k) => <li key={h.id}><HappeningCard h={h} from="space-nights" k={k} /></li>)}</ul>
      ) : (
        <p className="room-tile__note">No game nights in the next month yet.</p>
      )}
    </div>
  );
}

/** The season board: this month's GameShuffle points in the space's games, for games without time trials or a lounge. */
export async function SeasonBoard({ s, viewerId }: { s: GameSpace; viewerId: string | null }) {
  const { rows, month } = await spaceSeason(s, viewerId).catch(() => ({ rows: [], month: "" }));
  return (
    <section className="room-tile" aria-labelledby="sp-season">
      <div className="room-tile__head"><h2 id="sp-season">{month ? `${month}'s points` : "This month's points"}</h2></div>
      {rows.length ? <p className="room-tile__note">Points from live nights in {s.short}: placements, missions and right calls. A new board every month.</p> : null}
      {rows.length ? (
        <RankList label={`This month's points in ${s.name}`} rows={rows.map((r, i) => ({
          key: r.userId, place: i + 1, name: r.name, href: r.username ? `/u/${r.username}` : undefined, you: r.you, line: r.rank, value: `${r.points.toLocaleString("en-US")} pts`,
          pic: <UserAvatar user={r.avatar} size={32} />,
        }))} />
      ) : (
        <GhostRows count={3} notice={<p>Nobody has points this month yet. <b>Play {s.short} on a live night</b> (placements, missions and right calls all count) and you&apos;re on the board.</p>} />
      )}
    </section>
  );
}
