/**
 * Everything the extension asks gameshuffle.co, through one small store:
 *
 *   state  GET /api/twitch-ext/state?channel=  what's running on the channel,
 *          the same for every viewer (cached a couple of seconds on Vercel's
 *          edge), at most every 2 seconds
 *   me     GET /api/twitch-ext/me (Twitch's token)  the viewer's own part, at
 *          most every 4 seconds, only once they've shared their Twitch id
 *   act    POST /api/twitch-ext/act  a play
 *
 * The live cards are the same components /live uses. They ask for their usual
 * site paths through LiveHost's `api`; `liveApi` answers those from this store
 * instead of the network, so six cards cost one request every two seconds.
 * Nothing is asked while the card is hidden.
 */

import type { ExtMyState, ExtPanelState, ExtPublicState } from "@/lib/twitch/extension/state";
import { BASE, extHost, type ExtAuth } from "./host";

export type { ExtMyState, ExtPanelState, ExtPublicState };

const STATE_MS = 2000;
const ME_MS = 4000;

/** Our own pictures come as site paths; inside Twitch they need the full address. */
function absolute<T>(value: T): T {
  if (typeof value === "string") return (/^\/(images|api|files)\//.test(value) ? `${BASE}${value}` : value) as T;
  if (Array.isArray(value)) return value.map(absolute) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, absolute(v)])) as T;
  return value;
}

class ExtStore {
  auth: ExtAuth | null = null;
  state: ExtPublicState | null = null;
  me: ExtMyState | null = null;
  visible = true;
  /** State reads in a row that failed (reset by one that works). */
  failures = 0;
  private stateAt = 0;
  private meAt = 0;
  private stateLoad: Promise<void> | null = null;
  private meLoad: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private authWaiters: (() => void)[] = [];

  constructor() {
    const host = extHost();
    host.onAuth((a) => {
      const shared = a.userId !== this.auth?.userId;
      this.auth = a;
      if (shared) { this.me = null; this.meAt = 0; }
      for (const w of this.authWaiters.splice(0)) w();
      this.emit();
      void this.fresh();
    });
    host.onVisible((v) => { this.visible = v; if (v) void this.fresh(); });
  }

  get shared(): boolean { return !!this.auth?.userId; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const fn of this.listeners) fn(); }

  private ready(): Promise<void> {
    return this.auth ? Promise.resolve() : new Promise((r) => this.authWaiters.push(r));
  }

  /** Brings state (and the viewer's part) up to date when they're older than their limits. */
  async fresh(): Promise<void> {
    await this.ready();
    if (!this.visible && this.state) return;
    const jobs: Promise<void>[] = [];
    if (Date.now() - this.stateAt > STATE_MS) jobs.push(this.loadState());
    if (this.shared && this.running && Date.now() - this.meAt > ME_MS) jobs.push(this.loadMe());
    await Promise.all(jobs);
  }

  get running(): boolean {
    const s = this.state;
    return !!s && !!(s.poll || s.bingo || s.trivia || s.brk || s.brain || s.draft || s.picks);
  }

  private loadState(): Promise<void> {
    if (this.stateLoad) return this.stateLoad;
    this.stateLoad = (async () => {
      try {
        const res = await fetch(`${BASE}/api/twitch-ext/state?channel=${encodeURIComponent(this.auth!.channelId)}`);
        const d = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean; state?: ExtPublicState } | null) : null;
        if (d?.ok && d.state) {
          this.state = absolute(d.state);
          this.stateAt = Date.now();
          this.failures = 0;
        } else this.failures += 1;
      } catch {
        this.failures += 1; // the next read tries again
      }
      this.emit();
      this.stateLoad = null;
    })();
    return this.stateLoad;
  }

  private loadMe(): Promise<void> {
    if (this.meLoad) return this.meLoad;
    this.meLoad = (async () => {
      try {
        const res = await fetch(`${BASE}/api/twitch-ext/me`, { headers: { Authorization: `Bearer ${this.auth!.token}` } });
        const d = (await res.json().catch(() => null)) as { ok?: boolean; me?: ExtMyState } | null;
        if (d?.ok && d.me) {
          this.me = absolute(d.me);
          this.meAt = Date.now();
          this.emit();
        }
      } catch { /* the next read tries again */ }
      this.meLoad = null;
    })();
    return this.meLoad;
  }

  /** A play. On success the next reads skip the caches, so the card shows it straight away. */
  async act(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string; [k: string]: unknown }> {
    await this.ready();
    try {
      const res = await fetch(`${BASE}/api/twitch-ext/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.auth!.token}` },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;
      if (!d) return { ok: false, error: "failed" };
      if (!d.ok) return { ok: false, error: d.error ?? "failed" };
      this.stateAt = 0;
      this.meAt = 0;
      void this.fresh();
      return { ok: true, message: d.message, ...absolute(d.data ?? {}) };
    } catch {
      return { ok: false, error: "failed" };
    }
  }

  async panel(): Promise<ExtPanelState | null> {
    await this.ready();
    try {
      const res = await fetch(`${BASE}/api/twitch-ext/panel?channel=${encodeURIComponent(this.auth!.channelId)}`);
      const d = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean; panel?: ExtPanelState } | null) : null;
      return d?.ok && d.panel ? absolute(d.panel) : null;
    } catch {
      return null;
    }
  }
}

