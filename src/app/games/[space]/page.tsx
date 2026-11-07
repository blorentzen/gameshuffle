/**
 * A game space (game spaces picks 2026-11-05, all A, https://claude.ai/artifact/YBhN8GBidm9XpEkx78EbWw; phone picks
 * the same day, all A, https://claude.ai/artifact/VT2Zwk5BNHYPwMBFBcqpEb): one game's community in one place.
 *
 * A cover that's only the game's art, then the space on the page: box art on the cover's edge, the name, members and
 * who's online, Join. Tabs picked for the game stay at the top as you scroll; on a phone the header folds into a slim
 * title bar. Now uses the room's zones (what's happening in 8 columns, your slice and the people in a rail of 4);
 * every other tab is one kind of thing at full width.
 *
 * Out of search (noindex): the tools that earn search keep their pages (picks 10A). Until its opening day
 * (`opens` in src/lib/games/spaces.ts) only staff can open it.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";
import { spaceById, spaceOpen, SPACE_TAB_LABEL, type GameSpace, type SpaceTab } from "@/lib/games/spaces";
import { spaceCounts, spaceCrews, spaceEvents, spaceHappening, spaceJoined, spacePeople, spaceYou, type SpaceYou } from "@/lib/games/spaceData";
import { recordsThisWeek, climbersThisWeek } from "@/lib/competitive/hub";
import { trackSummary } from "@/lib/timeTrials/store";
import { ttTrack, trackPath } from "@/lib/timeTrials/tracks";
import { formatTime } from "@/lib/timeTrials/rules";
import { describePlayers } from "@/lib/daily/boards";
import { boardRows } from "@/lib/lounge/store";
import { medalSrc } from "@/lib/mmr/medals";
import { divisionLook } from "@/lib/mmr/look";
import { HappeningCard } from "@/components/home/HappeningBand";
import type { Happening } from "@/lib/home/happening";
import { StickyRail } from "@/components/home/StickyRail";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { PeopleList } from "@/components/people/PersonRow";
import { RankList, type RankRow } from "@/components/boards/RankList";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { VisitorKeeps } from "@/components/games/VisitorKeeps";
import { SpaceYouPanel } from "@/components/games/SpaceYouPanel";
import { spaceYouTab } from "@/lib/games/spaceYouTab";
import { isProUser } from "@/lib/subscription-server";
import { NewMemberSheet } from "@/components/games/JoinSheet";
import { SpaceJoin } from "@/components/games/SpaceJoin";
import { SpaceTabs, type SpaceTabItem } from "@/components/games/SpaceTabs";
import { SpaceSubTabs } from "@/components/games/SpaceSubTabs";
import { SpaceTitleBar } from "@/components/games/SpaceTitleBar";
import { SpacePosts } from "@/components/games/SpacePosts";
import { CardShelf, DailiesPanel, DailiesToday, RoadPanel, CardsPanel, NightsPanel, SeasonBoard } from "@/components/games/SpaceGamePanels";
import { SpaceRolls } from "@/components/rolls/SpaceRolls";
import { RollingNow, type RollingCard } from "@/components/rolls/RollingNow";
import { spaceRolls, spaceSeason } from "@/lib/games/spaceData";
import { challengeView } from "@/lib/spaces/challenges";
import { SpaceToday } from "@/components/spaces/SpaceToday";
import { TtChallengesTile } from "@/components/spaces/SpaceTt";
import { GhostCard, GhostCards, GhostRows } from "@/components/ui/Ghost";
import { UserAvatar } from "@/components/UserAvatar";
import { spaceRoller } from "@/lib/rolls/spaceRoll";
import { MerchShelf } from "@/components/store/ShopEntry";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { PostLines } from "@/components/social/PostLines";
import { RankBlock, type RankLine } from "@/components/rank/RankBlock";
import { profileMmr } from "@/lib/mmr/store";
import { profileRows } from "@/lib/mmr/profileCard";

import { listGameFeed, postLine, type FeedPost } from "@/lib/social/feed";
import { gameEntry } from "@/lib/games/key";
import "@/styles/happening.css";
import "@/styles/home-room.css";
import "@/styles/game-space.css";

/** The tabs built so far; a space's others (posts, dailies, road, cards, nights) arrive with their steps. */
const BUILT: SpaceTab[] = ["now", "you", "rolls", "boards", "events", "lounge", "people", "posts", "dailies", "road", "cards", "nights"];

