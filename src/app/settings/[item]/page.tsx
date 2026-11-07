import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { accountPageData, showShopOrdersFor } from "@/lib/account/pageData";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { settingsItem } from "@/lib/settings/items";
import { usernameOf } from "@/lib/settings/server";

type Props = { params: Promise<{ item: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = settingsItem((await params).item);
  return { title: item?.label ?? "Settings" };
}

/** One Settings page; a tool or game item opens its own page. */
export default async function SettingsItemPage({ params }: Props) {
  const id = (await params).item;
  const item = settingsItem(id);
  if (!item) notFound();
  if (item.href) redirect(item.href);
  const d = await accountPageData(`/settings/${id}`);
  return <SettingsScreen item={id} timeZone={d.timeZone} showShopOrders={await showShopOrdersFor(d)} username={await usernameOf(d.userId)} />;
}
