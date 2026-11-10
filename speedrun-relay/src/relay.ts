// One Durable Object per runner. LiveSplit One connects here (socket tag "lso") and the object is the protocol
// client: it reads the run, follows events, keeps the RelayState in storage, pushes it to every overlay (tag "watch")
// and tells the site about attempts. Hibernation API throughout: sockets stay open while the object sleeps.

import { DurableObject } from "cloudflare:workers";
import { LsoClient, LsoError, type LsoReply } from "./lso";
import { observe, readReached, readRun, readSnap, readTimes, timeOf } from "./reads";
import {
  emptyCore,
  finished,
  paused,
  predictedMs,
  reachedOf,
  rebased,
  reconcile,
  refreshed,
  remeasured,
  resegmented,
  reset,
  resumed,
  sameSegments,
  sameView,
  skipped,
  splitted,
  started,
  undone,
  type Core,
  type HookEvent,
  type RelayState,
  type Snap,
} from "./state";
import { signBody } from "./tokens";

export interface RelayEnv {
  RELAY: DurableObjectNamespace<Relay>;
  SPEEDRUN_RELAY_SECRET?: string;
  GS_ORIGIN?: string;
}

interface Persist {
  relayId: string | null;
  core: Core;
  attemptBase: number;
  minTimer: number;
  minOverlay: number;
  lsoConn: string | null;
}

interface Attachment {
  kind: "lso" | "overlay";
  version: number;
  conn?: string;
}

export const CLOSE = {
  replaced: { code: 4000, reason: "Replaced by a newer LiveSplit One connection." },
  retired: { code: 4001, reason: "This address was replaced. Copy the new one from GameShuffle." },
  invalid: { code: 4003, reason: "This address isn't valid. Copy it again from GameShuffle." },
  full: { code: 4029, reason: "Too many overlays are open for this run." },
} as const;

const MAX_WATCHERS = 64;
const MAX_FIELD = 80;
const SOFT_REFRESH_MS = 1000;
const DRIFT_MS = 300;
const HOOK_TIMEOUT_MS = 8000;
// Start only starts and Split only splits (LiveSplit One refuses each at the wrong time), so a stale Start tap from
// the remote or a mod can't split a run in progress.
const COMMANDS: Record<string, { command: string; [k: string]: unknown }> = {
  start: { command: "start" },
  split: { command: "split" },
  undo: { command: "undoSplit" },
  skip: { command: "skipSplit" },
  reset: { command: "reset", saveAttempt: true },
  pause: { command: "pause" },
  resume: { command: "resume" },
};
const ERRORS: Record<string, string> = { Busy: "busy", NoRunInProgress: "no_run" };

