import "server-only";

/**
 * "Make it for my stream" content packs (GS Pro): a streamer gives a theme and
 * gets a list to edit and approve before anything is saved: wheel slices,
 * bingo squares, tier list items, Most Likely To prompts or Odd One Out
 * secret words. Every item passes the shared word filter and the kind's length limit;
 * nothing here is saved or shown publicly until the streamer keeps it.
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";

export type PackKind = "wheel" | "bingo" | "tierlist" | "mostlikely" | "oddoneout";

interface PackSpec {
  /** How many items to ask for, and the most we'll return. */
  count: number;
  /** Longest item, in characters (wheel slices truncate past 16). */
  maxLen: number;
  /** What one item is, for the prompt. */
  brief: string;
}

export const PACK_SPECS: Record<PackKind, PackSpec> = {
  wheel: {
    count: 10,
    maxLen: 16,
    brief: "slices for a spin-the-wheel on a livestream: short challenges, rules, picks or consequences the streamer or chat acts on. Each label is 16 characters or fewer, so it fits on a wheel slice.",
  },
  bingo: {
    count: 30,
    maxLen: 36,
    brief: "bingo squares for viewers to mark while watching a stream: things that visibly happen on stream or in chat (an in-game moment, a streamer habit, a chat reaction). Each one is short, specific and something you can clearly say happened or didn't.",
  },
  tierlist: {
    count: 12,
    maxLen: 28,
    brief: "items to rank in a tier list (S to D): things in the same category that people will argue about. Use names people recognize; no descriptions.",
  },
  mostlikely: {
    count: 15,
    maxLen: 90,
    brief: "'Most likely to…' prompts for a group to vote on who fits best. Each starts with 'Most likely to' and is playful, never mean, never about bodies, money troubles or anything sensitive.",
  },
  oddoneout: {
    count: 24,
    maxLen: 28,
    brief: "secret words for a hidden-word party game, all in the theme's category: everyone but one player gets the word and gives one-word hints, and the odd one out only knows the category. Pick things everyone at a table knows and can hint at without giving it away; avoid words that are also the category name.",
  },
};

const SYSTEM = `You write content for GameShuffle, a game night and livestream companion. Streamers use what you write on stream, in front of their chat, so it must be stream-safe: no slurs, sexual content, graphic violence, drugs, real-person insults, or anything that singles out a group. Keep it fun, specific to the theme, and varied (no near-duplicates). Use plain words and the theme's own vocabulary. Don't use em dashes or en dashes. Never invent facts about real people.`;

const schema = z.object({ items: z.array(z.string()) });

function clean(items: string[], spec: PackSpec, avoid: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    let item = raw.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()
      .replace(/^(\d+[.)]|[-*•])\s+/, ""); // list numbering or bullets
    if (/^(["']).*\1$/.test(item)) item = item.slice(1, -1).trim(); // quotes wrapping the whole item
    const key = item.toLowerCase();
    if (!item || item.length > spec.maxLen || seen.has(key) || avoid.has(key) || isBlockedText(item)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, spec.count);
}

/**
 * Draft a pack. `avoid` is what the streamer already has (so a second run adds
 * new items instead of repeating them).
 */
export async function generatePack(kind: PackKind, theme: string, avoid: string[] = []): Promise<AiResult<string[]>> {
  const spec = PACK_SPECS[kind];
  const avoidSet = new Set(avoid.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const prompt = [
    `Theme: ${theme.trim()}`,
    `Write ${spec.count + 4} ${spec.brief}`,
    `Hard limit: ${spec.maxLen} characters per item.`,
    avoidSet.size ? `They already have these, so don't repeat them: ${[...avoidSet].slice(0, 60).join("; ")}` : "",
  ].filter(Boolean).join("\n");
  const res = await draftStructured({ system: SYSTEM, prompt, schema, effort: "low", maxTokens: 3000 });
  if (!res.ok) return res;
  const items = clean(res.data.items, spec, avoidSet);
  return items.length ? { ok: true, data: items } : { ok: false, error: "failed" };
}

export function isPackKind(v: unknown): v is PackKind {
  return typeof v === "string" && v in PACK_SPECS;
}
