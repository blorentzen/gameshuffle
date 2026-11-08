/**
 * Order tracking rules (shop picks 2026-11-08): where an order is, the tracker's steps, what needs staff, and a
 * Printful v2 shipment read as one of our boxes. Run: npx tsx -r ./scripts/server-only-shim.cjs scripts/test-order-tracking.ts
 */
import { needsOf, stageOf, stepsFor, requestLine } from "../src/lib/store/orderStage";
import { boxFromPrintful } from "../src/lib/store/tracking";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// stage
ok(stageOf({ status: "paid", units: 2 }, []) === "making", "paid, no boxes = being made");
ok(stageOf({ status: "shipped", units: 2 }, []) === "shipped", "shipped by hand = shipped");
ok(stageOf({ status: "refunded", units: 2 }, []) === "closed", "refunded = closed");
ok(stageOf({ status: "canceled", units: 1 }, [{ status: "delivered", items: [] }]) === "closed", "canceled beats boxes");
ok(stageOf({ status: "shipped", units: 2 }, [{ status: "shipped", items: [{ sku: "a", quantity: 1 }] }]) === "shipped", "one of two shipped");
ok(stageOf({ status: "shipped", units: 2 }, [{ status: "delivered", items: [{ sku: "a", quantity: 1 }] }]) === "shipped", "half delivered, half not shipped = still shipped");
ok(stageOf({ status: "shipped", units: 2 }, [{ status: "delivered", items: [{ sku: "a", quantity: 1 }] }, { status: "delivered", items: [{ sku: "b", quantity: 1 }] }]) === "delivered", "both boxes delivered");
ok(stageOf({ status: "shipped", units: 3 }, [{ status: "delivered", items: [] }]) === "delivered", "a box without an item list counts as the whole order");
ok(stageOf({ status: "shipped", units: 1 }, [{ status: "canceled", items: [] }]) === "shipped", "a canceled box doesn't count");
ok(stageOf({ status: "shipped", units: 1 }, [{ status: "returned", items: [{ sku: "a", quantity: 1 }] }]) === "shipped", "came back = still shipped (needs staff)");

// steps
const d = { ordered: "Nov 4", made: "Nov 10", shipped: "Nov 10", shipBy: "Nov 12", arrives: "Nov 13 to 18", delivered: "Nov 15" };
const m = stepsFor("making", { merch: true }, d);
ok(m.map((s) => s.state).join() === "done,now,later,later" && m[1].label === "Being made" && m[2].date === "By Nov 12", "making steps");
ok(stepsFor("making", { merch: false }, d)[1].label === "Packing", "card packs say Packing");
const sh = stepsFor("shipped", { merch: true }, d);
ok(sh.map((s) => s.state).join() === "done,done,done,now" && sh[3].date === "Nov 13 to 18", "shipped steps");
ok(stepsFor("delivered", { merch: true }, d).every((s) => s.state === "done"), "delivered steps all done");

// requests
ok(requestLine({ kind: "problem", problem: "misprinted", wants: "replacement" }) === "Problem reported: misprinted, wants a replacement", "problem line");
ok(requestLine({ kind: "address" }) === "New address asked", "address line");

