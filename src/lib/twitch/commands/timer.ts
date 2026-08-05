/**
 * `!gs-timer <duration> [label]` — start a countdown on the streamer's overlay.
 * `!gs-timer stop` clears it. Broadcaster + mods only (gated by
 * `minAuthority: "mod"` at dispatch), Pro-gated inside the handler (silent for
 * non-Pro so it never spams chat). Session-independent, like the dice + wheel.
 *
 * Duration grammar (first whitespace token; the rest is the label):
 *   90s · 5m · 1h · 1h30m · 25m30s   (unit combos)
 *   5:00 · 1:30:00                    (M:SS or H:MM:SS)
 *   10                               (bare number = minutes)
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { triggerTimerStart, triggerTimerStop } from "@/lib/overlay/tools/timer";
import type { ShuffleContext } from "./shuffle";

const STOP_WORDS = new Set(["stop", "cancel", "off", "clear", "end"]);

/** Parse the leading duration token → seconds. Returns null when unparseable. */
export function parseDurationToken(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;

  // Colon form: M:SS or H:MM:SS
  if (t.includes(":")) {
    const parts = t.split(":");
    if (parts.length < 2 || parts.length > 3) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length === 2) {
      const [m, s] = nums;
      if (s >= 60) return null;
      return Math.round(m * 60 + s);
    }
    const [h, m, s] = nums;
    if (m >= 60 || s >= 60) return null;
    return Math.round(h * 3600 + m * 60 + s);
  }

  // Unit-combo form: 1h30m, 90s, 5m …
  const unitRe = /(\d+(?:\.\d+)?)(h|m|s)/g;
  let match: RegExpExecArray | null;
  let seconds = 0;
  let matchedAny = false;
  let consumed = 0;
  while ((match = unitRe.exec(t)) !== null) {
    matchedAny = true;
    consumed += match[0].length;
    const value = Number(match[1]);
    const unit = match[2];
    seconds += unit === "h" ? value * 3600 : unit === "m" ? value * 60 : value;
  }
  // Only accept the unit form if it consumed the whole token (no stray chars).
  if (matchedAny && consumed === t.length) return Math.round(seconds);

  // Bare number → minutes.
  if (/^\d+(?:\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);

  return null;
}

/** Format seconds as M:SS or H:MM:SS for chat. */
function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export async function handleTimerCommand(ctx: ShuffleContext, args: string): Promise<void> {
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

  const trimmed = (args ?? "").trim();
  const [first, ...rest] = trimmed.split(/\s+/);
  const firstLower = (first ?? "").toLowerCase();

  // Stop / clear.
  if (!first || STOP_WORDS.has(firstLower)) {
    if (!first) {
      // Bare `!gs-timer` with no args → usage hint (broadcaster only, avoid spam).
      if (ctx.isBroadcaster) {
        await sendChatMessage({
          broadcasterId: ctx.broadcasterTwitchId,
          senderId: ctx.botTwitchId,
          message: "⏱️ Usage: !gs-timer 5m [label]  •  !gs-timer stop",
        });
      }
      return;
    }
    await triggerTimerStop({ ownerUserId: ctx.userId, source: "chat" });
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: "⏱️ Timer cleared.",
    });
    return;
  }

  const seconds = parseDurationToken(first);
  if (seconds == null) {
    if (ctx.isBroadcaster) {
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: `⏱️ Couldn't read "${first}". Try 5m, 90s, or 1:30.`,
      });
    }
    return;
  }

  const label = rest.join(" ").trim() || null;
  const started = await triggerTimerStart({
    ownerUserId: ctx.userId,
    seconds,
    label,
    source: "chat",
  });

  const prefix = started.label ? `${started.label}: ` : "";
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: `⏱️ ${prefix}${formatClock(started.seconds)} on the clock!`,
  });
}
