/**
 * Pure tests for the shop (src/lib/store/{config,rules}.ts) and a sanity check
 * of src/data/store/shop-seed.json against the database constraints.
 * Run: npx tsx scripts/test-store-rules.ts
 */
import assert from "node:assert/strict";
import { SHOP, isOnSale, stripeLookupKey, stripeProductId } from "../src/lib/store/config";
import { holidayState, missesChristmas, orderCode, postageCents, shipMethodFor, shipWeightOz } from "../src/lib/store/rules";
import { shopDate } from "../src/lib/store/copy";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`ok  ${name}`); };

test("the seed fits the table constraints", () => {
  const skus = new Set<string>();
  for (const p of SHOP.products) {
    assert.match(p.sku, /^[a-z0-9-]{2,40}$/, p.sku);
    assert.ok(!skus.has(p.sku), `duplicate ${p.sku}`);
    skus.add(p.sku);
    assert.ok(p.kind === "bundle" || p.kind === "single", p.sku);
    assert.ok(p.name.length >= 1 && p.name.length <= 80, p.sku);
    assert.ok(Number.isInteger(p.price_cents) && p.price_cents >= 0, p.sku);
    assert.ok(p.max_per_order >= 1 && p.max_per_order <= 20, p.sku);
    assert.ok(p.ship_weight_oz > 0, p.sku);
    assert.ok(p.category.length >= 1 && p.category.length <= 30, p.sku);
    assert.ok(Array.isArray(p.contents) && p.contents.length > 0, p.sku);
    assert.ok(stripeProductId(p.sku).length <= 64 && stripeLookupKey(p.sku).length <= 200);
  }
  assert.ok(SHOP.products.some((p) => p.kind === "single"), "singles exist for add-ons");
});

test("ship method follows the table: 1 single letter, 2 to 4 flat, 5+ or any bundle parcel", () => {
  assert.equal(shipMethodFor([{ sku: "spark-spook-1", quantity: 1 }]), "letter");
  assert.equal(shipMethodFor([{ sku: "spark-spook-1", quantity: 1 }, { sku: "thirty-hunt-1", quantity: 1 }]), "flat");
  assert.equal(shipMethodFor([{ sku: "thirty-hunt-1", quantity: 4 }]), "flat");
  assert.equal(shipMethodFor([{ sku: "thirty-hunt-1", quantity: 4 }, { sku: "spark-spook-1", quantity: 1 }]), "parcel");
  assert.equal(shipMethodFor([{ sku: "ready-deck", quantity: 1 }]), "parcel");
  assert.equal(shipMethodFor([{ sku: "ready-deck", quantity: 1 }, { sku: "spark-spook-1", quantity: 1 }]), "parcel");
  assert.equal(shipMethodFor([{ sku: "ready-deck", quantity: 0 }, { sku: "spark-spook-1", quantity: 1 }]), "letter", "zero-quantity lines don't count");
});

test("weight adds the method's packaging", () => {
  assert.equal(shipWeightOz([{ sku: "thirty-hunt-1", quantity: 1 }], "letter"), 1.8);
  assert.equal(shipWeightOz([{ sku: "thirty-hunt-1", quantity: 4 }], "flat"), 5.9);
  assert.equal(shipWeightOz([{ sku: "set-builder-100", quantity: 1 }], "parcel"), 8.5);
});

test("stamps from the config; parcels have none", () => {
  assert.equal(postageCents("letter", 1.8), 82 + 29 + 49);
  assert.equal(postageCents("letter", 1), 82 + 49);
  assert.equal(postageCents("flat", 5.9), 169 + 5 * 29);
  assert.equal(postageCents("parcel", 8.5), null);
});

test("on sale = active and before its end date", () => {
  const now = new Date("2026-11-10T12:00:00-08:00");
  assert.equal(isOnSale({ active: true }, now), true);
  assert.equal(isOnSale({ active: false }, now), false);
  assert.equal(isOnSale({ active: true, inactive_after: "2026-10-25T23:59:59-07:00" }, now), false);
  assert.equal(isOnSale({ active: true, inactive_after: "2026-12-31T23:59:59-08:00" }, now), true);
  assert.equal(orderCode(1047), "GS-1047");
});

test("Christmas banner and cutoffs come from the config, Pacific time", () => {
  assert.equal(holidayState(new Date("2026-11-30T23:00:00-08:00")), "none");
  assert.equal(holidayState(new Date("2026-12-01T00:00:00-08:00")), "before_cutoff");
  assert.equal(holidayState(new Date("2026-12-13T23:59:00-08:00")), "before_cutoff");
  assert.equal(holidayState(new Date("2026-12-14T00:01:00-08:00")), "after_cutoff");
  assert.equal(holidayState(new Date("2026-12-26T00:00:00-08:00")), "none");
  const dec13noon = new Date("2026-12-13T12:00:00-08:00");
  assert.equal(missesChristmas("WA", dec13noon), false);
  assert.equal(missesChristmas("HI", dec13noon), true, "Alaska and Hawaii cut off a day earlier");
  assert.equal(missesChristmas("AK", new Date("2026-12-12T23:00:00-08:00")), false);
  assert.equal(shopDate("2026-12-13T23:59:59-08:00", { weekday: true }), "Sunday, Dec 13");
  assert.equal(shopDate("2026-12-12T23:59:59-08:00", { weekday: true }), "Saturday, Dec 12");
});

console.log(`\n${passed} passed`);
