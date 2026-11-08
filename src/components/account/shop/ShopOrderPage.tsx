"use client";

/**
 * One order for staff, /admin/shop/GS-1021 (order tracking picks 2026-11-08). What needs you sits on top: a problem
 * report (photos, Reprint at Printful, refund the item, ask for more), a new address (use it at Printful while it
 * allows), a question, Printful trouble, late, a box that came back. Then where it is (the buyer's own tracker),
 * the items and boxes, and the history. On the side: the buyer and their other orders, a message to them with
 * ready-made starts (it emails them and shows on their order page), Printful, and the rest (refund, tracking, notes).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Breadcrumb, Button, Chip, Input, Select, Textarea, Timeline } from "@empac/cascadeds";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminPanel } from "@/components/account/admin/AdminKit";
import { OrderSteps } from "@/components/store/order/OrderSteps";
import { formatPrice } from "@/lib/store/copy";
import type { AdminOrderDetail, RefundReason } from "@/lib/store/manage";
import type { CustomerOrderView, ViewRequest } from "@/lib/store/lookup";
import type { Need } from "@/lib/store/orderStage";
import { RefundModal } from "../PlatformShopOrdersTab";
import { EVENT_STATUS, PRINTFUL_LINE, errorText, eventDetail, when } from "./orderBits";
import "@/styles/shop.css";

interface Data { order: AdminOrderDetail; view: CustomerOrderView | null; needs: Need[]; customer: { orders: number; total: number } | null }

const STARTS: { id: string; label: string; text: (first: string, item: string | null) => string }[] = [
  { id: "report", label: "About their report", text: (f, i) => `Hi ${f}, thanks for the photos. We're making you a new ${i ?? "one"} now, and it ships free. You don't need to send the first one back.` },
  { id: "photo", label: "Ask for a photo", text: (f) => `Hi ${f}, could you reply with a photo of the whole item and one up close of the problem? Then we'll sort it out right away.` },
  { id: "late", label: "Running late", text: (f) => `Hi ${f}, your order is taking a little longer than usual at our print partner. It should ship within a few days, and we'll email the tracking link the moment it does.` },
  { id: "address", label: "Check the address", text: (f) => `Hi ${f}, your package came back to our print partner. Could you check the address on your order page and reply with any fix? Then we'll send it again.` },
];

/** A request as staff read it ("Question", "Problem: misprinted, wanted a replacement"). */
const staffLine = (r: ViewRequest) => (r.kind === "question" ? "Question" : r.kind === "address" ? "New address" : `Problem: ${r.line.toLowerCase().replace("you'd like a", "wanted a")}`);

