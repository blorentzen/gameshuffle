/**
 * Color families for the shop's Color filter (shop picks 2026-11-08, all as recommended): Printful's ~90 shade names
 * (Athletic Heather, Heather Midnight Navy…) sort into 11 families a shopper picks from, each shown as a swatch with
 * its name. The name decides (a two-tone like "Navy/ White" goes by its first color); a name with no color word goes
 * by its hex. Pure and client-safe.
 */

export const COLOR_FAMILIES = [
  { id: "black", name: "Black" },
  { id: "grey", name: "Grey" },
  { id: "white", name: "White" },
  { id: "cream", name: "Cream and tan" },
  { id: "brown", name: "Brown" },
  { id: "red", name: "Red" },
  { id: "pink", name: "Pink" },
  { id: "purple", name: "Purple" },
  { id: "blue", name: "Blue" },
  { id: "green", name: "Green" },
  { id: "yellow", name: "Yellow" },
] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number]["id"];

export const familyName = (id: string) => COLOR_FAMILIES.find((f) => f.id === id)?.name ?? id;
export const isFamily = (id: string): id is ColorFamily => COLOR_FAMILIES.some((f) => f.id === id);

/** Color words, checked in this order: "Heather Midnight Navy" is blue before it's a heather, "Cranberry" red not pink. */
const WORDS: [ColorFamily, RegExp][] = [
  ["blue", /\b(navy|royal|blue|indigo|aqua|turquoise|teal|lagoon|petrol|denim|cobalt|sky)\b/],
  ["green", /\b(green|forest|kelly|military|sage|spruce|cypress|evergreen|loden|mineral|olive|mint|moss)\b/],
  ["pink", /\b(pink|bubblegum|orchid|mauve|berry|rose|blush|coral)\b/],
  ["purple", /\b(purple|violet|lilac|lavender|plum)\b/],
  ["red", /\b(red|maroon|cardinal|cranberry|rust|clay|burgundy|wine|brick|scarlet)\b/],
  ["brown", /\b(brown|walnut|chocolate|espresso|coffee|mocha)\b/],
  ["yellow", /\b(yellow|gold|mustard|lemon|orange)\b/],
  ["black", /\bblack\b/],
  ["white", /\b(white|matte|ash)\b/],
  ["cream", /\b(natural|ecru|bone|oatmeal|dust|khaki|tan|stone|sand|cream|ivory|beige)\b/],
  ["grey", /\b(grey|gray|charcoal|asphalt|storm|heather|slate|smoke|silver|carbon|graphite)\b/],
];

/** A shade's family: by its name, else by its hex, else grey. */
export function familyOf(name: string, hex?: string | null): ColorFamily {
  const first = name.split("/")[0].toLowerCase().trim();
  for (const [family, re] of WORDS) if (re.test(first)) return family;
  return hex ? familyOfHex(hex) : "grey";
}

function familyOfHex(hex: string): ColorFamily {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "grey";
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l < 0.13) return "black";
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12) return l > 0.9 ? "white" : "grey";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return l > 0.75 ? "pink" : "red";
  if (h < 45) return l > 0.75 ? "cream" : l < 0.35 ? "brown" : "yellow";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 260) return "blue";
  if (h < 300) return "purple";
  return "pink";
}
