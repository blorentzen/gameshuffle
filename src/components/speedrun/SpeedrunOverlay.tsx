"use client";

/**
 * The OBS overlay's live part: the relay's /watch socket (useRelayWatch). A newer state seen on the same connection
 * can play a moment (gold split, new PB, reset); the first state after connecting never does. Chat's "PB this run"
 * prediction (GS Pro) comes from the site every few seconds while a run is going (`predictionUrl`).
 */

import { useEffect, useRef, useState } from "react";
import { momentFor } from "@/lib/speedrun/rules";
import type { RelayState, SpeedrunLook, SpeedrunPredictionView } from "@/lib/speedrun/types";
import { SpeedrunCanvas, type SpeedrunMoment } from "./SpeedrunCanvas";
import { useRelayWatch } from "./useRelayWatch";

const MOMENT_MS: Record<SpeedrunMoment["kind"], number> = { gold: 4500, pb: 8000, reset: 4500 };
/** How often the prediction is asked for: while a run is going or a prediction shows, and otherwise. */
const PRED_LIVE_MS = 4_000;
const PRED_IDLE_MS = 30_000;

interface Props {
  /** The relay's ws(s) address with the token, e.g. wss://relay.example/watch/o1.…; null = no relay here. */
  socketUrl: string | null;
  initial: RelayState;
  look: SpeedrunLook;
  game: string | null;
  category: string | null;
  /** /api/speedrun/prediction/<token>, or null when the runner has no prediction switched on. */
  predictionUrl?: string | null;
}

export function SpeedrunOverlay({ socketUrl, initial, look, game, category, predictionUrl = null }: Props) {
  const [snap, setSnap] = useState<{ state: RelayState; at: number }>({ state: initial, at: 0 });
  const [moment, setMoment] = useState<SpeedrunMoment | null>(null);
  const live = useRef<{ state: RelayState; at: number }>({ state: initial, at: 0 });

  // Transparent page behind the canvas (an OBS source).
  useEffect(() => {
    document.documentElement.classList.add("sr-obs-route");
    return () => document.documentElement.classList.remove("sr-obs-route");
  }, []);

  const momentId = useRef(0);
  useRelayWatch(socketUrl, (next, first) => {
    const now = performance.now();
    const prev = live.current;
    const kind = first ? null : momentFor(prev.state, next);
    live.current = { state: next, at: now };
    setSnap(live.current);
    if (kind) {
      // A reset shows the run as it stood when it stopped, frozen.
      const before = kind === "reset"
        ? { ...prev.state, phase: "paused" as const, elapsedMs: prev.state.phase === "running" ? prev.state.elapsedMs + (now - prev.at) : prev.state.elapsedMs }
        : null;
      setMoment({ kind, id: ++momentId.current, before });
    }
  });

  // Chat's prediction: asked often while something's happening, rarely otherwise.
  const [prediction, setPrediction] = useState<SpeedrunPredictionView | null>(null);
  const predRef = useRef<SpeedrunPredictionView | null>(null);
  useEffect(() => {
    if (!predictionUrl) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ask = async () => {
      try {
        const res = await fetch(predictionUrl, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { prediction?: SpeedrunPredictionView | null };
          predRef.current = body.prediction ?? null;
          if (!stopped) setPrediction(predRef.current);
        }
      } catch { /* try again next time */ }
      if (stopped) return;
      const busy = live.current.state.phase !== "idle" || !!predRef.current;
      timer = setTimeout(() => void ask(), busy ? PRED_LIVE_MS : PRED_IDLE_MS);
    };
    void ask();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [predictionUrl]);

  // A moment plays for a few seconds, then the overlay settles back.
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => setMoment((m) => (m && m.id === moment.id ? null : m)), MOMENT_MS[moment.kind]);
    return () => clearTimeout(t);
  }, [moment]);

  return (
    <SpeedrunCanvas state={snap.state} receivedAt={snap.at} look={look} game={game} category={category} moment={moment} prediction={prediction} />
  );
}
