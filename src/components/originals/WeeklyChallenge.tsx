"use client";

/**
 * The Weekly Challenge (a GameShuffle Original) at /weekly. This week's Tier
 * War (rank six items S to D; the crowd's ranking is revealed next Monday), the
 * shared agenda for game nights, and last week's reveal and leaderboard.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { TIERS } from "@/lib/originals/tierWars";
import { BADGE_RANK, type WeeklyItem } from "@/lib/originals/weekly";
import type { BoardRow } from "@/lib/weekly/store";

type Ballot = Record<string, number>;

interface WeeklyData {
  ready: boolean;
  signedIn: boolean;
  current?: {
    week: string; number: number; title: string; items: WeeklyItem[];
    agenda: { title: string; text: string } | null; players: number; revealAt: string; myBallot: Ballot | null;
  };
  last?: null | {
    week: string; number: number; title: string; items: WeeklyItem[]; crowd: Record<string, number>; players: number;
    board: BoardRow[];
    me: null | { rank: number | null; total: number | null; tierScore: number | null; agendaPoints: number; ballot: Ballot | null };
  };
}

function revealDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function ItemName({ it }: { it: WeeklyItem }) {
  return (
    <>
      {it.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.image} alt="" className="tierwars__img" loading="lazy" />
      )}
      {it.label}
    </>
  );
}

export function WeeklyChallenge() {
  const toast = useToast();
  const [data, setData] = useState<WeeklyData | null>(null);
  const [draft, setDraft] = useState<Ballot>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/weekly", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive && d?.ok) setData(d as WeeklyData); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data) return <p className="party-muted">Loading this week&apos;s challenge…</p>;
  if (!data.ready || !data.current) {
    return <Alert variant="info" title="The Weekly Challenge is almost here">It needs one more update on our side. Check back soon.</Alert>;
  }

  const c = data.current;
  const ranks: Ballot = { ...(c.myBallot ?? {}), ...draft };
  const complete = c.items.every((it) => ranks[it.id] !== undefined);
  const changed = Object.keys(draft).some((k) => draft[k] !== c.myBallot?.[k]);

  const lockIn = async () => {
    setBusy(true);
    const res = await fetch("/api/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ballot: ranks }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setData({ ...data, current: { ...c, myBallot: d.ballot, players: d.players } });
      setDraft({});
      toast.success(c.myBallot ? "Ranking updated" : "Ranking locked in");
    } else toast.error(d?.error === "closed" ? "This week has closed." : "Couldn't save your ranking. Try again.");
  };

  const last = data.last;

  return (
    <div className="weekly">
      <section className="weekly__card">
        <div className="weekly__head">
          <Badge variant="info" size="small">Week {c.number}</Badge>
          <span className="party-muted">{c.players} {c.players === 1 ? "player" : "players"} so far · the crowd&apos;s ranking is revealed {revealDay(c.revealAt)}</span>
        </div>
        <h2 className="weekly__title">Tier War: {c.title}</h2>
        <p className="party-muted">Rank all six from S to D. You score a point for every one you put where the crowd does. You can change your ranking until the week ends.</p>

        <ul className="tierwars__list">
          {c.items.map((it) => (
            <li key={it.id} className="tierwars__item">
              <span className="tierwars__name"><ItemName it={it} /></span>
              <span className="tierwars__chips" role="group" aria-label={`Tier for ${it.label}`}>
                {TIERS.map((t, i) => (
                  <Chip key={t} clickable={data.signedIn} selected={ranks[it.id] === i} variant={ranks[it.id] === i ? "primary" : "default"} label={t}
                    onClick={data.signedIn ? () => setDraft((d) => ({ ...d, [it.id]: i })) : undefined} />
                ))}
              </span>
            </li>
          ))}
        </ul>

        {data.signedIn ? (
          <span className="party-row">
            <Button variant="primary" disabled={busy || !complete || (!!c.myBallot && !changed)} onClick={() => void lockIn()}>
              {c.myBallot ? (changed ? "Update my ranking" : "Locked in") : "Lock in my ranking"}
            </Button>
            {!complete && <span className="party-muted">Give every item a tier first.</span>}
          </span>
        ) : (
          <p><Link href="/login?redirect=/weekly">Sign in</Link> to play. Your result goes on the leaderboard and a top-10 week shows on your profile.</p>
        )}
      </section>

      {c.agenda && (
        <section className="weekly__card">
          <span className="weekly__eyebrow">At game nights this week</span>
          <h2 className="weekly__title">{c.agenda.title}</h2>
          <p>{c.agenda.text.replace("{player}", "you")}</p>
          <p className="party-muted">Every <Link href="/help/apps/live-game-nights">live game night</Link> this week deals this mission. When your table confirms you did it, it adds 3 to your week.</p>
        </section>
      )}

      {last && (
        <section className="weekly__card">
          <span className="weekly__eyebrow">Last week&apos;s reveal · week {last.number}</span>
          <h2 className="weekly__title">The crowd ranked {last.title.toLowerCase()}</h2>
          <div className="tierwars__board">
            {TIERS.map((t, i) => {
              const inTier = last.items.filter((it) => last.crowd[it.id] === i);
              return (
                <div key={t} className="tierwars__row">
                  <span className={`tierwars__tier tierwars__tier--${t.toLowerCase()}`}>{t}</span>
                  <span className="tierwars__tiles">
                    {inTier.length ? inTier.map((it) => (
                      <span key={it.id} className={`tierwars__tile${last.me?.ballot?.[it.id] === i ? " tierwars__tile--match" : ""}`}><ItemName it={it} /></span>
                    )) : <span className="party-muted">Nothing</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {last.me?.rank && (
            <p className="weekly__me">
              You finished <strong>#{last.me.rank}</strong> of {last.players} with {last.me.total} {last.me.total === 1 ? "point" : "points"}
              {" "}({[
                last.me.tierScore !== null ? `${last.me.tierScore} from the Tier War` : null,
                last.me.agendaPoints ? `${last.me.agendaPoints} from the game-night mission` : null,
              ].filter(Boolean).join(", ")}).
              {last.me.rank <= BADGE_RANK ? " Top 10: it's on your profile." : ""}
            </p>
          )}
          {last.me?.ballot && <p className="party-muted">Highlighted: the ones you put where the crowd did.</p>}

          {last.board.length > 0 ? (
            <div className="weekly__board">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow><TableHead>Rank</TableHead><TableHead>Player</TableHead><TableHead align="right">Tier War</TableHead><TableHead align="right">Mission</TableHead><TableHead align="right">Total</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {last.board.map((r, i) => (
                    <TableRow key={`${r.rank}-${i}`}>
                      <TableCell>#{r.rank}</TableCell>
                      <TableCell>{r.username ? <Link href={`/u/${r.username}`}>{r.name}</Link> : r.name}</TableCell>
                      <TableCell align="right">{r.tierScore ?? <span className="party-muted">Skipped</span>}</TableCell>
                      <TableCell align="right">{r.agendaPoints ? `+${r.agendaPoints}` : 0}</TableCell>
                      <TableCell align="right"><strong>{r.total}</strong></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : <p className="party-muted">Nobody played last week.</p>}
        </section>
      )}
    </div>
  );
}
