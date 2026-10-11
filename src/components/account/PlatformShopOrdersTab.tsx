"use client";

/**
 * Platform admin ▸ Shop ▸ Orders and Products (staff): run the GameShuffle Shop.
 *   Orders    to ship (oldest first) / shipped / refunded and canceled / all,
 *             search by order number, email or name. An order opens with the
 *             full address, items, totals and timeline: mark shipped (the
 *             buyer gets the tracking email), fix tracking, refund (optionally
 *             back in stock), restock, notes, resend the confirmation.
 *   Products  the catalog: add, edit (a price change makes a new Stripe price),
 *             stock, on/off, archive and restore. Changes go to Stripe too.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Checkbox, Input, Modal, Select, StatCard, Switch, Textarea, Timeline,
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { formatPrice } from "@/lib/store/copy";
import type { AdminOrderDetail, AdminOrderRow, AdminRefundQuote, OrderFilter, OrdersSummary, RefundReason } from "@/lib/store/manage";
import { refundCents } from "@/lib/store/rules";
import { AdminHeader, AdminRowMenu, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { IconCash, IconPackage, IconPlus, IconReceipt, IconReceiptRefund, IconRefresh } from "@tabler/icons-react";
import type { AdminProduct, ProductInput } from "@/lib/store/catalog";

const STATUS: Record<AdminOrderRow["status"], { label: string; variant: "warning" | "success" | "default" | "info" }> = {
  paid: { label: "To ship", variant: "warning" },
  shipped: { label: "Shipped", variant: "success" },
  refunded: { label: "Refunded", variant: "default" },
  canceled: { label: "Canceled", variant: "default" },
};
const ERRORS: Record<string, string> = {
  bad_tracking: "That doesn't look like a tracking number.", not_shippable: "Only unshipped orders can be marked shipped.",
  not_refundable: "This order can't be refunded.", already_restocked: "Already back in stock.", never_taken: "This order never took stock.",
  empty_note: "Write the note first.", no_email: "This order has no email.", live_locked: "Live mode is locked. An admin can turn on \"Edit products in Stripe live mode\" on the Switches screen.",
  bad_sku: "SKU: lowercase letters, numbers and dashes.", sku_taken: "That SKU is taken.", bad_price: "Price must be $0.50 to $1,000.",
  bad_name: "Add a name.", missing_fields: "Add a name and a price.", bad_max: "Max per order is 1 to 20.", bad_weight: "Weight must be above 0.",
  bad_stock: "Stock must be a whole number, 0 or more.", bad_image: "Image link must start with https:// or /images/.",
  nothing_to_refund: "Pick something to refund.", too_much: "That's more than is left to refund.", bad_amount: "Enter an amount above $0.",
  too_many_items: "That's more units than are left to refund.", shipping_refunded: "Shipping was already refunded.",
  stripe_failed: "Stripe didn't take the refund. Nothing was refunded; try again.", refund_failed: "The refund didn't go through. Nothing was refunded.",
  no_payment: "This order has no payment to refund.",
};
const errorText = (code?: string) => ERRORS[code ?? ""] ?? "That didn't work.";
const EVENT_STATUS: Record<string, "primary" | "success" | "warning" | "info" | "default"> = { placed: "primary", shipped: "success", refunded: "warning", canceled: "warning", restocked: "info", reshipped: "info" };
function eventDetail(e: AdminOrderDetail["timeline"][number]): string {
  const d = e.detail;
  if (e.kind === "note" && typeof d.text === "string") return d.text;
  if ((e.kind === "shipped" || e.kind === "updated") && typeof d.tracking === "string") return `Tracking ${d.tracking}`;
  if (e.kind === "restocked" && typeof d.units === "number") return `${d.units} back in stock`;
  if (e.kind === "refunded" && typeof d.reason === "string") return d.reason;
  if (e.kind === "email" && d.what === "confirmation_resent") return "Confirmation sent again";
  return "";
}
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Shop ▸ Orders. */
export function PlatformShopOrdersTab() {
  return <OrdersPanel />;
}

/** Shop ▸ Products. */
export function PlatformShopProductsTab() {
  return <ProductsPanel />;
}

// ─── orders ─────────────────────────────────────────────────────────────────

