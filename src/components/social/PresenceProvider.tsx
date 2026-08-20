"use client";

/**
 * Global live presence — makes online dots update in real time app-wide, not
 * just inside an open chat thread (the coarse `last_seen_at` polling is the
 * fallback).
 *
 * Model: "relationships + on-screen". Every surface that shows a person's dot
 * renders that person, so a refcounted per-user Realtime presence channel
 * (`online:{userId}`) — opened while at least one dot for that user is mounted,
 * torn down when the last unmounts — covers all current surfaces and stays
 * swappable for a future "friends online" widget.
 *
 * How it works: the signed-in user permanently `track()`s themselves on their
 * own `online:{me}` channel (the "I'm online" broadcast). To read someone
 * else's state, we subscribe to their channel (without tracking) and treat a
 * non-empty presence state as "owner online". Watched channels are capped so a
 * huge directory can't blow past Realtime's per-client channel budget — beyond
 * the cap, dots gracefully fall back to coarse `last_seen`.
 *
 * Inert when signed out (Realtime presence needs an authenticated session), so
 * visitors just see the coarse fallback dots.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

/** Max concurrent watched presence channels (self is always allowed on top). */
const MAX_WATCHED = 50;

class PresenceStore {
  // Lazily created — never during SSR, and only once a channel is actually
  // opened (which only happens client-side, for a signed-in user).
  private _sb: ReturnType<typeof createClient> | null = null;
  private online = new Map<string, boolean>();
  private listeners = new Map<string, Set<() => void>>();
  private channels = new Map<string, RealtimeChannel>();
  private refs = new Map<string, number>();

  constructor(private readonly myId: string | null) {}

  private get sb() {
    if (!this._sb) this._sb = createClient();
    return this._sb;
  }

  start() {
    // Permanent self-watch: broadcast my presence while the app is open.
    if (this.myId) this.addRef(this.myId, true);
  }

  stop() {
    for (const channel of this.channels.values()) void this._sb?.removeChannel(channel);
    this.channels.clear();
    this.refs.clear();
    this.online.clear();
    this.listeners.clear();
  }

  /** useSyncExternalStore subscribe: registers interest + refcounts the channel. */
  subscribe = (userId: string, cb: () => void): (() => void) => {
    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
    }
    set.add(cb);
    this.addRef(userId, false);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.listeners.delete(userId);
      this.releaseRef(userId);
    };
  };

  getSnapshot = (userId: string): boolean | undefined => this.online.get(userId);

  private notify(userId: string) {
    this.listeners.get(userId)?.forEach((cb) => cb());
  }

  private setOnline(userId: string, val: boolean) {
    if (this.online.get(userId) === val) return;
    this.online.set(userId, val);
    this.notify(userId);
  }

  private addRef(userId: string, isSelf: boolean) {
    this.refs.set(userId, (this.refs.get(userId) ?? 0) + 1);
    if (!this.myId) return; // signed out → coarse fallback only
    if (this.channels.has(userId)) return;
    if (this.channels.size >= MAX_WATCHED && !isSelf) return; // capped → fallback
    this.openChannel(userId, isSelf);
  }

  private releaseRef(userId: string) {
    const n = (this.refs.get(userId) ?? 0) - 1;
    if (n > 0) {
      this.refs.set(userId, n);
      return;
    }
    this.refs.delete(userId);
    if (userId === this.myId) return; // never tear down the self broadcast
    const channel = this.channels.get(userId);
    if (channel) {
      void this.sb.removeChannel(channel);
      this.channels.delete(userId);
    }
    this.online.delete(userId);
  }

  private openChannel(userId: string, isSelf: boolean) {
    const channel = this.sb.channel(`online:${userId}`, {
      config: { presence: { key: this.myId ?? "anon" } },
    });
    this.channels.set(userId, channel);
    channel.on("presence", { event: "sync" }, () => {
      // Only the owner tracks on their channel, so any tracked entry = online.
      this.setOnline(userId, Object.keys(channel.presenceState()).length > 0);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && isSelf) void channel.track({ online: true });
    });
  }
}

const PresenceContext = createContext<PresenceStore | null>(null);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  // New store per signed-in identity; old one is torn down by the effect cleanup.
  const store = useMemo(() => new PresenceStore(myId), [myId]);

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  return <PresenceContext.Provider value={store}>{children}</PresenceContext.Provider>;
}

/**
 * Live online status for a user. Returns the realtime value once it resolves,
 * otherwise `fallback` (the coarse last_seen value from server data). Registering
 * this hook is what opens the underlying presence channel (refcounted).
 */
export function useUserPresence(userId: string | null | undefined, fallback = false): boolean {
  const store = useContext(PresenceContext);
  const subscribe = useCallback(
    (cb: () => void) => (store && userId ? store.subscribe(userId, cb) : () => {}),
    [store, userId],
  );
  const getSnapshot = useCallback(
    () => (store && userId ? store.getSnapshot(userId) : undefined),
    [store, userId],
  );
  const live = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  return live ?? fallback;
}
