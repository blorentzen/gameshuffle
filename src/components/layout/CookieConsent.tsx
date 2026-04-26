"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Modal, Stack } from "@empac/cascadeds";
import { onConsentChange, readConsent, writeConsent, type ConsentState } from "@/lib/consent";

const GA_ID = "G-WBXS3D8GBL";

function loadGA() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ga-script")) return;
  const script = document.createElement("script");
  script.id = "ga-script";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.async = true;
  document.head.appendChild(script);

  const initScript = document.createElement("script");
  initScript.id = "ga-init";
  initScript.textContent = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  `;
  document.head.appendChild(initScript);
}

function unloadGA() {
  if (typeof document === "undefined") return;
  document.getElementById("ga-script")?.remove();
  document.getElementById("ga-init")?.remove();
  // Best-effort: prevent further pageviews from any in-flight gtag calls.
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };
    w.gtag = undefined;
    w.dataLayer = [];
  } catch {
    // ignore
  }
}

export function CookieConsent() {
  const [bannerVisible, setBannerVisible] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const initialized = useRef(false);

  // Initial mount: read consent state (post-hydration so SSR doesn't desync).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const initial = readConsent();
    setConsent(initial);
    // Show banner only when user has not yet decided AND GPC isn't already
    // making the decision for them. With GPC on, we silently honor the
    // signal without nagging.
    if (!initial.decided && !initial.gpcOverride) {
      setBannerVisible(true);
    }
    if (initial.analytics) loadGA();
    else unloadGA();
  }, []);

  // React to consent changes from anywhere (banner, prefs modal, other tabs).
  useEffect(() => {
    return onConsentChange((next) => {
      setConsent(next);
      if (next.analytics) loadGA();
      else unloadGA();
    });
  }, []);

  // Listen for the global "open cookie preferences" event so the footer link
  // (or any other surface) can pop the modal without prop-drilling.
  // Two channels:
  //   - custom event `gs:open-cookie-prefs` (fired programmatically)
  //   - URL hash `#cookie-preferences` (the footer link's href)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const open = () => {
      setPrefsOpen(true);
      setBannerVisible(false);
    };
    const onHash = () => {
      if (window.location.hash === "#cookie-preferences") {
        open();
        // Clear the hash so re-clicking the same link re-fires the event.
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    onHash(); // handle initial load with the hash already set
    window.addEventListener("gs:open-cookie-prefs", open);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("gs:open-cookie-prefs", open);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const handleAcceptAll = () => {
    writeConsent({ analytics: true, marketing: true });
    setBannerVisible(false);
  };

  const handleDeclineAll = () => {
    writeConsent({ analytics: false, marketing: false });
    setBannerVisible(false);
  };

  return (
    <>
      {bannerVisible && consent && !consent.gpcOverride && (
        <div className="cookie-banner">
          <p className="cookie-banner__text">
            We use a small set of cookies. Some are required for the site to work; analytics and marketing are optional. Read our <a href="/cookie-policy">Cookie Policy</a>.
          </p>
          <div className="cookie-banner__actions">
            <Button variant="primary" size="small" onClick={handleAcceptAll}>Accept all</Button>
            <Button variant="ghost" size="small" onClick={handleDeclineAll}>Decline</Button>
            <Button variant="ghost" size="small" onClick={() => { setPrefsOpen(true); setBannerVisible(false); }}>
              Customize
            </Button>
          </div>
        </div>
      )}

      <PreferencesModal
        isOpen={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        consent={consent}
      />
    </>
  );
}

function PreferencesModal({
  isOpen,
  onClose,
  consent,
}: {
  isOpen: boolean;
  onClose: () => void;
  consent: ConsentState | null;
}) {
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  // Sync local toggle state with canonical consent each time the modal opens.
  useEffect(() => {
    if (!isOpen || !consent) return;
    setAnalytics(consent.analytics);
    setMarketing(consent.marketing);
  }, [isOpen, consent]);

  const handleSave = () => {
    writeConsent({ analytics, marketing });
    onClose();
  };

  const gpcLocked = consent?.gpcOverride === true;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cookie preferences"
      size="medium"
      primaryAction={{ label: gpcLocked ? "Close" : "Save preferences", onClick: gpcLocked ? onClose : handleSave }}
      secondaryAction={gpcLocked ? undefined : { label: "Cancel", onClick: onClose }}
    >
      <Stack direction="vertical" gap={16}>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", lineHeight: "var(--line-height-relaxed)", margin: 0 }}>
          Choose which optional cookies we&apos;re allowed to use. Strictly necessary cookies (auth, session, payment) cannot be turned off — they&apos;re required for the site to function.
        </p>

        {gpcLocked && (
          <Alert variant="info" title="Global Privacy Control is enabled">
            <p>
              Your browser is sending a Global Privacy Control signal, which we honor as a binding decline of all non-essential cookies. We won&apos;t load analytics or marketing cookies regardless of the toggles below.
            </p>
          </Alert>
        )}

        <ConsentRow
          name="Strictly necessary"
          description="Authentication, session management, payment fraud prevention. Always on."
          checked
          disabled
        />

        <ConsentRow
          name="Analytics"
          description="Google Analytics — page views and events. Helps us understand how the platform is used. Plausible (cookieless) runs separately and isn't affected by this setting."
          checked={analytics}
          disabled={gpcLocked}
          onChange={setAnalytics}
        />

        <ConsentRow
          name="Marketing"
          description="Reserved for future use — we currently don't run advertising or retargeting cookies. Toggle here so your preference is on file if/when this changes."
          checked={marketing}
          disabled={gpcLocked}
          onChange={setMarketing}
        />
      </Stack>
    </Modal>
  );
}

function ConsentRow({
  name,
  description,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-8)",
        padding: "var(--spacing-12) var(--spacing-16)",
        background: disabled ? "var(--background-secondary)" : "var(--background-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-12)" }}>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)", color: "var(--text-primary)" }}>
            {name}
          </p>
          <p style={{ margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-12)", color: "var(--text-secondary)", lineHeight: "var(--line-height-snug)" }}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