export async function generateMetadata({ params }: { params: Promise<{ space: string }> }): Promise<Metadata> {
  const s = spaceById((await params).space);
  if (!s) return {};
  return {
    title: `${s.name} players, events and boards`,
    description: `Who's playing ${s.name} on GameShuffle right now, what's coming up, and this week's boards.`,
    robots: { index: false, follow: true },
  };
}

const medal = (division: string | null) => (division ? medalSrc(divisionLook(division).base) : null);

function YouChips({ s, you }: { s: GameSpace; you: SpaceYou }) {
  const chips = [
    you.lounge && (
      <li key="lounge"><Link href={you.lounge.href} className="space-chip">
        {/* eslint-disable-next-line @next/next/no-img-element -- MKCentral's division medal (credited on the lounge pages) */}
        {medal(you.lounge.division) && <img src={medal(you.lounge.division)!} alt="" className="space-chip__medal" />}
        <b>{you.lounge.mmr?.toLocaleString("en-US") ?? "Placement"}</b><span>{you.lounge.division ?? "Lounge"}</span>
      </Link></li>
    ),
    you.best && (
      <li key="best"><Link href={you.best.href} className="space-chip">
        {/* eslint-disable-next-line @next/next/no-img-element -- our course art */}
        {you.best.image && <img src={you.best.image} alt="" className="space-chip__course" />}
        <b>{you.best.time}</b><span>{you.best.track}</span>
      </Link></li>
    ),
    you.build && (
      <li key="build"><Link href={you.build.href} className="space-chip">
        {/* eslint-disable-next-line @next/next/no-img-element -- our racer art */}
        <img src={you.build.character.img} alt="" className="space-chip__racer" />
        <b>Your build</b><span>{you.build.character.name}</span>
      </Link></li>
    ),
  ].filter(Boolean);
  if (!chips.length) {
    if (!s.tt) return null;
    return <p className="space-you__none"><ArrowLink href={`/time-trials/${s.id}`}>Add a time</ArrowLink> and it shows here, with your lounge and your saved build.</p>;
  }
  return <ul className="space-you" aria-label={`You in ${s.name}`}>{chips}</ul>;
}

