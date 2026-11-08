import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/subscription";
import { PlatformTabs } from "@/components/account/PlatformTabs";
import type { Metadata } from "next";
import { ACCOUNT_SECTIONS, ACCOUNT_TAB_ALIAS, itemTabIds } from "@/lib/account/nav";

/** The browser tab names the open screen, the way Settings does ("Pricing · Admin | GameShuffle"). */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ tab?: string }> }): Promise<Metadata> {
  const raw = (await searchParams).tab ?? "";
  const tab = ACCOUNT_TAB_ALIAS[raw] ?? raw;
  const item = ACCOUNT_SECTIONS.find((s) => s.kind === "staff")?.items.find((i) => itemTabIds(i).includes(tab));
  const name = item?.tabs?.find((t) => t.id === tab)?.label ?? item?.label ?? "Platform admin";
  return { title: { absolute: `${name} · Admin | GameShuffle` }, robots: { index: false, follow: false } };
}

/**
 * Platform Admin section page — the third of the three /account section PAGES
 * (Account · Streamer · Platform Admin). Staff/admin only.
 *
 * Gated server-side so a non-staff session that navigates straight to
 * `/account/platform?tab=…` is bounced to `/account` before any admin UI
 * renders (no flash, defense-in-depth on top of each tab's own API checks).
 * The shared shell + sidebar live in `src/app/account/layout.tsx`.
 */
export default async function PlatformAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isStaffRole((data?.role as string | null) ?? null)) {
    redirect("/account");
  }

  return <PlatformTabs />;
}
