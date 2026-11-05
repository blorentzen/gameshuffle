/**
 * Merch rules against the Printful store as it was on 2026-11-03
 * (scripts/data/printful-fixture.json: 8 products). Run:
 *   npx tsx scripts/test-merch-rules.ts
 */

import fixture from "./data/printful-fixture.json";
import {
  collectionFor, DEFAULT_HIDDEN_COLORS, deliveryDays, designOf, factsFromDescription, groupKeyFor, isMerchSku, itemFor, itemRank, keepCents,
  listingNameFor, merchSku, sizeRank, orderColors, phoneGroup, pictureView, priceForOption, seriesCollection, seriesOf, shelfSections, slugify,
} from "../src/lib/store/merch";

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
}

// Grouping: 8 Printful products → 4 shop products (pick 1, pick 2).
const groups = new Map<string, string[]>();
for (const p of fixture) groups.set(groupKeyFor(p.name, p.catalogType), [...(groups.get(groupKeyFor(p.name, p.catalogType)) ?? []), p.name.trim()]);
check("four listings", groups.size, 4);
check("tee key", groupKeyFor(" GS Colored Monogram - Unisex Tee", "T-SHIRT"), "monogram:tee");
check("white tee joins it", groupKeyFor("GS White Monogram - Unisex Tee", "T-SHIRT"), "monogram:tee");
check("hoodies merge", groupKeyFor("GS Black Monogram - Unisex Full Zip Hoodie", "DTFILM"), groupKeyFor("GS White Monogram - Unisex Full Zip Hoodie", "DTFILM"));
check("beanies merge", groupKeyFor("GS Colored Monogram - Embroidered Beanie", "EMBROIDERY"), "monogram:beanie");
check("phone cases merge", groupKeyFor("GS Icon Shuffle - Tough case for Samsung®", "PHONE-CASE"), groupKeyFor("GS Icon Shuffle - MagSafe® tough case for iPhone®", "PHONE-CASE"));

// Names (pick 3).
check("tee name", listingNameFor(" GS Colored Monogram - Unisex Tee", "T-SHIRT"), "Monogram Tee");
check("hoodie name", listingNameFor("GS White Monogram - Unisex Full Zip Hoodie", "DTFILM"), "Monogram Full-Zip Hoodie");
check("beanie name", listingNameFor("GS White Monogram - Embroidered Beanie", "EMBROIDERY"), "Monogram Beanie");
check("case name", listingNameFor("GS Icon Shuffle - MagSafe® tough case for iPhone®", "PHONE-CASE"), "Icon Shuffle Phone Case");
check("slug", slugify("Monogram Full-Zip Hoodie"), "monogram-full-zip-hoodie");

// Starting collections.
check("GS designs start in GameShuffle", collectionFor("GS White Monogram - Unisex Tee"), "gameshuffle");
check("wordmark too", collectionFor("GameShuffle Wordmark - Bubble-free stickers"), "gameshuffle");
check("kart", collectionFor("Eat. Sleep. Kart. - Colored Version - Unisex t-shirt"), "kart-culture");
check("rip is cards", collectionFor("Eat. Sleep. Rip. - Colored Version - Unisex t-shirt"), "card-collectors");
check("game night", collectionFor("Eat. Sleep. Game. - Colored Version - Unisex t-shirt"), "game-night");
check("scalper", collectionFor("Scalper, No Scalping - Unisex t-shirt"), "card-collectors");
check("anything else", collectionFor("Eat. Sleep. Fight - Colored Version - Unisex t-shirt"), "one-liners");

