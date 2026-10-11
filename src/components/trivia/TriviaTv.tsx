"use client";

/**
 * The room's screen (chrome-free, for a TV or laptop): join code and QR, the
 * question with a countdown and which teams have locked in (never what they
 * answered), then the reveal and the standings. Same look as the live-night TV.
 */

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { IconField } from "@/components/events/EventHeaderArt";
import type { RoomView } from "@/lib/trivia/store";
import { STYLE_LABEL } from "@/lib/trivia/rules";
import "@/styles/trivia.css";

const POLL_MS = 2000;

export function TriviaTv({ code }: { code: string }) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const d = await fetch(`/api/trivia/room/${code}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { setView(d.view as RoomView); setError(null); }
    else setError(d?.error ?? "offline");
  }, [code]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const iv = window.setInterval(() => void load(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => { window.clearInterval(iv); window.clearInterval(clock); };
  }, [load]);
  useEffect(() => {
    const url = `${window.location.origin}/trivia/play/${code}`;
    QRCode.toString(url, { type: "svg", margin: 1, width: 220, color: { dark: "#0b0d14", light: "#ffffff" } })
      .then((svg) => { setQr(svg); setJoinUrl(url.replace(/^https?:\/\//, "")); })
      .catch(() => setQr(null));
  }, [code]);

  if (error === "not_found") return <main className="bgn-display party-tv"><div className="bgn-display__inner"><h1 className="bgn-display__title">No trivia night with that code</h1></div></main>;
  if (!view) return <main className="bgn-display party-tv"><div className="bgn-display__inner"><p className="bgn-display__meta">{error ? "Reconnecting…" : "Loading…"}</p></div></main>;

  const r = view.round;
  const left = view.closesAt ? Math.max(0, Math.ceil((Date.parse(view.closesAt) - now) / 1000)) : 0;
  const done = view.phase === "done";
  const showJoin = !done && (view.phase === "lobby" || view.phase === "standings");

  return (
    <main className="bgn-display party-tv trivia-tv">
      <IconField category="mystery" seed={`trivia-${code}`} opacity={0.09} className="party-tv__art" />
      <div className="bgn-display__inner">
        <header className="party-tv__head">
          <div>
            <p className="bgn-display__eyebrow">{done ? "Final" : r ? `Round ${r.index + 1} of ${r.count} · ${r.title}${r.title.toLowerCase().includes(STYLE_LABEL[r.style].toLowerCase()) || r.style === "classic" ? "" : ` · ${STYLE_LABEL[r.style]}`}` : "Trivia"}</p>
            <h1 className="bgn-display__title">{view.title}</h1>
          </div>
          {showJoin && (
            <div className="party-tv__join">
              {qr && <span className="party-tv__qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />}
              <span className="party-tv__code">
                <span className="party-tv__code-label">Scan or go to</span>
                <span className="party-tv__code-url">{joinUrl}</span>
                <span className="party-tv__code-label">Code</span>
                <strong className="party-tv__code-big">{view.code}</strong>
              </span>
            </div>
          )}
        </header>

        <section className="bgn-display__panel trivia-tv__stage">
          {view.phase === "lobby" && (
            <>
              <p className="trivia-tv__big">{r ? (view.questionIndex === 0 ? `${r.title} is next` : `Question ${view.questionIndex + 1} is next`) : "Get your team together"}</p>
              <ul className="trivia-tv__teams">{view.teams.map((t) => <li key={t.name}>{t.name}</li>)}</ul>
              {view.teams.length === 0 && <p className="bgn-display__meta">Teams appear here as they join.</p>}
            </>
          )}
          {(view.phase === "question" || view.phase === "locked") && view.question && (
            <>
              <p className="trivia-tv__label">Question {view.questionIndex + 1}{view.question.category ? ` · ${view.question.category}` : ""}</p>
              <p className="trivia-tv__q">{view.question.prompt}</p>
              {view.question.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a host-supplied picture-round image
                <img className="trivia-tv__pic" src={view.question.imageUrl} alt="" />
              )}
              {view.question.kind === "choice" && view.question.options && (
                <ol className="trivia-tv__options">{view.question.options.map((o, i) => <li key={o}><strong>{String.fromCharCode(65 + i)}</strong> {o}</li>)}</ol>
              )}
              <div className="trivia-tv__foot">
                <ul className="trivia-tv__locked">{view.teams.map((t) => <li key={t.name} className={t.answered ? "is-in" : ""}>{t.name}{t.answered ? " ✓" : ""}</li>)}</ul>
                <span className="trivia-tv__clock">{view.phase === "locked" ? "Time's up" : `0:${String(left).padStart(2, "0")}`}</span>
              </div>
            </>
          )}
          {view.phase === "reveal" && view.question && (
            <>
              <p className="trivia-tv__label">The answer</p>
              <p className="trivia-tv__q trivia-tv__q--small">{view.question.prompt}</p>
              <p className="trivia-tv__answer">{view.answer}</p>
              {view.gotIt !== null && <p className="trivia-tv__got">{view.gotIt} of {view.teams.length} team{view.teams.length === 1 ? "" : "s"} got it</p>}
              <TvStandings rows={view.standings.slice(0, 5)} />
            </>
          )}
          {(view.phase === "standings" || done) && (
            <>
              <p className="trivia-tv__big">{done ? `${view.standings[0]?.name ?? "Nobody"} win${view.standings.length ? "s" : ""}!` : "Standings"}</p>
              <TvStandings rows={view.standings.slice(0, 10)} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function TvStandings({ rows }: { rows: { name: string; score: number }[] }) {
  return (
    <ol className="trivia-tv__standings">
      {rows.map((t, i) => (
        <li key={t.name}><span>{i + 1}</span><span>{t.name}</span><em>{t.score}</em></li>
      ))}
    </ol>
  );
}