function OrdersPanel() {
  const [filter, setFilter] = useState<OrderFilter>("to_ship");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<AdminOrderRow[] | null>(null);
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const d = await fetch(`/api/admin/shop/orders?filter=${filter}&q=${encodeURIComponent(q)}&summary=1`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    setOrders(d?.ok ? d.orders : []);
    if (d?.summary) setSummary(d.summary);
  }, [filter, q]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div className="account-card admin-screen shop-admin">
      <AdminHeader
        title="Orders"
        intro="Orders to ship come first, oldest at the top. Open one to mark it shipped, refund it or add a note."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} onClick={() => void load()}>Refresh</Button>}
      />
      {summary && (
        <AdminStats label="Orders at a glance">
          <StatCard label="To ship" value={String(summary.toShip)} source={summary.oldestShipBy ? `Oldest ships by ${summary.oldestShipBy}` : "Nothing waiting"} icon={<IconPackage size={20} />} variant={summary.toShip > 0 ? "accent" : "default"} />
          <StatCard label="Orders, 30 days" value={String(summary.orders30d)} source={`${summary.orders7d} this week`} icon={<IconReceipt size={20} />} />
          <StatCard label="Sales, 30 days" value={formatPrice(summary.sales30d)} source="After refunds, with shipping and tax" icon={<IconCash size={20} />} />
          <StatCard label="Refunded, 30 days" value={formatPrice(summary.refunded30d)} icon={<IconReceiptRefund size={20} />} />
        </AdminStats>
      )}
      <div className="admin-filters">
        <Input fullWidth floatingLabel="Search all orders: number, email or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select floatingLabel="Show" value={filter} onChange={(v) => setFilter(String(v) as OrderFilter)}
          options={[{ value: "to_ship", label: "To ship" }, { value: "shipped", label: "Shipped" }, { value: "closed", label: "Refunded and canceled" }, { value: "all", label: "All orders" }]} />
      </div>
      {orders === null ? <LoadingLines label="Loading" /> : (
        <AdminTable label="Orders">
          <Table variant="striped" hoverable dense>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead><TableHead>Placed</TableHead><TableHead>Ship to</TableHead>
                <TableHead align="right">Items</TableHead><TableHead align="right">Total</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow><TableCell colSpan={6}><TableEmpty title={filter === "to_ship" && !q ? "Nothing to ship" : q ? "No orders match that search" : "No orders here"} description={filter === "to_ship" && !q ? "New orders show here, oldest first." : undefined} /></TableCell></TableRow>
              ) : orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <button type="button" className="admin-table__link shop-admin__open" onClick={() => setOpen(o.id)}>{o.code}</button>
                    {o.shortfall && <span className="admin-table__sub">Stock ran short</span>}
                  </TableCell>
                  <TableCell>{when(o.createdAt)}</TableCell>
                  <TableCell>{o.name ?? "No name"}<span className="admin-table__sub">{o.state ?? ""}{o.email ? ` · ${o.email}` : ""}</span></TableCell>
                  <TableCell align="right">{o.itemCount}</TableCell>
                  <TableCell align="right">{formatPrice(o.total)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS[o.status].variant} size="small">{STATUS[o.status].label}</Badge>
                    {o.amountRefunded > 0 && (o.status === "paid" || o.status === "shipped") && <span className="admin-table__sub">Partly refunded</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={() => void load()} />}
    </div>
  );
}

function OrderModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/shop/orders/${id}`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (live && d?.ok) { setOrder(d.order); setTracking(d.order.tracking ?? ""); } }).catch(() => {});
    return () => { live = false; };
  }, [id]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    const d = await fetch(`/api/admin/shop/orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(errorText(d?.error)); return false; }
    setOrder(d.order);
    toast.success(done);
    onChanged();
    return true;
  };

  return (
    <Modal isOpen onClose={onClose} title={order ? `Order ${order.code}` : "Order"} size="large">
      {!order ? <LoadingLines label="Loading" /> : (
        <div className="shop-admin__order">
          <div className="shop-admin__order-head">
            <Badge variant={STATUS[order.status].variant}>{STATUS[order.status].label}</Badge>
            {order.amountRefunded > 0 && (order.status === "paid" || order.status === "shipped") && <Badge variant="warning">{`Partly refunded: ${formatPrice(order.amountRefunded)}`}</Badge>}
            <span className="admin-table__sub">Placed {when(order.createdAt)} · ships by {order.shipByLabel}{order.livemode ? "" : " · test mode"}</span>
          </div>
          {order.stockShortfall && <Alert variant="warning" title="Stock ran short">{order.stockShortfall.map((s) => `${s.sku}: ${s.missing} missing`).join(", ")}. Check the shelf before shipping.</Alert>}
          <div className="shop-admin__cols">
            <section>
              <h3 className="shop-admin__h">Ship to</h3>
              <address className="shop-admin__address">
                {order.name}<br />{order.address.line1}{order.address.line2 ? <><br />{order.address.line2}</> : null}<br />{order.address.city}, {order.state} {order.address.postal}
              </address>
              <p className="admin-table__sub">{order.email}{order.phone ? ` · ${order.phone}` : ""}</p>
              <p className="admin-table__sub">USPS Ground Advantage · {order.shipWeightOz} oz with packaging</p>
            </section>
            <section>
              <h3 className="shop-admin__h">Items</h3>
              <ul className="shop-admin__items">
                {order.items.map((i) => (
                  <li key={i.sku}>
                    <span>{i.quantity} x {i.name}{i.refundedQuantity > 0 && i.refundedQuantity < i.quantity ? <span className="admin-table__sub">{i.refundedQuantity} refunded</span> : null}</span>
                    <span>{formatPrice(i.unitAmount * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <dl className="shop-admin__totals">
                <div><dt>Subtotal</dt><dd>{formatPrice(order.amountSubtotal)}</dd></div>
                <div><dt>Shipping</dt><dd>{order.amountShipping ? formatPrice(order.amountShipping) : "Free"}</dd></div>
                {order.amountTax > 0 && <div><dt>Sales tax</dt><dd>{formatPrice(order.amountTax)}</dd></div>}
                <div><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
                {order.amountRefunded > 0 && <div><dt>Refunded</dt><dd>−{formatPrice(order.amountRefunded)}</dd></div>}
              </dl>
            </section>
          </div>

          {order.status === "paid" && (
            <section className="shop-admin__action">
              <h3 className="shop-admin__h">Mark shipped</h3>
              <div className="shop-admin__row">
                <Input fullWidth floatingLabel="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} autoComplete="off" />
                <Button variant="primary" disabled={busy || !tracking.trim()} onClick={() => void act({ action: "ship", tracking }, "Marked shipped")}>Mark shipped</Button>
              </div>
              <p className="admin-table__sub">The buyer gets an email with the USPS tracking link.</p>
            </section>
          )}
          {order.status === "shipped" && (
            <section className="shop-admin__action">
              <h3 className="shop-admin__h">Tracking</h3>
              {order.trackingUrl && <p><a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">{order.tracking}</a></p>}
              <div className="shop-admin__row">
                <Input fullWidth floatingLabel="Fix the tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} autoComplete="off" />
                <Button variant="secondary" disabled={busy || !tracking.trim() || tracking === order.tracking} onClick={() => void act({ action: "tracking", tracking }, "Tracking saved")}>Save</Button>
              </div>
            </section>
          )}

          <section className="shop-admin__action">
            <h3 className="shop-admin__h">More</h3>
            <div className="shop-admin__row shop-admin__row--wrap">
              {(order.status === "paid" || order.status === "shipped") && (
                <Button variant="danger" size="small" disabled={busy} onClick={() => setRefunding(true)}>Refund</Button>
              )}
              {(order.status === "refunded" || order.status === "canceled") && !order.restocked && order.refundReason !== "cant_ship_address" && (
                <Button variant="secondary" size="small" disabled={busy} onClick={() => void act({ action: "restock" }, "Back in stock")}>Put back in stock</Button>
              )}
              {order.email && <Button variant="ghost" size="small" disabled={busy} onClick={() => void act({ action: "resend" }, "Confirmation sent")}>Resend confirmation</Button>}
            </div>
            <div className="shop-admin__row">
              <Textarea fullWidth floatingLabel="Add a note (staff only)" value={note} rows={2} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
              <Button variant="secondary" size="small" disabled={busy || !note.trim()} onClick={async () => { if (await act({ action: "note", text: note }, "Note added")) setNote(""); }}>Add note</Button>
            </div>
          </section>

          <section>
            <h3 className="shop-admin__h">Timeline</h3>
            <Timeline variant="compact" items={[...order.timeline].reverse().map((e, i) => ({
              id: i,
              title: e.kind === "note" ? "Note" : e.kind[0].toUpperCase() + e.kind.slice(1),
              timestamp: `${when(e.at)}${e.actor ? ` · ${e.actor}` : ""}${e.visible ? " · buyer sees this" : ""}`,
              status: EVENT_STATUS[e.kind] ?? "default",
              description: eventDetail(e) || undefined,
            }))} />
          </section>
          {(order.utm.content || order.utm.source) && <p className="admin-table__sub">Came from {[order.utm.source, order.utm.medium, order.utm.campaign, order.utm.content].filter(Boolean).join(" / ")}</p>}
          {refunding && <RefundModal order={order} onClose={() => setRefunding(false)} onDone={(o) => { setOrder(o); setRefunding(false); onChanged(); }} />}
        </div>
      )}
    </Modal>
  );
}

const REASONS: { value: RefundReason; label: string }[] = [
  { value: "damaged", label: "Damaged in transit" },
  { value: "missing", label: "Missing from the order" },
  { value: "goodwill", label: "Goodwill" },
  { value: "other", label: "Other" },
];

/**
 * Refund part of an order: pick units of each item (their tax comes back with
 * them, from Stripe's own totals), the shipping charge, or a set amount. Damaged
 * packs stay off the shelf unless "Put these back in stock" is ticked.
 */
function RefundModal({ order, onClose, onDone }: { order: AdminOrderDetail; onClose: () => void; onDone: (o: AdminOrderDetail) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [quote, setQuote] = useState<AdminRefundQuote | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [shipping, setShipping] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<RefundReason>("damaged");
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/shop/orders/${order.id}?quote=1`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d?.ok) setQuote(d.quote); else { toast.error(errorText(d?.error)); onClose(); }
    }).catch(() => {});
    return () => { live = false; };
  }, [order.id, toast, onClose]);

  if (!quote) return <Modal isOpen onClose={onClose} title={`Refund ${order.code}`} size="medium"><LoadingLines label="Loading" /></Modal>;
  const left = quote.amountTotal - quote.amountRefunded;
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([sku, quantity]) => ({ sku, quantity }));
  const cents = custom ? Math.round(Number(amount) * 100) : refundCents(quote, items, shipping);
  const valid = Number.isFinite(cents) && cents >= 1 && cents <= left;

  const send = async (body: Record<string, unknown>, label: string) => {
    if (!(await confirm({ title: `${label}?`, body: "It goes back to the buyer's card through Stripe, and they get an email. This can't be undone.", confirmLabel: label }))) return;
    setBusy(true);
    const d = await fetch(`/api/admin/shop/orders/${order.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refund", ...body }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(errorText(d?.error)); return; }
    toast.success("Refunded");
    onDone(d.order);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Refund ${order.code}`} size="medium"
      footer={
        <div className="shop-refund__footer">
          <Button variant="ghost" disabled={busy} onClick={() => void send({ all: true, reason, restock }, `Refund everything left (${formatPrice(left)})`)}>Refund everything</Button>
          <Button variant="danger" disabled={busy || !valid} onClick={() => void send(
            custom ? { amountCents: cents, reason, note, restock: false } : { items, shipping, reason, note, restock },
            `Refund ${valid ? formatPrice(cents) : ""}`.trim(),
          )}>{valid ? `Refund ${formatPrice(cents)}` : "Refund"}</Button>
        </div>
      }>
      <div className="shop-refund">
        <p className="admin-table__sub">{`${formatPrice(quote.amountRefunded)} refunded so far · ${formatPrice(left)} left of ${formatPrice(quote.amountTotal)}`}</p>
        <Switch label="Refund a set amount instead" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
        {custom ? (
          <Input fullWidth floatingLabel={`Amount (up to ${formatPrice(left)})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        ) : (
          <div className="shop-refund__lines">
            {quote.lines.map((l) => {
              const open = l.quantity - l.refundedQuantity;
              const n = qty[l.sku] ?? 0;
              return (
                <div key={l.sku} className="shop-refund__line">
                  <div className="shop-refund__name">
                    <strong>{l.name}</strong>
                    <span className="admin-table__sub">{open > 0 ? `${open} of ${l.quantity} left to refund` : "Fully refunded"}</span>
                  </div>
                  <Select size="small" disabled={open < 1} value={String(n)} onChange={(v) => setQty((cur) => ({ ...cur, [l.sku]: Number(v) }))}
                    aria-label={`Units of ${l.name} to refund`}
                    options={Array.from({ length: open + 1 }, (_, k) => ({ value: String(k), label: String(k) }))} />
                  <span className="shop-refund__amt">{n > 0 ? formatPrice(refundCents(quote, [{ sku: l.sku, quantity: n }], false)) : ""}</span>
                </div>
              );
            })}
            {quote.shipping.total > 0 && (
              <Checkbox label={quote.shipping.refunded ? "Shipping (already refunded)" : `Shipping (${formatPrice(quote.shipping.total)})`} disabled={quote.shipping.refunded} checked={shipping} onChange={(e) => setShipping(e.target.checked)} />
            )}
            <p className="admin-table__sub">Each item&apos;s sales tax comes back with it.</p>
          </div>
        )}
        <Select floatingLabel="Reason" value={reason} onChange={(v) => setReason(String(v) as RefundReason)} options={REASONS} />
        {!custom && <Checkbox label="Put these back in stock" checked={restock} onChange={(e) => setRestock(e.target.checked)} />}
        <Textarea fullWidth floatingLabel="Note (staff only)" value={note} rows={2} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <p className="admin-table__sub">The buyer&apos;s email lists what was refunded{reason === "damaged" || reason === "missing" ? ` and says "${REASONS.find((r) => r.value === reason)?.label}"` : ""}.</p>
      </div>
    </Modal>
  );
}

// ─── products ───────────────────────────────────────────────────────────────

function ProductsPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [live, setLive] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/shop/products", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setProducts(d?.ok ? d.products : []);
    setLive(!!d?.live);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const patch = async (body: Record<string, unknown>, done: string) => {
    const d = await fetch("/api/admin/shop/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { toast.error(errorText(d?.error)); return; }
    toast.success(done);
    void load();
  };

  const shown = (products ?? []).filter((p) => showArchived || !p.archived);
  const archive = async (p: AdminProduct) => {
    if (await confirm({ title: `Archive ${p.name}?`, body: "It comes off the shop for good (orders keep it) and its Stripe product is archived. You can restore it later.", confirmLabel: "Archive" })) void patch({ sku: p.sku, action: "archive" }, "Product archived");
  };
  return (
    <div className="account-card admin-screen shop-admin">
      <AdminHeader
        title="Products"
        intro="What the shop sells. Changes go to Stripe too; a price change makes a new Stripe price."
        actions={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing("new")}>Add product</Button>}
      />
      {live && <Alert variant="warning" title="Live mode">Changes here create and change real Stripe products and prices.</Alert>}
      <Switch label="Show archived products" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      {products === null ? <LoadingLines label="Loading" /> : (
        <AdminTable label="Products">
          <Table variant="striped" hoverable dense>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead><TableHead align="right">Price</TableHead><TableHead align="right">Stock</TableHead>
                <TableHead align="right">Held</TableHead><TableHead align="right">Sold</TableHead><TableHead>Status</TableHead><TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? <TableRow><TableCell colSpan={7}><TableEmpty title="No products yet" description="Add the first one with Add product." /></TableCell></TableRow> : shown.map((p) => (
                <TableRow key={p.sku}>
                  <TableCell>
                    <button type="button" className="admin-table__link shop-admin__open" onClick={() => setEditing(p)}>{p.name}</button>
                    <span className="admin-table__sub">{p.sku} · {p.kind === "bundle" ? "Bundle" : "Single pack"}</span>
                  </TableCell>
                  <TableCell align="right">{formatPrice(p.priceCents)}</TableCell>
                  <TableCell align="right">{p.stock}</TableCell>
                  <TableCell align="right">{p.held}</TableCell>
                  <TableCell align="right">{p.sold}</TableCell>
                  <TableCell>
                    {p.archived ? <Badge variant="default" size="small">Archived</Badge>
                      : p.onSale ? (p.available < 1 ? <Badge variant="warning" size="small">Sold out</Badge> : <Badge variant="success" size="small">On sale</Badge>)
                      : <Badge variant="default" size="small">Hidden</Badge>}
                  </TableCell>
                  <TableCell align="right">
                    <span className="admin-row-actions">
                      <Button variant="ghost" size="small" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>Edit</Button>
                      <AdminRowMenu
                        label={`More for ${p.name}`}
                        items={p.archived
                          ? [{ label: "Restore", onClick: () => void patch({ sku: p.sku, action: "restore" }, "Product restored") }]
                          : [{ label: "Archive", onClick: () => void archive(p) }]}
                      />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      {editing && <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function ProductModal({ product, onClose, onSaved }: { product: AdminProduct | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    sku: product?.sku ?? "", name: product?.name ?? "", kind: product?.kind ?? "bundle", category: product?.category ?? "tcg",
    price: product ? (product.priceCents / 100).toFixed(2) : "", stock: String(product?.stock ?? 0), maxPerOrder: String(product?.maxPerOrder ?? 5),
    weight: String(product?.shipWeightOz ?? 4), blurb: product?.blurb ?? "", description: product?.description ?? "", contents: (product?.contents ?? []).join("\n"),
    imageUrl: product?.imageUrl ?? "", active: product?.active ?? false, sortOrder: String(product?.sortOrder ?? 100),
  });
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));

  const save = async () => {
    const input: ProductInput = {
      name: f.name, kind: f.kind as "bundle" | "single", category: f.category, priceCents: Math.round(Number(f.price) * 100),
      stockAvailable: Number(f.stock), maxPerOrder: Number(f.maxPerOrder), shipWeightOz: Number(f.weight), blurb: f.blurb, description: f.description,
      contents: f.contents.split("\n"), imageUrl: f.imageUrl, active: f.active, sortOrder: Number(f.sortOrder),
    };
    setBusy(true);
    const d = await fetch("/api/admin/shop/products", {
      method: product ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product ? { sku: product.sku, product: input } : { product: { ...input, sku: f.sku.trim().toLowerCase() } }),
    }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(errorText(d?.error)); return; }
    toast.success(product ? "Product saved" : "Product added");
    onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title={product ? `Edit ${product.name}` : "Add a product"} size="large"
      footer={<div className="shop-details__footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>{product ? "Save product" : "Add product"}</Button></div>}>
      <div className="shop-admin__form">
        {!product && <Input fullWidth floatingLabel="SKU (lowercase, dashes; can't change later)" value={f.sku} onChange={(e) => set("sku")(e.target.value)} />}
        <Input fullWidth floatingLabel="Name" value={f.name} maxLength={80} onChange={(e) => set("name")(e.target.value)} />
        <div className="shop-admin__grid">
          <Select floatingLabel="Kind" value={f.kind} onChange={(v) => set("kind")(String(v))} options={[{ value: "bundle", label: "Bundle" }, { value: "single", label: "Single pack" }]} />
          <Input fullWidth floatingLabel="Category" value={f.category} maxLength={30} onChange={(e) => set("category")(e.target.value)} />
          <Input fullWidth floatingLabel="Price (USD)" inputMode="decimal" value={f.price} onChange={(e) => set("price")(e.target.value)} />
          <Input fullWidth floatingLabel="Stock" inputMode="numeric" value={f.stock} onChange={(e) => set("stock")(e.target.value)} />
          <Input fullWidth floatingLabel="Max per order" inputMode="numeric" value={f.maxPerOrder} onChange={(e) => set("maxPerOrder")(e.target.value)} />
          <Input fullWidth floatingLabel="Packed weight (oz)" inputMode="decimal" value={f.weight} onChange={(e) => set("weight")(e.target.value)} />
          <Input fullWidth floatingLabel="Shelf order" inputMode="numeric" value={f.sortOrder} onChange={(e) => set("sortOrder")(e.target.value)} />
        </div>
        <Input fullWidth floatingLabel="Short description (on the card)" value={f.blurb} maxLength={200} onChange={(e) => set("blurb")(e.target.value)} />
        <Textarea fullWidth floatingLabel="Full description (details and Stripe)" value={f.description} rows={3} maxLength={1000} onChange={(e) => set("description")(e.target.value)} />
        <Textarea fullWidth floatingLabel="What's inside (one per line)" value={f.contents} rows={4} onChange={(e) => set("contents")(e.target.value)} />
        <Input fullWidth floatingLabel="Photo link (https:// or /images/…)" value={f.imageUrl} onChange={(e) => set("imageUrl")(e.target.value)} />
        <Switch label="On sale (shows in the shop)" checked={f.active} onChange={(e) => set("active")(e.target.checked)} />
        {product && <p className="admin-table__sub">A price change makes a new Stripe price; past orders keep what they paid.</p>}
      </div>
    </Modal>
  );
}