// Series: designs that share every sentence but the last sit together.
check("series from a three-part design", seriesOf("Eat. Sleep. Kart. - Colored Version - Unisex t-shirt"), "Eat. Sleep.");
check("series without the last period", seriesOf("Eat. Sleep. Fight - Colored Version - Unisex t-shirt"), "Eat. Sleep.");
check("two parts isn't a series", seriesOf("Eat. Sleep. - Unisex t-shirt"), null);
check("brand designs aren't a series", seriesOf("GS White Monogram - Unisex Tee"), null);
check("a series takes the first collection in shelf order", seriesCollection(["one-liners", "game-night", "kart-culture", "card-collectors"]), "kart-culture");
const shelf = shelfSections([
  { id: "tee", collection: "gameshuffle", series: null },
  { id: "kart", collection: "kart-culture", series: "Eat. Sleep." },
  { id: "game", collection: "kart-culture", series: "Eat. Sleep." },
  { id: "lone", collection: "one-liners", series: "Trust the." },
]);
check("sections: GameShuffle, the series, then One-liners", shelf.map((s) => s.name), ["GameShuffle", "Eat. Sleep.", "One-liners"]);
check("the series holds both tees", shelf[1].listings.map((l) => l.id), ["kart", "game"]);
check("a series of one stays in its collection", shelf[2].listings.map((l) => l.id), ["lone"]);
check("an emptied collection has no section", shelf.some((s) => s.id === "kart-culture"), false);

