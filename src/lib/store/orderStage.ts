/**
 * Where an order is, said the same way to the buyer and to staff (order tracking picks 2026-11-08), and what needs
 * staff. Pure and client-safe; the views in lookup.ts and manage.ts feed it.
 *
 *   stageOf    ordered → being made → shipped → delivered, or closed (refunded, canceled)
 *   stepsFor   the four steps with their dates, for the tracker on the order page, the staff page and the emails
 *   needsOf    what an order needs from staff: requests, Printful trouble, late, a box that came back, no delivery
 */

export type OrderStatus = "paid" | "shipped" | "refunded" | "canceled";
export type ShipmentStatus = "shipped" | "delivered" | "returned" | "canceled";
export type Stage = "making" | "shipped" | "delivered" | "closed";

export interface StageShipment { status: ShipmentStatus; items: { sku: string; quantity: number }[] }

/** Where it is. Paid merch is being made from the moment it's ordered (it's made when you order). */
export function stageOf(o: { status: OrderStatus; units: number }, shipments: StageShipment[]): Stage {
  if (o.status === "refunded" || o.status === "canceled") return "closed";
  const live = shipments.filter((s) => s.status !== "canceled");
  if (live.length) {
    const shippedUnits = live.reduce((n, s) => n + s.items.reduce((m, i) => m + i.quantity, 0), 0);
    // A box without an item list (Printful didn't say) counts as the whole order.
    const all = live.some((s) => !s.items.length) || shippedUnits >= o.units;
    if (all && live.every((s) => s.status === "delivered")) return "delivered";
    return "shipped";
  }
  return o.status === "shipped" ? "shipped" : "making";
}

/** The chip on an order: "Being made", "On the way"… */
export function stageLabel(stage: Stage, o: { status: OrderStatus; merch: boolean }): string {
  if (stage === "closed") return o.status === "refunded" ? "Refunded" : "Canceled";
  if (stage === "making") return o.merch ? "Being made" : "Getting it ready";
  return stage === "shipped" ? "On the way" : "Delivered";
}

export interface Step { label: string; date: string; state: "done" | "now" | "later" }

/** The tracker's four steps. Dates are labels the caller already formatted ("Nov 4", "By Nov 12", "Nov 13 to 18"). */
export function stepsFor(stage: Stage, o: { merch: boolean }, d: { ordered: string; made?: string | null; shipped?: string | null; shipBy: string; arrives: string; delivered?: string | null }): Step[] {
  const making = o.merch ? "Being made" : "Packing";
  const made = o.merch ? "Made" : "Packed";
  if (stage === "making") return [
    { label: "Ordered", date: d.ordered, state: "done" },
    { label: making, date: "Now", state: "now" },
    { label: "Shipped", date: `By ${d.shipBy}`, state: "later" },
    { label: "Delivered", date: d.arrives, state: "later" },
  ];
  if (stage === "shipped") return [
    { label: "Ordered", date: d.ordered, state: "done" },
    { label: made, date: d.made ?? "Done", state: "done" },
    { label: "Shipped", date: d.shipped ?? "Done", state: "done" },
    { label: "Delivered", date: d.arrives, state: "now" },
  ];
  return [
    { label: "Ordered", date: d.ordered, state: "done" },
    { label: made, date: d.made ?? "Done", state: "done" },
    { label: "Shipped", date: d.shipped ?? "Done", state: "done" },
    { label: "Delivered", date: d.delivered ?? "Done", state: "done" },
  ];
}

// ─── requests ───────────────────────────────────────────────────────────────

export type RequestKind = "problem" | "question" | "address";
export type RequestStatus = "open" | "waiting" | "resolved";
export type Problem = "misprinted" | "damaged" | "wrong" | "missing";
export type Wants = "replacement" | "refund";
export const PROBLEMS: { id: Problem; label: string }[] = [
  { id: "misprinted", label: "Misprinted" },
  { id: "damaged", label: "Damaged" },
  { id: "wrong", label: "Wrong item or size" },
  { id: "missing", label: "Missing" },
];
export const problemLabel = (p: string | null) => PROBLEMS.find((x) => x.id === p)?.label.toLowerCase() ?? "a problem";

/** How a request reads in a list: "Problem: misprinted, wants a replacement". */
export function requestLine(r: { kind: RequestKind; problem?: string | null; wants?: string | null }): string {
  if (r.kind === "problem") return `Problem reported: ${problemLabel(r.problem ?? null)}${r.wants ? `, wants a ${r.wants}` : ""}`;
  return r.kind === "address" ? "New address asked" : "Question from the buyer";
}

// ─── what needs staff ───────────────────────────────────────────────────────

export type NeedTone = "red" | "amber" | "blue";
export interface Need { kind: "request" | "printful" | "late" | "returned" | "undelivered"; text: string; tone: NeedTone }

/** Days after the end of the arrival window before a box that hasn't been delivered needs a look. */
export const UNDELIVERED_GRACE_DAYS = 3;

const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function needsOf(o: {
  status: OrderStatus; livemode: boolean; merch: boolean; printfulStatus: string | null; printfulError: string | null;
  /** YYYY-MM-DD, Pacific. */ shipBy: string; today: string; shipByLabel: string; lateEmailed: boolean;
}, requests: { kind: RequestKind; status: RequestStatus; problem?: string | null; wants?: string | null }[], shipments: { status: ShipmentStatus; estimateTo: string | null; estimateLabel?: string | null }[]): Need[] {
  const out: Need[] = [];
  for (const r of requests) {
    if (r.status !== "open") continue;
    out.push({ kind: "request", text: requestLine(r), tone: r.kind === "problem" ? "red" : r.kind === "address" ? "amber" : "blue" });
  }
  const open = o.status === "paid" || o.status === "shipped";
  if (open && o.merch && o.status === "paid") {
    const pf = o.printfulStatus;
    if (pf === "failed") out.push({ kind: "printful", text: `Printful didn't take it${o.printfulError ? `: ${o.printfulError}` : ""}`, tone: "red" });
    else if (pf === "onhold") out.push({ kind: "printful", text: `Printful hold${o.printfulError ? `: ${o.printfulError}` : ""}`, tone: "amber" });
    else if (pf === "canceled") out.push({ kind: "printful", text: "Canceled at Printful, still paid here", tone: "red" });
    else if (pf === "draft" && o.livemode) out.push({ kind: "printful", text: "Waiting for you to send it to Printful", tone: "amber" });
  }
  if (o.status === "paid" && o.today > o.shipBy) out.push({ kind: "late", text: `Late: was due to ship ${o.shipByLabel}${o.lateEmailed ? " · buyer told" : ""}`, tone: "amber" });
  for (const s of shipments) {
    if (s.status === "returned") out.push({ kind: "returned", text: "A box came back: check the address", tone: "blue" });
    else if (s.status === "shipped" && s.estimateTo && o.today > addDays(s.estimateTo, UNDELIVERED_GRACE_DAYS)) {
      out.push({ kind: "undelivered", text: `Not delivered yet: due by ${s.estimateLabel ?? s.estimateTo}`, tone: "amber" });
    }
  }
  return out;
}
