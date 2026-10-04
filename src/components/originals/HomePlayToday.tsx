"use client";

/**
 * Homepage module: the Daily Shuffle (today's game), the Weekly Challenge
 * (this week's question, how many are in, last week's #1) and a Chat Brain
 * question to answer inline while it's being built. Client-side so the
 * homepage stays static; the Daily needs the viewer's current date anyway.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button } from "@empac/cascadeds";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { dayKey, puzzleFor, puzzleNumber } from "@/lib/originals/daily";

interface WeeklySummary { number: number; title: string; players: number; leader: string | null }

export function HomePlayToday() {
  const [daily, setDaily] = useState<{ n: number; game: string } | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);

  useEffect(() => {
    const day = dayKey();
    void Promise.resolve().then(() => setDaily({ n: puzzleNumber(day), game: puzzleFor(day).game }));
    let alive = true;
    void fetch("/api/weekly", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!alive || !d?.ok || !d.ready || !d.current) return;
      setWeekly({ number: d.current.number, title: d.current.title, players: d.current.players, leader: d.last?.board?.[0]?.name ?? null });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="home-play">
      <div className="home-play__card">
        <span className="home-play__eyebrow">Every day</span>
        <h3 className="home-play__title">The Daily Shuffle</h3>
        <p className="home-play__text">Guess today&apos;s character in six tries. The game changes through the week: Mario Kart 8 Deluxe, Mario Kart World and Mario Party.</p>
        {daily && <span className="home-play__meta"><Badge variant="info" size="small">Puzzle #{daily.n}</Badge> Today: {daily.game}</span>}
        <Link href="/daily"><Button variant="primary">Play today&apos;s puzzle</Button></Link>
      </div>
      <div className="home-play__card">
        <span className="home-play__eyebrow">Every week</span>
        <h3 className="home-play__title">The Weekly Challenge</h3>
        <p className="home-play__text">
          {weekly ? <>This week: rank <strong>{weekly.title.toLowerCase()}</strong> like the crowd, plus one mission for every game night.</> : "Rank six things like the crowd does, plus one mission for every game night. New every Monday."}
        </p>
        {weekly && (
          <span className="home-play__meta">
            <Badge variant="info" size="small">Week {weekly.number}</Badge> {weekly.players} {weekly.players === 1 ? "player" : "players"} so far{weekly.leader ? ` · last week's #1: ${weekly.leader}` : ""}
          </span>
        )}
        <Link href="/weekly"><Button variant="primary">Play this week</Button></Link>
      </div>
      <ChatBrainAsk source="home" frameClass="home-play__card" eyebrow="New · help build it" title="Chat Brain" />
    </div>
  );
}
