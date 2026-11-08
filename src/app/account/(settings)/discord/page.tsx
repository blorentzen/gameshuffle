import type { Metadata } from "next";
import { DiscordTabs } from "@/components/account/discord/DiscordTabs";
import { accountPageData } from "@/lib/account/pageData";

export const metadata: Metadata = { title: "Discord servers" };

/** Account ▸ Discord (menus and account picks 2026-11-05): see DiscordTabs. */
export default async function DiscordPage() {
  const d = await accountPageData("/account/discord");
  return <DiscordTabs isPro={d.isPro} />;
}
