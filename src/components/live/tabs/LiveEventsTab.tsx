"use client";

/**
 * Events tab — viewer-facing window into in-flight event state: active
 * **modifiers** (with a live countdown) and open **public challenges** /
 * side-quests. Secret missions are intentionally not shown (they stay hidden
 * until they resolve). This is the viewer face of the Spec 04 event system.
 *
 * Poll-only (10s) + a 1s ticker for the modifier countdowns + a
 * visibility-restore refresh. No Realtime: the modifier/challenge tables
 * aren't in the realtime publication, and event cadence is slow enough that a
 * 10s poll reads fine.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveChallenge, LiveEvents, LiveModifier } from "@/lib/economy/events/live";

interface Props {
  streamerSlug: string;
}

const POLL_MS = 10_000;

function tidy(s: string): string {
  const t = (s ?? "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function remaining(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expiring…";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function describeChallenge(c: LiveChallenge): string {
  const cond = c.condition
    ? Object.values(c.condition)
        .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
        .filter(Boolean)
        .join(", ")
    : "";
  return cond ? `${tidy(c.variableType)} — ${cond}` : tidy(c.variableType);
}

export function LiveEventsTab({ streamerSlug }: Props) {
  const [events, setEvents] = useState<LiveEvents>({ modifiers: [], challenges: [] });
  const [now, setNow] = useState<number>(() => Date.now());
  const inflightRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    try {
      const res = await fetch(`/api/live/${encodeURIComponent(streamerSlug)}/events`, {
        signal: ac.signal,
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as LiveEvents;
      setEvents({ modifiers: body.modifiers ?? [], challenges: body.challenges ?? [] });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
    }
  }, [streamerSlug]);

  // Initial load + 10s poll, paused while the tab is hidden.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // 1s ticker for the modifier countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Drop modifiers that have ticked past expiry between polls.
  const modifiers: LiveModifier[] = events.modifiers.filter(
    (m) => new Date(m.expiresAt).getTime() > now,
  );
  const challenges = events.challenges;
  const isEmpty = modifiers.length === 0 && challenges.length === 0;

  return (
    <div className="live-events">
      <div className="live-events__intro">
        <p>
          Live mayhem from <code>!chaos</code> and <code>!random</code> — active
          modifiers and open challenges show up here. (Secret missions stay
          hidden until they resolve.)
        </p>
      </div>

      {isEmpty ? (
        <div className="live-events__empty">
          <p className="live-events__empty-headline">No events active right now.</p>
          <p className="live-events__empty-sub">
            When the streamer fires an event, the modifier or challenge it
            triggers lands here.
          </p>
        </div>
      ) : (
        <>
          {modifiers.length > 0 && (
            <section className="live-events__section">
              <h3 className="live-events__heading">Active modifiers</h3>
              <ul className="live-events__list">
                {modifiers.map((m) => (
                  <li key={m.id} className="live-events__card live-events__card--modifier">
                    <div className="live-events__card-main">
                      <span className="live-events__card-title">{tidy(m.effect)}</span>
                      <span className="live-events__card-scope">{tidy(m.scope)}</span>
                    </div>
                    <span className="live-events__timer">{remaining(m.expiresAt, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {challenges.length > 0 && (
            <section className="live-events__section">
              <h3 className="live-events__heading">Open challenges</h3>
              <ul className="live-events__list">
                {challenges.map((c) => (
                  <li key={c.id} className="live-events__card live-events__card--challenge">
                    <div className="live-events__card-main">
                      <span className="live-events__card-title">{describeChallenge(c)}</span>
                      <span className="live-events__card-scope">
                        {c.targetName ? `For ${c.targetName}` : "Open to everyone"}
                      </span>
                    </div>
                    <div className="live-events__stakes">
                      {c.reward !== null && (
                        <span className="live-events__reward">+{c.reward.toLocaleString()}🪙</span>
                      )}
                      {c.penalty !== null && (
                        <span className="live-events__penalty">−{c.penalty.toLocaleString()}🪙</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
