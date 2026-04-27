"use client";

/**
 * Staff-only floating control for switching the active impersonation tier.
 *
 * Renders a small badge in the bottom-right of the viewport. Click to
 * expand into a menu of options (Default / Pro / Free / Unauthenticated).
 * Selecting an option POSTs to /api/staff/impersonate which sets the
 * cookies, then reloads the page so server-rendered surfaces (banner,
 * capability gates, navbar) reflect the new state.
 *
 * Per gs-staff-tier-impersonation-spec.md §3. The server wrapper at
 * `ImpersonationControlMount.tsx` is responsible for only emitting this
 * component for staff users — non-staff never see it.
 */

import { useEffect, useRef, useState } from "react";
import type { SubscriptionTier } from "@/lib/subscription";

type Option = "default" | "pro" | "free" | "unauth";

const OPTIONS: Array<{ value: Option; label: string; hint: string }> = [
  { value: "default", label: "Default", hint: "staff — full access" },
  { value: "pro", label: "Pro", hint: "as a Pro subscriber" },
  { value: "free", label: "Free", hint: "as a free user" },
  { value: "unauth", label: "Unauthenticated", hint: "as a logged-out visitor" },
];

interface ImpersonationControlProps {
  /**
   * Current state — which option is active. `null` = default. Read
   * server-side from the cookies and passed in so first paint matches
   * server state.
   */
  currentOption: Option;
}

export function ImpersonationControl({ currentOption }: ImpersonationControlProps) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<Option | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const apply = async (option: Option) => {
    setWorking(option);
    try {
      await fetch("/api/staff/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option }),
      });
    } finally {
      window.location.reload();
    }
  };

  const badgeLabel: Record<Option, string> = {
    default: "STAFF",
    pro: "AS PRO",
    free: "AS FREE",
    unauth: "AS GUEST",
  };

  return (
    <div ref={ref} className="staff-impersonation-control">
      <button
        type="button"
        className="staff-impersonation-control__badge"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Staff impersonation control"
      >
        {badgeLabel[currentOption]}
      </button>
      {open && (
        <div className="staff-impersonation-control__menu" role="menu">
          <p className="staff-impersonation-control__title">View as</p>
          {OPTIONS.map((opt) => {
            const active = opt.value === currentOption;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={working !== null}
                onClick={() => void apply(opt.value)}
                className={
                  "staff-impersonation-control__option" +
                  (active ? " staff-impersonation-control__option--active" : "")
                }
              >
                <span className="staff-impersonation-control__option-label">
                  {opt.label}
                </span>
                <span className="staff-impersonation-control__option-hint">
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Re-export types for the server wrapper.
export type { Option as ImpersonationOption };
export type { SubscriptionTier };
