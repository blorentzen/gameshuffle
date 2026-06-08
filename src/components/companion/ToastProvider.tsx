"use client";

/**
 * Lightweight toast provider for the Companion surface.
 *
 * Wraps CDS's `ToastContainer` + manages local state. Any component
 * under the provider can call `useCompanionToasts().push({...})` to
 * fire a transient notification — save success, delete success,
 * resume, etc.
 *
 * Auto-dismisses after `DEFAULT_DURATION_MS` (4 seconds) unless the
 * caller passes a different `durationMs`. Passing `0` keeps the
 * toast pinned until the user dismisses it manually.
 *
 * Mirrors the same usage pattern as `LiveStreamView` — kept inline
 * here (rather than a global toast manager) because the Companion's
 * toast volume is low and a page-local provider keeps the surface
 * area small.
 */

import { ToastContainer, type ToastProps } from "@empac/cascadeds";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_DURATION_MS = 4000;

export interface PushToastInput {
  /** CDS variant — defaults to `info` if omitted. Success / warning /
   *  error tint accordingly. */
  variant?: ToastProps["variant"];
  title?: string;
  message: ReactNode;
  action?: ToastProps["action"];
  /** Override auto-dismiss timer. Pass 0 to disable. */
  durationMs?: number;
}

interface ToastCtxValue {
  push: (input: PushToastInput) => void;
}

const Ctx = createContext<ToastCtxValue | null>(null);

export function CompanionToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  // Counter for monotonic ids so two toasts fired in the same ms
  // don't collide. useRef survives renders without causing re-renders.
  const nextIdRef = useRef(0);

  const push = useCallback((input: PushToastInput) => {
    const id = `companion-toast-${Date.now()}-${nextIdRef.current++}`;
    const dismiss = () => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    };
    setToasts((prev) => [
      ...prev,
      {
        id,
        variant: input.variant ?? "info",
        title: input.title,
        message: input.message,
        action: input.action,
        onClose: dismiss,
      },
    ]);
    const duration = input.durationMs ?? DEFAULT_DURATION_MS;
    if (duration > 0) {
      window.setTimeout(dismiss, duration);
    }
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <ToastContainer toasts={toasts} />
    </Ctx.Provider>
  );
}

export function useCompanionToasts(): ToastCtxValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCompanionToasts called outside CompanionToastProvider");
  }
  return ctx;
}
