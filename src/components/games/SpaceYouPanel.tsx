/**
 * A game space's You tab (journeys picks 2026-11-06, step 6, all A): what's yours in that game, second after Now.
 * Mario Kart: your rank (the Lounge tab's block, passed in), your streak and this week, your best times, your builds.
 * Pokémon: your Dex and Duel streaks, your trainer card, My Cards and deck lists (each opens here as its own part,
 * `?tab=you&part=cards|decks`, the screens Account ▸ Pokémon had). Smash and Mario Party: your streak, your month on
 * the board, your setups. Each ends on one line of settings for the game. Visitors get the dashed slots and Join free.
 * Joining and leaving stay on the header's Join button. Server component.
 */

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { IconCards, IconChevronLeft, IconFlame, IconStack2 } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { GhostRows } from "@/components/ui/Ghost";
import { VisitorKeeps } from "@/components/games/VisitorKeeps";
import { AddTimeButton } from "@/components/timeTrials/AddTimeButton";
import { RoadTrainerCard } from "@/components/originals/duel/road/RoadCard";
import { CollectionManager } from "@/components/tcg/CollectionManager";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { TcgDecksTab } from "@/components/tcg/decks/TcgDecksTab";
import { TT_GAMES } from "@/lib/timeTrials/tracks";
import type { GameSpace } from "@/lib/games/spaces";
import type { SpaceYouTab } from "@/lib/games/spaceYouTab";
import "@/styles/space-you.css";

