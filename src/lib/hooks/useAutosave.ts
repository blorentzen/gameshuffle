"use client";

/**
 * Site-wide autosave (decided 2026-10-09: no Save buttons for settings). A
 * value is saved a moment after the person stops changing it, written so it
 * stays light on the database and realtime:
 *
 *   - waits `delay` ms after the last change (default 1000), so typing a
 *     sentence is one write, not one per keystroke
 *   - never saves the value it started with (what was loaded) or a value
 *     equal to the last one saved
 *   - one request at a time: changes made while a save is running wait for
 *     it, then go out together as one more save
 *   - saves straight away if the component goes away with a change pending
 *     (switching tabs never loses an edit)
 *
 * `ready: false` (still loading) holds everything back. `save` returns false
 * or throws to mark an error; the next change tries again. Callers that can
 * write only what changed should do so (see ProfileStore).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface Options {
  ready?: boolean;
  delay?: number;
  /** Toast after a save; false for none. The toast system confirms every save. */
  toast?: string | false;
}

export function useAutosave<T>(value: T, save: (value: T) => Promise<boolean | void>, opts: Options = {}) {
  const { ready = true, delay = 1000 } = opts;
  const toastText = opts.toast === undefined ? "Saved" : opts.toast;
  const toast = useToast();
  const [status, setStatus] = useState<AutosaveStatus>("idle");

  const key = JSON.stringify(value);
  const saveRef = useRef(save);
  const valueRef = useRef(value);
  const lastSaved = useRef<string | null>(null);
  // The newest unsaved value, and whether its pause has passed (it's due).
  const latest = useRef<{ key: string; value: T } | null>(null);
  const due = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    saveRef.current = save;
    valueRef.current = value;
  });

  // One save at a time; anything that came due meanwhile goes out next.
  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    while (due.current && latest.current) {
      due.current = false;
      const job = latest.current;
      if (job.key === lastSaved.current) continue;
      setStatus("saving");
      let ok = false;
      try { ok = (await saveRef.current(job.value)) !== false; } catch { ok = false; }
      if (ok) {
        lastSaved.current = job.key;
        if (latest.current?.key === job.key) latest.current = null;
        setStatus("saved");
        if (toastText && !due.current) toast.success(toastText);
      } else {
        setStatus("error");
      }
    }
    inFlight.current = false;
  }, [toast, toastText]);

  useEffect(() => {
    if (!ready) return;
    // The first value once ready is what was loaded: remember it, don't save it.
    if (lastSaved.current === null) { lastSaved.current = key; return; }
    if (key === lastSaved.current) { latest.current = null; if (timer.current) { clearTimeout(timer.current); timer.current = null; } return; }
    latest.current = { key, value: valueRef.current };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; due.current = true; void run(); }, delay);
  }, [key, ready, delay, run]);

  // Leaving with a change waiting: save it now rather than dropping it.
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; due.current = true; void run(); }
  }, [run]);

  /** Save any waiting change now (e.g. before navigating away on purpose). */
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (latest.current) { due.current = true; void run(); }
  }, [run]);

  return { status, flush };
}