function errorName(code: string): string {
  return ERRORS[code] ?? code.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Opens and at once closes a socket, so the other side sees why (an HTTP error would only say it failed). */
export function refuse(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

function attachmentOf(ws: WebSocket): Attachment | null {
  try {
    return (ws.deserializeAttachment() as Attachment | null) ?? null;
  } catch {
    return null;
  }
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // already closing
  }
}

export class Relay extends DurableObject<RelayEnv> {
  private p!: Persist;
  private client: LsoClient | null = null;
  private work: Promise<unknown> = Promise.resolve();
  private hooks: Promise<unknown> = Promise.resolve();
  private syncPending = false;
  private failures = 0;
  private softTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Persist>("relay");
      this.p = saved ?? { relayId: null, core: emptyCore(), attemptBase: 0, minTimer: 1, minOverlay: 1, lsoConn: null };
      const lso = this.currentLso();
      if (lso) this.bind(lso);
      else if (this.p.lsoConn || this.p.core.state.connected) {
        // Woke up without the LiveSplit One socket (restart or deploy): it is gone.
        this.p.lsoConn = null;
        await this.commit({ ...this.p.core, state: { ...this.p.core.state, connected: false } }, "disconnect");
      }
    });
  }

  // ---- HTTP from the Worker -------------------------------------------------------------------------------------

  async fetch(req: Request): Promise<Response> {
    const op = req.headers.get("x-relay-op");
    const relayId = req.headers.get("x-relay-id");
    if (relayId && this.p.relayId !== relayId) {
      this.p.relayId = relayId;
      await this.save();
    }
    const version = Number(req.headers.get("x-token-version") ?? "0");
    switch (op) {
      case "lso":
        return this.acceptLso(version);
      case "watch":
        return this.acceptWatch(version);
      case "cmd":
        return this.cmd(req);
      case "admin":
        return this.admin(req);
      case "state":
        return json(this.p.core.state);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private async acceptLso(version: number): Promise<Response> {
    if (!(version >= this.p.minTimer)) return refuse(CLOSE.retired.code, CLOSE.retired.reason);
    // A newer signed address means the site moved on: older ones stop working even if /admin never arrived.
    if (version > this.p.minTimer) this.p.minTimer = version;
    const [client, server] = Object.values(new WebSocketPair());
    const conn = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, ["lso"]);
    server.serializeAttachment({ kind: "lso", version, conn } satisfies Attachment);
    for (const ws of this.ctx.getWebSockets("lso")) {
      if (ws !== server) closeQuietly(ws, CLOSE.replaced.code, CLOSE.replaced.reason);
    }
    this.p.lsoConn = conn;
    const lso = this.bind(server);
    await this.commit({ ...this.p.core, state: { ...this.p.core.state, connected: true } }, null);
    this.enqueue(() => this.syncAll(lso, true));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async acceptWatch(version: number): Promise<Response> {
    if (!(version >= this.p.minOverlay)) return refuse(CLOSE.retired.code, CLOSE.retired.reason);
    if (version > this.p.minOverlay) {
      this.p.minOverlay = version;
      await this.save();
      this.closeOld("watch", version);
    }
    if (this.ctx.getWebSockets("watch").length >= MAX_WATCHERS) return refuse(CLOSE.full.code, CLOSE.full.reason);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, ["watch"]);
    server.serializeAttachment({ kind: "overlay", version } satisfies Attachment);
    server.send(JSON.stringify({ type: "state", state: this.p.core.state }));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async cmd(req: Request): Promise<Response> {
    const body = await req.json().catch(() => null) as { command?: unknown } | null;
    const name = typeof body?.command === "string" ? body.command : "";
    const command = COMMANDS[name];
    if (!command) return json({ ok: false, error: "bad_command" }, 400);
    const lso = this.client;
    if (!lso) return json({ ok: false, error: "not_connected" });
    let reply: LsoReply;
    try {
      reply = await lso.request(command);
    } catch (e) {
      return json({ ok: false, error: e instanceof LsoError && e.code === "closed" ? "not_connected" : "timeout" });
    }
    if (!reply.ok) return json({ ok: false, error: errorName(reply.code) });
    // LiveSplit One sends the event before the reply, so its handling is already queued: wait for it.
    await this.settle();
    return json({ ok: true, state: this.p.core.state });
  }

  private async admin(req: Request): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "bad_body" }, 400);
    const b = body as Record<string, unknown>;
    const int = (v: unknown, min: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= 1e9;
    const text = (v: unknown) => v === null || (typeof v === "string" && v.trim().length <= MAX_FIELD);
    const bad =
      (b.timerVersion !== undefined && !int(b.timerVersion, 1)) ||
      (b.overlayVersion !== undefined && !int(b.overlayVersion, 1)) ||
      (b.attemptBase !== undefined && !int(b.attemptBase, 0)) ||
      (b.game !== undefined && !text(b.game)) ||
      (b.category !== undefined && !text(b.category));
    if (bad) return json({ ok: false, error: "bad_body" }, 400);

    let core = this.p.core;
    if (b.attemptBase !== undefined && b.attemptBase !== this.p.attemptBase) {
      this.p.attemptBase = b.attemptBase as number;
      core = rebased(core, this.p.attemptBase);
    }
    const tidy = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    if (b.game !== undefined) core = { ...core, state: { ...core.state, game: tidy(b.game) } };
    if (b.category !== undefined) core = { ...core, state: { ...core.state, category: tidy(b.category) } };
    if (b.overlayVersion !== undefined) {
      this.p.minOverlay = b.overlayVersion as number;
      this.closeOld("watch", this.p.minOverlay);
    }
    let lsoGone = false;
    if (b.timerVersion !== undefined) {
      this.p.minTimer = b.timerVersion as number;
      lsoGone = this.closeOld("lso", this.p.minTimer);
    }
    if (lsoGone) {
      this.unbind();
      core = { ...core, state: { ...core.state, connected: false } };
    }
    await this.commit(core, lsoGone ? "disconnect" : null);
    return json({ ok: true, state: this.p.core.state });
  }

  // ---- Sockets ------------------------------------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = attachmentOf(ws);
    if (a?.kind === "lso") {
      if (!a.conn || a.conn !== this.p.lsoConn) return; // a replaced connection
      const lso = this.client ?? this.bind(ws);
      lso.handle(typeof message === "string" ? message : new TextDecoder().decode(message));
      return;
    }
    // Overlays only ping (the auto response answers the exact form without waking the object).
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
    this.socketGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.socketGone(ws);
  }

  private socketGone(ws: WebSocket): void {
    const a = attachmentOf(ws);
    if (a?.kind !== "lso" || !a.conn || a.conn !== this.p.lsoConn) return;
    this.unbind();
    this.enqueue(async () => {
      if (this.p.lsoConn) return; // a new LiveSplit One connected meanwhile
      await this.commit({ ...this.p.core, state: { ...this.p.core.state, connected: false } }, "disconnect");
    });
  }

  private currentLso(): WebSocket | null {
    if (!this.p.lsoConn) return null;
    return this.ctx.getWebSockets("lso").find((ws) => attachmentOf(ws)?.conn === this.p.lsoConn) ?? null;
  }

  /** Closes sockets of one kind whose token version is below `min`. True when that closed the current LiveSplit One. */
  private closeOld(tag: "lso" | "watch", min: number): boolean {
    let closedCurrent = false;
    for (const ws of this.ctx.getWebSockets(tag)) {
      const a = attachmentOf(ws);
      if (!a || a.version >= min) continue;
      if (tag === "lso" && a.conn === this.p.lsoConn) closedCurrent = true;
      closeQuietly(ws, CLOSE.retired.code, CLOSE.retired.reason);
    }
    return closedCurrent;
  }

  private bind(ws: WebSocket): LsoClient {
    this.client?.close();
    const lso: LsoClient = new LsoClient({
      send: (text) => ws.send(text),
      onEvent: (name) => this.enqueue(() => this.onEvent(lso, name)),
      onLost: () => this.needSync(lso),
    });
    this.client = lso;
    this.failures = 0;
    return lso;
  }

  private unbind(): void {
    this.client?.close();
    this.client = null;
    this.p.lsoConn = null;
    if (this.softTimer) clearTimeout(this.softTimer);
    this.softTimer = null;
  }

  // ---- Following LiveSplit One -------------------------------------------------------------------------------

  /** Runs one job at a time, in order, so commits never interleave. */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.work.then(job).catch((e) => this.onJobError(e));
    this.work = run;
    this.ctx.waitUntil(run);
    return run;
  }

  /** Resolves once every queued job (including ones queued while waiting) has finished. */
  private async settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      const w = this.work;
      await w;
      if (w === this.work) return;
    }
  }

  private onJobError(e: unknown): void {
    if (e instanceof LsoError && e.code === "closed") return;
    console.warn("[relay] job failed:", e instanceof Error ? e.message : e);
    // Resync: the client calls back by itself once LiveSplit One has gone quiet.
    if (e instanceof LsoError && e.code === "resync") return;
    const lso = this.client;
    if (lso && !lso.isClosed && ++this.failures <= 3) this.needSync(lso);
  }

  /** One full read at a time: a late reply while one is queued or running changes nothing it won't see. */
  private needSync(lso: LsoClient): void {
    if (this.syncPending || lso !== this.client) return;
    this.syncPending = true;
    this.enqueue(async () => {
      try {
        await this.syncAll(lso, false);
      } finally {
        this.syncPending = false;
      }
    });
  }

  /** Reads everything and lines the relay up with LiveSplit One (on connect, and after anything went missing). */
  private async syncAll(lso: LsoClient, connecting: boolean): Promise<void> {
    try {
      const obs = await observe(lso);
      if (lso !== this.client) return;
      for (const step of reconcile(this.p.core, obs)) await this.commit(step.core, step.event);
      this.failures = 0;
    } finally {
      if (connecting && lso === this.client) this.hook("connect", this.p.core.state);
    }
  }

  private async onEvent(lso: LsoClient, name: string): Promise<void> {
    if (lso !== this.client) return;
    const n = this.p.core.state.segments.length;
    switch (name) {
      case "Started": {
        const read = (await readSnap(lso)).snap;
        if (lso !== this.client) return;
        // Each event's own phase wins over a read that already shows the next event.
        const snap: Snap = read.phase === "idle" ? { phase: "running", index: 0, timeMs: 0 } : read;
        // A reset went by unseen: close that attempt first.
        if (this.p.core.state.phase !== "idle") {
          await this.commit(reset(this.p.core, { phase: "idle", index: null, timeMs: 0 }, null), "reset");
        }
        await this.commit(started(this.p.core, snap, null), "start");
        // The splits file may have changed since the last read: check, and fix the attempt if it did.
        const segments = await readRun(lso);
        if (lso === this.client && !sameSegments(segments, this.p.core.state.segments)) {
          await this.commit(resegmented(this.p.core, segments), null);
        }
        return;
      }
      case "Splitted":
      case "Finished": {
        const finish = name === "Finished";
        const from = Math.min(this.p.core.state.index ?? 0, Math.max(n - 1, 0));
        const target = finish ? Math.max(n - 1, 0) : from;
        const read = await readSnap(lso, [{ command: "getCurrentRunSplitTime", index: target }]);
        const extra = read.extra;
        const snap: Snap = finish && read.snap.phase !== "ended" ? { phase: "ended", index: null, timeMs: read.snap.timeMs } : read.snap;
        if (lso !== this.client) return;
        // A Finished already queued handles the last split; an earlier job or a full read may have this one already.
        if (!finish && (snap.phase === "ended" || reachedOf(snap, n) <= from)) return;
        if (finish && this.p.core.state.phase === "ended" && this.p.core.state.last?.kind === "finish") return;
        const times = new Map<number, number | null>([[target, timeOf(extra[0])]]);
        const upTo = finish ? n : reachedOf(snap, n);
        const missing: number[] = [];
        for (let i = from; i < upTo; i++) if (!times.has(i)) missing.push(i);
        if (missing.length) for (const [i, t] of await readTimes(lso, missing)) times.set(i, t);
        if (lso !== this.client) return;
        await this.commit(finish ? finished(this.p.core, snap, times) : splitted(this.p.core, snap, times), finish ? "finish" : "split");
        if (finish) await this.rereadRun(lso);
        return;
      }
      case "SplitSkipped":
      case "SplitUndone": {
        const { snap } = await readSnap(lso);
        const times = await readReached(lso, snap, n);
        if (lso !== this.client) return;
        const skip = name === "SplitSkipped";
        await this.commit(skip ? skipped(this.p.core, snap, times) : undone(this.p.core, snap, times), skip ? "skip" : "undo");
        return;
      }
      case "Reset": {
        const read = (await readSnap(lso)).snap;
        const segments = await readRun(lso); // the PB and best segments it just saved
        if (lso !== this.client) return;
        const snap: Snap = read.phase === "idle" ? read : { phase: "idle", index: null, timeMs: 0 };
        await this.commit(reset(this.p.core, snap, segments), "reset");
        return;
      }
      case "Paused":
      case "Resumed":
      case "PausesUndone":
      case "PausesUndoneAndResumed": {
        const { snap } = await readSnap(lso);
        if (lso !== this.client) return;
        const next = name === "Paused" ? paused(this.p.core, snap) : name === "PausesUndone" ? refreshed(this.p.core, snap) : resumed(this.p.core, snap);
        await this.commit(next, null);
        return;
      }
      case "TimingMethodChanged": {
        const obs = await observe(lso);
        if (lso !== this.client) return;
        await this.commit(remeasured(this.p.core, obs), null);
        return;
      }
      case "GameTimeInitialized":
      case "GameTimeSet":
      case "GameTimePaused":
      case "GameTimeResumed":
      case "LoadingTimesSet":
        // Auto splitters can send these every frame: look at most once a second.
        this.softRefresh(lso);
        return;
      default:
        return; // ComparisonChanged, CustomVariableSet, AutoSplitterSettingsChanged: nothing overlays show
    }
  }

  private async rereadRun(lso: LsoClient): Promise<void> {
    const segments = await readRun(lso);
    if (lso === this.client && !sameSegments(segments, this.p.core.state.segments)) {
      await this.commit({ ...this.p.core, state: { ...this.p.core.state, segments } }, null);
    }
  }

  private softRefresh(lso: LsoClient): void {
    if (this.softTimer) return;
    this.softTimer = setTimeout(() => {
      this.softTimer = null;
      this.enqueue(async () => {
        if (lso !== this.client) return;
        const { snap } = await readSnap(lso);
        if (lso !== this.client) return;
        const s = this.p.core.state;
        const drift = Math.abs(snap.timeMs - predictedMs(s, Date.now()));
        if (snap.phase !== s.phase || snap.index !== s.index || drift > DRIFT_MS) await this.commit(refreshed(this.p.core, snap), null);
      });
    }, SOFT_REFRESH_MS);
  }

  // ---- Commit, broadcast, webhook ----------------------------------------------------------------------------

  private async save(): Promise<void> {
    await this.ctx.storage.put("relay", this.p);
  }

  private async commit(core: Core, event: HookEvent | null): Promise<void> {
    const prev = this.p.core.state;
    if (!event && sameView(prev, core.state) && core.count === this.p.core.count && core.rebase === this.p.core.rebase) {
      this.p.core = { ...core, state: prev };
      await this.save();
      return;
    }
    const state: RelayState = { ...core.state, v: 1, seq: prev.seq + 1, at: Date.now() };
    this.p.core = { ...core, state };
    await this.save();
    const msg = JSON.stringify({ type: "state", state });
    for (const ws of this.ctx.getWebSockets("watch")) {
      try {
        ws.send(msg);
      } catch {
        // closing
      }
    }
    if (event) this.hook(event, state);
  }

  /** Tells the site, in order, without holding anything else up. Retried once on a 5xx or a network error. */
  private hook(event: HookEvent, state: RelayState): void {
    const origin = this.env.GS_ORIGIN?.replace(/\/+$/, "");
    const secret = this.env.SPEEDRUN_RELAY_SECRET;
    const relayId = this.p.relayId;
    if (!origin || !secret || !relayId) return;
    const body = JSON.stringify({ relayId, event, state });
    const send = async () => {
      const signature = await signBody(secret, body);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`${origin}/api/speedrun/relay`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-relay-signature": signature },
            body,
            signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
          });
          await res.body?.cancel();
          if (res.status < 500) {
            if (!res.ok) console.warn(`[relay] webhook ${event} answered ${res.status}`);
            return;
          }
          console.warn(`[relay] webhook ${event} answered ${res.status} (try ${attempt})`);
        } catch (e) {
          console.warn(`[relay] webhook ${event} failed (try ${attempt}):`, e instanceof Error ? e.message : e);
        }
        if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
      }
    };
    const run = this.hooks.then(send, send);
    this.hooks = run;
    this.ctx.waitUntil(run);
  }
}