export function ShopOrderPage({ code }: { code: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState<{ preset?: { sku: string; quantity: number; reason: RefundReason }; requestId?: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [about, setAbout] = useState("");
  const [then, setThen] = useState<"" | "waiting" | "resolved">("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/admin/shop/orders/${code}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { setData("missing"); return; }
    setData(d);
    setTracking(d.order.tracking ?? "");
  }, [code]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    const d = await fetch(`/api/admin/shop/orders/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) {
      toast.error(d?.error === "printful_locked" ? "Printful has started on it, so the address can't change there. Reply to the buyer instead."
        : d?.error === "printful" && d?.message ? `Printful: ${d.message}` : d?.error === "shipped" ? "It has shipped, so the address can't change now." : errorText(d?.error));
      return false;
    }
    setData(d);
    toast.success(done);
    if (d.printfulCanceled === false && d.printfulReason) toast.error(`Printful didn't cancel it: ${d.printfulReason}. Cancel it in Printful.`);
    return true;
  };

  if (data === null) return <div className="account-card admin-screen"><LoadingLines label="Loading the order" /></div>;
  if (data === "missing") return <div className="account-card admin-screen"><Alert variant="warning" title="No such order">Check the number, or go back to <Link href="/admin/shop?tab=orders">Orders</Link>.</Alert></div>;
  const { order, view, needs, customer } = data;
  const first = (order.name ?? "there").split(/\s+/)[0];
  const open = (view?.requests ?? []).filter((r) => r.id !== "messages" && r.status !== "resolved");
  const done = (view?.requests ?? []).filter((r) => r.id !== "messages" && r.status === "resolved");
  const otherNeeds = needs.filter((n) => n.kind !== "request");
  const itemName = (sku: string | null) => view?.items.find((i) => i.sku === sku)?.name ?? null;
  const reasonFor = (r: ViewRequest): RefundReason => (r.line.toLowerCase().startsWith("damaged") ? "damaged" : r.line.toLowerCase().startsWith("missing") ? "missing" : "other");

  const sendMsg = async () => {
    if (await act({ action: "message", body: msg, requestId: about || null, status: about && then ? then : null, resolution: then === "resolved" ? "answered" : null }, "Sent to the buyer")) { setMsg(""); setThen(""); }
  };

  return (
    <div className="account-card admin-screen shop-order-admin">
      <Breadcrumb items={[{ label: "Orders", href: "/admin/shop?tab=orders" }, { label: order.code }]} />
      <header className="shop-oa__head">
        <div>
          <h1 className="shop-oa__title">Order {order.code} · {order.name ?? "No name"}</h1>
          <p className="shop-oa__sub">Placed {when(order.createdAt)} · {formatPrice(order.total)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}{order.address.city ? ` · ${order.address.city}, ${order.state}` : ""}{order.livemode ? "" : " · test mode"}</p>
        </div>
        <div className="shop-oa__actions">
          {order.merch && order.printful.orderId && <Button variant="ghost" size="small" iconBefore={IconRefresh} disabled={busy} onClick={() => void act({ action: "sync_boxes" }, "Boxes updated from Printful")}>Update boxes</Button>}
          <a className="empac-button empac-button--secondary empac-button--small shop-oa__link" href={`/shop/orders/${order.code}`} target="_blank" rel="noopener noreferrer">
            <span>See what {first} sees</span><IconExternalLink size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <div className="shop-oa__cols">
        <div className="shop-oa__main">
          <h2 className="sr-only">This order</h2>
          {open.map((r) => (
            <section key={r.id} className={`shop-oa__need shop-oa__need--${r.kind}`} aria-labelledby={`need-${r.id}`}>
              <p className="shop-oa__kicker">{r.status === "waiting" ? "Waiting for the buyer" : "Needs you"} · {r.kind === "problem" ? "problem report" : r.kind === "address" ? "new address" : "question"}</p>
              <h3 id={`need-${r.id}`} className="shop-oa__h2">{r.kind === "problem" ? `${r.itemName ?? "An item"}: ${r.line.split(",")[0].toLowerCase()}` : r.kind === "address" ? "They'd like it sent somewhere else" : "A question about the order"}</h3>
              {r.kind === "problem" && <p className="shop-oa__p">{first} would like <b>a {r.wants ?? "replacement"}</b>. Sent {r.at}.</p>}
              {r.body && <blockquote className="shop-oa__quote">{r.body}</blockquote>}
              {r.address && <p className="shop-oa__p"><b>New address:</b> {r.address}<br /><span className="shop-oa__muted">Now: {[order.name, order.address.line1, order.address.line2, `${order.address.city}, ${order.state} ${order.address.postal}`].filter(Boolean).join(", ")}</span></p>}
              {r.photos.length > 0 && (
                <div className="shop-oa__photos">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the buyer's photos */}
                  {r.photos.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Buyer's photo ${k + 1}`} width={96} height={96} /></a>)}
                </div>
              )}
              {r.messages.length > 0 && (
                <ul className="shop-oa__thread">{r.messages.map((m, k) => <li key={k} className={`shop-oa__msg shop-oa__msg--${m.from}`}><span>{m.from === "staff" ? "GameShuffle" : first} · {m.at}</span><p>{m.body}</p></li>)}</ul>
              )}
              <div className="shop-oa__row">
                {r.kind === "problem" && order.merch && (
                  <Button variant="primary" disabled={busy} onClick={async () => {
                    if (!(await confirm({ title: `Reprint ${r.itemName ?? "this item"}?`, body: order.livemode ? "Printful makes a new one and ships it to the buyer now, at no charge to them. Printful charges us for it." : "Test order: Printful only prices it, nothing is made.", confirmLabel: "Reprint at Printful" }))) return;
                    await act({ action: "reprint", requestId: r.id }, order.livemode ? "Sent to Printful" : "Priced at Printful (test)");
                  }}>Reprint at Printful</Button>
                )}
                {r.kind === "problem" && (order.status === "paid" || order.status === "shipped") && (
                  <Button variant="secondary" disabled={busy} onClick={() => setRefund({ preset: r.sku ? { sku: r.sku, quantity: 1, reason: reasonFor(r) } : undefined, requestId: r.id })}>Refund this item</Button>
                )}
                {r.kind === "address" && <Button variant="primary" disabled={busy} onClick={() => void act({ action: "use_address", requestId: r.id }, "Address changed")}>Use this address</Button>}
                <Button variant="ghost" disabled={busy} onClick={() => { setAbout(r.id); setThen(r.kind === "question" ? "resolved" : "waiting"); setMsg(r.kind === "problem" ? STARTS[1].text(first, itemName(r.sku)) : ""); document.getElementById("oa-msg")?.focus(); }}>Reply</Button>
                <Button variant="ghost" disabled={busy} onClick={async () => { if (await confirm({ title: "Close this without a reply?", body: "The buyer sees it as closed on their order page.", confirmLabel: "Close it" })) await act({ action: "resolve", requestId: r.id, resolution: "declined" }, "Closed"); }}>Close</Button>
              </div>
              {r.kind === "problem" && order.merch && <p className="shop-oa__muted">To get the cost back, file a claim in Printful with these photos within 30 days of delivery.</p>}
            </section>
          ))}

          {otherNeeds.map((n, k) => <Alert key={k} variant={n.tone === "red" ? "error" : n.tone === "amber" ? "warning" : "info"}>{n.text}</Alert>)}

          <AdminPanel>
            <OrderSteps steps={view?.steps ?? []} label="Where it is" />
            <ul className="order-items">
              {(view?.items ?? []).map((i) => {
                const it = order.items.find((x) => x.sku === i.sku);
                return (
                  <li key={i.sku} className="order-item">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                    {i.image ? <img src={i.image} alt="" width={56} height={56} /> : <span className="order-item__ph" aria-hidden="true" />}
                    <span className="order-item__text"><b>{i.quantity > 1 ? `${i.quantity} × ` : ""}{i.name}</b>{i.detail && <small>{i.detail}</small>}{it && it.refundedQuantity > 0 && <small>{it.refundedQuantity} refunded</small>}</span>
                    <span className="order-item__price">{formatPrice(i.unitAmount * i.quantity)}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="order-totals">
              <div><dt>Subtotal</dt><dd>{formatPrice(order.amountSubtotal)}</dd></div>
              <div><dt>Shipping</dt><dd>{order.amountShipping ? formatPrice(order.amountShipping) : "Free"}</dd></div>
              {order.amountTax > 0 && <div><dt>Sales tax</dt><dd>{formatPrice(order.amountTax)}</dd></div>}
              <div className="order-totals__total"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
              {order.amountRefunded > 0 && <div><dt>Refunded</dt><dd>−{formatPrice(order.amountRefunded)}</dd></div>}
            </dl>
            {(view?.boxes ?? []).length > 0 && (
              <ul className="shop-oa__boxes">
                {view!.boxes.map((b) => (
                  <li key={b.id}><b>{b.label}</b>{b.carrier ? ` · ${b.carrier}` : ""} · {b.statusLine}{b.tracking && <> · {b.trackingUrl ? <a href={b.trackingUrl} target="_blank" rel="noopener noreferrer">{b.tracking}</a> : b.tracking}</>}{b.events[0] && <span className="shop-oa__muted"> · {b.events[0].text}</span>}</li>
                ))}
              </ul>
            )}
          </AdminPanel>

          {done.length > 0 && (
            <AdminPanel>
            <h3 className="admin-panel__title">Earlier requests</h3>
              <ul className="shop-oa__done">{done.map((r) => <li key={r.id}>{staffLine(r)}{r.itemName ? ` · ${r.itemName}` : ""} · <span className="shop-oa__muted">{r.statusLabel.replace(/^Done: /, "")} · {r.at}</span></li>)}</ul>
            </AdminPanel>
          )}

          <AdminPanel>
            <h3 className="admin-panel__title">History</h3>
            <Timeline variant="compact" items={[...order.timeline].reverse().map((e, i) => ({
              id: i,
              title: e.kind === "note" ? "Note" : e.kind === "message" ? `Message ${(e.detail as { from?: string }).from === "staff" ? "to" : "from"} ${first}` : e.kind[0].toUpperCase() + e.kind.slice(1).replace(/_/g, " "),
              timestamp: `${when(e.at)}${e.actor ? ` · ${e.actor}` : ""}${e.visible ? ` · ${first} sees this` : " · staff only"}`,
              status: EVENT_STATUS[e.kind] ?? "default",
              description: (e.kind === "message" ? String((e.detail as { body?: string }).body ?? "") : eventDetail(e)) || undefined,
            }))} />
          </AdminPanel>
        </div>

        <aside className="shop-oa__side">
          <AdminPanel>
            <h2 className="admin-panel__title">{order.name ?? "The buyer"}</h2>
            <dl className="shop-oa__dl">
              {order.email && <><dt>Email</dt><dd>{order.email}</dd></>}
              {order.phone && <><dt>Phone</dt><dd>{order.phone}</dd></>}
              <dt>Ship to</dt><dd>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}<br />{order.address.city}, {order.state} {order.address.postal}</dd>
              {customer && <><dt>Orders</dt><dd>{customer.orders} · {formatPrice(customer.total)} in all</dd></>}
            </dl>
          </AdminPanel>

          <AdminPanel>
            <h2 className="admin-panel__title">{`Message ${first}`}</h2>
            <div className="shop-oa__chips">
              {STARTS.map((t) => <Chip key={t.id} label={t.label} clickable onClick={() => setMsg(t.text(first, itemName(open.find((r) => r.kind === "problem")?.sku ?? null)))} />)}
            </div>
            <Textarea id="oa-msg" floatingLabel="Your message" value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} maxLength={4000} fullWidth />
            {open.length > 0 && (
              <div className="shop-oa__two">
                <Select floatingLabel="About" value={about} onChange={(v) => setAbout(String(v))} options={[{ value: "", label: "The order" }, ...open.map((r) => ({ value: r.id, label: staffLine(r) }))]} fullWidth />
                {about && <Select floatingLabel="Then" value={then} onChange={(v) => setThen(String(v) as typeof then)} options={[{ value: "", label: "Leave it open" }, { value: "waiting", label: "Wait for their answer" }, { value: "resolved", label: "Mark it done" }]} fullWidth />}
              </div>
            )}
            <Button variant="primary" disabled={busy || !msg.trim()} onClick={() => void sendMsg()}>Send by email</Button>
            <p className="shop-oa__muted">It also shows on {first}&apos;s order page{order.email ? "" : " (this order has no email)"}.</p>
          </AdminPanel>

          {order.merch && (
            <AdminPanel>
            <h2 className="admin-panel__title">Printful</h2>
              <p className="shop-oa__p">{PRINTFUL_LINE[order.printful.status ?? ""] ?? (order.printful.status ? `Printful: ${order.printful.status}` : "Not in Printful yet.")}</p>
              {order.printful.error && order.printful.status !== "test" && <Alert variant="warning">{order.printful.error}</Alert>}
              <div className="shop-oa__row">
                {order.livemode && order.status === "paid" && (!order.printful.status || order.printful.status === "draft" || order.printful.status === "failed") && (
                  <Button variant="primary" size="small" disabled={busy} onClick={async () => { if (await confirm({ title: `Send ${order.code} to Printful?`, body: "Printful charges for it now and starts making it.", confirmLabel: "Send to Printful" })) await act({ action: "printful_send" }, "Sent to Printful"); }}>Send to Printful</Button>
                )}
                {order.livemode && order.status === "paid" && !order.printful.orderId && order.printful.status === "failed" && (
                  <Button variant="secondary" size="small" disabled={busy} onClick={() => void act({ action: "printful_draft" }, "Draft made")}>Make the draft again</Button>
                )}
                {order.printful.orderId && <a href="https://www.printful.com/dashboard/default/orders" target="_blank" rel="noopener noreferrer">Open Printful (order {order.printful.orderId})</a>}
              </div>
            </AdminPanel>
          )}

          <AdminPanel>
            <h2 className="admin-panel__title">More</h2>
            {order.status === "paid" && !order.merch && (
              <div className="shop-oa__two">
                <Input fullWidth floatingLabel="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} autoComplete="off" />
                <Button variant="primary" size="small" disabled={busy || !tracking.trim()} onClick={() => void act({ action: "ship", tracking }, "Marked shipped")}>Mark shipped</Button>
              </div>
            )}
            {order.status === "shipped" && !order.merch && (
              <div className="shop-oa__two">
                <Input fullWidth floatingLabel="Fix the tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} autoComplete="off" />
                <Button variant="secondary" size="small" disabled={busy || !tracking.trim() || tracking === order.tracking} onClick={() => void act({ action: "tracking", tracking }, "Tracking saved")}>Save</Button>
              </div>
            )}
            <div className="shop-oa__row">
              {(order.status === "paid" || order.status === "shipped") && <Button variant="danger" size="small" disabled={busy} onClick={() => setRefund({})}>Refund</Button>}
              {(order.status === "refunded" || order.status === "canceled") && !order.restocked && !order.merch && order.refundReason !== "cant_ship_address" && (
                <Button variant="secondary" size="small" disabled={busy} onClick={() => void act({ action: "restock" }, "Back in stock")}>Put back in stock</Button>
              )}
              {order.email && <Button variant="ghost" size="small" disabled={busy} onClick={() => void act({ action: "resend" }, "Confirmation sent")}>Resend confirmation</Button>}
            </div>
            <Textarea fullWidth floatingLabel="Add a note (staff only)" value={note} rows={2} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            <Button variant="secondary" size="small" disabled={busy || !note.trim()} onClick={async () => { if (await act({ action: "note", text: note }, "Note added")) setNote(""); }}>Add note</Button>
            {(order.utm.content || order.utm.source) && <p className="shop-oa__muted">Came from {[order.utm.source, order.utm.medium, order.utm.campaign, order.utm.content].filter(Boolean).join(" / ")}</p>}
          </AdminPanel>
        </aside>
      </div>
      {refund && <RefundModal order={order} preset={refund.preset ?? null} requestId={refund.requestId ?? null} onClose={() => setRefund(null)} onDone={() => { setRefund(null); void load(); }} />}
    </div>
  );
}
