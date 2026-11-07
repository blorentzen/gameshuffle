import type { Metadata } from "next";
import { accountPageData, showPayoutsFor } from "@/lib/account/pageData";
import { HostHeader } from "@/components/host/HostParts";
import { HostTools } from "@/components/host/HostScreen";

export const metadata: Metadata = { title: "Tools · Host", robots: { index: false, follow: false } };

/**
 * /host/tools: what you bring to the events you run (journeys picks 2026-11-06, 4A and 7A): every saved setup (moved
 * here from Account), your game night decks, and payouts once paid entry is on or you have a payout account.
 */
export default async function HostToolsPage() {
  const d = await accountPageData("/host/tools");
  return (
    <div className="hub-page studio-page host-page">
      <HostHeader />
      <HostTools isPro={d.isPro} showPayouts={await showPayoutsFor(d.userId)} />
    </div>
  );
}
