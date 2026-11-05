/**
 * Reactions on posts and comments (GIFs step 2, picks https://claude.ai/artifact/3JFd2GLvPRQtypZBHrHAhg, all as
 * recommended, plus Britton's notes: stickers come first in the picker, and a row never stacks up with ten pills).
 * A reaction is stored as its key: one of the six emoji, or a GameShuffle sticker as "s:<sticker id>"
 * (src/data/stickers.ts). Each person can add each one once. Client-safe.
 */

import { STICKER_BY_ID, stickerText } from "@/data/stickers";

export const REACTION_EMOJI = ["👍", "❤️", "😄", "🎉", "😕", "👀"] as const;
const EMOJI_SET = new Set<string>(REACTION_EMOJI);
const EMOJI_NAMES: Record<string, string> = { "👍": "Thumbs up", "❤️": "Heart", "😄": "Smile", "🎉": "Party", "😕": "Unsure", "👀": "Eyes" };

export const STICKER_KEY = "s:";
/** The stickers the picker opens on (the rest are a tap away). */
export const QUICK_STICKERS = ["gg", "clutch", "nice", "so-close", "nooo", "rematch", "hype", "respect", "called-it"];
/** Most pills a row shows before folding the rest into "+N" (which counts as one of them). */
export const MAX_PILLS = { post: 4, comment: 3 } as const;

export const stickerKey = (id: string): string => `${STICKER_KEY}${id}`;
export function stickerOfKey(key: string): string | null {
  return key.startsWith(STICKER_KEY) && STICKER_BY_ID[key.slice(STICKER_KEY.length)] ? key.slice(STICKER_KEY.length) : null;
}
export function isReactionKey(key: unknown): key is string {
  return typeof key === "string" && (EMOJI_SET.has(key) || stickerOfKey(key) !== null);
}
/** What a reaction says, for labels and notifications ("CLUTCH", "Thumbs up"). */
export function reactionLabel(key: string): string {
  const s = stickerOfKey(key);
  return s ? stickerText(STICKER_BY_ID[s]) : EMOJI_NAMES[key] ?? key;
}

export interface ReactionCount { emoji: string; count: number; reacted: boolean; users?: string[] }

/**
 * Which pills a row shows: most used first (ties keep their order), at most `max` including a "+N" when some are
 * folded away; a reaction of the viewer's own is never the one hidden.
 */
export function visibleReactions<T extends ReactionCount>(list: T[], max: number): { shown: T[]; hidden: T[] } {
  const sorted = list.map((r, i) => ({ r, i })).sort((a, b) => b.r.count - a.r.count || a.i - b.i).map((x) => x.r);
  if (sorted.length <= max) return { shown: sorted, hidden: [] };
  const room = Math.max(1, max - 1);
  const shown = sorted.slice(0, room);
  const hidden = sorted.slice(room);
  // Keep the viewer's own reaction in view, in place of the least used one shown.
  const mine = hidden.find((r) => r.reacted);
  if (mine && !shown.some((r) => r.reacted)) {
    const out = shown[shown.length - 1];
    shown[shown.length - 1] = mine;
    hidden.splice(hidden.indexOf(mine), 1, out);
  }
  return { shown, hidden };
}