// Items and option labels.
check("tee item", itemFor("GS White Monogram - Unisex Tee", "T-SHIRT"), { type: "Tees", noun: "Tee", optionLabel: "Size" });
check("beanie item", itemFor("GS White Monogram - Embroidered Beanie", "EMBROIDERY"), { type: "Hats", noun: "Beanie", optionLabel: "" });
check("case item", itemFor("GS Icon Shuffle - Tough case for Samsung®", "PHONE-CASE"), { type: "Phone cases", noun: "Phone Case", optionLabel: "Phone" });
check("mug item", itemFor("GS Trust the Shuffle - White glossy mug", "MUG"), { type: "Drinkware", noun: "Mug", optionLabel: "Size" });
check("bottle filed as a mug by Printful", itemFor("GS Icon Shuffle - Stainless steel water bottle with a straw lid", "MUG"), { type: "Drinkware", noun: "Water Bottle", optionLabel: "Size" });
check("drawstring bag", itemFor("GS Icon Shuffle - Drawstring bag", "BAG"), { type: "Bags", noun: "Drawstring Bag", optionLabel: "" });
check("three-part name", listingNameFor("Eat. Sleep. Kart. - Colored Version - Unisex t-shirt", "T-SHIRT"), "Eat. Sleep. Kart. Tee");
check("versions merge", groupKeyFor("Eat. Sleep. Kart. - White Version - Unisex t-shirt", "T-SHIRT"), groupKeyFor("Eat. Sleep. Kart. - Colored Version - Unisex t-shirt", "T-SHIRT"));
check("pullover vs full zip stay apart", groupKeyFor("GS White Monogram - Unisex Hoodie", "HOODIE") !== groupKeyFor("GS White Monogram - Unisex Full Zip Hoodie", "DTFILM"), true);
check("sticker sheet", itemFor("GS Reactions - Kiss-cut sticker sheet", "STICKER"), { type: "Stickers", noun: "Sticker Sheet", optionLabel: "Size" });
check("cap", itemFor("GS Monogram - Dad hat", "EMBROIDERY"), { type: "Hats", noun: "Dad Hat", optionLabel: "" });
// Women's, kids' and hat cuts stay out of each other's listings (the November drop's blanks).
check("relaxed tee", itemFor("Don't tell chat. - Women's Relaxed T-Shirt", null), { type: "Tees", noun: "Relaxed Tee", optionLabel: "Size" });
check("crop top", itemFor("Run it back. - Women's Crop Top", null).noun, "Crop Top");
check("cropped hoodie", itemFor("Sore winner. - Women's Cropped Hoodie", null), { type: "Hoodies", noun: "Cropped Hoodie", optionLabel: "Size" });
check("racerback", itemFor("Clip that. - Women's Cropped Racerback Tank", null).noun, "Racerback Tank");
check("youth tee", itemFor("Run it back. White - Youth Staple Tee", null), { type: "Kids and baby", noun: "Youth Tee", optionLabel: "Size" });
check("youth long sleeve", itemFor("Screen time left: 0:00 - Youth Long Sleeve Tee", null).noun, "Youth Long Sleeve Tee");
check("youth hoodie", itemFor("One more level. - Youth Heavy Blend Hoodie", null).noun, "Youth Hoodie");
check("toddler tee", itemFor("Rage quits. - Toddler Jersey T-Shirt", null).noun, "Toddler Tee");
check("toddler hoodie", itemFor("Final boss: bedtime. - Toddler Pullover Fleece Hoodie", null).noun, "Toddler Hoodie");
check("baby one piece", itemFor("Getting carried. - Baby Short Sleeve One Piece", null), { type: "Kids and baby", noun: "Baby Bodysuit", optionLabel: "Size" });
check("baby tee", itemFor("Auto-saving. - Baby Jersey T-Shirt", null).noun, "Baby Tee");
check("kids sweatshirt", itemFor("Social battery 100% - Kids Crew Neck Sweatshirt", null).noun, "Kids Sweatshirt");
check("coloring book", itemFor("GameShuffle Coloring Book - Coloring Book", null), { type: "Kids and baby", noun: "Coloring Book", optionLabel: "" });
check("puzzle", itemFor("Patchwork Puzzle - Jigsaw Puzzle", null), { type: "Home", noun: "Puzzle", optionLabel: "" });
check("blanket", itemFor("Patchwork Blanket - Sublimated Sherpa Blanket", null).type, "Home");
check("snapback", itemFor("GS Monogram - Classic Snapback", null).noun, "Snapback");
check("trucker", itemFor("Clip that. - Snapback Trucker Cap", null).noun, "Trucker Hat");
check("retro trucker", itemFor("Chat made me do it. - Retro Trucker Hat", null).noun, "Trucker Hat");
check("flat bill", itemFor("Skill issue. - Flat Bill Cap", null).noun, "Flat Bill Cap");
check("fisherman beanie", itemFor("GS Monogram - Fisherman Beanie", null).noun, "Fisherman Beanie");
check("cuffed beanie stays a beanie", itemFor("lurking. - Cuffed Beanie", null).noun, "Beanie");
check("adult and youth tees stay apart", groupKeyFor("Run it back. White - Unisex Staple T-Shirt", null) !== groupKeyFor("Run it back. White - Youth Staple Tee", null), true);
check("ink versions merge", groupKeyFor("Run it back. - Unisex Staple T-Shirt", null), groupKeyFor("Run it back. White - Unisex Staple T-Shirt", null));
const bySize = (xs: string[]) => [...xs].sort((a, b) => sizeRank(a) - sizeRank(b));
check("adult sizes", bySize(["2XL", "3XL", "L", "M", "S", "XL", "XS", "5XL", "4XL"]), ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]);
check("toddler sizes", bySize(["5T", "2T", "4T", "3T"]), ["2T", "3T", "4T", "5T"]);
check("kids sizes", bySize(["7", "5/6", "2T", "4T", "3T"]), ["2T", "3T", "4T", "5/6", "7"]);
check("baby sizes", bySize(["12-18m", "3-6m", "18-24m", "6-12m"]), ["3-6m", "6-12m", "12-18m", "18-24m"]);
check("baby bodysuit sizes", bySize(["24M", "NB", "12M", "6M", "18M"]), ["NB", "6M", "12M", "18M", "24M"]);
check("measured sizes", bySize(["15 oz", "11 oz"]), ["11 oz", "15 oz"]);
check("desk mat sizes merge", groupKeyFor("Seeded last. Finished first. - Desk Mat (12″×18″)", null), groupKeyFor("Seeded last. Finished first. - Desk Mat (16″×32″)", null));
check("unknown item", itemFor("GS Monogram - Enamel pin", null).type, "Other");
check("shelf order: tees, hoodies, hats … bags", ["Bags", "Stickers", "Hats", "Tees", "Hoodies"].sort((a, b) => itemRank(a) - itemRank(b)), ["Tees", "Hoodies", "Hats", "Stickers", "Bags"]);
check("an unknown item goes last", itemRank("Socks") > itemRank("Other"), true);

