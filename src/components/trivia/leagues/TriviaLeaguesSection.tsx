"use client";

/** /trivia for a signed-in host: their leagues and "Start a league". Hidden until leagues are set up. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@empac/cascadeds";

interface LeagueSummary { id: string; slug: string; title: string; status: "active" | "finished" | "archived"; weeks: number }

export function TriviaLeaguesSection() {
  const [data, setData] = useState<{ ready: boolean; leagues: LeagueSummary[] } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/trivia/leagues", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (active && d?.ok) setData({ ready: !!d.ready, leagues: (d.leagues ?? []) as LeagueSummary[] });
    }).catch(() => null);
    return () => { active = false; };
  }, []);

  if (!data?.ready) return null;
  return (
    <section className="trivia-leagues" aria-labelledby="trivia-leagues-title">
      <div className="trivia-row trivia-leagues__head">
        <h2 id="trivia-leagues-title" className="trivia-h2">Leagues</h2>
        <Link href="/trivia/leagues/new"><Button variant="secondary" size="small">Start a league</Button></Link>
      </div>
      {data.leagues.length === 0 ? (
        <p className="trivia-muted">A league is a season of weekly nights with standings and teams that come back. Start one for a bar night, an office or a group of friends.</p>
      ) : (
        <ul className="trivia-games">
          {data.leagues.map((l) => (
            <li key={l.id} className="trivia-card trivia-game">
              <div>
                <Link href={`/trivia/leagues/${l.slug}/manage`} className="trivia-game__title">{l.title}</Link>
                <p className="trivia-muted">{l.weeks} weeks · <Link href={`/trivia/leagues/${l.slug}`}>League page</Link></p>
              </div>
              <Badge variant={l.status === "active" ? "success" : "info"} size="small">{l.status === "active" ? "Running" : "Season over"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
