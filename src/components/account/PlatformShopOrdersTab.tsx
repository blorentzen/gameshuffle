"use client";

/**
 * Platform admin ▸ Shop ▸ Orders and Products (staff): run the GameShuffle Shop.
 *   Orders    the queue (ShopOrdersQueue: what needs you first, then by where
 *             orders are); each order has its own page (ShopOrderPage).
 *   Products  the catalog: add, edit (a price change makes a new Stripe price),
 *             stock, on/off, archive and restore. Changes go to Stripe too.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Checkbox, Input, Modal, Select, Switch, Textarea,
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { formatPrice } from "@/lib/store/copy";
import type { AdminOrderDetail, AdminRefundQuote, RefundReason, StateSales } from "@/lib/store/manage";
import type { StateTotals } from "@/lib/store/rules";
import { refundCents } from "@/lib/store/rules";
import { AdminHeader, AdminRowMenu, AdminTable } from "@/components/account/admin/AdminKit";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import type { AdminProduct, ProductInput } from "@/lib/store/catalog";
import { ShopOrdersQueue } from "./shop/ShopOrdersQueue";
import { errorText } from "./shop/orderBits";

/** Shop ▸ Orders: the queue (order tracking picks 2026-11-08); each order opens its own page, /admin/shop/GS-1021. */
export function PlatformShopOrdersTab() {
  return <ShopOrdersQueue />;
}

/** Shop ▸ Products. */
export function PlatformShopProductsTab() {
  return <ProductsPanel />;
}

// ─── orders ─────────────────────────────────────────────────────────────────

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
export function RefundModal({ order, onClose, onDone, preset, requestId }: {
  order: AdminOrderDetail; onClose: () => void; onDone: (o: AdminOrderDetail) => void;
  /** From a problem report: that item and reason already picked, and the report closed by the refund. */
  preset?: { sku: string; quantity: number; reason: RefundReason } | null; requestId?: string | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [quote, setQuote] = useState<AdminRefundQuote | null>(null);
  const [qty, setQty] = useState<Record<string, number>>(preset ? { [preset.sku]: preset.quantity } : {});
  const [shipping, setShipping] = useState(false);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<RefundReason>(preset?.reason ?? "damaged");
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
    const d = await fetch(`/api/admin/shop/orders/${order.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refund", ...body, ...(requestId ? { requestId } : {}) }) }).then((r) => r.json()).catch(() => null);
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

// ---------------------------------------------------------------------------
// Sales by state (build F): an early warning before a state's sales tax threshold.

const STATE_STATUS: Record<StateTotals["status"], { label: string; variant: "info" | "error" | "warning" | "success" }> = {
  home: { label: "Home state, registered", variant: "info" },
  over: { label: "Over the line", variant: "error" },
  close: { label: "Getting close", variant: "warning" },
  fine: { label: "Fine", variant: "success" },
};

export function PlatformShopStatesTab() {
  const toast = useToast();
  const [data, setData] = useState<StateSales | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/shop/orders?states=1", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (d?.states) setData(d.states as StateSales);
      else toast.toast({ variant: "error", message: "Couldn't load sales by state. Try again." });
    } finally {
      setBusy(false);
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const flagged = data?.rows.filter((r) => r.status === "over" || r.status === "close").length ?? 0;

  return (
    <div className="account-card admin-screen shop-admin">
      <AdminHeader
        title="Sales by state"
        intro={data
          ? `An early warning before a state's sales tax threshold. Most states start at $100,000 or 200 orders a year; this flags at ${formatPrice(data.warnRevenue).replace(/\.00$/, "")} or ${data.warnOrders} orders, over the last 12 months and ${data.year}, and says "Getting close" at three quarters.`
          : "An early warning before a state's sales tax threshold."}
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} onClick={() => void load()}>Refresh</Button>}
      />
      {data && !data.live && <Alert variant="info">No live orders yet, so these are test orders.</Alert>}
      {data && flagged > 0 && (
        <Alert variant="warning" title={`${flagged} ${flagged === 1 ? "state needs" : "states need"} a look`}>
          Check whether that state wants you to register to collect its sales tax before you pass its threshold.
        </Alert>
      )}
      {data === null ? <LoadingLines label="Loading" /> : (
        <AdminTable label="Sales by state">
          <Table variant="striped" hoverable dense>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead align="right">Orders, 12 months</TableHead>
                <TableHead align="right">Sales, 12 months</TableHead>
                <TableHead align="right">Orders, {data.year}</TableHead>
                <TableHead align="right">Sales, {data.year}</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow><TableCell colSpan={6}><TableEmpty title="No orders yet" description="Each state shows here once it has an order." /></TableCell></TableRow>
              ) : data.rows.map((r) => (
                <TableRow key={r.state}>
                  <TableCell>{r.state}</TableCell>
                  <TableCell align="right">{r.orders12}</TableCell>
                  <TableCell align="right">{formatPrice(r.sales12)}</TableCell>
                  <TableCell align="right">{r.ordersYear}</TableCell>
                  <TableCell align="right">{formatPrice(r.salesYear)}</TableCell>
                  <TableCell><Badge variant={STATE_STATUS[r.status].variant} size="small">{STATE_STATUS[r.status].label}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
      <p className="admin-updated">Sales are order totals minus tax and refunds. Canceled and fully refunded orders don&apos;t count.</p>
    </div>
  );
}
