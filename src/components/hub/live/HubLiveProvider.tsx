"use client";

/**
 * Live data for a stream page: polls /api/hub/running every 5 seconds while
 * the tab is visible and shares it with the control room's cards. When the
 * game on stream changes (Twitch category), the server page re-renders so
 * every control, card and tab matches the new game (just in time).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { HubRunning } from "@/lib/hub/types";

const POLL_MS = 5_000;

interface HubLive {
  data: HubRunning | null;
  /** The stream (gs_sessions id) this control room runs. */
  sessionId: string;
  refresh: () => void;
  /** Switch the stream page to a tab (and an inner view, e.g. a live game). */
  goTab: (tab: string, view?: string) => void;
}

const Ctx = createContext<HubLive | null>(null);

export function useHubLive(): HubLive {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHubLive needs HubLiveProvider");
  return v;
}

export function HubLiveProvider({ sessionId, renderedGame, children }: {
  sessionId: string;
  /** The game the server rendered the page for. */
  renderedGame: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<HubRunning | null>(null);
  const refreshedFor = useRef<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hub/running?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json().catch(() => null)) as HubRunning | null;
    if (!next) return;
    setData(next);
    if (next.activeGame && next.activeGame !== renderedGame && refreshedFor.current !== next.activeGame) {
      refreshedFor.current = next.activeGame;
      router.refresh();
    }
  }, [sessionId, renderedGame, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void load(), POLL_MS); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { void load(); start(); } else stop();
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after its fetch resolves, not synchronously
    void load();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  const goTab = useCallback((tab: string, view?: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    if (view) next.set("view", view); else next.delete("view");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname, router, searchParams]);

  return <Ctx.Provider value={{ data, sessionId, refresh: () => void load(), goTab }}>{children}</Ctx.Provider>;
}
