import "server-only";

/**
 * "Make cards with AI" for a GS Pro deck (My Stuff ▸ Decks): the owner names a
 * game and a theme, and gets Chance cards, missions or house rules to tick and
 * add as drafts. Every card passes the word filter and the same checks a
 * hand-written card does (validateCard); nothing is saved here, and a draft
 * still has to be published (with the family-safe question) before it's dealt.
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { isBlockedText } from "@/lib/text/filter";
import { deckFamily } from "@/lib/cards/families";
import { validateCard, type CardDraft } from "@/lib/party/deck";
import { PARTY_FAMILY } from "@/data/party";

export type AiDeckKind = "chance" | "mission" | "rule";
const COUNT = 8;

const KIND_BRIEF: Record<AiDeckKind, string> = {
  chance:
    "Chance cards. Each is dealt to one player, named {player} in the text, and is either a help (an advantage) or a crutch (a handicap). A card can also name {rival}, someone else at the table, and can last {n} turns (give turnsMin and turnsMax, 1 to 30). Set rivalObeys when the card holds the rival back, like a truce. Aim for half helps and half crutches.",
  mission:
    "Missions: a secret goal one player tries to complete during the game, worth 1 (easy), 2 or 3 (hard) points. Missions must be something the table can clearly confirm happened. A mission may name {rival}; it never uses {player}.",
  rule:
    "House rules: a rule everyone plays by (scope table) or one player follows (scope player). Mark each mild (a small twist) or spicy (shakes up the game). House rules never use placeholders.",
};

const FAMILY_BRIEF: Record<string, string> = {
  [PARTY_FAMILY]: "Mario Party, played on a board with dice, coins, Stars, items, shops, forks in the path and minigames. 'Turn' means a board turn.",
  smash: "Super Smash Bros. Ultimate, played as a night of games with stocks, stages and fighters. 'Turn' means one game.",
};

const SYSTEM = `You write cards for GameShuffle's game night decks: house rules, Chance cards and missions that friends play by at the couch, and that can show on a livestream. Keep every card stream-safe and kind: no slurs, sexual content, drinking, drugs, real-person insults, dares about bodies, or anything that singles out a group. Cards should be fun, short, specific to the game's real mechanics, and checkable by the table. A card can only ask for things players choose or do in the game (which path, which item, whether to buy, how hard to try, who to target) or at the couch (talking, hands, seats); it can't add or remove coins, Stars or stocks by hand, since the game keeps those. Use plain words. Don't use em dashes or en dashes. Titles are 2 to 4 words.`;

const schema = z.object({
  cards: z.array(z.object({
    title: z.string(),
    text: z.string(),
    effect: z.enum(["help", "crutch"]).nullable(),
    worth: z.number().int().nullable(),
    tone: z.enum(["mild", "spicy"]).nullable(),
    scope: z.enum(["table", "player"]).nullable(),
    turnsMin: z.number().int().nullable(),
    turnsMax: z.number().int().nullable(),
    rivalObeys: z.boolean().nullable(),
  })),
});

const tidy = (s: string) => s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/** Draft cards of one kind for a deck family. `avoid` = titles already in the deck. */
export async function generateDeckCards(family: string, kind: AiDeckKind, theme: string, avoid: string[] = []): Promise<AiResult<CardDraft[]>> {
  const fam = deckFamily(family);
  if (!fam) return { ok: false, error: "failed" };
  const avoidSet = new Set(avoid.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const prompt = [
    `Game: ${FAMILY_BRIEF[family] ?? fam.label}`,
    `Write ${COUNT + 3} ${KIND_BRIEF[kind]}`,
    kind === "chance" ? "Mix them: about half helps and half crutches." : "",
    theme ? `Theme or group: ${theme}` : "",
    "Card text is one or two short sentences, at most 200 characters. Placeholders allowed: {player}, {rival}, {n}, and only as described.",
    avoidSet.size ? `The deck already has these titles, so write different ideas: ${[...avoidSet].slice(0, 60).join("; ")}` : "",
  ].filter(Boolean).join("\n");
  const res = await draftStructured({ system: SYSTEM, prompt, schema, effort: "low", maxTokens: 4000 });
  if (!res.ok) return res;

  const seen = new Set<string>();
  const out: CardDraft[] = [];
  for (const c of res.data.cards) {
    const title = tidy(c.title).slice(0, 60);
    const text = tidy(c.text);
    const key = title.toLowerCase();
    if (!title || !text || seen.has(key) || avoidSet.has(key) || isBlockedText(`${title} ${text}`)) continue;
    const hasN = text.includes("{n}");
    const lo = hasN ? Math.min(Math.max(c.turnsMin ?? 2, 1), 30) : null;
    const hi = hasN ? Math.min(Math.max(c.turnsMax ?? (lo ?? 2) + 2, lo ?? 1), 30) : null;
    const draft: CardDraft = {
      kind,
      scope: kind === "rule" ? (c.scope ?? "table") : "player",
      title,
      text,
      tone: kind === "rule" ? (c.tone ?? "mild") : null,
      worth: kind === "mission" ? Math.min(Math.max(c.worth ?? 1, 1), 3) : null,
      effect: kind === "chance" ? (c.effect ?? "crutch") : null,
      turns_min: lo,
      turns_max: hi,
      turns_mode: "for",
      rival_obeys: kind === "chance" && !!c.rivalObeys && text.includes("{rival}"),
      starter: false,
      games: null,
      not_under: null,
    };
    if (validateCard(draft).length) continue;
    seen.add(key);
    out.push(draft);
  }
  return out.length ? { ok: true, data: out.slice(0, COUNT) } : { ok: false, error: "failed" };
}

export function isAiDeckKind(v: unknown): v is AiDeckKind {
  return v === "chance" || v === "mission" || v === "rule";
}