let store: ExtStore | null = null;
export function extStore(): ExtStore {
  store ??= new ExtStore();
  return store;
}

// ── The live cards' paths, answered from the store ───────────────────────────

const bodyOf = (init?: RequestInit): Record<string, unknown> => {
  try { return typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {}; } catch { return {}; }
};

/**
 * LiveHost's `api` for the extension. GETs come from the store (one request
 * for every card); POSTs become plays. Paths and answers match the site's
 * routes, so the cards can't tell the difference.
 */
export async function liveApi(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  const st = extStore();
  const post = (init?.method ?? "GET").toUpperCase() === "POST";
  const seg = path.split("?")[0].split("/").filter(Boolean); // ["api", "polls", …]

  if (post) {
    const body = bodyOf(init);
    const text = typeof body.text === "string" ? body.text : "";
    if (seg[1] === "polls" && seg[3] === "vote") return st.act({ kind: "vote", pollId: seg[2], optionId: String(body.optionId ?? "") });
    if (seg[1] === "trivia" && seg[2] === "live") return st.act({ kind: "trivia", text });
    if (seg[1] === "break" && seg[3] === "answer") return st.act({ kind: "break", text });
    if (seg[1] === "chat-brain" && seg[2] === "live") return st.act({ kind: "brain", text });
    if (seg[1] === "bingo" && seg[3] === "card") return st.act({ kind: "bingo_card" });
    if (seg[1] === "bingo" && seg[3] === "claim") return st.act({ kind: "bingo_claim" });
    if (seg[1] === "drafts" && seg[3] === "pick") return st.act({ kind: "captain_pick", key: String(body.key ?? "") });
    return { ok: false, error: "not_here" };
  }

  await st.fresh();
  const s = st.state, me = st.me, signedIn = st.shared;
  if (!s) return null;
  switch (seg[1]) {
    case "polls":
      return { ok: true, poll: s.poll?.poll ?? null, tally: s.poll?.tally ?? null, myVote: me?.pollVote ?? null };
    case "trivia":
      return { ok: true, view: s.trivia ? { ...s.trivia, you: me?.trivia ?? null } : null, signedIn };
    case "break":
      return { ok: true, view: s.brk, signedIn, mine: me?.brk ?? null };
    case "chat-brain":
      return { ok: true, game: s.brain?.game ?? null, survey: s.brain?.survey ?? null, open: s.brain?.open ?? null, signedIn, you: me?.brain ?? null };
    case "bingo":
      return { ok: true, game: s.bingo, myCard: me?.bingoCard ?? null, signedIn };
    case "drafts":
      return { ok: true, draft: s.draft, you: s.draft?.mode === "captains" && signedIn ? { onClock: !!me?.captainOnClock, streamer: false } : null };
    default:
      return null;
  }
}
