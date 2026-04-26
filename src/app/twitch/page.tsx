/**
 * /twitch → /account?tab=integrations
 *
 * The streamer integration lives as a tab under /account now. This
 * route survives for bookmarks, the OAuth-flow return target, and any
 * external links that still use the old URL. Query params are forwarded
 * so auth callbacks (`?connected=1`, `?connect_error=...`) still land
 * on the right tab.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TwitchRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const url = new URL("/account", "https://placeholder");
  url.searchParams.set("tab", "integrations");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  redirect(`${url.pathname}${url.search}`);
}
