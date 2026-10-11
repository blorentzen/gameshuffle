"use client";

/**
 * Break mode on the live page: the round in play with buttons (or a box for
 * numbers and names), so viewers on their phones can play along with chat.
 * Signed-in viewers answer here; their Twitch account makes it the same
 * player as in chat. Polls every 2 seconds while a break runs.
 */

import { useEffect, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { AuthPromptModal } from "./AuthPromptModal";
import type { BreakView } from "@/lib/break/types";
import { ConnectBoard, ZoomFrame } from "@/components/overlay/BreakScreenOverlay";

const secsUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

export function LiveBreakCard({ communityId, streamerSlug }: { communityId: string | null; streamerSlug: string }) {
  const toast = useToast();
  const [view, setView] = useState<BreakView | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  // What's typed, for one round only (a new round starts with an empty box).
  const [draft, setDraft] = useState({ round: "", text: "" });
  // Roster Rush takes many names: the last one sent, for this round only.
  const [sent, setSent] = useState({ round: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const load = async () => {
      const d = await fetch(`/api/break/community/${communityId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active || !d?.ok) return;
      setView(d.view ?? null);
      setMine(d.mine ?? null);
      setSignedIn(!!d.signedIn);
    };
    void load();
    const iv = window.setInterval(load, 2000);
    return () => { active = false; window.clearInterval(iv); };
  }, [communityId]);

  const open = view?.phase === "open" && view.status === "running";
  useEffect(() => {
    if (!open) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [open]);

  const roundKey = `${view?.id}:${view?.gameRound}:${view?.game?.id}`;
  const typed = draft.round === roundKey ? draft.text : "";
  const setTyped = (text: string) => setDraft({ round: roundKey, text });

  if (!view) return null;

  const answer = async (text: string) => {
    if (!signedIn) { setAuthOpen(true); return; }
    if (!text.trim()) return;
    setBusy(true);
    const d = await fetch(`/api/break/${view.id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setMine(text.trim().toLowerCase());
      if (view.round?.layout === "rush") { setSent({ round: roundKey, text: text.trim() }); setTyped(""); }
    }
    else toast.error(d?.error === "closed" ? "That round just closed. Catch the next one!" : d?.error === "not_an_answer" ? "That isn't an answer for this round." : "Couldn't send that. Try again.");
  };

  const r = view.round;
  const rv = view.reveal;
  const counting = open && secsUntil(view.countdownEndsAt, now) > 0;
  const choices = r?.layout === "choice" || r?.layout === "shuffle" || r?.layout === "connect" ? r.options : r?.layout === "dice" ? r.options : undefined;
  // Typed answers: one box. Zoomed In takes one guess, so the box goes once it's in.
  const typedBox = r && (r.layout === "number" || r.layout === "word" || r.layout === "text" || r.layout === "rush" || (r.layout === "zoom" && !mine));
  const lastSent = sent.round === roundKey ? sent.text : null;
  const table = r?.layout === "shuffle" ? rv?.table ?? r.table : null;

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
        <>
          <p className="live-break__meta">{view.game?.name}{view.gameRounds > 1 ? ` · round ${view.gameRound} of ${view.gameRounds}` : ""}</p>
          <p className="live-break__prompt">{r.prompt}</p>
          {r.layout === "choice" && r.item && <p className="live-break__item">{r.item}</p>}
          {r.layout === "bingo" && <p className="live-break__line">Grab a card in the Stream Bingo box on this page, then mark your numbers as they&apos;re called.</p>}
          {table && <p className="live-break__line">Chat {table.chat}, House {table.house} (first to {table.target}). {table.turnPoints} riding, {table.bombs} of 3 Bombs out.</p>}
          {r.layout === "word" && !rv && <p className="live-break__tiles" aria-label="Scrambled letters">{r.tiles.join(" ")}</p>}
          {r.layout === "text" && r.big && <p className="live-break__big">{r.big}</p>}
          {r.layout === "zoom" && <ZoomFrame className="live-break__zoom" img={r.img} focus={r.focus} steps={r.steps} stepSeconds={r.stepSeconds} openedAt={r.openedAt} reveal={!!rv} now={now} />}
          {r.layout === "connect" && <ConnectBoard className="live-break__c4" board={rv?.board ?? r.board} last={rv ? null : r.last} win={rv?.winLine} />}
          {r.layout === "rush" && (
            <>
              <p className="live-break__line"><b>{(rv?.found ?? view.found ?? []).length}</b> of {r.total} found</p>
              <ul className="live-break__chips">{(rv?.found ?? view.found ?? []).slice(-40).map((n) => <li key={n}>{n}</li>)}</ul>
            </>
          )}
          {r.layout === "royale" && (
            r.stage === "join" && !rv
              ? <p className="live-break__line">{view.answering} in so far.</p>
              : <p className="live-break__line">{rv?.aliveCount ?? r.aliveCount} still in.</p>
          )}
          {open && r.layout === "royale" && r.stage === "join" && (
            <Button size="small" variant={mine ? "primary" : "secondary"} disabled={busy || !!mine} onClick={() => void answer("join")}>{mine ? "You're in!" : "Join"}</Button>
          )}
          {rv?.out && rv.out.length > 0 && (
            <ul className="live-break__out">{rv.out.slice(0, 4).map((o, i) => <li key={i}>{o.line}</li>)}</ul>
          )}
          {choices && (
            <div className="live-break__choices" role="group" aria-label="Answers">
              {choices.map((o) => {
                const picked = mine === o.key.toLowerCase();
                const right = rv?.correct?.includes(o.key);
                return (
                  <Button key={o.key} size="small" variant={picked || right ? "primary" : "secondary"} disabled={busy || !open}
                    onClick={() => void answer(o.key)} aria-pressed={picked}>
                    {r.layout === "connect" ? `Column ${o.key}` : `${o.key}. ${o.label}`}{rv?.counts ? ` · ${rv.counts[o.key] ?? 0}` : ""}
                  </Button>
                );
              })}
            </div>
          )}
          {open && r.layout === "dice" && !r.options && (
            <Button size="small" variant={mine ? "primary" : "secondary"} disabled={busy} onClick={() => void answer("roll")}>{mine ? "Rolled! Wait for the dice" : "Roll"}</Button>
          )}
          {open && typedBox && (
            <form className="live-break__form" onSubmit={(e) => { e.preventDefault(); void answer(typed); }}>
              <Input id="live-break-answer" size="small" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={r.hint} aria-label={r.hint}
                inputMode={r.layout === "number" ? "numeric" : "text"} autoComplete="off" />
              <Button type="submit" size="small" variant="primary" disabled={busy || !typed.trim()}>Send</Button>
            </form>
          )}
          {open && r.layout === "rush" && lastSent && <p className="live-break__mine">Sent: {lastSent}</p>}
          {open && mine && r.layout !== "choice" && r.layout !== "connect" && r.layout !== "rush" && r.layout !== "royale" && !(r.layout === "dice" && !r.options) && (
            <p className="live-break__mine">{r.layout === "zoom" ? "Your guess" : "Your answer"}: {mine}</p>
          )}
          {rv && <p className="live-break__reveal">{rv.text}</p>}
        </>
      ) : null}

      {view.leaders.length > 0 && view.status === "running" && (
        <p className="live-break__leaders">Leading: {view.leaders.slice(0, 3).map((l) => `${l.name} ${l.points}`).join(" · ")}</p>
      )}
      <AuthPromptModal isOpen={authOpen} onClose={() => setAuthOpen(false)} streamerSlug={streamerSlug} actionLabel="play along" />
    </section>
  );
}
