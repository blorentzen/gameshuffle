/**
 * Spin engine — shared by the Hub action and the `!spin` chat command.
 *
 * Builds the spinnable pool (fixed segments minus consumed labels + active
 * viewer entries), picks a weighted-random winner server-side, records the
 * spin (snapshot = the pool, so the overlay renders fixed + viewer
 * together), and — for remove-on-spin wheels — consumes the winner.
 */

import "server-only";
import {
  consumeEntry,
  consumeFixedLabel,
  getDefaultWheel,
  getSpinPool,
  getWheel,
  recordSpin,
} from "./store";
import { pickWeightedWinner, type WheelSegment, type WheelSpin } from "./types";

export type SpinOutcome =
  | { ok: true; spin: WheelSpin }
  | { ok: false; error: "no_wheel" | "empty_wheel" };

export async function performSpin(args: {
  ownerUserId: string;
  /** Specific wheel; omit to use the streamer's default. */
  wheelId?: string;
  /** Display label for who triggered it (chat name / "Streamer"). */
  triggeredBy?: string | null;
  /** "hub" | "chat_command" — recorded for analytics. */
  triggerType: string;
}): Promise<SpinOutcome> {
  const wheel = args.wheelId
    ? await getWheel(args.ownerUserId, args.wheelId)
    : await getDefaultWheel(args.ownerUserId);
  if (!wheel) return { ok: false, error: "no_wheel" };

  const pool = await getSpinPool(wheel);
  if (!pool.length) return { ok: false, error: "empty_wheel" };

  const winningIndex = pickWeightedWinner(pool);
  const winner = pool[winningIndex];
  const winningLabel = winner?.label ?? "";

  // Snapshot the pool as plain segments (drop internal source/entryId).
  const segments: WheelSegment[] = pool.map((p) => {
    const seg: WheelSegment = { label: p.label };
    if (p.weight != null) seg.weight = p.weight;
    if (p.color) seg.color = p.color;
    return seg;
  });

  const spin = await recordSpin({
    ownerUserId: args.ownerUserId,
    wheelId: wheel.id,
    wheelName: wheel.name,
    segments,
    winningIndex,
    winningLabel,
    triggeredBy: args.triggeredBy ?? null,
    triggerType: args.triggerType,
    themeId: wheel.themeId,
    fillStyle: wheel.fillStyle,
  });

  // Elimination — remove the winner from the wheel for the next spin.
  if (wheel.contribution.resetMode === "on_spin" && winner) {
    if (winner.source === "viewer" && winner.entryId) {
      await consumeEntry(winner.entryId);
    } else {
      await consumeFixedLabel(wheel.id, winner.label, wheel.consumedLabels);
    }
  }

  return { ok: true, spin };
}
