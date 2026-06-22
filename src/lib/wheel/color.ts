/**
 * Tiny hex color helper for wheel fill styles — derive lighter/darker
 * shades of a slice's base color for gradients, stripes, and dots.
 */

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Mix a hex color toward white (`amount` > 0) or black (`amount` < 0).
 * `amount` in [-1, 1]. Returns the input unchanged if it isn't hex.
 */
export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const [r, g, b] = rgb.map((c) => c + (target - c) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
