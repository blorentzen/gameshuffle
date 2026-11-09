/**
 * The shop shelf's rules (shop picks 2026-11-08): color families, old ?color= links, the family filter, sections by
 * item and card names without the item word. Run: npx tsx scripts/test-merch-shelf.ts
 */

import { COLOR_FAMILIES, familyOf } from "../src/lib/store/merchColors";
import { applyFilter, cardName, filterChoices, readFilter, shelfSections, NO_FILTER } from "../src/lib/store/merchFilters";
import type { MerchListing } from "../src/lib/store/merchCatalog";

let fails = 0, checks = 0;
const eq = (got: unknown, want: unknown, what: string) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.error(`✗ ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// Every shade name the live shop used on 2026-11-08, with the family a shopper would look under.
const SHADES: [string, string, string][] = [
  ["Black", "#0c0c0c", "black"], ["Vintage Black", "#43413D", "black"], ["Solid Black Blend", "#090909", "black"], ["Black / White", "#101010", "black"], ["Black/ Red", "#25292e", "black"],
  ["White", "#FFFFFF", "white"], ["Ash", "#f0f1ea", "white"], ["Matte", "#ffffff", "white"],
  ["Athletic Heather", "#e1dad7", "grey"], ["Dark Grey Heather", "#3E3C3D", "grey"], ["Charcoal Heather", "#463e3d", "grey"], ["Asphalt", "#716b63", "grey"], ["Heather", "#e5e5e5", "grey"],
  ["Storm", "#746e72", "grey"], ["Dark Grey", "#39353a", "grey"], ["Heather Slate", "#4C626E", "grey"], ["Sport Grey", "#cacacd", "grey"], ["Charcoal/Black", "#616161", "grey"], ["Carbon Grey", "#c7c3be", "grey"],
  ["Heather Dust", "#e5d9c9", "cream"], ["Natural", "#fffaed", "cream"], ["Bone", "#f5e8ce", "cream"], ["Tan", "#f0d8bc", "cream"], ["Khaki", "#e3c7b1", "cream"], ["Heather Stone", "#c6b7a7", "cream"],
  ["Oatmeal Heather", "#fbf2e1", "cream"], ["Ecru", "#fff2d9", "cream"], ["Organic Natural", "#f1dfcc", "cream"], ["Natural Heather", "#fff7e6", "cream"],
  ["Brown", "#322622", "brown"], ["Walnut", "#59392b", "brown"],
  ["Maroon", "#7d263a", "red"], ["Red", "#f0120e", "red"], ["Heather Clay", "#994836", "red"], ["Cardinal", "#9E1510", "red"], ["Cranberry", "#a3001b", "red"], ["Rust", "#bf4015", "red"], ["Team Red", "#FF2D41", "red"],
  ["Pink", "#ffd6df", "pink"], ["Berry", "#c02773", "pink"], ["Heather Mauve", "#b97b7e", "pink"], ["Bubblegum", "#ffc5d4", "pink"], ["Orchid", "#fff2f4", "pink"], ["Hot Pink", "#fe607a", "pink"],
  ["Team Purple", "#230f46", "purple"], ["Light Violet", "#e1c4cf", "purple"], ["Purple", "#623a7a", "purple"], ["Heather Prism Lilac", "#deafcd", "purple"],
  ["Navy", "#24365d", "blue"], ["Heather Midnight Navy", "#302d4b", "blue"], ["True Royal", "#05499b", "blue"], ["Heather Columbia Blue", "#7D95E8", "blue"], ["Heather Deep Teal", "#4a7486", "blue"],
  ["Navy Blazer", "#1a1c31", "blue"], ["Royal", "#2d4571", "blue"], ["Heather Ice Blue", "#e8fdff", "blue"], ["Turquoise", "#54d9eb", "blue"], ["Navy/ White", "#24303b", "blue"], ["Heather Blue Lagoon", "#8eb9bd", "blue"],
  ["Forest", "#223e25", "green"], ["Military Green", "#6a6c54", "green"], ["Kelly", "#1a9462", "green"], ["Forest Green", "#335231", "green"], ["Spruce", "#183e41", "green"], ["Sage", "#aab89a", "green"],
  ["Mineral", "#8fa7a6", "green"], ["Cypress", "#455237", "green"], ["Evergreen", "#385e3d", "green"], ["Loden", "#8e845e", "green"], ["Dark green", "#2c4632", "green"],
  ["Yellow", "#ffea75", "yellow"], ["Gold", "#ff9900", "yellow"],
];
for (const [name, hex, want] of SHADES) eq(familyOf(name, hex), want, `family of ${name}`);
// A name with no color word goes by its hex.
eq(familyOf("Midnight", "#101418"), "black", "hex: near black");
eq(familyOf("Fog", "#bfbfbf"), "grey", "hex: grey");
eq(familyOf("Meadow", "#3f8f3f"), "green", "hex: green");
eq(familyOf("Lagoon Splash", "#1e7fb8"), "blue", "name word: lagoon");
eq(familyOf("Wave", "#2a6fd6"), "blue", "hex: blue");
eq(familyOf("Mystery", null), "grey", "no word, no hex");

const listing = (o: Partial<MerchListing> & { id: string; name: string; itemType: string; noun: string | null; colors?: MerchListing["colors"] }): MerchListing => ({
  slug: o.id, collection: "one-liners", series: null, description: null, facts: [], photos: [], optionLabel: "Size", sizeGuide: null,
  deliveryMin: null, deliveryMax: null, sortOrder: 0, live: true, options: ["S", "M"], variants: [], fromCents: 2799, priceVaries: false, colors: [], ...o,
});
const L = [
  listing({ id: "a", name: "Run it back. Tee", itemType: "Tees", noun: "tee", colors: [{ name: "Black", hex: "#000000", image: null }, { name: "Navy", hex: "#24365d", image: null }] }),
  listing({ id: "b", name: "Run it back. Crop Top", itemType: "Tees", noun: "crop-top", colors: [{ name: "Heather Midnight Navy", hex: "#302d4b", image: null }] }),
  listing({ id: "c", name: "Chat made me do it. Trucker Hat", itemType: "Hats", noun: "trucker-hat", colors: [{ name: "Forest", hex: "#223e25", image: null }] }),
  listing({ id: "d", name: "Monogram Full-Zip Hoodie", itemType: "Hoodies", noun: "full-zip-hoodie", colors: [{ name: "Black", hex: "#000000", image: null }] }),
  listing({ id: "e", name: "Monogram Hoodie", itemType: "Hoodies", noun: "hoodie" }),
  listing({ id: "f", name: "Patchwork Blanket", itemType: "Home", noun: "blanket" }),
  listing({ id: "g", name: "Renamed in Platform", itemType: "Tees", noun: "tee" }),
  listing({ id: "h", name: "Tee", itemType: "Tees", noun: "tee" }),
  listing({ id: "i", name: "Technically correct. Mug", itemType: "Drinkware", noun: "mug" }),
];

// Card names under a section heading.
eq(cardName(L[0]), { design: "Run it back.", item: "Tee", style: null }, "plain tee");
eq(cardName(L[1]), { design: "Run it back.", item: "Crop Top", style: "Crop top" }, "crop top says its style");
eq(cardName(L[2]), { design: "Chat made me do it.", item: "Trucker Hat", style: "Trucker hat" }, "hats always say which");
eq(cardName(L[3]), { design: "Monogram", item: "Full-Zip Hoodie", style: "Full-zip hoodie" }, "hyphenated item");
eq(cardName(L[4]), { design: "Monogram", item: "Hoodie", style: null }, "plain hoodie");
eq(cardName(L[5]), { design: "Patchwork", item: "Blanket", style: "Blanket" }, "home items say what they are");
eq(cardName(L[6]), { design: "Renamed in Platform", item: null, style: null }, "a renamed listing stays whole");
eq(cardName(L[7]), { design: "Tee", item: null, style: null }, "nothing but the item stays whole");
eq(cardName(L[8]), { design: "Technically correct.", item: "Mug", style: null }, "mugs are drinkware's plain item");
eq(cardName({ name: "Old listing", noun: null, itemType: "Tees" }), { design: "Old listing", item: null, style: null }, "no key, whole name");

// Sections in the shop's item order, empty ones left out.
eq(shelfSections(L).map((s) => [s.type, s.items.length]), [["Tees", 4], ["Hoodies", 2], ["Hats", 1], ["Drinkware", 1], ["Home", 1]], "sections");

// Color families as filter choices, and links.
const choices = filterChoices(L);
eq(choices.colors.map((c) => [c.id, c.count]), [["black", 2], ["blue", 2], ["green", 1]], "families in family order, products counted once");
eq(choices.colors.find((c) => c.id === "blue")!.swatch.length, 2, "swatch from the family's shades");
eq(COLOR_FAMILIES.length, 11, "eleven families");
eq(readFilter(new URLSearchParams("color=blue"), choices).color, "blue", "family link");
eq(readFilter(new URLSearchParams("color=Navy"), choices).color, "blue", "an older shade link reads as its family");
eq(readFilter(new URLSearchParams("color=pink"), choices).color, null, "a family nothing comes in is dropped");
eq(applyFilter(L, { ...NO_FILTER, color: "blue" }).map((l) => l.id), ["a", "b"], "blue finds Navy and Heather Midnight Navy");
eq(applyFilter(L, { ...NO_FILTER, color: "green", type: "Hats" }).map((l) => l.id), ["c"], "family with a category");

console.log(fails ? `${fails} of ${checks} checks failed` : `All ${checks} checks passed`);
process.exit(fails ? 1 : 0);
