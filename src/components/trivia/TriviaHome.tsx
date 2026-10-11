"use client";

/**
 * /trivia: join a game by code, or host one. Hosts see their nights and start
 * a new one from an occasion template (Party, Office, Fundraiser, Bar night).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TEMPLATES } from "@/lib/trivia/rules";
import "@/styles/trivia.css";

interface GameSummary { id: string; title: string; code: string; status: "draft" | "live" | "done" | "cancelled"; template: string | null; createdAt: string; questions: number }

const STATUS: Record<GameSummary["status"], { label: string; variant: "default" | "success" | "info" }> = {
  draft: { label: "Building", variant: "default" },
  live: { label: "Live", variant: "success" },
  done: { label: "Finished", variant: "info" },
  cancelled: { label: "Cancelled", variant: "default" },
};

export function TriviaHome({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch("/api/trivia/games", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!active) return;
      if (d?.ok) setGames(d.games as GameSummary[]);
      else { setGames([]); if (d?.error === "not_ready") setReady(false); }
    }).catch(() => active && setGames([]));
    return () => { active = false; };
  }, [signedIn]);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length >= 4) router.push(`/trivia/play/${c}`);
  };

  const start = async (templateId: string, label: string) => {
    setBusy(templateId);
    const res = await fetch("/api/trivia/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, title: `${label} trivia` }) });
    const d = await res.json().catch(() => null);
    setBusy(null);
    if (d?.ok) { track(EVENTS.triviaNightCreated, { template: templateId }); router.push(`/trivia/host/${d.id}`); }
    else toast.error(d?.error === "not_ready" ? "Trivia needs a quick update on our side first." : "Couldn't start a night. Try again.");
  };

  return (
    <main className="trivia-page">
      <BrowseHero
        eyebrow="GameShuffle · Trivia Nights"
        title="Trivia night, ready in minutes"
        sub="Pick an occasion, fill the rounds from your library or draft them with AI, and run the room from your phone. Teams play on theirs, the TV shows the rest."
        accent="violet"
        field="mystery"
        actions={
          <form className="trivia-join" onSubmit={join}>
            <Input fullWidth floatingLabel="Got a code? Join a game" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
            <Button type="submit" variant="primary" disabled={code.trim().length < 4}>Join</Button>
          </form>
        }
      />

      <div className="trivia-page__body">
        {!signedIn ? (
          <div className="trivia-card">
            <h2 className="trivia-h2">Host a trivia night</h2>
            <p className="trivia-muted">Hosting is free. Make an account so your questions and nights are saved.</p>
            <div className="trivia-row">
              <Link href="/signup?redirect=/trivia"><Button variant="primary">Make a free account</Button></Link>
              <Link href="/login?redirect=/trivia"><Button variant="secondary">Sign in</Button></Link>
            </div>
          </div>
        ) : !ready ? (
          <div className="trivia-card"><p className="trivia-muted">Trivia Nights needs a quick update on our side before it can run.</p></div>
        ) : (
          <>
            <h2 className="trivia-h2">Start a night</h2>
            <div className="trivia-templates">
              {TEMPLATES.map((t) => (
                <div key={t.id} className="trivia-card trivia-template">
                  <div className="trivia-template__head">
                    <h3 className="trivia-h3">{t.label}</h3>
                    {t.familySafe && <Badge variant="info" size="small">Family-safe</Badge>}
                  </div>
                  <p className="trivia-muted">{t.blurb}</p>
                  <ol className="trivia-template__rounds">
                    {t.rounds.map((r, i) => <li key={i}>{r.title}{r.style !== "final" ? ` · ${r.count}` : ""}</li>)}
                  </ol>
                  <Button variant="secondary" size="small" disabled={!!busy} onClick={() => void start(t.id, t.label)}>{busy === t.id ? "Setting up…" : `Use ${t.label}`}</Button>
                </div>
              ))}
            </div>

            <h2 className="trivia-h2">Your nights</h2>
            {games === null ? (
              <div className="trivia-card"><LoadingLines label="Loading" /></div>
            ) : games.length === 0 ? (
              <p className="trivia-muted">No trivia nights yet. Pick a template above to start one.</p>
            ) : (
              <ul className="trivia-games">
                {games.map((g) => (
                  <li key={g.id} className="trivia-card trivia-game">
                    <div>
                      <Link href={`/trivia/host/${g.id}`} className="trivia-game__title">{g.title}</Link>
                      <p className="trivia-muted">{g.questions} question{g.questions === 1 ? "" : "s"} · code {g.code}</p>
                    </div>
                    <Badge variant={STATUS[g.status].variant} size="small">{STATUS[g.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
