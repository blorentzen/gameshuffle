"use client";

/**
 * Homepage: Today on GameShuffle (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/PjULC3d4viTX3Tn4oYmLTe). The Daily Shuffle, the
 * Daily Dex (once it launches) and the Weekly, then today's top 3 from the
 * Daily leaderboard. Signed in, each daily shows your streak and where you
 * stand today. Client-side: the day is the visitor's, and the numbers change
 * all day. Chat Brain lives on the Daily's end screen now.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button } from "@empac/cascadeds";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { DEX_EPOCH, dayKey, puzzleNumber } from "@/lib/originals/daily";
import { ordinal } from "@/lib/daily/boardRules";
import type { BoardRow, BoardView } from "@/lib/daily/boardTypes";

interface WeeklySummary { number: number; kind: "tier" | "survey"; title: string; players: number }
interface Mine { streak: number; place: number | null }

const dexNumber = (day: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DEX_EPOCH}T00:00:00Z`)) / 86_400_000) + 1;

async function mine(game: "shuffle" | "dex"): Promise<Mine | null> {
  const [stats, board] = await Promise.all([
    fetch(`/api/daily${game === "dex" ? "?game=dex" : ""}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ signedIn?: boolean; stats?: { streak: number } | null } | null>,
    fetch(`/api/daily/board?game=${game}&period=day`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<BoardView | null>,
  ]);
  if (!stats?.signedIn) return null;
  return { streak: stats.stats?.streak ?? 0, place: board?.you?.place ?? null };
}

function standing(m: Mine | null | undefined, fresh: string): string | null {
  if (!m) return null;
  const parts = [m.streak ? `Your streak: ${m.streak}` : fresh, m.place ? `${ordinal(m.place)} today` : null].filter(Boolean);
  return parts.join(" · ");
}

export function HomeToday({ dexPublic }: { dexPublic: boolean }) {
  const [day, setDay] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [top, setTop] = useState<BoardRow[] | null>(null);
  const [me, setMe] = useState<{ shuffle: Mine | null; dex: Mine | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const today = dayKey();
    void Promise.resolve().then(() => setDay(today));
    void fetch("/api/weekly", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!alive || !d?.ok || !d.ready || !d.current) return;
      setWeekly({ number: d.current.number, kind: d.current.kind === "survey" ? "survey" : "tier", title: d.current.title, players: d.current.players });
    }).catch(() => {});
    void fetch("/api/daily/board?game=shuffle&period=day", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((v: BoardView | null) => {
      if (alive && v?.ready && v.rows.length) setTop(v.rows.slice(0, 3));
    }).catch(() => {});
    void Promise.all([mine("shuffle"), dexPublic ? mine("dex") : Promise.resolve(null)]).then(([shuffle, dex]) => { if (alive) setMe({ shuffle, dex }); });
    return () => { alive = false; };
  }, [dexPublic]);

  return (
    <>
      <ResponsiveCarousel className="home-play" label="Today's games">
        <div className="home-play__card">
          <span className="home-play__eyebrow">Every day</span>
          <h3 className="home-play__title">The Daily Shuffle</h3>
          <p className="home-play__text">Guess today&apos;s Nintendo character. Five guesses, with a new hint after every miss.</p>
          <span className="home-play__meta">
            {day && <Badge variant="info" size="small">Puzzle #{puzzleNumber(day)}</Badge>}
            {standing(me?.shuffle, "Start a streak today")}
          </span>
          <Link href="/daily"><Button variant="primary">Play today&apos;s puzzle</Button></Link>
        </div>
        {dexPublic && (
          <div className="home-play__card">
            <span className="home-play__eyebrow">Every day · New</span>
            <h3 className="home-play__title">The Daily Dex</h3>
            <p className="home-play__text">Guess today&apos;s Pokémon from all 1,025, with a new hint after every miss.</p>
            <span className="home-play__meta">
              {day && dexNumber(day) >= 1 && <Badge variant="info" size="small">Puzzle #{dexNumber(day)}</Badge>}
              {standing(me?.dex, "Start a streak today")}
            </span>
            <Link href="/daily-dex"><Button variant="primary">Play today&apos;s Pokémon</Button></Link>
          </div>
        )}
        <div className="home-play__card">
          <span className="home-play__eyebrow">Every week</span>
          <h3 className="home-play__title">The Weekly Challenge</h3>
          <p className="home-play__text">
            {weekly?.kind === "survey"
              ? <>This week: <strong>{weekly.title}</strong>. Give your answer and guess the crowd&apos;s top three.</>
              : weekly ? <>This week: rank <strong>{weekly.title.toLowerCase()}</strong> like the crowd.</>
              : "Answer the week's question and guess what the crowd said. New every Monday."}
          </p>
          {weekly && <span className="home-play__meta"><Badge variant="info" size="small">Week {weekly.number}</Badge> {weekly.players} {weekly.players === 1 ? "player" : "players"} so far</span>}
          <Link href="/weekly"><Button variant="secondary">Play this week</Button></Link>
        </div>
      </ResponsiveCarousel>
      {top && (
        <p className="home-today__top">
          <strong>Top today</strong>
          {top.map((r, i) => <span key={`${r.place}-${i}`} className="home-today__chip">{r.place} · {r.name} · {r.points}</span>)}
          <Link href="/daily#daily-board-shuffle">Leaderboards →</Link>
        </p>
      )}
    </>
  );
}
