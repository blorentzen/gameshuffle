"use client";

/**
 * Site-wide banner for the 30-day policy-update notice window.
 *
 * Privacy Policy and Terms both publicly commit to giving users at least
 * 30 days notice before material changes take effect. This banner is the
 * second half of that workflow (the first is the email blast that runs at
 * the start of the window — see scripts/policy-update-blast.ts).
 *
 * Driven by two env vars so the workflow doesn't require a code deploy:
 *   NEXT_PUBLIC_POLICY_UPDATE_URL       — link target (e.g. "/privacy")
 *   NEXT_PUBLIC_POLICY_UPDATE_EFFECTIVE — ISO date when the change takes
 *                                          effect; banner auto-hides after
 *
 * Optional:
 *   NEXT_PUBLIC_POLICY_UPDATE_LABEL     — short label (default "Policy update")
 *   NEXT_PUBLIC_POLICY_UPDATE_MESSAGE   — message body override
 *
 * Dismissals persist per-effective-date in localStorage so a user who
 * clears the banner doesn't see it return on every visit, but DOES see
 * a fresh banner if a new update lands later.
 */

import { useEffect, useState } from "react";

const URL = process.env.NEXT_PUBLIC_POLICY_UPDATE_URL || "";
const EFFECTIVE = process.env.NEXT_PUBLIC_POLICY_UPDATE_EFFECTIVE || "";
const LABEL = process.env.NEXT_PUBLIC_POLICY_UPDATE_LABEL || "Policy update";
const MESSAGE_OVERRIDE = process.env.NEXT_PUBLIC_POLICY_UPDATE_MESSAGE || "";

function dismissalKey(effective: string): string {
  return `gs:policy-banner-dismissed:${effective}`;
}

export function PolicyUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!URL || !EFFECTIVE) return;
    const effectiveAt = new Date(EFFECTIVE);
    if (Number.isNaN(effectiveAt.getTime())) return;
    // Hide once the change is in effect — no further notice needed.
    if (effectiveAt.getTime() <= Date.now()) return;

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(dismissalKey(EFFECTIVE)) === "1";
    } catch {
      // private browsing / quota — show by default
    }
    if (!dismissed) setVisible(true);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(dismissalKey(EFFECTIVE), "1");
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  const effectiveAt = new Date(EFFECTIVE);
  const formatted = effectiveAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const message =
    MESSAGE_OVERRIDE ||
    `We're updating our policies. The changes take effect on ${formatted}.`;

  return (
    <div className="policy-banner" role="status">
      <span className="policy-banner__badge">{LABEL}</span>
      <span className="policy-banner__text">
        {message}{" "}
        <a href={URL} className="policy-banner__link">
          Read the update
        </a>
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        className="policy-banner__dismiss"
        aria-label="Dismiss policy update notice"
      >
        ×
      </button>
    </div>
  );
}
