"use client";

/**
 * The run card (speedrun Twitch and Discord picks 2026-11-10, all as recommended): the runner's speedrun as the stream
 * shows it, on the live page and on the Twitch extension's card (the extension answers the same path from its state).
 * The clock, the split being run with how far ahead or behind, five splits around it (gold splits starred), PB and sum of
 * best, and "On PB pace" once a run is ahead with a quarter left. Shown while a run is going and for two minutes after
 * it ends; each state waits out the runner's stream delay so viewers never see a split before the stream does.
 */

import { useEffect, useState } from "react";
import { Card } from "@empac/cascadeds";
import { IconCaretDownFilled, IconCaretUpFilled, IconCheck, IconFlame, IconPlayerPlayFilled, IconStarFilled } from "@tabler/icons-react";
import { useLiveHost } from "@/components/live/LiveHost";
import { useDelayedRun } from "@/components/live/LiveSpeedrunCard";
import { everyVisible } from "@/lib/hooks/everyVisible";
import { fmtClock, fmtDelta } from "@/lib/speedrun/time";
import { currentIndex, deltas, isNewPb, lastDelta, onPbPace, pbTime, runCardRows, splitsDone, sumOfBest } from "@/lib/speedrun/rules";
import type { LiveRunBody } from "@/lib/speedrun/liveRun";
import "@/styles/speedrun-live.css";

/**
 * `betHint`: where to point viewers while a "PB this run" bet is open: chat (the extension, which takes no bets) or the
 * bet card under this one (the live page).
 */
export function LiveRunCard({ streamerSlug, betHint }: { streamerSlug: string; betHint: "chat" | "below" }) {
  const host = useLiveHost();
  const [body, setBody] = useState<LiveRunBody | null>(null);
  const active = !!body;
  useEffect(() => {
    let live = true;
    const load = async () => {
      const d = await host.api(`/api/live/${encodeURIComponent(streamerSlug)}/run`);
      const run = d && typeof d === "object" ? ((d as { run?: LiveRunBody | null }).run ?? null) : null;
      if (live) setBody(run && run.kind === "run" ? run : null);
    };
    void load();
    const stop = everyVisible(() => void load(), active ? 2000 : 10_000);
    return () => { live = false; stop(); };
  }, [host, streamerSlug, active]);
  const shown = useDelayedRun(body?.run.state ?? null, body?.run.ageMs ?? null, body?.delayMs ?? 0);
  if (!body || !shown) return null;
  const st = shown.st;
  const n = st.segments.length;
  const cur = currentIndex(st);
  const d = lastDelta(st);
  const ended = st.phase === "ended";
  const reset = st.phase === "idle";
  const newPb = ended && isNewPb(st);
  const title = [body.run.game, body.run.category].filter(Boolean).join(" · ") || "Speedrun";
  const ds = deltas(st);
  const rows = runCardRows(n, Math.min(cur ?? Math.max(0, splitsDone(st) - 1), Math.max(0, n - 1)));
  const now = ended ? (newPb ? "New PB" : "Finished") : reset ? "Reset" : `${st.segments[cur ?? 0]?.name ?? ""} now${st.phase === "paused" ? " (paused)" : ""}`;
  const pb = pbTime(st.segments);
  const sob = sumOfBest(st);
  const even = (ms: number) => Math.abs(ms) < 100; // under a tenth: the clock can't show a gap
  const tone = d && !even(d.ms) ? (d.ms < 0 ? "is-ahead" : "is-behind") : "";

  return (
    <section className="live-run" aria-label="Speedrun">
     <Card variant="outlined" padding="none" className="lrun">
     <div className="lrun__in">
      <div className="lrun__head">
      <div className="lrun__top">
        <span className="lrun__eye">Speedrun</span>
        <span className="lrun__att">Attempt {st.attempt.toLocaleString("en-US")}</span>
      </div>
      <h2 className="lrun__title">{title}</h2>
      <div className="lrun__now">
        <span className={`lrun__clock ${tone}`}>{fmtClock(shown.ms)}</span>
        <span className="lrun__split" aria-live="polite">
          <b>{now}</b>
          {d && (even(d.ms) ? (
            <span className="lrun-d">Even with PB</span>
          ) : (
            <span className={`lrun-d ${tone}`}>
              {d.ms < 0 ? <IconCaretDownFilled size={14} aria-hidden="true" /> : <IconCaretUpFilled size={14} aria-hidden="true" />}
              {fmtDelta(d.ms)} {d.ms < 0 ? "ahead" : "behind"}
            </span>
          ))}
        </span>
      </div>
      {onPbPace(st) && <span className="lrun__pace"><IconFlame size={14} aria-hidden="true" />On PB pace</span>}
      </div>
      <div className="lrun__body">
      {n > 0 && (
        <ol className="lrun__list">
          {rows.map((i) => {
            const seg = st.segments[i];
            const done = st.splits[i] != null;
            const isCur = !ended && !reset && i === cur;
            const delta = ds[i];
            const time = done ? st.splits[i] : seg.pbMs;
            return (
              <li key={i} className={isCur ? "is-cur" : done ? "is-done" : undefined} aria-current={isCur ? "step" : undefined}>
                <span className="lrun__ic" aria-hidden="true">
                  {done ? <IconCheck size={14} stroke={2.6} /> : isCur ? <IconPlayerPlayFilled size={12} /> : null}
                </span>
                <span className="lrun__name">{seg.name}{isCur && seg.group ? <small className="lrun__grp">{seg.group}</small> : null}</span>
                <span className={`lrun-d ${st.golds[i] ? "is-gold" : delta == null || even(delta) ? "" : delta < 0 ? "is-ahead" : "is-behind"}`}>
                  {st.golds[i] && <IconStarFilled size={12} aria-label="Gold split" />}
                  {done && delta != null ? `${even(delta) ? "" : delta < 0 ? "−" : "+"}${fmtDelta(delta)}` : ""}
                  {done && delta != null && !even(delta) && <span className="sr-only">{delta < 0 ? " ahead" : " behind"}</span>}
                </span>
                <span className="lrun__time">{time != null ? fmtClock(time) : "-"}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="lrun__foot">
        <span>{newPb ? "Old PB" : "PB"} <b>{pb != null ? fmtClock(pb) : "-"}</b></span>
        <span>Sum of best <b>{sob != null ? fmtClock(sob) : "-"}</b></span>
      </div>
      </div>
      {body.bet && !ended && !reset && (
        <p className="lrun__note">{betHint === "chat" ? "Bet on this run in chat: !bet pb 100 or !bet no 100" : "Bet on this run: PB or No PB, below."}</p>
      )}
     </div>
     </Card>
    </section>
  );
}
