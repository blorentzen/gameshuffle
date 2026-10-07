/**
 * The shape of a chat roll, as stored on `session_participants.current_combo`
 * and in shuffle events, plus readers for every surface that shows one (OBS
 * overlay, lobby page, /live, recaps, `!gs-mycombo`). Client-safe: no game data.
 *
 * Rolls before chat rolls covered every game are a bare Mario Kart combo
 * (`{character, vehicle, wheels, glider}`); `rollSlots` and `rollText` read
 * those too, and Mario Kart rolls keep those fields so older readers still work.
 */

/** How a part is drawn: game art on a dark mat, full-body art on a colour tile,
 *  an icon on a colour tile (Perfect Dark), a role glyph (hero shooters), or
 *  just the name on a colour tile (no art: GoldenEye, Pokémon Stadium). */
export type RollSlotKind = "art" | "portrait" | "icon" | "glyph" | "text";
export type RollGlyph = "shield" | "sword" | "heart" | "star";

export interface RollSlot {
  /** What this part is ("Character", "Fighter", "Hero", "Machine"). */
  label: string;
  name: string;
  kind: RollSlotKind;
  /** Image URL or site path (art, portrait, icon). */
  img?: string;
  /** Tile colour (portrait, icon, glyph, text). */
  color?: string;
  glyph?: RollGlyph;
  /** A second line: "Costume 4", "Tank", "Splat Bomb · Big Bubbler". */
  detail?: string;
}

export interface ChatRoll {
  v: 2;
  /** Randomizer slug the roll belongs to. */
  game: string;
  slots: RollSlot[];
  /** One line for chat: "🥊 Kirby (costume 4)". */
  text: string;
  /** A heading in place of "{name} drew" (a viewer battle: one part per player). */
  title?: string;
  /** A viewer battle (one part per player) or a match setup (`!gs setup`: tracks, a stage, a map). */
  kind?: "battle" | "setup";
}

type KartPart = { name?: string; img?: string } | null | undefined;
const KART_PARTS: { key: "character" | "vehicle" | "wheels" | "glider"; label: string; emoji: string }[] = [
  { key: "character", label: "Character", emoji: "🧑" },
  { key: "vehicle", label: "Vehicle", emoji: "🏎️" },
  { key: "wheels", label: "Wheels", emoji: "🛞" },
  { key: "glider", label: "Glider", emoji: "🪂" },
];

function isChatRoll(raw: unknown): raw is ChatRoll {
  return !!raw && typeof raw === "object" && Array.isArray((raw as ChatRoll).slots);
}

function kartParts(raw: Record<string, unknown>) {
  return KART_PARTS.map((p) => ({ ...p, part: raw[p.key] as KartPart })).filter(
    (p) => p.part && p.part.name && p.part.name !== "N/A",
  );
}

/** The parts of any stored roll, new or old. Empty when there's nothing to show. */
export function rollSlots(raw: unknown): RollSlot[] {
  if (!raw || typeof raw !== "object") return [];
  if (isChatRoll(raw)) return raw.slots;
  return kartParts(raw as Record<string, unknown>).map(({ label, part }) => ({
    label,
    name: part!.name!,
    kind: "art" as const,
    img: part!.img || undefined,
  }));
}

/** One chat line for any stored roll, new or old. */
export function rollText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  if (isChatRoll(raw)) return raw.text;
  return kartParts(raw as Record<string, unknown>).map(({ emoji, part }) => `${emoji} ${part!.name}`).join(" · ");
}

/** Which game a stored roll belongs to, when it says (old Mario Kart rolls don't). */
export function rollGame(raw: unknown): string | null {
  return isChatRoll(raw) ? raw.game : null;
}

/** "setup" for a match roll, "battle" for a viewer battle, null for a player's own roll. */
export function rollKind(raw: unknown): "battle" | "setup" | null {
  if (!isChatRoll(raw)) return null;
  if (raw.kind === "setup" || raw.kind === "battle") return raw.kind;
  return raw.title ? "battle" : null;
}

/** The heading a roll asks for in place of "{name} drew", if any. */
export function rollTitle(raw: unknown): string | null {
  return isChatRoll(raw) && typeof raw.title === "string" && raw.title ? raw.title : null;
}
