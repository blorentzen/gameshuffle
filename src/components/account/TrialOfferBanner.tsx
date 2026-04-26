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
        background:
          "linear-gradient(135deg, rgba(14, 117, 193, 0.08), rgba(14, 117, 193, 0.02))",
        border: "1px solid rgba(14, 117, 193, 0.3)",
        borderRadius: "0.6rem",
        padding: "1.25rem 3rem 1.25rem 1.25rem",
        marginBottom: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss trial offer"
        style={{
          position: "absolute",
          top: "0.6rem",
          right: "0.75rem",
          background: "none",
          border: "none",
          color: "#606060",
          fontSize: "1.25rem",
          lineHeight: 1,
          cursor: "pointer",
          padding: "0.25rem 0.4rem",
          borderRadius: "0.3rem",
        }}
      >
        ×
      </button>

      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "#0E75C1",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        14-day free trial
      </div>
      <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#202020" }}>
        Try GameShuffle Pro for 14 days — no charge if you cancel in time
      </h3>
      <p style={{ margin: 0, color: "#606060", fontSize: "14px" }}>
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
