// One Durable Object per head-to-head room (speedrun races picks 2026-11-10). The site sets it up (/room, with the
// shared secret): the title, the checkpoints, who's in. Each runner's relay object, once bound here, sends its state on
// every change; the room keeps a lane per runner, starts every timer itself when the countdown ends (pick 2A), turns a
// reset into a forfeit (pick 4A), pushes the room to every watcher (the race page, overlays, the restream link) and
// tells the site at the start, at each lane's end and at the finish. Lanes can also be fed by the site (a game the
// site runs, such as a two-player duel), so nothing here is about timers except the relay binding.

import { DurableObject } from "cloudflare:workers";
import {
  MAX_RACE_MS,
  allResolved,
  cleanCheckpoints,
  cleanEntrants,
  cleanLive,
  emptyLane,
  emptyRoom,
  finishedRoom,
  laneFromLive,
  laneFromSite,
  leaderReached,
  outLane,
  startedRoom,
  viewOf,
  type Lane,
  type RoomCore,
  type RoomStatus,
  type Unit,
} from "./roomState";
import { signBody } from "./tokens";
import type { RelayEnv } from "./relay";

export type RoomHookEvent = "started" | "lane" | "progress" | "finished" | "cancelled";

const MAX_WATCHERS = 500;
const HOOK_TIMEOUT_MS = 8000;
/** A finished or cancelled room is wiped this long after (the site keeps the results). */
const KEEP_MS = 3 * 24 * 60 * 60_000;
/** The countdown can't be shorter (every timer has to hear about it) or further out than this. */
const MIN_COUNTDOWN_MS = 3000;
const MAX_COUNTDOWN_MS = 120_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // already closing
  }
}

const ended = (s: RoomStatus) => s === "finished" || s === "cancelled";

