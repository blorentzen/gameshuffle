"use client";

/**
 * Dismissible 14-day trial offer banner at the top of /account. Shows
 * when the signed-in user is:
 *   - Non-staff
 *   - Has never used the Pro trial (users.has_used_trial = false)
 *   - Has no active subscription row
 *
 * Dismissal persists in localStorage so we don't nag on every visit.
 * Clicking through goes to the Plans tab (where the actual trial CTAs
 * live) — the banner itself is deliberately low-pressure.
 */

import { useState, useSyncExternalStore } from "react";
import { Button } from "@empac/cascadeds";

const DISMISS_KEY = "gs-trial-banner-dismissed-v1";

/**
 * Subscribe to `localStorage` changes for our dismiss flag the
 * React-idiomatic way — keeps us compatible with the set-state-in-effect
 * compiler rule and multi-tab updates (another tab dismissing the banner
 * will also dismiss here).
 */
function subscribeStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshotDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

function getServerSnapshot(): boolean {
  // Server render hides the banner; client reconciliation reads the real
  // flag. Avoids a flash of the banner on the first render for users
  // who've already dismissed.
  return true;
}

interface TrialOfferBannerProps {
  isEligible: boolean;
  onLearnMore: () => void;
}

export function TrialOfferBanner({ isEligible, onLearnMore }: TrialOfferBannerProps) {
  const dismissed = useSyncExternalStore(
    subscribeStorage,
    getSnapshotDismissed,
    getServerSnapshot
  );
  // Track hover state separately so we don't re-trigger the external
  // store on every render.
  const [, forceUpdate] = useState(0);

  if (!isEligible || dismissed) return null;

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
      window.dispatchEvent(new StorageEvent("storage", { key: DISMISS_KEY }));
      forceUpdate((n) => n + 1);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        background: "var(--primary-50)",
        border: "1px solid var(--primary-200)",
        borderRadius: "var(--radius-8)",
        padding: "var(--spacing-16) var(--spacing-40) var(--spacing-16) var(--spacing-16)",
        marginBottom: "var(--spacing-20)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-10)",
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss trial offer"
        style={{
          position: "absolute",
          top: "var(--spacing-8)",
          right: "var(--spacing-10)",
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          fontSize: "var(--font-size-20)",
          lineHeight: 1,
          cursor: "pointer",
          padding: "var(--spacing-4) var(--spacing-6)",
          borderRadius: "var(--radius-4)",
        }}
      >
        ×
      </button>

      <div
        style={{
          fontSize: "var(--font-size-12)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--primary-600)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        14-day free trial
      </div>
      <h3 style={{ margin: 0, fontSize: "var(--font-size-18)", color: "var(--text-primary)" }}>
        Try GameShuffle Pro for 14 days — no charge if you cancel in time
      </h3>
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
        Unlocks the Twitch streamer integration, Discord session binding, feature modules,
        channel-point redemptions, and the OBS overlay. Credit card required; cancel
        anytime.
      </p>
      <div>
        <Button variant="primary" onClick={onLearnMore}>
          Check it out
        </Button>
      </div>
    </div>
  );
}
