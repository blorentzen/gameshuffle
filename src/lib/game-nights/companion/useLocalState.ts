"use client";

import { useEffect, useRef, useState } from "react";

/**
 * localStorage-backed state, SSR-safe. Loads in an effect (not a lazy
 * initializer) so the server-rendered value and first client render match, then
 * persists on change. Guest-friendly: no account needed, kept on the device.
 * `hydrated` flips true once the stored value has loaded (avoids a flash of the
 * default before restore).
 */
export function useLocalState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe restore
      if (raw != null) setState(JSON.parse(raw) as T);
    } catch {
      /* ignore blocked/broken storage */
    }
    loaded.current = true;
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);

  return [state, setState, hydrated];
}
