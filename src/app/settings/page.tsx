import { accountPageData, showShopOrdersFor } from "@/lib/account/pageData";
import { usernameOf } from "@/lib/settings/server";
import { SettingsScreen } from "@/components/settings/SettingsScreen";

/** The list (phones), with Account open beside it on a laptop. */
export default async function SettingsIndexPage() {
  const d = await accountPageData("/settings");
  return <SettingsScreen item="account" index timeZone={d.timeZone} showShopOrders={await showShopOrdersFor(d)} username={await usernameOf(d.userId)} />;
}
