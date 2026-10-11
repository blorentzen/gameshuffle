"use client";

/** /trivia/host/[id]: the builder until the room opens, then the console. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { TriviaBuilder, type BuilderGame } from "./TriviaBuilder";
import { TriviaConsole } from "./TriviaConsole";
import "@/styles/trivia.css";

export function TriviaHostPage({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<BuilderGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/trivia/games/${gameId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) setGame(d.game as BuilderGame);
    else setError(d?.error ?? "failed");
  }, [gameId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return (
    <main className="trivia-page">
      <div className="trivia-page__body">
        <p className="trivia-crumb"><Link href="/trivia">Trivia</Link></p>
        {error ? (
          <div className="trivia-card">
            <p>{error === "not_found" ? "That trivia night isn't yours or doesn't exist." : error === "unauthenticated" ? "Sign in to host." : "Couldn't load the night."}</p>
            <Link href="/trivia"><Button variant="secondary">Back to Trivia</Button></Link>
          </div>
        ) : !game ? (
          <div className="trivia-card"><LoadingLines label="Loading" /></div>
        ) : game.status === "draft" ? (
          <TriviaBuilder game={game} onLive={() => setGame({ ...game, status: "live" })} />
        ) : game.status === "cancelled" ? (
          <div className="trivia-card"><p>This night was cancelled.</p></div>
        ) : (
          <TriviaConsole gameId={game.id} />
        )}
      </div>
    </main>
  );
}
