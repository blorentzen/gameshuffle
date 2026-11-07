import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { IconPlus } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { cardsFor, joinedSpaces, visibleSpaces, type GameCard } from "@/lib/home/yourGames";
import { SpaceJoin } from "@/components/games/SpaceJoin";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { GameCover } from "@/components/games/GameCover";
import "@/styles/home-room.css";
import "@/styles/game-space.css";

/**
 * /games: every game space you can open (journeys picks 2026-11-06; the phone app bar's Games tab). Yours first, then
 * the rest with Join. Before any space opens to everyone, members see their games' shelf and the tools instead.
 */
export const metadata: Metadata = {
  title: "Games",
  robots: { index: false, follow: true },
};

function Card({ g, action }: { g: GameCard; action?: React.ReactNode }) {
  return (
    <div className="games-card">
      <Link href={g.href} className="room-game" style={{ "--acc": g.accent } as React.CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element -- our box art */}
        {g.box ? <img className="room-game__box" src={g.box} alt="" /> : <span className="room-game__box" aria-hidden="true" />}
        <span className="room-game__text">
          <b className="room-game__name">{g.name}</b>
          {g.pick && <span className="room-game__pick">{g.pick.label}: <b>{g.pick.name}</b></span>}
          {g.news && <span className={`room-game__news${g.news.fresh ? " is-fresh" : ""}`}>{g.news.fresh && <i aria-hidden="true" />}{g.news.text}</span>}
        </span>
      </Link>
      {action}
    </div>
  );
}

export default async function GamesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const row = user
    ? ((await createServiceClient().from("users").select("role, favorite_games").eq("id", user.id).maybeSingle()).data as { role: string | null; favorite_games: string[] | null } | null)
    : null;
  const role = row?.role ?? null;
  const favorites = row?.favorite_games ?? [];
  const mine = joinedSpaces(favorites, role);
  const others = visibleSpaces(role).filter((s) => !mine.includes(s));
  const [mineCards, otherCards] = await Promise.all([cardsFor(mine, null), cardsFor(others, null)]);

  return (
    <main className="games-index">
      <Container>
        <header className="games-index__head">
          <h1>Games</h1>
          <p>Each game has a space: the pick of the day, its boards, events, people and posts.</p>
        </header>

        {mineCards.length > 0 && (
          <section className="room-games" aria-labelledby="games-mine">
            <div className="room-games__head"><h2 id="games-mine">Your games</h2></div>
            <div className="room-games__row">{mineCards.map((g) => <Card key={g.id} g={g} />)}</div>
          </section>
        )}

        {otherCards.length > 0 && (
          <section className="room-games" aria-labelledby="games-more">
            <div className="room-games__head"><h2 id="games-more">{mineCards.length ? "More game spaces" : "Game spaces"}</h2></div>
            <div className="room-games__row">
              {otherCards.map((g) => <Card key={g.id} g={g} action={<SpaceJoin space={g.id} name={g.name} joined={false} signedIn={!!user} size="small" />} />)}
            </div>
          </section>
        )}

        {mineCards.length + otherCards.length === 0 && (
          <section className="room-games" aria-labelledby="games-soon">
            <div className="room-games__head"><h2 id="games-soon">Game spaces open one game at a time</h2></div>
            <p className="games-index__note">Until yours opens, your games and their tools are here.</p>
            {favorites.length > 0 && (
              <ul className="room-shelf">
                {favorites.slice(0, 12).map((name) => (
                  <li key={name}><span><GameCover name={name} className="room-shelf__cover" /><span className="room-shelf__act">{name}</span></span></li>
                ))}
                <li><Link href="/account?tab=games" className="room-shelf__add"><span className="room-shelf__slot"><IconPlus size={26} stroke={1.8} aria-hidden="true" /></span><span className="room-shelf__act">Add a game</span></Link></li>
              </ul>
            )}
          </section>
        )}

        <p className="games-index__more"><ArrowLink href="/randomizers">Every randomizer</ArrowLink> <ArrowLink href="/apps">Everything on GameShuffle</ArrowLink></p>
      </Container>
    </main>
  );
}
