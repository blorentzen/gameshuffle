// A client for LiveSplit One's server protocol, over any socket. LiveSplit One answers every text message exactly
// once, in order, with {"success": value} or {"error": {"code"}}; events ({"event": "Splitted"}) come in between and
// on their own. Replies carry no id, so the queue is the id: a request that times out stays in the queue as a
// tombstone so its late reply is thrown away instead of being handed to the next request. If replies ever stop
// lining up (a reply of the wrong shape, or a tombstone that never gets its reply) the client stops, waits for
// LiveSplit One to go quiet, and asks its owner to read everything again.

export type LsoReply = { ok: true; value: unknown } | { ok: false; code: string };

export type LsoFailure = "timeout" | "closed" | "resync";

export class LsoError extends Error {
  constructor(public readonly code: LsoFailure) {
    super(`LiveSplit One request failed: ${code}`);
  }
}

type Expect = "none" | "value" | "state";

interface Entry {
  expect: Expect;
  resolve(reply: LsoReply): void;
  reject(err: LsoError): void;
  timer: unknown;
  expiredAt: number | null;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LsoClientOptions {
  send(text: string): void;
  onEvent(name: string): void;
  /** A reply went missing or arrived late: the owner should read the run and state again. */
  onLost?(why: "late" | "stray" | "resynced"): void;
  timeoutMs?: number;
  quietMs?: number;
  tombstoneMs?: number;
  clock?: Clock;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

function expectOf(command: string): Expect {
  if (command === "getCurrentState") return "state";
  return command.startsWith("get") ? "value" : "none";
}

function toReply(msg: Record<string, unknown>): LsoReply | null {
  if ("success" in msg) return { ok: true, value: msg.success };
  const err = (msg.error ?? msg.Err) as { code?: unknown } | undefined;
  if (err && typeof err === "object") return { ok: false, code: typeof err.code === "string" ? err.code : "Unknown" };
  return null;
}

function fits(expect: Expect, reply: LsoReply): boolean {
  if (!reply.ok) return true;
  const v = reply.value;
  const isState = !!v && typeof v === "object" && typeof (v as { state?: unknown }).state === "string";
  if (expect === "state") return isState;
  if (expect === "value") return v === null || typeof v === "string";
  return v === null;
}

export class LsoClient {
  private queue: Entry[] = [];
  private closed = false;
  private resyncing = false;
  private lastReplyAt = 0;
  private quietTimer: unknown = null;
  private watchdog: unknown = null;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private readonly quietMs: number;
  private readonly tombstoneMs: number;

  constructor(private readonly opts: LsoClientOptions) {
    this.clock = opts.clock ?? realClock;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.quietMs = opts.quietMs ?? 2000;
    this.tombstoneMs = opts.tombstoneMs ?? 20000;
  }

  get pending(): number {
    return this.queue.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Sends one command. Resolves with LiveSplit One's answer; rejects with LsoError when there is none. */
  request(command: { command: string } & Record<string, unknown>): Promise<LsoReply> {
    if (this.closed) return Promise.reject(new LsoError("closed"));
    if (this.resyncing) return Promise.reject(new LsoError("resync"));
    return new Promise<LsoReply>((resolve, reject) => {
      const entry: Entry = { expect: expectOf(command.command), resolve, reject, timer: null, expiredAt: null };
      this.queue.push(entry);
      try {
        this.opts.send(JSON.stringify(command));
      } catch {
        this.queue.splice(this.queue.indexOf(entry), 1);
        reject(new LsoError("closed"));
        return;
      }
      entry.timer = this.clock.setTimeout(() => {
        entry.timer = null;
        entry.expiredAt = this.clock.now();
        reject(new LsoError("timeout"));
        this.armWatchdog();
      }, this.timeoutMs);
    });
  }

  /** Feed every text message from LiveSplit One here. */
  handle(text: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    const obj = msg as Record<string, unknown>;
    if (typeof obj.event === "string") {
      this.opts.onEvent(obj.event);
      return;
    }
    const reply = toReply(obj);
    if (!reply) return;
    this.lastReplyAt = this.clock.now();
    if (this.closed || this.resyncing) return;
    const head = this.queue.shift();
    if (!head) {
      this.opts.onLost?.("stray");
      return;
    }
    if (head.timer != null) this.clock.clearTimeout(head.timer);
    if (!fits(head.expect, reply)) {
      if (head.expiredAt == null) head.reject(new LsoError("resync"));
      this.startResync();
      return;
    }
    if (head.expiredAt != null) {
      this.armWatchdog();
      this.opts.onLost?.("late");
      return;
    }
    head.resolve(reply);
    if (this.watchdog != null) this.armWatchdog();
  }

  /** The socket is gone: fail everything still waiting. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.dropAll(new LsoError("closed"));
    if (this.quietTimer != null) this.clock.clearTimeout(this.quietTimer);
    if (this.watchdog != null) this.clock.clearTimeout(this.watchdog);
    this.quietTimer = this.watchdog = null;
  }

  private dropAll(err: LsoError): void {
    const queue = this.queue;
    this.queue = [];
    for (const e of queue) {
      if (e.timer != null) this.clock.clearTimeout(e.timer);
      if (e.expiredAt == null) e.reject(err);
    }
  }

  /** Keeps a timer while a tombstone waits, so it can't wait forever (and the object can't hibernate with one). */
  private armWatchdog(): void {
    if (this.watchdog != null) this.clock.clearTimeout(this.watchdog);
    this.watchdog = null;
    const oldest = this.queue.find((e) => e.expiredAt != null);
    if (!oldest || this.closed || this.resyncing) return;
    const wait = Math.max(0, this.tombstoneMs - (this.clock.now() - (oldest.expiredAt as number)));
    this.watchdog = this.clock.setTimeout(() => {
      this.watchdog = null;
      if (this.queue.includes(oldest)) this.startResync();
    }, wait);
  }

  private startResync(): void {
    if (this.resyncing || this.closed) return;
    this.resyncing = true;
    this.dropAll(new LsoError("resync"));
    if (this.watchdog != null) this.clock.clearTimeout(this.watchdog);
    this.watchdog = null;
    this.lastReplyAt = this.clock.now();
    const check = () => {
      this.quietTimer = null;
      if (this.closed) return;
      const quietFor = this.clock.now() - this.lastReplyAt;
      if (quietFor >= this.quietMs) {
        this.resyncing = false;
        this.opts.onLost?.("resynced");
      } else {
        this.quietTimer = this.clock.setTimeout(check, this.quietMs - quietFor);
      }
    };
    this.quietTimer = this.clock.setTimeout(check, this.quietMs);
  }
}
