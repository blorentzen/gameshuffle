/**
 * `!gs-bingo` — control the shared community bingo board (broadcaster + mods,
 * Pro). Subcommands:
 *   !gs-bingo new [3-5]   — fresh board
 *   !gs-bingo mark <n>    — toggle square n (1-indexed)
 *   !gs-bingo clear       — remove the board
 * Gated by `minAuthority: "mod"` at dispatch; Pro-gated inside the handler
 * (silent for non-Pro so it never spams). Session-independent, like the dice.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  newBingoBoard,
  markBingoSquare,
  clearBingoBoard,
} from "@/lib/overlay/tools/bingo";
import type { ShuffleContext } from "./shuffle";

export async function handleBingoCommand(ctx: ShuffleContext, args: string): Promise<void> {
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

  const [sub, arg] = (args ?? "").trim().split(/\s+/);
  const subLower = (sub ?? "").toLowerCase();

  if (subLower === "new" || subLower === "start") {
    const size = parseInt(arg ?? "", 10);
    const board = await newBingoBoard({
      ownerUserId: ctx.userId,
      size: Number.isFinite(size) ? size : undefined,
      source: "chat",
    });
    await send(`🅱️ New ${board.size}×${board.size} bingo board is live on the overlay!`);
    return;
  }

  if (subLower === "mark" || subLower === "x") {
    const n = parseInt(arg ?? "", 10);
    if (!Number.isFinite(n)) {
      if (ctx.isBroadcaster) await send("🅱️ Usage: !gs-bingo mark <square number>");
      return;
    }
    const res = await markBingoSquare({ ownerUserId: ctx.userId, square: n, source: "chat" });
    if (res.error === "no_board") {
      if (ctx.isBroadcaster) await send("🅱️ No board yet. Run !gs-bingo new first.");
      return;
    }
    if (res.error === "out_of_range") {
      if (ctx.isBroadcaster) await send(`🅱️ Square ${n} is off the board.`);
      return;
    }
    if (res.newBingo) await send("🎉 BINGO! A line just completed!");
    return;
  }

  if (subLower === "clear" || subLower === "stop" || subLower === "off") {
    await clearBingoBoard({ ownerUserId: ctx.userId, source: "chat" });
    await send("🅱️ Bingo board cleared.");
    return;
  }

  // Bare / unknown → usage hint (broadcaster only, avoid spam).
  if (ctx.isBroadcaster) {
    await send("🅱️ !gs-bingo new · mark <n> · clear");
  }
}
