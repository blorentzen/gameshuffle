import "server-only";

/**
 * Whether visitors can see the shop at all: the full shop (`shop_open`) or the
 * Coming soon page (`shop_coming_soon`). With both off, /shop is page not found
 * for visitors, so the links into it (nav, homepage band, TCG and game night
 * lines) stay hidden too. Flags are cached in memory by getPlatformFlag.
 */

import { getPlatformFlag } from "@/lib/platform/flags";

export async function shopVisibleToVisitors(): Promise<boolean> {
  const [open, soon] = await Promise.all([getPlatformFlag("shop_open", false), getPlatformFlag("shop_coming_soon", false)]);
  return open || soon;
}
