/**
 * Board-game nights don't carry a per-night photo, so each card gets a branded
 * gradient header + motif derived deterministically from its id. Same night,
 * same look every time; the set is varied so a grid of cards feels lively.
 * Client-safe (no server imports) so both server pages and client browsers use it.
 */

export interface NightVisual { gradient: string; emoji: string }

const GRADIENTS = [
  "linear-gradient(135deg, var(--primary-600, #3b3fb6) 0%, var(--accent-500, #7c3aed) 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #d946a6 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, var(--primary-600, #3b3fb6) 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #d9466a 100%)",
  "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
  "linear-gradient(135deg, #d9466a 0%, #7c3aed 100%)",
];

const EMOJI = ["🎲", "🃏", "♟️", "🎯", "🧩", "🀄", "🎴", "🎰"];

/** Stable non-negative hash of a string (djb2-ish). */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function nightVisual(id: string): NightVisual {
  const h = hash(id || "night");
  return { gradient: GRADIENTS[h % GRADIENTS.length], emoji: EMOJI[h % EMOJI.length] };
}

/**
 * FPO artwork for a board game that has no cover image. Deterministic per name,
 * color-coded by play length so a grid reads at a glance: green = short,
 * amber = moderate, violet = long. Returns a gradient + 1-2 letter initials.
 */
export interface GameArtFallback { gradient: string; initials: string; length: "short" | "moderate" | "long" }

// Two-stop ramps per length bucket; the name hash picks one so same-length
// games still vary. Keyed to the platform length palette (short/mod/long).
const LENGTH_RAMPS: Record<"short" | "moderate" | "long", string[]> = {
  short: [
    "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
    "linear-gradient(135deg, #22c55e 0%, #10b981 100%)",
    "linear-gradient(135deg, #34d399 0%, #059669 100%)",
  ],
  moderate: [
    "linear-gradient(135deg, #f59e0b 0%, #d9466a 100%)",
    "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #7c3aed 100%)",
  ],
  long: [
    "linear-gradient(135deg, #7c3aed 0%, #d946a6 100%)",
    "linear-gradient(135deg, #6d28d9 0%, #4338ca 100%)",
    "linear-gradient(135deg, #d9466a 0%, #7c3aed 100%)",
  ],
};

/** First letters of up to two words, uppercased (e.g. "Ticket to Ride" → "TR"). */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "🎲";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function gameArtFallback(name: string, length?: string | null): GameArtFallback {
  const bucket: "short" | "moderate" | "long" =
    length === "short" || length === "long" ? length : "moderate";
  const ramps = LENGTH_RAMPS[bucket];
  const h = hash(name || "game");
  return { gradient: ramps[h % ramps.length], initials: initialsFor(name || ""), length: bucket };
}
