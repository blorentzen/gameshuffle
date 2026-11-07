/**
 * Mario Kart's time trial challenges in a game space (spaces round three, picks 10 to 14): one tile under the
 * space's Combo of the day with two halves side by side, today's time trial and the week's Combo Cup, each with its
 * track(s), board and its own "add a time" (one tile instead of two stacked ones; Britton: too much stacking). The
 * halves share rows (subgrid), so their boards start on one line. Today's half names the Combo of the day instead of
 * drawing it again (it's right above); the Cup draws its own combo, and owns the week (the Combo of the day card
 * leaves its week strip out on cup weeks, so the Cup shows once).
 * Server component; adding a time opens the time trials' own add form in challenge mode (AddTimeButton), so the
 * screenshot, laps and clip steps are the ones players already know. Statuses come from the board times
 * (src/lib/spaces/spaceTt.ts). An empty board is a ghost whose first row is the notice.
 */

import Link from "next/link";
import { Badge } from "@empac/cascadeds";
import { UserAvatar } from "@/components/UserAvatar";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { AddTimeButton } from "@/components/timeTrials/AddTimeButton";
import { GhostRows } from "@/components/ui/Ghost";
import { PartArt } from "@/components/rolls/RollCard";
import { getImagePath } from "@/lib/images";
import { TT_GAMES, ttTrack } from "@/lib/timeTrials/tracks";
import { challengeTrackHref, cupBoard, dayBoard, ttChallenge, type EntryStatus, type TtChallengeInfo } from "@/lib/spaces/spaceTt";
import { spaceLevers } from "@/lib/spaces/challenges";
import { gsDay, gsWeekStart } from "@/lib/time/gsClock";
import type { GameSpace } from "@/lib/games/spaces";
import type { PersonAvatar } from "@/lib/home/people";
import "@/styles/time-trials.css";

type BadgeLook = { label: string; variant: "success" | "warning" | "default" | "info" };
const STATUS: Record<EntryStatus, BadgeLook> = {
  verified: { label: "Verified", variant: "success" },
  trusted: { label: "Trusted", variant: "info" },
  waiting: { label: "Clip waiting", variant: "warning" },
  screenshot: { label: "Screenshot", variant: "default" },
};

type Row = { key: string; place: number; avatar: PersonAvatar; name: string; username: string | null; you: boolean; value: string; badge: BadgeLook };

function Board({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <ol className="space-tt__rows" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={r.you ? "is-you" : undefined}>
          <span className="space-tt__place">{r.place || "·"}</span>
          <UserAvatar user={r.avatar} size={32} />
          <span className="space-tt__who">
            {r.username ? <Link href={`/u/${r.username}`} className="space-tt__name">{r.you ? "You" : r.name}</Link> : <span className="space-tt__name">{r.you ? "You" : r.name}</span>}
            <Badge variant={r.badge.variant} size="small">{r.badge.label}</Badge>
          </span>
          <span className="space-tt__time">{r.value}</span>
        </li>
      ))}
    </ol>
  );
}

function Combo({ ch, label }: { ch: TtChallengeInfo; label: string }) {
  return (
    <ul className="space-tt__combo" aria-label={label}>
      {ch.combo.slots.map((p) => <li key={p.label} title={`${p.label}: ${p.name}`}><PartArt slot={p} /><span className="sr-only">{p.label}: {p.name}</span></li>)}
    </ul>
  );
}

