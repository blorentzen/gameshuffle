"use client";

/**
 * useToolLook: one tool's look (src/lib/tools/looks.ts) wherever the tool
 * shows. Signed in, the look is the account's (any device) and changes save
 * themselves; a visitor's look lives in this browser. When a signed-in account
 * has no saved look yet and this browser has one, the browser's look becomes
 * the account's.
 *
 * Every hook on a page shares one request. `forStream` reads the stream this
 * page acts on (a Full-access mod sees the streamer's looks) and never saves.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { DEFAULT_LOOKS, normalizeLook, type LookBrand, type LookFor, type ToolLookId, type ToolLooks } from "@/lib/tools/looks";

export interface LookContext {
  signedIn: boolean;
  pro: boolean;
  /** The account's brand colors (the site brand without GS Pro). */
  brand: LookBrand | null;
  avatarUrl: string | null;
  /** The account's personal color (Theming ▸ Colors). */
  color: string | null;
  /** A GS Pro account's own 8-ball answers. */
  eightBall: { disabled: string[]; custom: string[] } | null;
}

interface Remote extends Omit<LookContext, "signedIn"> {
  looks: ToolLooks;
  saved: Record<ToolLookId, boolean>;
}

const cache = new Map<string, Promise<Remote | null>>();

function loadRemote(key: string, forStream: boolean): Promise<Remote | null> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/account/tool-looks${forStream ? "?for=stream" : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Remote>) : null))
      .catch(() => null);
    cache.set(key, p);
    // A failed read can try again next time.
    void p.then((r) => { if (!r) cache.delete(key); });
  }
  return p;
}

/** Keep the shared copy current after a save, so a remounted editor shows the new look. */
function remember(key: string, tool: ToolLookId, look: unknown) {
  const p = cache.get(key);
  if (!p) return;
  void p.then((r) => {
    if (!r) return;
    (r.looks as unknown as Record<string, unknown>)[tool] = look;
    r.saved[tool] = true;
  });
}

const LOCAL = (tool: ToolLookId) => `gs-look-${tool}`;

/** This browser's look for a tool, including what the free pages kept before looks existed. */
function readLocal<T extends ToolLookId>(tool: T): LookFor<T> | null {
  try {
    const raw = window.localStorage.getItem(LOCAL(tool));
    if (raw) return normalizeLook(tool, JSON.parse(raw));
    if (tool === "dice") {
      const face = window.localStorage.getItem("gs-dice-face");
      return face ? normalizeLook(tool, { dieColor: face }) : null;
    }
    if (tool === "wheel") {
      const themeId = window.localStorage.getItem("gs-wheel-theme");
      const fillStyle = window.localStorage.getItem("gs-wheel-fill");
      return themeId || fillStyle ? normalizeLook(tool, { themeId, fillStyle }) : null;
    }
  } catch {
    // Private windows can refuse storage: the default look stands.
  }
  return null;
}

function writeLocal(tool: ToolLookId, look: unknown) {
  try {
    window.localStorage.setItem(LOCAL(tool), JSON.stringify(look));
  } catch {
    // Not kept in this browser; nothing else depends on it.
  }
}

async function putLook(tool: ToolLookId, look: unknown): Promise<unknown | null> {
  try {
    const res = await fetch("/api/account/tool-looks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, look }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { look?: unknown }).look ?? null;
  } catch {
    return null;
  }
}

const NO_CONTEXT: LookContext = { signedIn: false, pro: false, brand: null, avatarUrl: null, color: null, eightBall: null };

function contextFrom(r: Remote | null, signedIn: boolean): LookContext {
  if (!r) return { ...NO_CONTEXT, signedIn };
  return { signedIn, pro: r.pro, brand: r.brand, avatarUrl: r.avatarUrl, color: r.color ?? null, eightBall: r.eightBall };
}

/** Who is looking (GS Pro, brand, picture, own 8-ball answers) without any one tool's look. */
export function useLookContext(opts: { forStream?: boolean } = {}): LookContext {
  const { forStream = false } = opts;
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const key = `${userId ?? "anon"}:${forStream ? "stream" : "own"}`;
  const [state, setState] = useState<{ key: string; ctx: LookContext } | null>(null);
  useEffect(() => {
    if (loading || !userId) return;
    let alive = true;
    void loadRemote(key, forStream).then((r) => { if (alive) setState({ key, ctx: contextFrom(r, true) }); });
    return () => { alive = false; };
  }, [loading, userId, key, forStream]);
  return state?.key === key ? state.ctx : { ...NO_CONTEXT, signedIn: !!userId };
}

export function useToolLook<T extends ToolLookId>(tool: T, opts: { forStream?: boolean; toast?: string | false } = {}) {
  const { forStream = false } = opts;
  const { user, loading } = useAuth();
  const toast = useToast();
  const [look, setLookState] = useState<LookFor<T>>(DEFAULT_LOOKS[tool]);
  // The key the look was last loaded for: ready only once this account's look is in.
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [ctx, setCtx] = useState<LookContext>(NO_CONTEXT);
  const userId = user?.id ?? null;
  const key = `${userId ?? "anon"}:${forStream ? "stream" : "own"}`;
  const ready = readyKey === key;

  useEffect(() => {
    if (loading) return;
    let alive = true;
    if (!userId) {
      const local = readLocal(tool);
      queueMicrotask(() => {
        if (!alive) return;
        if (local) setLookState(local);
        setCtx(NO_CONTEXT);
        setReadyKey(key);
      });
      return () => { alive = false; };
    }
    void loadRemote(key, forStream).then(async (r) => {
      if (!alive) return;
      setCtx(contextFrom(r, true));
      if (!r) {
        // The account couldn't be read: show this browser's look, don't save over the account.
        const local = readLocal(tool);
        if (local) setLookState(local);
        return;
      }
      let next = normalizeLook(tool, r.looks[tool]);
      if (!forStream && !r.saved[tool]) {
        const local = readLocal(tool);
        if (local) {
          // The browser's look becomes the account's.
          const stored = await putLook(tool, local);
          if (!alive) return;
          next = stored ? normalizeLook(tool, stored) : local;
          remember(key, tool, next);
        }
      }
      setLookState(next);
      setReadyKey(key);
    });
    return () => { alive = false; };
  }, [loading, userId, key, tool, forStream]);

  const signedIn = !!userId;
  const canSave = ready && signedIn && !forStream;
  useAutosave(
    look,
    async (v) => {
      const stored = await putLook(tool, v);
      if (!stored) {
        toast.error("Please try again.", { title: "Couldn't save your look" });
        return false;
      }
      remember(key, tool, normalizeLook(tool, stored));
      return true;
    },
    { ready: canSave, toast: opts.toast ?? "Look saved" },
  );

  // A visitor's look stays in this browser.
  useEffect(() => {
    if (ready && !signedIn && !forStream) writeLocal(tool, look);
  }, [ready, signedIn, forStream, tool, look]);

  const setLook = useCallback((next: LookFor<T> | ((prev: LookFor<T>) => LookFor<T>)) => {
    setLookState((prev) => (typeof next === "function" ? (next as (p: LookFor<T>) => LookFor<T>)(prev) : next));
  }, []);

  return { look, setLook, ready, ...ctx, signedIn };
}
