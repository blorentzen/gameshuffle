"use client";

/**
 * Following a run live: a WebSocket to the relay's /watch/<overlay token> (phase 1 contract). The relay sends
 * { type: "state", state } on connect and on every change; we answer nothing but a ping now and then. A dropped
 * connection comes back with a growing pause (1s, 2s, 4s… up to 30s). `onState` hears every state with `first` = the
 * first one on this connection (overlays never play a moment for it). Used by the OBS overlay and the phone remote
 * (which adds `?as=remote` so the relay doesn't count it as an overlay).
 */

import { useEffect, useRef, useState } from "react";
import { isRelayState } from "@/lib/speedrun/rules";
import type { RelayState } from "@/lib/speedrun/types";

const PING_MS = 25_000;
const MAX_WAIT_MS = 30_000;

/** True while the socket is open. */
export function useRelayWatch(socketUrl: string | null, onState: (state: RelayState, first: boolean) => void): boolean {
  const handler = useRef(onState);
  useEffect(() => { handler.current = onState; });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!socketUrl || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let tries = 0;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (stopped) return;
      let first = true;
      try { ws = new WebSocket(socketUrl); } catch { schedule(); return; }
      ws.onopen = () => {
        setOpen(true);
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
        handler.current(next, first);
        first = false;
      };
      ws.onclose = () => {
        setOpen(false);
        if (ping) { clearInterval(ping); ping = null; }
        schedule();
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* already closed */ } };
    };
    const schedule = () => {
      if (stopped || retry) return;
      const wait = Math.min(MAX_WAIT_MS, 1000 * 2 ** tries) * (0.8 + Math.random() * 0.4);
      tries = Math.min(tries + 1, 6);
      retry = setTimeout(() => { retry = null; connect(); }, wait);
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; try { ws.close(); } catch { /* already closed */ } }
    };
  }, [socketUrl]);

  return open;
}
