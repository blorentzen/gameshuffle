import { redirect } from "next/navigation";
import { AccountTabs } from "@/components/account/AccountTabs";
import { accountPageData, showShopOrdersFor } from "@/lib/account/pageData";
import { ACCOUNT_TAB_ALIAS } from "@/lib/account/nav";
import { ACCOUNT_TAB_TO_SETTINGS } from "@/lib/settings/items";

/**
 * The You section (/account) moved into Settings (journeys picks 2026-11-06, 8A): its addresses forward there, keeping
 * any other parameters (sign-in results, OAuth returns). A `?tab=` that belongs to another section still opens it
 * through AccountTabs.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = typeof sp.tab === "string" ? sp.tab : "";
  const tab = ACCOUNT_TAB_ALIAS[raw] ?? raw;
  const to = !tab ? "/settings" : ACCOUNT_TAB_TO_SETTINGS[tab];
  if (to) {
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "tab" && typeof v === "string") rest.set(k, v);
    redirect(rest.size ? `${to}${to.includes("?") ? "&" : "?"}${rest.toString()}` : to);
  }
  const d = await accountPageData("/account");
  return <AccountTabs showShopOrders={await showShopOrdersFor(d)} timeZone={d.timeZone} />;
}