export class Room extends DurableObject<RelayEnv> {
  private r!: RoomCore;
  private hooks: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
    ctx.blockConcurrencyWhile(async () => {
      this.r = (await ctx.storage.get<RoomCore>("room")) ?? emptyRoom();
    });
  }

  async fetch(req: Request): Promise<Response> {
    const op = req.headers.get("x-relay-op");
    const roomId = req.headers.get("x-room-id");
    if (roomId && this.r.roomId !== roomId) this.r = { ...this.r, roomId };
    switch (op) {
      case "roomwatch":
        return this.acceptWatch();
      case "room":
        return req.method === "GET" ? this.read() : this.site(req);
      case "lane":
        return this.fromRelay(req);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private read(): Response {
    if (!this.r.configVersion) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, room: viewOf(this.r, Date.now()) });
  }

  private acceptWatch(): Response {
    if (this.ctx.getWebSockets("watch").length >= MAX_WATCHERS) {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      server.close(4029, "Too many people are watching this race.");
      return new Response(null, { status: 101, webSocket: client });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, ["watch"]);
    server.send(JSON.stringify({ type: "room", room: viewOf(this.r, Date.now()) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message.length < 200) {
      try {
        if ((JSON.parse(message) as { type?: unknown }).type === "ping") ws.send('{"type":"pong"}');
      } catch {
        // not JSON: ignore
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    closeQuietly(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
  }

  // ---- The site ---------------------------------------------------------------------------------------------

  private async site(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return json({ ok: false, error: "bad_body" }, 400);
    const now = Date.now();
    switch (body.op) {
      case "setup":
        return this.setup(body, now);
      case "start":
        return this.scheduleStart(body, now);
      case "leave":
      case "remove":
        return this.takeOut(String(body.key ?? ""), body.op === "leave" ? "left" : "removed", now);
      case "lane":
        return this.siteLane(String(body.key ?? ""), body.lane, now);
      case "end":
        if (this.r.status !== "running") return json({ ok: false, error: "not_running" }, 409);
        await this.finish(finishedRoom(this.r, now, "ended"));
        return json({ ok: true, room: viewOf(this.r, now) });
      case "cancel":
        if (ended(this.r.status)) return json({ ok: true, room: viewOf(this.r, now) });
        await this.unbindAll(this.r.entrants.map((e) => e.relayId));
        await this.commit({ ...this.r, status: "cancelled", finishedAt: now }, "cancelled");
        await this.ctx.storage.setAlarm(now + KEEP_MS);
        return json({ ok: true, room: viewOf(this.r, now) });
      default:
        return json({ ok: false, error: "bad_op" }, 400);
    }
  }

  /** The whole config, every time (a missed call catches up on the next). Entrants change only before the start. */
  private async setup(b: Record<string, unknown>, now: number): Promise<Response> {
    const version = typeof b.configVersion === "number" && Number.isInteger(b.configVersion) && b.configVersion > 0 ? b.configVersion : null;
    const entrants = cleanEntrants(b.entrants);
    const checkpoints = cleanCheckpoints(b.checkpoints);
    const unit: Unit = b.unit === "turns" ? "turns" : "ms";
    const title = typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const kind = typeof b.kind === "string" && /^[a-z-]{2,20}$/.test(b.kind) ? b.kind : null;
    if (!version || !entrants || !checkpoints || !kind) return json({ ok: false, error: "bad_body" }, 400);
    if (version < this.r.configVersion) return json({ ok: true, stale: true, room: viewOf(this.r, now) });
    if (ended(this.r.status)) return json({ ok: false, error: "ended", room: viewOf(this.r, now) }, 409);

    let next: RoomCore = { ...this.r, configVersion: version, kind, title, unit };
    const before = this.r.entrants;
    if (this.r.status === "open") {
      next = { ...next, checkpoints, entrants };
      const lanes: Record<string, Lane> = {};
      for (const e of entrants) lanes[e.key] = this.r.lanes[e.key] ?? emptyLane();
      next.lanes = lanes;
    } else {
      // During the countdown or the race: names, colors, delays and ready marks can change; nobody joins.
      const byKey = new Map(entrants.map((e) => [e.key, e]));
      next.entrants = before.map((e) => {
        const n = byKey.get(e.key);
        return n ? { ...e, name: n.name, color: n.color, delayMs: n.delayMs, ready: n.ready } : e;
      });
    }
    // Bind relays that came in (or changed), unbind ones that left.
    const was = new Map(before.map((e) => [e.key, e.relayId]));
    const now2 = new Map(next.entrants.map((e) => [e.key, e.relayId]));
    const gone = before.filter((e) => e.relayId && now2.get(e.key) !== e.relayId).map((e) => e.relayId);
    const fresh = next.entrants.filter((e) => e.relayId && was.get(e.key) !== e.relayId);
    await this.commit(next, null);
    await this.unbindAll(gone);
    for (const e of fresh) await this.bind(e.relayId!, e.key);
    return json({ ok: true, room: viewOf(this.r, Date.now()) });
  }

  /** The host starts the countdown: who races (anyone else is taken out) and when it ends. */
  private async scheduleStart(b: Record<string, unknown>, now: number): Promise<Response> {
    if (this.r.status !== "open") return json({ ok: false, error: "not_open", room: viewOf(this.r, now) }, 409);
    const startAt = typeof b.startAt === "number" && Number.isFinite(b.startAt) ? Math.round(b.startAt) : NaN;
    if (!(startAt >= now + MIN_COUNTDOWN_MS && startAt <= now + MAX_COUNTDOWN_MS)) return json({ ok: false, error: "bad_start" }, 400);
    const keys = Array.isArray(b.keys) ? new Set(b.keys.filter((k): k is string => typeof k === "string")) : null;
    const entrants = keys ? this.r.entrants.filter((e) => keys.has(e.key)) : this.r.entrants;
    if (entrants.length < 1) return json({ ok: false, error: "nobody" }, 409);
    const dropped = this.r.entrants.filter((e) => !entrants.includes(e)).map((e) => e.relayId);
    const lanes: Record<string, Lane> = {};
    for (const e of entrants) lanes[e.key] = this.r.lanes[e.key] ?? emptyLane();
    await this.commit({ ...this.r, entrants, lanes, status: "countdown", startAt }, null);
    await this.unbindAll(dropped);
    await this.ctx.storage.setAlarm(startAt);
    return json({ ok: true, room: viewOf(this.r, now) });
  }

  private async takeOut(key: string, reason: "left" | "removed", now: number): Promise<Response> {
    const e = this.r.entrants.find((x) => x.key === key);
    if (!e) return json({ ok: true, room: viewOf(this.r, now) });
    if (this.r.status === "open" || this.r.status === "countdown") {
      const entrants = this.r.entrants.filter((x) => x.key !== key);
      const lanes = { ...this.r.lanes };
      delete lanes[key];
      await this.commit({ ...this.r, entrants, lanes }, null);
      await this.unbindAll([e.relayId]);
      return json({ ok: true, room: viewOf(this.r, now) });
    }
    if (this.r.status !== "running") return json({ ok: true, room: viewOf(this.r, now) });
    const lane = this.r.lanes[key] ?? emptyLane();
    await this.laneChanged(key, outLane(lane, reason, now), now);
    await this.unbindAll([e.relayId]);
    return json({ ok: true, room: viewOf(this.r, now) });
  }

  private async siteLane(key: string, raw: unknown, now: number): Promise<Response> {
    const e = this.r.entrants.find((x) => x.key === key);
    if (!e || e.source !== "site") return json({ ok: false, error: "not_found" }, 404);
    const next = laneFromSite(this.r.lanes[key] ?? emptyLane(), raw, this.r.status, now);
    if (!next) return json({ ok: false, error: "bad_body" }, 400);
    await this.laneChanged(key, next, now);
    return json({ ok: true, room: viewOf(this.r, now) });
  }

  // ---- Relays -------------------------------------------------------------------------------------------------

  /** A bound relay's state. Ignored unless that relay is this lane's (a relay a room let go may still be sending). */
  private async fromRelay(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as { key?: unknown; relayId?: unknown; live?: unknown } | null;
    const key = typeof body?.key === "string" ? body.key : "";
    const e = this.r.entrants.find((x) => x.key === key);
    if (!e || e.source !== "relay" || e.relayId !== body?.relayId) return json({ ok: false, error: "not_in_room" }, 409);
    const live = cleanLive(body?.live);
    if (!live) return json({ ok: false, error: "bad_body" }, 400);
    await this.laneChanged(key, laneFromLive(this.r.lanes[key] ?? emptyLane(), live, this.r.status), Date.now());
    return json({ ok: true });
  }

  private relayStub(relayId: string) {
    return this.env.RELAY.getByName(relayId);
  }

  private async bind(relayId: string, key: string): Promise<void> {
    if (!this.r.roomId) return;
    try {
      const res = await this.relayStub(relayId).fetch(new Request("https://relay/bind", {
        method: "POST",
        headers: { "x-relay-op": "bind", "x-relay-id": relayId, "content-type": "application/json" },
        body: JSON.stringify({ roomId: this.r.roomId, key }),
      }));
      await res.body?.cancel();
    } catch (err) {
      console.warn("[room] bind failed:", err instanceof Error ? err.message : err);
    }
  }

  private async unbindAll(relayIds: (string | null)[]): Promise<void> {
    const roomId = this.r.roomId;
    await Promise.all(relayIds.filter((id): id is string => !!id).map(async (relayId) => {
      try {
        const res = await this.relayStub(relayId).fetch(new Request("https://relay/bind", {
          method: "POST",
          headers: { "x-relay-op": "bind", "x-relay-id": relayId, "content-type": "application/json" },
          body: JSON.stringify({ roomId: null, from: roomId }),
        }));
        await res.body?.cancel();
      } catch (err) {
        console.warn("[room] unbind failed:", err instanceof Error ? err.message : err);
      }
    }));
  }

  /** Go: every lane runs, then every relay timer is started at once (each keeps its own start, so a tenth of a second
   *  of network never decides a race). A timer that won't start is out ("nostart"). */
  private async startRace(): Promise<void> {
    const now = Date.now();
    await this.commit(startedRoom(this.r, now), "started");
    if (!this.r.entrants.length) return this.finish({ ...this.r, status: "finished", finishedAt: now });
    await this.ctx.storage.setAlarm(now + MAX_RACE_MS);
    const relays = this.r.entrants.filter((e) => e.source === "relay" && e.relayId);
    const results = await Promise.all(relays.map(async (e) => {
      try {
        const res = await this.relayStub(e.relayId!).fetch(new Request("https://relay/cmd", {
          method: "POST",
          headers: { "x-relay-op": "cmd", "x-relay-id": e.relayId!, "content-type": "application/json" },
          body: JSON.stringify({ command: "start" }),
        }));
        const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; state?: { phase?: string; attempt?: number } } | null;
        return { e, out };
      } catch {
        return { e, out: null };
      }
    }));
    for (const { e, out } of results) {
      const lane = this.r.lanes[e.key] ?? emptyLane();
      if (lane.status !== "running") continue;
      // "busy" or "run_in_progress": the runner had already started; their own start counts.
      const already = out && !out.ok && /busy|progress|running/.test(out.error ?? "");
      if (out?.ok && out.state && out.state.phase !== "idle" && typeof out.state.attempt === "number") {
        if (lane.attempt == null) await this.laneChanged(e.key, { ...lane, attempt: out.state.attempt }, Date.now());
      } else if (!already) {
        await this.laneChanged(e.key, outLane(lane, "nostart", Date.now()), Date.now());
      }
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    if (this.r.status === "countdown" && this.r.startAt && now >= this.r.startAt - 50) return this.startRace();
    if (this.r.status === "countdown" && this.r.startAt) return this.ctx.storage.setAlarm(this.r.startAt);
    if (this.r.status === "running" && this.r.startedAt && now >= this.r.startedAt + MAX_RACE_MS - 1000) {
      return this.finish(finishedRoom(this.r, now, "timeout"));
    }
    if (ended(this.r.status) && this.r.finishedAt && now >= this.r.finishedAt + KEEP_MS - 1000) {
      for (const ws of this.ctx.getWebSockets("watch")) closeQuietly(ws, 1000, "This race is over.");
      await this.ctx.storage.deleteAll();
      this.r = emptyRoom();
    }
  }

  // ---- Commit, broadcast, webhook ----------------------------------------------------------------------------

  /** A lane moved: kept, broadcast, and the site told when it ended or the leader reached a new checkpoint; the room
   *  finishes once every lane has. */
  private async laneChanged(key: string, lane: Lane, now: number): Promise<void> {
    const before = this.r.lanes[key];
    const lead = leaderReached(this.r);
    const next: RoomCore = { ...this.r, lanes: { ...this.r.lanes, [key]: lane } };
    const endedNow = !!before && before.status !== lane.status && (lane.status === "done" || lane.status === "out");
    const led = this.r.status === "running" && leaderReached(next) > lead;
    await this.commit(next, endedNow ? "lane" : led ? "progress" : null);
    if (this.r.status === "running" && allResolved(this.r)) await this.finish({ ...this.r, status: "finished", finishedAt: now });
  }

  private async finish(next: RoomCore): Promise<void> {
    await this.commit(next, "finished");
    await this.unbindAll(this.r.entrants.map((e) => e.relayId));
    await this.ctx.storage.setAlarm(Date.now() + KEEP_MS);
  }

  private async commit(next: RoomCore, event: RoomHookEvent | null): Promise<void> {
    this.r = { ...next, seq: this.r.seq + 1 };
    await this.ctx.storage.put("room", this.r);
    const view = viewOf(this.r, Date.now());
    const msg = JSON.stringify({ type: "room", room: view });
    for (const ws of this.ctx.getWebSockets("watch")) {
      try {
        ws.send(msg);
      } catch {
        // closing
      }
    }
    if (event) this.hook(event, view);
  }

  /** Tells the site, in order, without holding anything else up. Retried once on a 5xx or a network error. */
  private hook(event: RoomHookEvent, room: ReturnType<typeof viewOf>): void {
    const origin = this.env.GS_ORIGIN?.replace(/\/+$/, "");
    const secret = this.env.SPEEDRUN_RELAY_SECRET;
    const roomId = this.r.roomId;
    if (!origin || !secret || !roomId) return;
    const body = JSON.stringify({ roomId, event, room });
    const send = async () => {
      const signature = await signBody(secret, body);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`${origin}/api/versus/relay`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-relay-signature": signature },
            body,
            signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
          });
          await res.body?.cancel();
          if (res.status < 500) {
            if (!res.ok) console.warn(`[room] webhook ${event} answered ${res.status}`);
            return;
          }
        } catch (e) {
          console.warn(`[room] webhook ${event} failed (try ${attempt}):`, e instanceof Error ? e.message : e);
        }
        if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
      }
    };
    const run = this.hooks.then(send, send);
    this.hooks = run;
    this.ctx.waitUntil(run);
  }
}
