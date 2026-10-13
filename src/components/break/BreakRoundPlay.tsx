"use client";

/**
 * One break-mode round, playable: the prompt, whatever the game draws (a
 * zooming picture, the letter grid, the race), and the way to answer (buttons,
 * a box for typed answers, Hit, Join). Shared by the live page's break card
 * and the Discord Activity's quick-fire rounds, which run the same games.
 *
 * `onAnswer` sends one answer and resolves true when it was taken; the box
 * clears for games that take many answers (Roster Rush).
 */

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import type { BreakReveal, BreakRound } from "@/lib/break/types";
import { BossBar, ConnectBoard, DerbyTrack, LetterGrid, ZoomFrame } from "@/components/overlay/BreakScreenOverlay";

export interface BreakRoundPlayProps {
  round: BreakRound;
  reveal: BreakReveal | null;
  /** The round takes answers right now. */
  open: boolean;
  /** This player's answer (lowercased), if any. */
  mine: string | null;
  /** Roster Rush: names found so far. */
  found: string[] | null;
  /** How many have answered (joins, racers). */
  answering: number;
  /** Changes with every round, so a typed answer doesn't carry over. */
  roundKey: string;
  now: number;
  onAnswer: (text: string) => Promise<boolean>;
  /** A line above the prompt (the game's name, "round 2 of 5"). */
  meta?: string | null;
  /** Unique id for the answer box on the page. */
  inputId: string;
}

export function BreakRoundPlay({ round: r, reveal: rv, open, mine, found, answering, roundKey, now, onAnswer, meta, inputId }: BreakRoundPlayProps) {
  // What's typed, for one round only (a new round starts with an empty box).
  const [draft, setDraft] = useState({ round: "", text: "" });
  // Roster Rush takes many names: the last one sent, for this round only.
  const [sent, setSent] = useState({ round: "", text: "" });
  const [busy, setBusy] = useState(false);
  const typed = draft.round === roundKey ? draft.text : "";
  const setTyped = (text: string) => setDraft({ round: roundKey, text });

  const answer = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onAnswer(text).catch(() => false);
    setBusy(false);
    if (ok && r.layout === "rush") { setSent({ round: roundKey, text: text.trim() }); setTyped(""); }
  };

  const choices = r.layout === "choice" || r.layout === "shuffle" || r.layout === "connect" ? r.options : r.layout === "dice" ? r.options : undefined;
  // Typed answers: one box. Zoomed In takes one guess, so the box goes once it's in.
  const typedBox = r.layout === "number" || r.layout === "word" || r.layout === "text" || r.layout === "rush" || r.layout === "letters" || (r.layout === "zoom" && !mine);
  const lastSent = sent.round === roundKey ? sent.text : null;
  const table = r.layout === "shuffle" ? rv?.table ?? r.table : null;

  return (
    <>
      {meta && <p className="live-break__meta">{meta}</p>}
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
          <p className="live-break__line"><b>{(rv?.found ?? found ?? []).length}</b> of {r.total} found</p>
          <ul className="live-break__chips">{(rv?.found ?? found ?? []).slice(-40).map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
      {r.layout === "royale" && (
        r.stage === "join" && !rv
          ? <p className="live-break__line">{answering} in so far.</p>
          : <p className="live-break__line">{rv?.aliveCount ?? r.aliveCount} still in.</p>
      )}
      {r.layout === "boss" && <BossBar className="live-break__boss" boss={rv?.boss ?? r.boss} />}
      {open && r.layout === "boss" && (
        <Button size="small" variant={mine ? "primary" : "secondary"} disabled={busy || !!mine} onClick={() => void answer("hit")}>{mine ? "Hit! Again next round" : "Hit"}</Button>
      )}
      {r.layout === "letters" && (
        <>
          <p className="live-break__line">Clue: <b>{r.category}</b></p>
          <LetterGrid className="live-break__letters" rows={rv?.rows ?? r.rows} maxRows={r.maxRows} />
        </>
      )}
      {r.layout === "derby" && r.stage === "join" && !rv && (
        <>
          <p className="live-break__line">{answering} racers so far.</p>
          {open && (
            <div className="live-break__choices" role="group" aria-label="Lanes">
              {Array.from({ length: 8 }, (_, i) => String(i + 1)).map((k) => (
                <Button key={k} size="small" variant={mine === k ? "primary" : "secondary"} disabled={busy} onClick={() => void answer(k)} aria-pressed={mine === k}>Lane {k}</Button>
              ))}
              <Button size="small" variant={mine === "any" ? "primary" : "ghost"} disabled={busy} onClick={() => void answer("join")} aria-pressed={mine === "any"}>Any lane</Button>
            </div>
          )}
        </>
      )}
      {r.layout === "derby" && (r.stage === "race" || rv) && (
        <DerbyTrack className="live-break__derby" lanes={rv?.lanes ?? r.lanes} events={r.events} openedAt={r.openedAt} seconds={r.seconds} reveal={!!rv} now={now} />
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
          <Input id={inputId} size="small" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={r.hint} aria-label={r.hint}
            inputMode={r.layout === "number" ? "numeric" : "text"} autoComplete="off" />
          <Button type="submit" size="small" variant="primary" disabled={busy || !typed.trim()}>Send</Button>
        </form>
      )}
      {open && r.layout === "rush" && lastSent && <p className="live-break__mine">Sent: {lastSent}</p>}
      {open && mine && r.layout !== "choice" && r.layout !== "connect" && r.layout !== "rush" && r.layout !== "royale" && r.layout !== "boss" && r.layout !== "derby" && !(r.layout === "dice" && !r.options) && (
        <p className="live-break__mine">{r.layout === "zoom" ? "Your guess" : "Your answer"}: {mine}</p>
      )}
      {rv && <p className="live-break__reveal">{rv.text}</p>}
    </>
  );
}
