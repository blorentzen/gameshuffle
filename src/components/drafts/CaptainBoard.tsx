"use client";

/**
 * CaptainBoard: a captain draft's board, shared by the dashboard and /live.
 * Teams side by side, who's on the clock with a countdown, and the players
 * still up for grabs. When `onPick` is given (the captain on the clock, or the
 * streamer) the players are tappable: tap one, then confirm, so a stray tap on
 * a phone can't draft the wrong person.
 */

import { useEffect, useState } from "react";
import { Badge, Button, Chip } from "@empac/cascadeds";
import type { StreamDraftView } from "@/lib/drafts/store";

type Captains = NonNullable<StreamDraftView["captains"]>;

/** 75 → "1:15". */
export function clockText(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export function useSecondsLeft(until: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [until]);
  return until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : null;
}

export function CaptainBoard({ c, status, onPick, youOnClock }: {
  c: Captains;
  status: StreamDraftView["status"];
  onPick?: (key: string) => Promise<void>;
  youOnClock?: boolean;
}) {
  const [choice, setChoice] = useState<{ key: string; turn: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const secs = useSecondsLeft(c.onClock?.closesAt);
  const clock = c.onClock;
  const turnKey = `${clock?.team}-${c.pool.length}`;
  // A choice only counts for the turn it was made in (a new turn clears it).
  const chosenName = choice?.turn === turnKey ? c.pool.find((p) => p.key === choice.key)?.name : undefined;
  const chosen = chosenName ? choice!.key : null;
  const setChosen = (key: string | null) => setChoice(key ? { key, turn: turnKey } : null);

  const confirm = async () => {
    if (!chosen || !onPick) return;
    setBusy(true);
    await onPick(chosen);
    setBusy(false);
    setChosen(null);
  };

  return (
    <div className="cap-board">
      {clock && (
        <div className={`cap-board__clock cap-team--${clock.team}${youOnClock ? " is-you" : ""}`} role="status">
          <strong>{youOnClock ? "You're on the clock" : `On the clock: ${clock.captain} for ${clock.name}`}</strong>
          <span>{clock.picks > 1 ? `${clock.picks} picks in a row` : "1 pick"}</span>
          {secs !== null && <Badge variant={secs <= 10 ? "warning" : "info"} size="small">{clockText(secs)}</Badge>}
        </div>
      )}
      {status === "done" && <p className="cap-board__done">Teams are set.</p>}

      <div className="cap-board__teams" style={{ gridTemplateColumns: `repeat(${Math.min(c.teams.length, 4)}, minmax(0, 1fr))` }}>
        {c.teams.map((t, i) => (
          <section key={t.name + i} className={`cap-board__team cap-team--${i}${clock?.team === i ? " is-picking" : ""}`}>
            <h4>{t.name}</h4>
            <ol>
              <li className="cap-board__captain">{t.captain.name} <span>captain</span></li>
              {t.players.map((p) => <li key={p.key}>{p.name}</li>)}
            </ol>
          </section>
        ))}
      </div>

      {c.pool.length > 0 && status === "open" && (
        <div className="cap-board__pool">
          <p className="cap-board__label">{c.pool.length} left to pick{onPick ? ": tap a player" : ""}</p>
          <div className="cap-board__chips">
            {c.pool.map((p) => onPick ? (
              <Chip key={p.key} label={p.name} size="large" clickable selected={chosen === p.key}
                onClick={() => setChosen(chosen === p.key ? null : p.key)} />
            ) : (
              <Chip key={p.key} label={p.name} size="medium" variant="outline" />
            ))}
          </div>
          {onPick && (
            <div className="cap-board__confirm">
              <Button variant="primary" fullWidth disabled={!chosen || busy} onClick={() => void confirm()}>
                {chosenName ? `Pick ${chosenName}` : "Choose a player"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
