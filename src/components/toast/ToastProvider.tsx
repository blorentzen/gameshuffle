"use client";

/**
 * Global toast system. One provider mounted at the app root renders a single
 * top-right `ToastContainer` (CDS positions `.empac-toast-container` fixed
 * top:0/right:0 by default); anything under it calls `useToast()` to push a
 * toast. Use this for every "saved" confirmation so the pattern stays identical
 * site-wide.
 *
 *   const toast = useToast();
 *   toast.success("Saved");                       // green, top-right, auto-dismiss
 *   toast.error("Couldn't save. Try again.");     // red
 *
 * The CDS `Toast` owns its own 5s timer + hover-pause + exit animation and calls
 * `onClose(id)` when done, so the provider just adds/removes from the array.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastContainer, type ToastProps } from "@empac/cascadeds";

/** What a caller passes — id + onClose are supplied by the provider. */
export type ToastInput = Omit<ToastProps, "id" | "onClose">;
/** Shorthand-helper options (message comes first, positionally). */
type ToastOpts = Omit<ToastInput, "message" | "variant">;

export interface ToastApi {
  /** Push a fully-specified toast; returns its id. */
  toast: (input: ToastInput) => string;
  success: (message: ReactNode, opts?: ToastOpts) => string;
  error: (message: ReactNode, opts?: ToastOpts) => string;
  info: (message: ReactNode, opts?: ToastOpts) => string;
  warning: (message: ReactNode, opts?: ToastOpts) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput): string => {
      const id = `toast-${++idRef.current}`;
      setToasts((prev) => [...prev, { ...input, id, onClose: dismiss }]);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message, opts) => toast({ variant: "success", message, ...opts }),
      error: (message, opts) => toast({ variant: "error", message, ...opts }),
      info: (message, opts) => toast({ variant: "info", message, ...opts }),
      warning: (message, opts) => toast({ variant: "warning", message, ...opts }),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