// needs
const base = { status: "paid" as const, livemode: true, merch: true, printfulStatus: "inprocess", printfulError: null, shipBy: "2026-11-12", today: "2026-11-08", shipByLabel: "Nov 12", lateEmailed: false };
ok(needsOf(base, [], []).length === 0, "on time, being made: nothing needed");
ok(needsOf({ ...base, today: "2026-11-13" }, [], []).some((n) => n.kind === "late" && !n.text.includes("buyer told")), "late after the ship-by day");
ok(needsOf({ ...base, today: "2026-11-13", lateEmailed: true }, [], [])[0].text.endsWith("buyer told"), "late says the buyer was told");
ok(needsOf({ ...base, printfulStatus: "draft" }, [], []).some((n) => n.kind === "printful" && n.tone === "amber"), "live draft waits for staff");
ok(!needsOf({ ...base, printfulStatus: "draft", livemode: false }, [], []).some((n) => n.kind === "printful"), "test draft needs nothing");
ok(needsOf({ ...base, printfulStatus: "failed", printfulError: "Bad file" }, [], [])[0].text === "Printful didn't take it: Bad file", "failed at Printful");
ok(needsOf({ ...base, printfulStatus: "onhold" }, [], [])[0].tone === "amber", "on hold");
const reqs = [{ kind: "problem" as const, status: "open" as const, problem: "damaged", wants: "refund" }, { kind: "question" as const, status: "waiting" as const }, { kind: "address" as const, status: "resolved" as const }];
const rn = needsOf({ ...base, status: "shipped", printfulStatus: "fulfilled" }, reqs, []);
ok(rn.length === 1 && rn[0].tone === "red" && rn[0].text.includes("damaged"), "only open requests need staff");
ok(needsOf({ ...base, status: "shipped", printfulStatus: "fulfilled" }, [], [{ status: "returned", estimateTo: null }])[0].kind === "returned", "a box came back");
ok(needsOf({ ...base, status: "shipped", printfulStatus: "fulfilled", today: "2026-11-20" }, [], [{ status: "shipped", estimateTo: "2026-11-16", estimateLabel: "Nov 16" }])[0].kind === "undelivered", "not delivered 4 days after the window");
ok(needsOf({ ...base, status: "shipped", printfulStatus: "fulfilled", today: "2026-11-19" }, [], [{ status: "shipped", estimateTo: "2026-11-16" }]).length === 0, "3 days after the window: still fine");
ok(needsOf({ ...base, status: "shipped", printfulStatus: "fulfilled", today: "2026-11-30" }, [], [{ status: "delivered", estimateTo: "2026-11-16" }]).length === 0, "delivered needs nothing");

// a Printful v2 shipment as a box
const skus = ["m-12", "m-1"].sort((a, b) => b.length - a.length);
const pf = (x: Record<string, unknown>) => ({ id: 9, order_id: 1, order_external_id: "gs-1", carrier: "USPS", service: "Ground", shipment_status: "shipped", shipped_at: "2026-11-10T18:00:00Z", delivery_status: "in_transit", delivered_at: null, tracking_number: "9400", tracking_url: "https://t", ...x });
const b1 = boxFromPrintful(pf({ tracking_events: [{ triggered_at: "2026-11-10T18:00:00Z", description: "Shipped" }, { triggered_at: "2026-11-11T09:00:00Z", description: "Arrived at facility" }], estimated_delivery: { from_date: "2026-11-13", to_date: "2026-11-15" }, shipment_items: [{ order_item_external_id: "m-12-player2-4", quantity: 1 }, { order_item_external_id: "m-1", quantity: 2 }] }) as never, skus)!;
ok(b1.status === "shipped" && b1.estimateFrom === "2026-11-13" && b1.estimateTo === "2026-11-15", "box: shipped with the window");
ok(b1.events![0].text === "Arrived at facility", "box: newest step first");
ok(JSON.stringify(b1.items) === JSON.stringify([{ sku: "m-12", quantity: 1 }, { sku: "m-1", quantity: 2 }]), `box: items mapped to our skus, picks included (${JSON.stringify(b1.items)})`);
ok(boxFromPrintful(pf({ delivery_status: "delivered", delivered_at: "2026-11-14T20:00:00Z" }) as never, skus)!.status === "delivered", "box: delivered");
ok(boxFromPrintful(pf({ shipment_status: "returned" }) as never, skus)!.status === "returned", "box: came back");
ok(boxFromPrintful(pf({ delivery_status: "return_to_sender" }) as never, skus)!.status === "returned", "box: return to sender = came back");
ok(boxFromPrintful(pf({ shipment_status: "packaged", shipped_at: null }) as never, skus) === null, "box: packaged, not shipped yet = no box");
ok(boxFromPrintful(pf({ shipment_status: "canceled" }) as never, skus)!.status === "canceled", "box: canceled");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
