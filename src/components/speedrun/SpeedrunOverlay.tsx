"use client";

/**
 * The OBS overlay's live part: a WebSocket to the relay's /watch/<overlay token> (phase 1 contract). The relay sends
 * { type: "state", state } on connect and on every change; we answer nothing but a ping now and then. A dropped
 * connection comes back with a growing pause (1s, 2s, 4s… up to 30s). A newer state seen on the same connection can
 * play a moment (gold split, new PB, reset); the first state after connecting never does.
 */

import { useEffect, useRef, useState } from "react";
import { isRelayState, momentFor } from "@/lib/speedrun/rules";
import type { RelayState, SpeedrunLook } from "@/lib/speedrun/types";
import { SpeedrunCanvas, type SpeedrunMoment } from "./SpeedrunCanvas";

const MOMENT_MS: Record<SpeedrunMoment["kind"], number> = { gold: 4500, pb: 8000, reset: 4500 };
const PING_MS = 25_000;
const MAX_WAIT_MS = 30_000;

interface Props {
  /** The relay's ws(s) address with the token, e.g. wss://relay.example/watch/o1.…; null = no relay here. */
  socketUrl: string | null;
  initial: RelayState;
  look: SpeedrunLook;
  game: string | null;
  category: string | null;
}

export function SpeedrunOverlay({ socketUrl, initial, look, game, category }: Props) {
  const [snap, setSnap] = useState<{ state: RelayState; at: number }>({ state: initial, at: 0 });
  const [moment, setMoment] = useState<SpeedrunMoment | null>(null);
  const live = useRef<{ state: RelayState; at: number }>({ state: initial, at: 0 });

  // Transparent page behind the canvas (an OBS source).
  useEffect(() => {
    document.documentElement.classList.add("sr-obs-route");
    return () => document.documentElement.classList.remove("sr-obs-route");
  }, []);

  useEffect(() => {
    if (!socketUrl || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let tries = 0;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let momentId = 0;

    const open = () => {
      if (stopped) return;
      let first = true;
      try { ws = new WebSocket(socketUrl); } catch { schedule(); return; }
      ws.onopen = () => {
        if (ping) clearInterval(ping);
        ping = setInterval(() => { try { ws?.send(JSON.stringify({ type: "ping" })); } catch { /* closing */ } }, PING_MS);
      };
      ws.onmessage = (ev) => {
        let msg: unknown;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (!msg || typeof msg !== "object" || (msg as { type?: string }).type !== "state") return;
        const next = (msg as { state?: unknown }).state;
        if (!isRelayState(next)) return;
        tries = 0;
        const now = performance.now();
        const prev = live.current;
        const kind = first ? null : momentFor(prev.state, next);
        first = false;
        live.current = { state: next, at: now };
        setSnap(live.current);
        if (kind) {
          // A reset shows the run as it stood when it stopped, frozen.
          const before = kind === "reset"
            ? { ...prev.state, phase: "paused" as const, elapsedMs: prev.state.phase === "running" ? prev.state.elapsedMs + (now - prev.at) : prev.state.elapsedMs }
            : null;
          setMoment({ kind, id: ++momentId, before });
        }
      };
      ws.onclose = () => { if (ping) { clearInterval(ping); ping = null; } schedule(); };
      ws.onerror = () => { try { ws?.close(); } catch { /* already closed */ } };
    };
    const schedule = () => {
      if (stopped || retry) return;
      const wait = Math.min(MAX_WAIT_MS, 1000 * 2 ** tries) * (0.8 + Math.random() * 0.4);
      tries = Math.min(tries + 1, 6);
      retry = setTimeout(() => { retry = null; open(); }, wait);
    };
    open();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; try { ws.close(); } catch { /* already closed */ } }
    };
  }, [socketUrl]);

  // A moment plays for a few seconds, then the overlay settles back.
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => setMoment((m) => (m && m.id === moment.id ? null : m)), MOMENT_MS[moment.kind]);
    return () => clearTimeout(t);
  }, [moment]);

  return (
    <SpeedrunCanvas state={snap.state} receivedAt={snap.at} look={look} game={game} category={category} moment={moment} />
  );
}
