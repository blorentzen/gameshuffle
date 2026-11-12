"use client";

/**
 * Following a race room live: a WebSocket to the relay's /roomwatch/<r1 token> (speedrun-relay/src/room.ts). The room
 * sends { type: "room", room } on connect and on every change. Each lane is shown as it stood its runner's stream delay
 * ago (pick 5A), so nobody watching learns about a split before that runner's stream shows it; `undelayed` names a
 * lane shown live (a runner's own lane on their own overlay). A dropped connection comes back with a growing pause.
 * While the room is counting down or racing, the hook ticks a few times a second so clocks and delays move.
 */

import { useEffect, useMemo, useState } from "react";
import { laneAsOf, type LaneMoment } from "@/lib/versus/rules";
import type { RoomView } from "@/lib/versus/types";

const PING_MS = 25_000;
const MAX_WAIT_MS = 30_000;
const KEEP_MS = 3 * 60_000;
const TICK_MS = 100;

function isRoom(v: unknown): v is RoomView {
  return !!v && typeof v === "object" && (v as RoomView).v === 1 && Array.isArray((v as RoomView).entrants);
}

export interface RaceRoomState {
  /** The room with each lane as its watchers may see it now. */
  room: RoomView | null;
  /** The room as it is now (status, who's in, readiness: nothing a stream would spoil). */
  latest: RoomView | null;
  /** The room's clock now (epoch ms on the relay's clock). */
  serverNow: number;
  open: boolean;
}

interface Store { latest: RoomView | null; offset: number; history: Record<string, LaneMoment[]> }
const EMPTY: Store = { latest: null, offset: 0, history: {} };

/** A new view kept with each lane's recent past (copy on write, so React sees the change). */
function add(store: Store, room: RoomView, localNow: number): Store {
  const history = { ...store.history };
  for (const e of room.entrants) {
    const list = [...(history[e.key] ?? []), { at: room.now, entrant: e }];
    while (list.length > 2 && list[1].at < room.now - KEEP_MS) list.shift();
    history[e.key] = list;
  }
  return { latest: room, offset: room.now - localNow, history };
}

export function useRaceRoom(watchUrl: string | null, initial: RoomView | null, undelayed: string | null = null): RaceRoomState {
  const [store, setStore] = useState<Store>(() => (initial ? add(EMPTY, initial, Date.now()) : EMPTY));
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!watchUrl || typeof WebSocket === "undefined") return;
    let ws: WebSocket | null = null;
    let tries = 0;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const connect = () => {
      if (stopped) return;
      try { ws = new WebSocket(watchUrl); } catch { schedule(); return; }
      ws.onopen = () => {
        setOpen(true);
        if (ping) clearInterval(ping);
        ping = setInterval(() => { try { ws?.send(JSON.stringify({ type: "ping" })); } catch { /* closing */ } }, PING_MS);
      };
      ws.onmessage = (ev) => {
        let msg: unknown;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        const room = (msg as { type?: string; room?: unknown } | null)?.type === "room" ? (msg as { room: unknown }).room : null;
        if (!isRoom(room)) return;
        tries = 0;
        const at = Date.now();
        setStore((s) => add(s, room, at));
        setNow(at);
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
  }, [watchUrl]);

  // Tick while something moves: the countdown, the race, or a delayed lane still catching up after the finish.
  const { latest, offset, history } = store;
  const status = latest?.status;
  const serverNow = now + offset;
  const settling = status === "finished" && latest?.finishedAt != null && serverNow - latest.finishedAt < 65_000;
  useEffect(() => {
    if (status !== "countdown" && status !== "running" && !settling) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [status, settling]);

  const room = useMemo<RoomView | null>(() => {
    if (!latest) return null;
    return {
      ...latest,
      entrants: latest.entrants.map((e) => {
        if (e.key === undelayed || latest.status === "open" || latest.status === "countdown") return e;
        const past = laneAsOf(history[e.key] ?? [], serverNow, e.delayMs);
        return past ? { ...e, lane: past.lane } : e;
      }),
    };
  }, [latest, history, serverNow, undelayed]);

  return { room, latest, serverNow, open };
}