const DAY = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Streak({ data, what }: { data: SpaceYouTab; what: string }) {
  return (
    <section className="room-tile" style={{ "--span": 5 } as CSSProperties} aria-labelledby="you-streak">
      <div className="room-tile__head"><h2 id="you-streak">Your streak</h2></div>
      <div className="you-streak">
        <IconTile icon={IconFlame} tone="orange" />
        <div><b className="you-streak__num">{data.streak} {data.streak === 1 ? "day" : "days"}</b><span>{what}, in a row</span></div>
      </div>
      <ol className="you-days" aria-label="This week">
        {data.week.days.map((d, i) => {
          const done = data.week.done.includes(d);
          const today = d === data.week.today;
          return (
            <li key={d} className={`${done ? "is-done" : ""}${today ? " is-today" : ""}`}>
              <span aria-hidden="true">{DAY[i]}</span>
              <span className="sr-only">{DAY_NAME[i]}{done ? ", checked in" : today ? ", today" : ""}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Setups({ data, s, span }: { data: SpaceYouTab; s: GameSpace; span: number }) {
  const kart = !!s.tt;
  return (
    <section className="room-tile" style={{ "--span": span } as CSSProperties} aria-labelledby="you-setups">
      <div className="room-tile__head">
        <h2 id="you-setups">{kart ? "Your builds" : "Your setups"}</h2>
        <ArrowLink href={s.main.href} className="room-tile__more">{s.main.label}</ArrowLink>
      </div>
      {data.setups.length ? (
        <ul className="you-setups">
          {data.setups.map((u) => (
            <li key={u.id}>
              <Link href={u.href} className="you-setup">
                {/* eslint-disable-next-line @next/next/no-img-element -- our character art */}
                {u.img ? <img src={u.img} alt="" /> : <IconTile icon={IconStack2} tone="violet" />}
                <span><b>{u.title}</b><small>{u.line}</small></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <GhostRows count={2} places={false} value={false} notice={<p>Roll one and press Save: {kart ? "your builds" : "your setups"} wait here.</p>} />
      )}
    </section>
  );
}

export function SpaceYouPanel({ s, data, rank, part, isPro }: {
  s: GameSpace;
  /** Null for visitors. */
  data: SpaceYouTab | null;
  /** Mario Kart: the Lounge tab's Your rank block. */
  rank?: ReactNode;
  /** Pokémon: My Cards or Deck lists open on their own. */
  part?: string | null;
  isPro: boolean;
}) {
  if (!data) {
    return (
      <div className="you-tab">
        <VisitorKeeps space={s.id} name={s.name} />
        <GhostRows count={3} places={false} lines notice={<p>Your times, streaks and saves in {s.short} show here once you join.</p>} />
      </div>
    );
  }

  if (s.id === "pokemon" && (part === "cards" || part === "decks")) {
    return (
      <div className="you-tab you-tab--part">
        <Link href={`/games/${s.id}?tab=you`} className="you-back"><IconChevronLeft size={18} aria-hidden="true" />You</Link>
        {part === "cards" ? (
          <>
            <CollectionManager isPro unlimited={isPro} />
            <TcgAttribution />
          </>
        ) : <TcgDecksTab isPro={isPro} />}
      </div>
    );
  }

  const hasSettings = !!s.lounge?.length || !!s.tt || s.id === "pokemon";
  const foot = hasSettings && (
    <div className="you-foot">
      <span>Settings for {s.short}</span>
      {s.lounge?.length ? <ArrowLink href="/lounge">Lounge names</ArrowLink> : null}
      {s.lounge?.length ? <ArrowLink href="/mmr-card">MMR card look</ArrowLink> : null}
      {s.tt ? <ArrowLink href={`/time-trials/${TT_GAMES[s.tt].slug}`}>Time trials</ArrowLink> : null}
      {s.id === "pokemon" ? <ArrowLink href="/pokemon-trainers">Trainer Road</ArrowLink> : null}
    </div>
  );

  if (s.id === "pokemon") {
    const dex = data.dailies?.dex;
    const duel = data.dailies?.duel;
    return (
      <div className="you-tab room-grid">
        <section className="room-tile" style={{ "--span": 5 } as CSSProperties} aria-labelledby="you-dailies">
          <div className="room-tile__head"><h2 id="you-dailies">Your streaks</h2></div>
          <ul className="you-dailies">
            <li><IconTile tone="dex" icon={IconFlame} /><span><b>{dex?.streak ?? 0} {dex?.streak === 1 ? "day" : "days"}</b><small>Daily Dex · best {dex?.best ?? 0}</small></span><ArrowLink href="/daily-dex">Play</ArrowLink></li>
            <li><IconTile tone="orange" icon={IconFlame} /><span><b>{duel?.streak ?? 0} {duel?.streak === 1 ? "day" : "days"}</b><small>Daily Duel · {duel?.won ?? 0} won</small></span><ArrowLink href="/daily-duel">Duel</ArrowLink></li>
          </ul>
        </section>
        <section className="room-tile" style={{ "--span": 7 } as CSSProperties} aria-labelledby="you-road">
          <div className="room-tile__head"><h2 id="you-road">Your trainer card</h2><ArrowLink href="/pokemon-trainers" className="room-tile__more">Trainer Road</ArrowLink></div>
          {data.road ? <RoadTrainerCard p={data.road} regions={false} /> : (
            <GhostRows count={2} places={false} value={false} notice={<p>Beat a Gym Leader on Trainer Road and your card starts here.</p>} />
          )}
        </section>
        <section className="room-tile" style={{ "--span": 12 } as CSSProperties} aria-labelledby="you-cards">
          <div className="room-tile__head"><h2 id="you-cards">Your cards</h2></div>
          <ul className="you-cards">
            <li><Link href={`/games/${s.id}?tab=you&part=cards`}><IconTile icon={IconCards} tone="red" /><span><b>My Cards</b><small>{(data.cards?.cards ?? 0).toLocaleString("en-US")} {data.cards?.cards === 1 ? "card" : "cards"}</small></span></Link></li>
            <li><Link href={`/games/${s.id}?tab=you&part=decks`}><IconTile icon={IconStack2} tone="violet" /><span><b>Deck lists</b><small>{data.cards?.decks ?? 0} {data.cards?.decks === 1 ? "deck" : "decks"}</small></span></Link></li>
          </ul>
        </section>
        {foot}
      </div>
    );
  }

  if (s.tt) {
    return (
      <div className="you-tab room-grid">
        {rank && <div className="you-rank" style={{ "--span": 7 } as CSSProperties}>{rank}</div>}
        <Streak data={data} what="Combo of the day" />
        <section className="room-tile" style={{ "--span": 7 } as CSSProperties} aria-labelledby="you-times">
          <div className="room-tile__head">
            <h2 id="you-times">Your best times</h2>
            {data.timesCount > data.times.length && <ArrowLink href={`/time-trials/${TT_GAMES[s.tt].slug}`} className="room-tile__more">All {data.timesCount}</ArrowLink>}
          </div>
          {data.times.length ? (
            <ol className="you-times">
              {data.times.map((t) => (
                <li key={t.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- our course art */}
                  {t.image ? <img src={t.image} alt="" /> : <span />}
                  <span><Link href={t.href}><b>{t.track}</b></Link><small>{t.place} of {t.total} on the board</small></span>
                  <span className="you-times__time">{t.time}</span>
                </li>
              ))}
            </ol>
          ) : (
            <GhostRows count={3} notice={<p>Add a time with its result screenshot and it lands on the boards and here.</p>} />
          )}
          <div><AddTimeButton game={s.tt} signedIn returnTo={`/games/${s.id}?tab=you`} variant="primary" label="Add a time" /></div>
        </section>
        <Setups data={data} s={s} span={5} />
        {foot}
      </div>
    );
  }

  return (
    <div className="you-tab room-grid">
      <Streak data={data} what={s.id === "smash" ? "Fighter of the day" : "Party of the day"} />
      <section className="room-tile" style={{ "--span": 7 } as CSSProperties} aria-labelledby="you-season">
        <div className="room-tile__head"><h2 id="you-season">Your {data.season?.month ?? "month"}</h2><ArrowLink href="?tab=boards" className="room-tile__more">The board</ArrowLink></div>
        {data.season ? (
          <div className="you-season">
            <b className="you-streak__num">{data.season.place}<small> of {data.season.of}</small></b>
            <span>{data.season.points.toLocaleString("en-US")} points from live nights this month</span>
          </div>
        ) : (
          <GhostRows count={2} places notice={<p>Play {s.short} on a live night and your points this month show here.</p>} />
        )}
      </section>
      <Setups data={data} s={s} span={12} />
      {foot}
    </div>
  );
}