export async function TtChallengesTile({ s, viewerId }: { s: GameSpace; viewerId: string | null }) {
  const [day, week, lv] = await Promise.all([ttChallenge(s, "day").catch(() => null), ttChallenge(s, "week").catch(() => null), spaceLevers()]);
  if (!day && !week) return null;
  const [dayRows, cupRows] = await Promise.all([
    day ? dayBoard(s, viewerId).catch(() => []) : Promise.resolve([]),
    week ? cupBoard(s, viewerId, week.tracks).catch(() => []) : Promise.resolve([]),
  ]);
  const signedIn = !!viewerId;
  const back = `/games/${s.id}`;
  const track = day ? ttTrack(day.game, day.tracks[0]) : null;
  const game = (day ?? week)!.game;

  const dayShown = dayRows.slice(0, 3);
  const mine = dayRows.find((r) => r.you);
  if (mine && !dayShown.includes(mine)) dayShown.push(mine);
  const cupShown = cupRows.slice(0, 3);
  const myCup = cupRows.find((r) => r.you);
  if (myCup && !cupShown.includes(myCup)) cupShown.push(myCup);

  const daysLeft = 7 - Math.round((Date.parse(`${gsDay()}T12:00:00Z`) - Date.parse(`${gsWeekStart()}T12:00:00Z`)) / 86_400_000);
  const dayAdd = day && track ? (
    <AddTimeButton game={day.game} track={day.tracks[0]} signedIn={signedIn} returnTo={back} variant={mine ? "secondary" : "primary"} label={mine ? "Beat your time" : "Add your time"} title="Time trial of the day"
      challenge={{ space: s.id, kind: "day", tracks: day.tracks, combo: "today's combo" }}
      sheet={{ space: s.id, then: "tt-day", context: { title: "Time trial of the day", line: track.name, img: track.image } }} />
  ) : null;
  const cupAdd = week ? (
    <AddTimeButton game={week.game} signedIn={signedIn} returnTo={back} variant="secondary" label="Add a cup time" title="Combo Cup"
      challenge={{ space: s.id, kind: "week", tracks: week.tracks, combo: "this week's combo" }}
      sheet={{ space: s.id, then: "tt-cup", context: { title: "Combo Cup", line: `${week.tracks.length} tracks, this week's combo` } }} />
  ) : null;

  return (
    <section className="room-tile space-tt" aria-labelledby="sp-tt">
      <div className="room-tile__head">
        <h2 id="sp-tt">Time trial challenges</h2>
        <ArrowLink href={`/time-trials/${TT_GAMES[game].slug}`} className="room-tile__more">Time trials</ArrowLink>
      </div>
      <div className="space-tt__pair">
        {day && track && (
          <div className="space-tt__half">
            <div className="space-tt__top">
              {track.image && (
                <Link href={challengeTrackHref(day.game, track.id) ?? "#"} className="space-tt__thumb" aria-label={`${track.name}'s board`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- our course art */}
                  <img src={getImagePath(track.image)} alt="" />
                </Link>
              )}
              <div className="space-tt__what">
                <h3>Today: {track.name}</h3>
                <span>150cc · Mushrooms · the Combo of the day</span>
              </div>
            </div>
            {dayShown.length ? (
              <div className="space-tt__board">
                <Board label="Today's board" rows={dayShown.map((r) => ({ key: r.userId, place: r.place, avatar: r.avatar, name: r.name, username: r.username, you: r.you, value: r.time, badge: STATUS[r.status] }))} />
                <div className="space-tt__act">{dayAdd}</div>
              </div>
            ) : (
              <GhostRows count={3} notice={<><p>No times yet today. <b>The first one leads the board.</b></p>{dayAdd}</>} />
            )}
          </div>
        )}
        {week && (
          <div className="space-tt__half" id="sp-cup">
            <div className="space-tt__top">
              <ul className="space-tt__thumb space-tt__tracks" aria-label="The cup's tracks">
                {week.tracks.map((id) => {
                  const t = ttTrack(week.game, id);
                  return t ? (
                    <li key={id}>
                      <Link href={challengeTrackHref(week.game, id) ?? "#"} title={t.name} aria-label={`${t.name}'s board`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- our course art */}
                        {t.image ? <img src={getImagePath(t.image)} alt="" /> : <span>{t.name}</span>}
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="space-tt__what">
                <h3>Combo Cup</h3>
                <span>Four tracks, lowest total wins · {daysLeft <= 1 ? "last day" : `${daysLeft} days left`}</span>
                <Combo ch={week} label="This week's combo" />
              </div>
            </div>
            {cupShown.length ? (
              <div className="space-tt__board">
                <Board label="Combo Cup standings" rows={cupShown.map((r) => ({
                  key: r.userId, place: r.place, avatar: r.avatar, name: r.name, username: r.username, you: r.you,
                  value: r.tracks === week.tracks.length ? r.total : `${r.tracks} of ${week.tracks.length}`,
                  badge: r.tracks === week.tracks.length ? (r.verified ? STATUS.verified : { label: "Clips waiting", variant: "warning" }) : { label: "Tracks to go", variant: "default" },
                }))} />
                <div className="space-tt__act">{cupAdd}</div>
              </div>
            ) : (
              <GhostRows count={3} notice={<><p>No cup times yet this week. <b>Post one on any of the four tracks.</b></p>{cupAdd}</>} />
            )}
          </div>
        )}
      </div>
      <p className="space-tt__foot">
        {`Every time needs a result screenshot, and the day's top three and the cup's top ten add a clip. ${lv.ttEntry > 0 ? `${lv.ttEntry} tokens for a day's time; ` : ""}${lv.ttDay.join("/")} for the day's top three and ${lv.cup.join("/")} for the cup's, paid once their clips are checked.`}
      </p>
    </section>
  );
}
