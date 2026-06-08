import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isBetaModeOn } from "@/lib/companion/beta";
import { BetaGate } from "./BetaGate";

export const metadata: Metadata = {
  title: "TCG Companion — Beta",
  // Never crawl the gate page. It's transient.
  robots: { index: false, follow: false },
};

/**
 * Beta-access gate. Per beta-gate-cc-spec acceptance criterion 3:
 * when `COMPANION_BETA_MODE !== "True"`, this route must 404 — not
 * render a hidden form, not redirect, not exist as a reachable
 * path. Failing closed at the server boundary guarantees the env
 * var alone controls reachability; no code change is required to
 * turn the gate off.
 */
export default function Page() {
  if (!isBetaModeOn()) {
    notFound();
  }
  return <BetaGate />;
}
