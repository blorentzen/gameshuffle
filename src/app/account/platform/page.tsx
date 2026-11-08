import { redirect } from "next/navigation";
import { adminHrefFor } from "@/lib/admin/items";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Platform admin moved to /admin (admin like Settings, picks 2026-11-08). Old links (emails, notifications,
 * bookmarks) name a screen as `?tab=platform-…`; this sends each to its new address, keeping any other params.
 * /admin itself checks who's asking.
 */
export default async function OldPlatformAdminPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : null;
  const to = adminHrefFor(tab);
  const rest = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== "tab" && typeof v === "string") rest.set(k, v);
  redirect(rest.size ? `${to}${to.includes("?") ? "&" : "?"}${rest.toString()}` : to);
}
