import { redirect } from "next/navigation";
import { hrefForTab } from "@/lib/account/nav";

/**
 * Moved (menus and account picks 2026-11-05): My Stuff's tabs now live in the section they belong to (Your events,
 * Pokémon, You ▸ Purchases, Profile ▸ GIFs). Forwards each `?tab=` there with every other query param.
 */
export default async function MovedMyStuff({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && sp.tab ? sp.tab : "tournaments";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "tab") continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  const rest = qs.toString();
  redirect(`${hrefForTab(tab)}${rest ? `&${rest}` : ""}`);
}
