/**
 * `!gs-tier` — control the shared tier list (broadcaster + mods, Pro).
 * Subcommands:
 *   !gs-tier new              — fresh list from your item pool
 *   !gs-tier place <n> <S-D>  — put item n in a tier (or "-" to unrank)
 *   !gs-tier clear            — remove the list
 * Placement is really a Hub job (this is here for parity + quick mod actions).
 * Pro-gated inside the handler; silent for non-Pro. Session-independent.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  newTierList,
  placeTierItem,
  clearTierList,
} from "@/lib/overlay/tools/tierList";
import type { ShuffleContext } from "./shuffle";

export async function handleTierCommand(ctx: ShuffleContext, args: string): Promise<void> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", ctx.userId)
    .maybeSingle();
  const tier = effectiveTier({
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  });
  if (tier !== "pro") return; // Pro-gated; stay silent for non-Pro owners.

  const send = (message: string) =>
    sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message,
    });

  const [sub, a1, a2] = (args ?? "").trim().split(/\s+/);
  const subLower = (sub ?? "").toLowerCase();

  if (subLower === "new" || subLower === "start") {
    const list = await newTierList({ ownerUserId: ctx.userId, source: "chat" });
    if (list.items.length === 0) {
      await send("📊 Tier list is live, but your item pool is empty. Add items in Stream Tools.");
    } else {
      await send(`📊 Tier list live with ${list.items.length} items. Rank them from your Hub!`);
    }
    return;
  }

  if (subLower === "place" || subLower === "rank") {
    const n = parseInt(a1 ?? "", 10);
    const tierKey = (a2 ?? "").toUpperCase();
    if (!Number.isFinite(n)) {
      if (ctx.isBroadcaster) await send("📊 Usage: !gs-tier place <item#> <S|A|B|C|D|->");
      return;
    }
    const target = tierKey === "-" || tierKey === "" ? null : tierKey;
    const res = await placeTierItem({
      ownerUserId: ctx.userId,
      itemId: n - 1, // chat is 1-indexed
      tier: target,
      source: "chat",
    });
    if (res.error === "no_list") {
      if (ctx.isBroadcaster) await send("📊 No tier list yet. Run !gs-tier new first.");
    } else if (res.error === "bad_item") {
      if (ctx.isBroadcaster) await send(`📊 No item #${n}.`);
    } else if (res.error === "bad_tier") {
      if (ctx.isBroadcaster) await send(`📊 "${tierKey}" isn't a tier. Use S, A, B, C, D, or -.`);
    }
    return;
  }

  if (subLower === "clear" || subLower === "stop" || subLower === "off") {
    await clearTierList({ ownerUserId: ctx.userId, source: "chat" });
    await send("📊 Tier list cleared.");
    return;
  }

  if (ctx.isBroadcaster) {
    await send("📊 !gs-tier new · place <n> <S-D> · clear");
  }
}
