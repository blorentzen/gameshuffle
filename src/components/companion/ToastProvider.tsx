"use client";

/**
 * Companion toasts, on the site's one toast system (useToast). This used to
 * run its own CDS ToastContainer, which put a second toast stack on the page;
 * it's now a thin adapter so existing callers keep `useCompanionToasts().push`.
 * Timing follows the site's rules (CDS on desktop, ToastProvider's timers on
 * touch screens).
 */

import type { ReactNode } from "react";
import type { ToastProps } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export interface PushToastInput {
  /** CDS variant: defaults to `info`. */
  variant?: ToastProps["variant"];
  title?: string;
  message: ReactNode;
  action?: ToastProps["action"];
}

/** Kept so the page's tree doesn't change; the site's ToastProvider (root layout) does the work. */
export function CompanionToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useCompanionToasts(): { push: (input: PushToastInput) => string } {
  const toast = useToast();
  return {
    push: (input) => toast.toast({ variant: input.variant ?? "info", title: input.title, message: input.message, action: input.action }),
  };
}