// Design words.
check("design drops GS and logo color", designOf("GS White Monogram - Unisex Tee"), "Monogram");
check("design two words", designOf("GS Icon Shuffle - MagSafe® tough case for iPhone®"), "Icon Shuffle");
check("design no dash", designOf("Eat Sleep Kart"), "Eat Sleep Kart");

// Prices (pick 8): the highest per size across colors.
const teeRows = fixture.filter((p) => p.name.includes("Unisex Tee")).flatMap((p) => p.variants);
const by = new Map<string, number[]>();
for (const v of teeRows) by.set(v.size!, [...(by.get(v.size!) ?? []), Math.round(Number(v.retail) * 100)]);
check("3XL charges the white logo's price", priceForOption(by.get("3XL")!), 2299);
check("5XL charges the white logo's price", priceForOption(by.get("5XL")!), 2699);
check("M is one price", new Set(by.get("M")).size, 1);

// Keep per order (the picks page's numbers).
check("tee keeps", keepCents(1999, 1192, 495), 709);
check("hoodie keeps (ships free)", keepCents(5999, 4202, 879), 714);
check("beanie keeps", keepCents(1999, 1434, 469), 493);
check("beanie at $24.99", keepCents(2499, 1434, 469), 978);
check("hoodie at $64.99", keepCents(6499, 4202, 879), 1200);

// Colors: Black and White lead, then Printful's order; look-alikes hidden by default.
const order = orderColors(teeRows.map((v, i) => ({ color: v.color, order: i })));
check("colors start Black, White", order.slice(0, 2), ["Black", "White"]);
check("all 13 tee colors", order.length, 13);
check("five look-alikes exist on the tee", DEFAULT_HIDDEN_COLORS.filter((c) => order.includes(c)).length, 5);

// Pictures: the Solid White Blend one is the back view.
const swb = teeRows.find((v) => v.color === "Solid White Blend");
check("back view found", pictureView(swb?.preview), "back");
check("front view", pictureView("unisex-staple-t-shirt-white-front-6aea40f67480e.jpg"), "front");
check("no view", pictureView(null), null);

// Phones.
check("iPhone group", phoneGroup("iPhone 17 Pro Max"), "iPhone");
check("Samsung group", phoneGroup("Samsung Galaxy S25 Ultra"), "Samsung");

// Delivery estimate from Printful's rate name.
const nov3 = new Date("2026-11-03T20:00:00Z");
check("delivery 6 to 7 days", deliveryDays("Flat Rate (Estimated delivery: Nov 9⁠–10) ", nov3), { min: 6, max: 7 });
check("delivery across months", deliveryDays("Flat Rate (Estimated delivery: Nov 28–Dec 2)", nov3), { min: 25, max: 29 });
check("delivery across the year", deliveryDays("Flat Rate (Estimated delivery: Dec 30–Jan 3)", new Date("2026-12-24T20:00:00Z")), { min: 6, max: 10 });
check("delivery unknown wording", deliveryDays("Flat Rate", nov3), null);

// Printful's bullets.
check("facts", factsFromDescription("A tee. • 100% cotton • Pre-shrunk • Blank product sourced from Nicaragua Disclaimer: thin"), ["100% cotton", "Pre-shrunk"]);

// SKUs.
check("sku", merchSku(5616647401), "m-5616647401");
check("sku shape fits shop_products", /^[a-z0-9-]{2,40}$/.test(merchSku(5616647401)), true);
check("merch sku", isMerchSku("m-5616647401"), true);
check("pack sku", isMerchSku("thirty-set"), false);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