export default async function GameSpacePage({ params, searchParams }: { params: Promise<{ space: string }>; searchParams: Promise<{ part?: string }> }) {
  const s = spaceById((await params).space);
  const part = (await searchParams).part ?? null;
  if (!s) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user ? ((await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle()).data as { role: string | null } | null)?.role ?? null : null;
  const open = spaceOpen(s, gsDay());
  if (!open && !isStaffRole(role)) notFound();
  const viewerId = user?.id ?? null;
  // Boards: time trials and the lounge for Mario Kart, this month's GameShuffle points for the rest.
  // You sits second, right after Now, so it's in view on a phone (journeys picks 2026-11-06, step 6, 1A).
  const tabs = ["now" as SpaceTab, "you" as SpaceTab, ...s.tabs.filter((t) => t !== "now")]
    .filter((t) => BUILT.includes(t) && (t !== "lounge" || !!s.lounge?.length) && (t !== "rolls" || !!spaceRoller(s)));

  const roller = spaceRoller(s);
  // The shop (round two picks 8A, 9A): merch shows while visitors can see the shop; staff see it before.
  const shopShown = (await shopVisibleToVisitors().catch(() => false)) || isStaffRole(role);
  const merchHere = shopShown && s.id !== "pokemon";
  const [counts, happening, people, crews, events, you, joined, records, climbers, tracks, board, posts, myCard, rolling, rollPosts, season, today] = await Promise.all([
    spaceCounts(s),
    spaceHappening(s, 3).catch(() => [] as Happening[]),
    spacePeople(s, viewerId, 48).catch(() => []),
    spaceCrews(s).catch(() => []),
    spaceEvents(s).catch(() => []),
    viewerId ? spaceYou(s, viewerId).catch(() => null) : Promise.resolve(null),
    viewerId ? spaceJoined(s, viewerId).catch(() => false) : Promise.resolve(false),
    s.tt ? recordsThisWeek(4, [s.tt]) : Promise.resolve([]),
    s.lounge?.length ? climbersThisWeek(10, s.lounge) : Promise.resolve(null),
    s.tt ? trackSummary(s.tt, "shrooms", "any").catch(() => []) : Promise.resolve([]),
    s.lounge?.length ? boardRows(s.lounge[0], "everyone", viewerId, 25).catch(() => ({ rows: [], country: null })) : Promise.resolve({ rows: [], country: null }),
    s.tabs.includes("posts") ? listGameFeed({ games: s.games, viewerId, limit: 20 }).catch(() => [] as FeedPost[]) : Promise.resolve([] as FeedPost[]),
    viewerId && s.lounge?.length ? profileMmr(viewerId).catch(() => null) : Promise.resolve(null),
    roller ? spaceRolls(s, viewerId).catch(() => []) : Promise.resolve([]),
    roller ? listGameFeed({ games: s.games, viewerId, limit: 20, kind: "roll" }).catch(() => [] as FeedPost[]) : Promise.resolve([] as FeedPost[]),
    s.tabs.includes("boards") && !s.tt && !s.lounge?.length ? spaceSeason(s, viewerId, 3).catch(() => null) : Promise.resolve(null),
    challengeView(s, viewerId).catch(() => null),
  ]);
  const [youTab, pro] = viewerId
    ? await Promise.all([spaceYouTab(s, viewerId).catch(() => null), s.id === "pokemon" ? isProUser(viewerId).catch(() => false) : Promise.resolve(false)])
    : [null, false];
  const rollingCards: RollingCard[] = rolling;
  const rollFull = { href: s.main.href, label: s.tt ? "Tracks, items and up to 12 racers: the full randomizer" : "The full randomizer" };
  const seasonRows: RankRow[] = (season?.rows ?? []).map((r, i) => ({
    key: r.userId, place: i + 1, name: r.name, href: r.username ? `/u/${r.username}` : undefined, you: r.you, line: r.rank,
    value: `${r.points.toLocaleString("en-US")} pts`, pic: <UserAvatar user={r.avatar} size={32} />,
  }));
  const postGame = { key: s.primary, name: gameEntry(s.primary)?.name ?? s.name };

  const playing = people.filter((p) => p.online || p.live);
  // Online counts anyone around in the last five minutes, and anyone live on Twitch in this game.
  const online = Math.max(counts.online, playing.length);
  // Happening now fills its row: this week's first, then the next ones coming up.
  const now = [...happening, ...events.filter((e) => !happening.some((h) => h.id === e.id))].slice(0, 3);

  // ── Boards ────────────────────────────────────────────────────────────────
  const topTracks = tracks.filter((t) => t.cc === 150).sort((a, b) => b.players - a.players).slice(0, 12);
  const holders = topTracks.length ? await describePlayers([...new Set(topTracks.map((t) => t.recordPlayer))]).catch(() => new Map()) : new Map();
  const trackRows: RankRow[] = topTracks.flatMap((x) => {
    const t = ttTrack(s.tt!, x.track);
    if (!t) return [];
    return [{
      key: `${x.track}-${x.cc}`, name: t.name, href: trackPath(t, x.cc),
      // eslint-disable-next-line @next/next/no-img-element -- our course art
      pic: t.image ? <img src={t.image} alt="" className="rank-row__course" /> : null,
      line: `Record ${formatTime(x.recordMs)}, ${holders.get(x.recordPlayer)?.name ?? "a player"}`,
      value: `${x.players.toLocaleString("en-US")} ${x.players === 1 ? "time" : "times"}`,
    }];
  });
  const recordRows: RankRow[] = records.map((r) => ({
    key: `${r.track}-${r.at}`, name: r.track, href: r.href, line: `${r.holder} · ${formatTime(r.timeMs)}`,
    // eslint-disable-next-line @next/next/no-img-element -- our course art
    pic: r.image ? <img src={r.image} alt="" className="rank-row__course" /> : null,
    tag: r.record ? <span className="rank-tag">Record</span> : <span className="rank-row__line">{r.place} of {r.total}</span>,
  }));
  const climberRows: RankRow[] = (climbers ?? []).map((c, i) => ({
    key: `${c.name}-${c.game}`, place: i + 1, name: c.name, href: c.href, line: [c.division, c.mmr?.toLocaleString("en-US")].filter(Boolean).join(" · "),
    // eslint-disable-next-line @next/next/no-img-element -- MKCentral's division medal (credited on the lounge pages)
    pic: medal(c.division) ? <img src={medal(c.division)!} alt="" className="rank-row__medal" /> : null,
    tag: <span className="rank-up">+{c.climbed.toLocaleString("en-US")}</span>,
  }));
  const loungeRows: RankRow[] = board.rows.map((r, i) => ({
    key: r.userId, place: i + 1, name: r.name, you: r.me, href: `/lounge/${encodeURIComponent(r.name)}?game=${s.lounge![0]}`,
    line: r.division ?? "Placement",
    // eslint-disable-next-line @next/next/no-img-element -- MKCentral's division medal (credited on the lounge pages)
    pic: medal(r.division) ? <img src={medal(r.division)!} alt="" className="rank-row__medal" /> : null,
    value: r.mmr?.toLocaleString("en-US") ?? "",
    tag: r.week ? <span className={r.week > 0 ? "rank-up" : "rank-row__line"}>{r.week > 0 ? "+" : ""}{r.week.toLocaleString("en-US")}</span> : null,
  }));

  const cards = (list: typeof happening, from: string) => (
    <ul className="space-cards">{list.map((h, k) => <li key={h.id}><HappeningCard h={h} from={from} k={k} /></li>)}</ul>
  );

  const playingTile = (
    <section className="room-tile room-rail__block" aria-labelledby="sp-playing">
      <div className="room-tile__head">
        {/* Nobody around: the rail shows who was here last, under a heading that says so. */}
        <h2 id="sp-playing">{playing.length ? "Playing now" : "Recently here"}</h2>
        {online > 0 && <span className="space-count">{online.toLocaleString("en-US")} online</span>}
      </div>
      {playing.length ? <PeopleList people={playing.slice(0, 5)} /> : people.length ? <PeopleList people={people.slice(0, 3)} /> : <p className="room-tile__note">Nobody here yet. Join and you&apos;ll be the first.</p>}
      {people.length > 0 && <ArrowLink plain href="?tab=people" className="room-tile__more space-more">Everyone here</ArrowLink>}
    </section>
  );
  const crewsTile = (id: string) => crews.length > 0 && (
    <section className="room-tile room-rail__block" aria-labelledby={id}>
      <div className="room-tile__head"><h2 id={id}>Crews</h2></div>
      <RankList numbered={false} label={`Crews in ${s.name}`} rows={crews.map((c) => ({
        key: c.id, name: c.name, href: `/c/${c.slug}`, line: `${c.members} ${c.members === 1 ? "member" : "members"}`,
        pic: <span className="space-crest" aria-hidden="true">{c.name.slice(0, 2).toUpperCase()}</span>,
      }))} />
    </section>
  );
  const toolsTile = (
    <section className="room-tile room-rail__block" aria-labelledby="sp-tools">
      <div className="room-tile__head"><h2 id="sp-tools">Tools</h2></div>
      <ul className="space-tools">{s.tools.map((t) => <li key={t.href + t.label}><ArrowLink href={t.href}>{t.label}</ArrowLink></li>)}</ul>
    </section>
  );

  const railRoll = rollingCards.length === 0 && !!roller;
  const nowPanel = (
    <div className="space-now">
    <div className="room-zones space-zones">
      <div className="room-zone room-zone--today">
        {you && <YouChips s={s} you={you} />}
        {/* Visitors: what a free account keeps here, as dashed slots, and Join free (journeys 3A). */}
        {!viewerId && <VisitorKeeps space={s.id} name={s.name} />}
        {/* The thing of the day and of the week (round three): first, except on Pokémon, whose dailies come first. */}
        {today && s.id !== "pokemon" && <SpaceToday space={s.id} spaceName={s.name} initial={today} signedIn={!!viewerId} accent={s.accent} />}
        {s.tt && <TtChallengesTile s={s} viewerId={viewerId} />}
        {s.tabs.includes("dailies") && <DailiesToday />}
        {today && s.id === "pokemon" && <SpaceToday space={s.id} spaceName={s.name} initial={today} signedIn={!!viewerId} accent={s.accent} />}
        <section className="room-tile" aria-labelledby="sp-now">
          <div className="room-tile__head">
            <h2 id="sp-now">Happening now</h2>
            {events.length > 0 && <ArrowLink plain href="?tab=events" className="room-tile__more">All events</ArrowLink>}
          </div>
          {now.length ? (
            // On phones the events swipe instead of stacking three tall cards (other spaces pass, 2026-11-06).
            <ResponsiveCarousel className="space-cards" label={`Happening in ${s.name}`}>
              {now.map((h, k) => <div key={h.id} className="space-cards__item"><HappeningCard h={h} from={`space-${s.id}`} k={k} /></div>)}
              {/* Fewer events than the row fits: the open slot says how to fill it. */}
              {now.length < 3 && (
                <div className="space-cards__item">
                  <GhostCard>
                    <p><b>Running something?</b> Tournaments and game nights for {s.short} show here.</p>
                    <div className="space-actions">
                      <Link href="/tournament/create" className="room-btn room-btn--ghost">Run a tournament</Link>
                      <Link href="/game-nights/create" className="room-btn room-btn--ghost">Host a game night</Link>
                    </div>
                  </GhostCard>
                </div>
              )}
            </ResponsiveCarousel>
          ) : (
            <GhostCards count={3} notice={<>
              <p>Nothing on in {s.short} this month yet. <b>Start something</b> and it shows here for everyone in the space.</p>
              <div className="space-actions">
                <Link href="/tournament/create" className="room-btn">Run a tournament</Link>
                <Link href="/game-nights/create" className="room-btn room-btn--ghost">Host a game night</Link>
              </div>
            </>} />
          )}
        </section>
        {/* Rolls people shared; while there are none, the roll itself sits in the rail (round two pick). */}
        {rollingCards.length > 0 && (
          <section className="room-tile" aria-labelledby="sp-rolling">
            <div className="room-tile__head">
              <h2 id="sp-rolling">Rolling now</h2>
              <ArrowLink plain href="?tab=rolls" className="room-tile__more">Roll for me</ArrowLink>
            </div>
            <RollingNow items={rollingCards} label={`Rolls in ${s.name}`} />
          </section>
        )}
      </div>
      <StickyRail blocks={2 + (crews.length ? 1 : 0) + (railRoll ? 1 : 0)}>
        {playingTile}
        {railRoll && <SpaceRolls only="roll" space={s.id} gameName={s.name} rollLabel={s.main.label} initialPosts={[]} currentUserId={viewerId} full={rollFull} />}
        {crewsTile("sp-crews")}
        {toolsTile}
      </StickyRail>
      {(recordRows.length > 0 || climberRows.length > 0 || seasonRows.length > 0 || s.tabs.includes("posts")) && (
        <div className="room-zone room-zone--main room-grid">
          {seasonRows.length > 0 && (
            <section className="room-tile" style={{ "--span": 12 } as CSSProperties} aria-labelledby="sp-month">
              <div className="room-tile__head">
                <h2 id="sp-month">{season?.month ? `${season.month} on the board` : "This month on the board"}</h2>
                <ArrowLink plain href="?tab=boards" className="room-tile__more">The board</ArrowLink>
              </div>
              <RankList label={`This month's points in ${s.name}`} rows={seasonRows} />
            </section>
          )}
          {(recordRows.length > 0 || climberRows.length > 0) && <section className="room-tile" style={{ "--span": 12 } as CSSProperties} aria-labelledby="sp-week">
            <div className="room-tile__head">
              <h2 id="sp-week">This week on the boards</h2>
              <ArrowLink plain href="?tab=boards" className="room-tile__more">All boards</ArrowLink>
            </div>
            <div className="space-two">
              {recordRows.length > 0 && <div className="space-col"><h3 className="room-kicker">Time trials</h3><RankList numbered={false} rows={recordRows} label="New times this week" /></div>}
              {climberRows.length > 0 && <div className="space-col"><h3 className="room-kicker">Lounge: climbing</h3><RankList rows={climberRows.slice(0, 4)} label="Climbing the lounge this week" /></div>}
            </div>
          </section>}
          {s.tabs.includes("posts") && (
            <section className="room-tile" style={{ "--span": 12 } as CSSProperties} aria-labelledby="sp-posts">
              <div className="room-tile__head">
                <h2 id="sp-posts">From the community</h2>
                <ArrowLink plain href="?tab=posts" className="room-tile__more">{posts.length ? "All posts" : "Post"}</ArrowLink>
              </div>
              {posts.length ? (
                <PostLines label={`Latest posts about ${s.name}`} posts={posts.slice(0, 3).map((p) => ({ id: p.id, author: p.author, text: postLine(p), createdAt: p.createdAt, href: `/community/post/${p.id}` }))} />
              ) : (
                <GhostRows count={3} places={false} lines notice={<>
                  <p>Nobody has posted in {s.short} yet. <b>Clips, wins, questions, a game night you&apos;re planning:</b> it all goes here.</p>
                  <div className="space-actions"><Link href="?tab=posts" className="room-btn room-btn--ghost">Write the first post</Link></div>
                </>} />
              )}
            </section>
          )}
        </div>
      )}
    </div>
      {/* The merch shelf: its own full-width row under both columns of Now, outside their grid so the sticky rail
          never slides over it (merch pass, 2026-11-06). */}
      {s.id === "pokemon" ? <CardShelf className="space-shelf" /> : merchHere && <MerchShelf prefer={s.merch} line="GameShuffle merch, made when you order." className="space-shelf" preview={isStaffRole(role)} />}
    </div>
  );

  const boardsPanel = !s.tt && !s.lounge?.length ? <SeasonBoard s={s} viewerId={viewerId} /> : (
    <section className="room-tile space-panel" aria-label="Boards">
      <SpaceSubTabs tabs={[
        ...(trackRows.length ? [{ id: "tt", label: "Time trials", content: (
          <div className="space-panel__body">
            <RankList numbered={false} rows={trackRows} label="Most raced tracks" />
            <ArrowLink href={`/time-trials/${s.id}`}>Every track&apos;s board</ArrowLink>
          </div>
        ) }] : []),
        ...(loungeRows.length ? [{ id: "lounge", label: "Lounge", content: (
          <div className="space-panel__body">
            <p className="room-tile__note">Players who confirmed their lounge name on GameShuffle.</p>
            <RankList rows={loungeRows} label="Lounge players on GameShuffle" />
            <ArrowLink href={`/lounge?game=${s.lounge![0]}`}>The whole lounge</ArrowLink>
          </div>
        ) }] : []),
      ]} />
    </section>
  );

  const eventsPanel = (
    <div className="space-stack">
      <div className="space-actions">
        <Link href="/tournament/create" className="room-btn">Run a tournament</Link>
        <Link href="/game-nights/create" className="room-btn room-btn--ghost">Host a game night</Link>
      </div>
      {events.length ? cards(events, `space-${s.id}-events`) : <p className="room-tile__note">Nothing coming up in the next month yet.</p>}
    </div>
  );

  // Your rank (the profile's Rank block, yours here): on the Lounge tab and the You tab.
  const rankBlock = s.lounge?.length ? (() => {
          // Your rank (the profile's Rank block, yours here): your MMR card when it's for this game and you show it.
          const card = myCard && s.lounge.includes(myCard.view.game) ? myCard : null;
          // Your card here shows what you picked for your profile in the studio (round two picks 4A).
          const lines: RankLine[] = card ? profileRows(card.view, card.look.profile) : [];
          if (!card && you?.lounge) lines.push({ label: you.lounge.division ?? "Placement", value: you.lounge.mmr?.toLocaleString("en-US") ?? "", href: you.lounge.href });
          return (
            <RankBlock
              id="sp-mylounge" title="Your rank" look="room"
              mmr={card ? { view: card.view, look: card.look, last10: card.look.profile.last10 } : null}
              lines={lines}
              note={!card && !you?.lounge ? <p className="room-tile__note">Confirm your lounge name with Discord and your MMR shows here.</p> : undefined}
              links={[
                ...(you?.lounge ? [{ href: you.lounge.href, label: "Your lounge page" }] : [{ href: "/lounge", label: "Confirm your lounge name" }]),
                { href: "/mmr-card", label: card ? "Change your MMR card" : "Make your MMR card" },
              ]}
            />
          );
        })() : null;

  const loungePanel = s.lounge?.length ? (
    <div className="room-zones space-zones">
      <div className="room-zone room-zone--today">
        <section className="room-tile" aria-labelledby="sp-climb">
          <div className="room-tile__head"><h2 id="sp-climb">Climbing this week</h2><ArrowLink href={`/lounge?game=${s.lounge[0]}`} className="room-tile__more">The lounge</ArrowLink></div>
          {climberRows.length ? <RankList rows={climberRows} label="Climbing the lounge this week" /> : <p className="room-tile__note">The lounge isn&apos;t answering right now.</p>}
        </section>
      </div>
      <StickyRail blocks={1}>
        {rankBlock}
      </StickyRail>
    </div>
  ) : null;

  const peoplePanel = (
    <div className="room-zones space-zones">
      <div className="room-zone room-zone--today">
        <section className="room-tile" aria-labelledby="sp-people">
          <div className="room-tile__head"><h2 id="sp-people">Everyone here</h2><span className="space-count">{counts.members.toLocaleString("en-US")} members</span></div>
          {people.length ? <PeopleList people={people} /> : <p className="room-tile__note">Nobody here yet.</p>}
        </section>
      </div>
      <StickyRail blocks={1}>
        {crewsTile("sp-crews-all") || (
          <section className="room-tile room-rail__block" aria-labelledby="sp-crews-none">
            <div className="room-tile__head"><h2 id="sp-crews-none">Crews</h2></div>
            <p className="room-tile__note">No crews in {s.name} yet.</p>
          </section>
        )}
      </StickyRail>
    </div>
  );

  const postsPanel = <SpacePosts space={s.id} game={postGame} initialPosts={posts} currentUserId={viewerId} />;

  const panel: Partial<Record<SpaceTab, React.ReactNode>> = {
    now: nowPanel,
    you: <SpaceYouPanel s={s} data={youTab} rank={rankBlock} part={part} isPro={pro} />,
    boards: boardsPanel, events: eventsPanel, lounge: loungePanel, people: peoplePanel, posts: postsPanel,
    dailies: <DailiesPanel viewerId={viewerId} />,
    road: <RoadPanel viewerId={viewerId} />,
    cards: <CardsPanel />,
    nights: <NightsPanel nights={events.filter((e) => e.world === "host")} />,
    rolls: roller ? (
      <SpaceRolls space={s.id} gameName={s.name} rollLabel={s.main.label} initialPosts={rollPosts} currentUserId={viewerId} full={rollFull} />
    ) : null,
  };
  const items: SpaceTabItem[] = tabs.flatMap((t) => (panel[t] ? [{ id: t, label: SPACE_TAB_LABEL[t], content: panel[t] }] : []));
  const signedIn = !!viewerId;
  const accent = { "--space-accent": s.accent } as CSSProperties;

  return (
    <main className="space-page" style={accent}>
      {/* A brand-new account back from the sign-up sheet: "What brings you here?" (journeys 4A). */}
      {signedIn && <NewMemberSheet />}
      <header className="space-cover" aria-hidden="true">
        {s.hero && (
          // eslint-disable-next-line @next/next/no-img-element -- the game's key art (ours or our CDN)
          <img className="space-cover__img" src={s.hero} alt="" />
        )}
      </header>
      <section className="space-id" id="space-id" aria-labelledby="space-name">
        <Container>
          <div className="space-id__inner">
            {s.box && (
              // eslint-disable-next-line @next/next/no-img-element -- the publisher's cover (box art)
              <img className="space-id__box" src={s.box} alt="" />
            )}
            <div className="space-id__who">
              <h1 id="space-name">{s.name}</h1>
              <p className="space-id__counts">
                <span><b>{counts.members.toLocaleString("en-US")}</b> {counts.members === 1 ? "member" : "members"}</span>
                {online > 0 && <span><b>{online.toLocaleString("en-US")}</b> online now</span>}
              </p>
            </div>
            <div className="space-id__acts">
              <SpaceJoin space={s.id} name={s.name} joined={joined} signedIn={signedIn} />
              <Link href={roller ? "?tab=rolls" : s.main.href} className="room-btn room-btn--ghost space-id__roll">{s.main.label}</Link>
            </div>
          </div>
          {!open && <p className="space-preview">Staff preview: only staff can see this space until its opening day is set.</p>}
        </Container>
      </section>
      <SpaceTitleBar watch="space-id">
        {s.box && (
          // eslint-disable-next-line @next/next/no-img-element -- box art
          <img src={s.box} alt="" className="space-bar__box" />
        )}
        <b className="space-bar__name">{s.name}</b>
        <SpaceJoin space={s.id} name={s.name} joined={joined} signedIn={signedIn} size="small" />
      </SpaceTitleBar>
      <Container>
        <div className="space-body">
          <SpaceTabs tabs={items} space={s.id} />
        </div>
      </Container>
    </main>
  );
}
