"use client";

/**
 * Viewer token balance for /live surfaces (badge + pre-bet context). Reads the
 * read-only /api/economy/balance. Refetches on a `gs:balance-refresh` window
 * event so a placed bet (or any token action) can update every consumer at
 * once without prop-drilling.
 */

import { useCallback, useEffect, useState } from "react";

export interface ViewerBalance {
  signedIn: boolean;
  activated: boolean;
  balance: number | null;
}

const REFRESH_EVENT = "gs:balance-refresh";

/** Tell every useViewerBalance consumer to refetch (call after a bet, etc.). */
export function refreshViewerBalance() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

export function useViewerBalance(): ViewerBalance & { refresh: () => void } {
  const [state, setState] = useState<ViewerBalance>({
    signedIn: false,
    activated: false,
    balance: null,
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/economy/balance", { cache: "no-store" });
      if (!res.ok) return;
      const b = (await res.json()) as Partial<ViewerBalance>;
      setState({
        signedIn: !!b.signedIn,
        activated: !!b.activated,
        balance: typeof b.balance === "number" ? b.balance : null,
      });
    } catch {
      // keep the prior value on a transient failure
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onRefresh = () => void load();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [load]);

  return { ...state, refresh: load };
}
