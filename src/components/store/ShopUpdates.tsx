"use client";

/**
 * The Coming soon page's signup: "Get an email when the packs go live".
 * Signed in, one button (the account email); signed out, an email field.
 * Cards and the details window jump here with focusShopUpdates().
 */

import { useEffect, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { IconMailForward } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { shopCopy } from "@/lib/store/copy";

const JOINED_KEY = "gs-shop-updates";
export const SHOP_UPDATES_ID = "shop-updates";

/** Scroll to the signup and put the cursor in it (or on its button when signed in). */
export function focusShopUpdates() {
  const panel = document.getElementById(SHOP_UPDATES_ID);
  if (!panel) return;
  panel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  const target = panel.querySelector<HTMLElement>("input, button");
  target?.focus({ preventScroll: true });
}

export function ShopUpdates({ signedIn, ready }: { signedIn: boolean; ready: boolean }) {
  const copy = shopCopy().soon;
  const toast = useToast();
  const [joined, setJoined] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => { try { setJoined(window.localStorage.getItem(JOINED_KEY) === "1"); } catch { /* fine */ } });
  }, []);

  const join = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/shop/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signedIn ? {} : { email }) })
        .then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error(j?.error === "bad_email" || j?.error === "email_required" ? copy.badEmail : copy.failed); return; }
      try { window.localStorage.setItem(JOINED_KEY, "1"); } catch { /* fine */ }
      setJoined(true);
      track(EVENTS.shopUpdatesJoined, { signedIn });
      toast.success("You're on the list");
    } finally { setBusy(false); }
  };

  return (
    <section id={SHOP_UPDATES_ID} className="shop-updates" aria-labelledby="shop-updates-title">
      <span className="shop-updates__icon" aria-hidden><IconMailForward size={24} stroke={1.75} /></span>
      <div className="shop-updates__body">
        <h2 id="shop-updates-title" className="shop-updates__title">{ready ? copy.panelTitle : copy.badge}</h2>
        {!ready ? <p>{copy.later}</p> : joined ? <p role="status">{copy.joined}</p> : (
          <>
            <p>{copy.panelBody}</p>
            {signedIn ? (
              <div><Button variant="primary" disabled={busy} onClick={() => void join()}>{copy.signedInButton}</Button></div>
            ) : (
              <form className="shop-updates__form" onSubmit={(e) => { e.preventDefault(); void join(); }}>
                <Input type="email" fullWidth floatingLabel={copy.emailLabel} value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
                <Button type="submit" variant="primary" disabled={busy || !email.includes("@")}>{copy.notify}</Button>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}
