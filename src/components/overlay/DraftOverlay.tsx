"use client";

/**
 * DraftOverlay: a chat draft on the OBS overlay. The slots filling in (the
 * team so far) and the current vote with live percentages and a countdown.
 * Placement-aware like the other overlay pieces. Text only: no game art.
 * Captain drafts show sign-ups, then the teams side by side, who's on the
 * clock, and the players still up for grabs.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { StreamDraftView } from "@/lib/drafts/store";

/** 75 → "1:15". */
export function clockText(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function useCountdown(until: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [until]);
  return until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : null;
}

function CaptainsOverlay({ draft, style }: { draft: StreamDraftView; style?: CSSProperties }) {
  const c = draft.captains!;
  const secs = useCountdown(c.onClock?.closesAt);
  if (draft.status === "signup") {
    return (
      <div className="gs-draft gs-draft--cap" style={style}>
        <div className="gs-draft__head"><span className="gs-draft__title">Team draft · sign-ups</span><span className="gs-draft__count">{c.pool.length} in</span></div>
        <div className="gs-draft__pool">{c.pool.slice(0, 40).map((e) => <span key={e.key}>{e.name}</span>)}</div>
        <div className="gs-draft__hint">Type !draft in to get picked</div>
      </div>
    );
  }
  return (
    <div className="gs-draft gs-draft--cap" style={style}>
      <div className="gs-draft__head">
        <span className="gs-draft__title">Team draft{draft.status === "done" ? " · teams set" : ""}</span>
        {draft.status === "open" && <span className="gs-draft__count">{c.pool.length} left</span>}
      </div>
      <div className="gs-draft__teams">
        {c.teams.map((t, i) => (
          <div key={t.name + i} className="gs-draft__team-wrap">
            {i > 0 && c.teams.length === 2 && <span className="gs-draft__vs" aria-hidden>vs</span>}
            <div className={`gs-draft__team cap-team--${i}${c.onClock?.team === i ? " is-picking" : ""}`}>
              <div className="gs-draft__team-name">{t.name}</div>
              <ol>
                <li className="is-captain">{t.captain.name}</li>
                {t.players.map((p) => <li key={p.key}>{p.name}</li>)}
              </ol>
            </div>
          </div>
        ))}
      </div>
      {c.onClock && (
        <div className={`gs-draft__clock cap-team--${c.onClock.team}`}>
          On the clock: <strong>{c.onClock.captain}</strong> for {c.onClock.name}{c.onClock.picks > 1 ? ` (${c.onClock.picks} picks)` : ""}
          {secs !== null && <span className="gs-draft__secs">{clockText(secs)}</span>}
        </div>
      )}
      {draft.status === "open" && c.pool.length > 0 && (
        <div className="gs-draft__pool">{c.pool.slice(0, 40).map((e) => <span key={e.key}>{e.name}</span>)}</div>
      )}
    </div>
  );
}

export function DraftOverlay({ draft, style }: { draft: StreamDraftView; style?: CSSProperties }) {
  if (draft.mode === "captains" && draft.captains) return <CaptainsOverlay draft={draft} style={style} />;
  return <VoteOverlay draft={draft} style={style} />;
}

function VoteOverlay({ draft, style }: { draft: StreamDraftView; style?: CSSProperties }) {
  const secs = useCountdown(draft.current?.closesAt);
  const c = draft.current;
  return (
    <div className="gs-draft" style={style}>
      <div className="gs-draft__head">
        <span className="gs-draft__title">Chat draft · {draft.title}</span>
        <span className="gs-draft__count">{draft.picks.length} / {draft.slots.length}</span>
      </div>
      <ol className="gs-draft__slots">
        {draft.slots.map((s, i) => {
          const p = draft.picks[i];
          return (
            <li key={s.key} className={`gs-draft__slot${p ? " is-filled" : ""}${!p && i === draft.picks.length && c ? " is-now" : ""}`}>
              <span className="gs-draft__slot-label">{s.label}</span>
              <span className="gs-draft__slot-pick">{p ? p.label : i === draft.picks.length && c ? "Voting…" : ""}</span>
              {p?.detail && <span className="gs-draft__slot-detail">{p.detail}</span>}
            </li>
          );
        })}
      </ol>
      {c && (
        <div className="gs-draft__vote">
          <div className="gs-draft__q">{c.question}{secs !== null && <span className="gs-draft__secs">{secs}s</span>}</div>
          <ul className="gs-draft__opts">
            {c.options.map((o) => {
              const pct = c.total ? Math.round((o.votes / c.total) * 100) : 0;
              return (
                <li key={o.id} className="gs-draft__opt">
                  <span className="gs-draft__fill" style={{ width: `${pct}%` }} aria-hidden />
                  <span className="gs-draft__num">{o.id}</span>
                  <span className="gs-draft__label">{o.label}{o.detail && <small> {o.detail}</small>}</span>
                  <span className="gs-draft__pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
          <div className="gs-draft__hint">Vote with !vote {c.options.map((o) => o.id).join("/")}</div>
        </div>
      )}
    </div>
  );
}
