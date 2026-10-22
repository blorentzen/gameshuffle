"use client";

/**
 * Break mode on the live page: the round in play with buttons (or a box for
 * numbers and names), so viewers on their phones can play along with chat.
 * Signed-in viewers answer here; their Twitch account makes it the same
 * player as in chat. Polls every 2 seconds while a break runs.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import { useLiveHost } from "./LiveHost";
import type { BreakView } from "@/lib/break/types";
import { BreakRoundPlay } from "@/components/break/BreakRoundPlay";

const secsUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

export function LiveBreakCard({ communityId }: { communityId: string | null; streamerSlug?: string }) {
  const toast = useToast();
  const host = useLiveHost();
  const [view, setView] = useState<BreakView | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const load = async () => {
      const d = await host.api(`/api/break/community/${communityId}`);
      if (!active || !d?.ok) return;
      setView(d.view ?? null);
      setMine(d.mine ?? null);
      setSignedIn(!!d.signedIn);
    };
    void load();
    const iv = window.setInterval(load, 2000);
    return () => { active = false; window.clearInterval(iv); };
  }, [communityId, host]);

  const open = view?.phase === "open" && view.status === "running";
  useEffect(() => {
    if (!open) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [open]);

  if (!view) return null;

  const answer = async (text: string): Promise<boolean> => {
    if (!signedIn) { host.signIn("play along"); return false; }
    const d = await host.api(`/api/break/${view.id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (d?.ok) { setMine(text.trim().toLowerCase()); return true; }
    toast.error(d?.error === "closed" ? "That round just closed. Catch the next one!" : d?.error === "not_an_answer" ? (view.round?.layout === "letters" ? "That word isn't on our list. Try another five-letter word." : "That isn't an answer for this round.") : "Couldn't send that. Try again.");
    return false;
  };

  const r = view.round;
  const counting = open && secsUntil(view.countdownEndsAt, now) > 0;

  return (
    <section className="live-poll live-break" aria-labelledby="live-break-title">
      <div className="live-break__head">
        <h2 id="live-break-title" className="live-break__title">{view.status === "ended" ? `${view.streamer} is back` : `${view.streamer} is on a break`}</h2>
        {open && <span className={`live-break__clock${counting ? "" : " is-last"}`}>{counting ? `${secsUntil(view.countdownEndsAt, now)}s` : "Last answers…"}</span>}
      </div>

      {view.status === "ended" ? (
        <p className="live-break__line">{view.champion ? `Break champion: ${view.champion.names.join(" and ")} with ${view.champion.points} points.` : "Thanks for playing!"}</p>
      ) : view.phase === "intro" ? (
        <p className="live-break__line">Next up: <b>{view.game?.name}</b>. {view.game?.howTo}{view.game?.hosted ? "." : " in chat or here."}</p>
      ) : view.phase === "standings" ? (
        <p className="live-break__line">Standings after {view.game?.name}.{view.next ? ` Next: ${view.next.name}.` : ""}</p>
      ) : r ? (
        <BreakRoundPlay
          round={r}
          reveal={view.reveal}
          open={open}
          mine={mine}
          found={view.found ?? null}
          answering={view.answering}
          roundKey={`${view.id}:${view.gameRound}:${view.game?.id}`}
          now={now}
          onAnswer={answer}
          meta={`${view.game?.name ?? ""}${view.gameRounds > 1 ? ` · round ${view.gameRound} of ${view.gameRounds}` : ""}`}
          inputId="live-break-answer"
        />
      ) : null}

      {view.leaders.length > 0 && view.status === "running" && (
        <p className="live-break__leaders">Leading: {view.leaders.slice(0, 3).map((l) => `${l.name} ${l.points}`).join(" · ")}</p>
      )}
    </section>
  );
}
