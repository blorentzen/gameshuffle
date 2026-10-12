"use client";

/** True once Play together is switched on (its table exists); false until known. */

import { useEffect, useState } from "react";
import { liveReadyOnce } from "./liveClient";

export function useLiveReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void liveReadyOnce().then((r) => { if (!cancelled) setReady(r); });
    return () => { cancelled = true; };
  }, []);
  return ready;
}
