"use client";

/**
 * "Keep these looks" (try before paying, picks 2026-10-29, https://claude.ai/artifact/FntRHwbNVFZ1DtC1i1Qff4, all
 * as recommended). Under the studio's preview, in the page (never fixed to the screen), as soon as the
 * card uses a paid look and the account has no looks: GS Pro (the trial while it's unused) and monthly
 * support from $3 (Supporter, one-step checkout, while that level sells looks; until then a link to the
 * levels, saying Backer at $9 is the one with the looks), plus the free version as a link.
 *   A visitor's buttons make the account first: /signup?redirect=/mmr-card?then=<plan>, and the studio
 *     opens checkout straight after (`autoPlan`). Their card waits in this browser (draft.ts).
 *   A signed-in account's buttons open checkout; both checkouts come back to /mmr-card.
 * Support checkout needs a passed Turnstile check (card testers look for small open checkouts), so the
 * support button shows the check and carries on once it passes.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@empac/cascadeds";
import { IconHeart, IconPalette } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { useLooks } from "@/components/billing/LooksOnly";
import { usePaidAvailability } from "@/components/billing/usePaidAvailability";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { useToast } from "@/components/toast/ToastProvider";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { EVENTS, track } from "@/lib/analytics/events";
import { supportLevel } from "@/lib/support/rules";
import type { DraftPlan } from "@/lib/mmr/draft";

type SupportPlan = "supporter" | "backer";
const RETURN_TO = "/mmr-card";

/** "your picture and Chakra Petch", "A, B and C". */
const listWords = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function KeepLooksPanel({ used, guest, autoPlan = null, beforeLeave }: {
  /** The paid choices the card uses, by label (proUsed). */
  used: string[];
  /** A visitor without an account. */
  guest: boolean;
  /** Just back from making an account with one of these buttons: carry on to its checkout. */
  autoPlan?: DraftPlan | null;
  /** Keeps the card in this browser before leaving the page. */
  beforeLeave: () => void;
}) {
  const access = useLooks();
  const trial = useTrialEligibility();
  const paid = usePaidAvailability();
  const pricing = usePublicPricing();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<DraftPlan | null>(null);
  // The support checkout waits for its Turnstile check; a visitor coming back for support starts on it.
  const [check, setCheck] = useState<SupportPlan | null>(() => (!guest && (autoPlan === "supporter" || autoPlan === "backer") ? autoPlan : null));
  const [round, setRound] = useState(0);
  const autoRan = useRef(false);

  const support: SupportPlan = access?.supporterOffer ? "supporter" : "backer";
  const supportDef = supportLevel(support);
  const trialLeft = !trial?.hasUsedTrial;
  const proPrice = usd(pricing.plans.pro?.monthly ?? 9);
  const supportPrice = usd((supportDef?.cents ?? (support === "supporter" ? 300 : 900)) / 100);
  const fromPrice = usd((supportLevel("supporter")?.cents ?? 300) / 100);
  // The support levels, from $3 (while Supporter looks aren't on sale); the card waits in this browser.
  const backLevels = () => {
    track(EVENTS.supportClicked, { from: guest ? "mmr-keep-looks-guest" : "mmr-keep-looks" });
    beforeLeave();
    router.push(`/support?level=supporter&from=${encodeURIComponent("mmr-keep-looks")}#give`);
  };

  const startPro = async () => {
    setBusy("pro");
    beforeLeave();
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval: "monthly", returnTo: RETURN_TO }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (data.url) {
        track(EVENTS.checkoutStarted, { product: "pro", from: "mmr-keep-looks" });
        window.location.assign(data.url);
        return;
      }
      toast.error(data.message ?? "Couldn't open checkout. Try again?");
    } catch {
      toast.error("Couldn't open checkout. Try again?");
    }
    setBusy(null);
  };

  const startSupport = async (plan: SupportPlan, token: string) => {
    setBusy(plan);
    beforeLeave();
    try {
      const res = await fetch("/api/support/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "monthly", level: plan, turnstileToken: token, returnTo: RETURN_TO }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (data.url) {
        track(EVENTS.checkoutStarted, { product: "support", from: "mmr-keep-looks" });
        window.location.assign(data.url);
        return;
      }
      if (data.error === "captcha") { setRound((r) => r + 1); toast.error("The check didn't go through. Try it again."); }
      else toast.error(data.message ?? "Couldn't open checkout. Try again?");
    } catch {
      toast.error("Couldn't open checkout. Try again?");
    }
    setBusy(null);
  };

  const choose = (plan: DraftPlan) => {
    track(plan === "pro" ? EVENTS.upgradeClicked : EVENTS.supportClicked, { from: guest ? "mmr-keep-looks-guest" : "mmr-keep-looks" });
    if (guest) {
      beforeLeave();
      router.push(`/signup?redirect=${encodeURIComponent(`${RETURN_TO}?then=${plan}`)}`);
      return;
    }
    if (plan === "pro") void startPro();
    else if (plan === "supporter" || plan === "backer") setCheck(plan);
  };

  // Back from making the account for GS Pro: open its checkout once (support waits for its check above).
  useEffect(() => {
    if (autoRan.current || guest || autoPlan !== "pro" || !paid?.paidPlans.available) return;
    autoRan.current = true;
    void startPro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlan, guest, paid?.paidPlans.available]);

  if (access?.looks) return null;
  const outside = paid != null && !paid.paidPlans.available;

  return (
    <Card variant="outlined" padding="medium" className="keep-looks">
      <div className="keep-looks__head">
        <IconTile icon={IconPalette} tone="magenta" />
        <div>
          <h3 className="keep-looks__title">Keep these looks</h3>
          {used.length > 0 && <p className="keep-looks__used">Your card uses {listWords(used.map((u) => (u === "Your picture or GIF" ? "your picture" : u)))}.</p>}
        </div>
      </div>

      {outside ? (
        <div className="keep-looks__outside">
          <p>GS Pro and monthly support are open in the US for now. Leave your email and we&apos;ll tell you when they open where you are.</p>
          <PaidPlansWaitlist product="both" />
        </div>
      ) : (
        <div className="keep-looks__choices">
          <div className="keep-looks__grid">
            <div className="keep-looks__choice">
              <p className="keep-looks__name">GS Pro <span className="keep-looks__price">{trialLeft ? `14 days free, then ${proPrice} a month` : `${proPrice} a month`}</span></p>
              <p className="keep-looks__line">Every look, plus streamer tools and AI.</p>
              <Button variant="primary" fullWidth loading={busy === "pro"} onClick={() => choose("pro")}>{trialLeft ? "Start GS Pro free" : "Get GS Pro"}</Button>
            </div>
            {support === "supporter" ? (
            <div className="keep-looks__choice">
              <p className="keep-looks__name">{supportDef?.name} <span className="keep-looks__price">{supportPrice} a month</span></p>
              <p className="keep-looks__line">Every look, and it keeps GameShuffle free.</p>
              {check === support ? (
                <div className="keep-looks__check">
                  <p className="keep-looks__line">One quick check, then checkout opens.</p>
                  <TurnstileWidget onToken={(t) => { if (t) void startSupport(support, t); }} size="flexible" resetKey={round} />
                </div>
              ) : (
                <Button variant="secondary" fullWidth iconBefore={IconHeart} loading={busy === support} onClick={() => choose(support)}>
                  Support for {supportPrice} a month
                </Button>
              )}
            </div>
            ) : (
            // Until Supporter looks are on sale, $3 is a thank-you only: lead with it, and let the levels say
            // which one keeps the looks (Backer, with GS Pro). The card waits in this browser meanwhile.
            <div className="keep-looks__choice">
              <p className="keep-looks__name">Back GameShuffle <span className="keep-looks__price">From {fromPrice} a month</span></p>
              <p className="keep-looks__line">Backer at {supportPrice} adds GS Pro and every look.</p>
              <Button variant="secondary" fullWidth iconBefore={IconHeart} onClick={backLevels}>Back from {fromPrice} a month</Button>
            </div>
            )}
          </div>
        </div>
      )}

      {guest ? (
        <p className="keep-looks__free">
          You&apos;ll make a free account first, and your card comes with you.{" "}
          <ArrowLink href={`/signup?redirect=${encodeURIComponent(`${RETURN_TO}?then=free`)}`}>Or save the free version</ArrowLink>
        </p>
      ) : (
        <p className="keep-looks__free">Until then, your card saves with free looks. <ArrowLink href="/gs-pro#included">See what&apos;s included</ArrowLink></p>
      )}
    </Card>
  );
}
