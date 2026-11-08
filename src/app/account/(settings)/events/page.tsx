import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EventsTabs } from "@/components/account/events/EventsTabs";
import { accountPageData, showPayoutsFor } from "@/lib/account/pageData";
import { hasHosted } from "@/lib/host/home";

export const metadata: Metadata = { title: "Events you run" };

/** Where each Your events tab lives on the Host pages (journeys picks 2026-11-06, 7A). */
const TO_HOST: Record<string, string> = {
  tournaments: "/host/events?kind=tournament",
  "game-nights": "/host/events?kind=night",
  trivia: "/host/events?kind=trivia",
  communities: "/host/communities",
  setups: "/host/tools?tab=setups",
  decks: "/host/tools?tab=decks",
  payouts: "/host/tools?tab=payouts",
};
const ANYONE = new Set(["communities", "setups", "decks", "payouts"]);

/**
 * Account ▸ Your events (menus and account picks 2026-11-05): see EventsTabs. Since the Host home (2026-11-06) an
 * organizer is sent to /host, the tab to its place there; communities, setups, decks and payouts go there for everyone.
 */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const d = await accountPageData("/account/events");
  const tab = (await searchParams).tab ?? "";
  if (ANYONE.has(tab)) redirect(TO_HOST[tab]);
  if (await hasHosted(d.userId).catch(() => false)) redirect(TO_HOST[tab] ?? "/host");
  return <EventsTabs isPro={d.isPro} showPayouts={await showPayoutsFor(d.userId)} timeZone={d.timeZone} />;
}
