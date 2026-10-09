/**
 * /shop/orders/GS-1005: one order, for the buyer. Visible to the account that
 * placed it (or whose confirmed email it used), to a browser that unlocked it
 * (lookup code or the email link, signed cookie), and to staff. Anyone else is
 * sent to the lookup form with the number filled in, which says nothing about
 * whether the order exists.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Badge, Button, Container, Timeline } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ORDER_COOKIE, ordersInCookie, parseOrderNumber } from "@/lib/store/access";
import { canViewOrder, customerOrderView, orderByNumber } from "@/lib/store/lookup";
import { formatPrice, shopCopy } from "@/lib/store/copy";
import { SHOP } from "@/lib/store/config";
import { ShopAccountPrompt } from "@/components/store/ShopAccountPrompt";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

const copy = shopCopy();
const STATUS = {
  paid: { label: "Getting it ready", variant: "info" },
  shipped: { label: "On the way", variant: "success" },
  refunded: { label: "Refunded", variant: "default" },
  canceled: { label: "Canceled", variant: "default" },
} as const;
const TIMELINE_STATUS: Record<string, "primary" | "success" | "warning" | "default" | "info"> = { placed: "primary", shipped: "success", refunded: "warning", canceled: "warning", reshipped: "info" };

export default async function ShopOrderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const n = parseOrderNumber(code);
  const lookup = `/shop/orders?order=${encodeURIComponent(n ? `GS-${n}` : "")}`;
  if (!n) redirect("/shop/orders");

  const order = await orderByNumber(n);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const jar = await cookies();
  // The viewer's own account owns it (placed signed in, or with its confirmed email).
  const owner = !!order && !!user && (order.user_id === user.id || (!!user.email_confirmed_at && !!order.email && user.email?.toLowerCase() === order.email.toLowerCase()));
  let allowed = !!order && canViewOrder(order, {
    userId: user?.id, email: user?.email ?? null, emailConfirmed: !!user?.email_confirmed_at, cookieIds: ordersInCookie(jar.get(ORDER_COOKIE)?.value),
  });
  if (order && !allowed && user) {
    const { data: me } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
    allowed = me?.role === "staff" || me?.role === "admin";
  }
  if (!order || !allowed) redirect(lookup);

  const view = await customerOrderView(order.id);
  if (!view) redirect(lookup);
  const status = STATUS[view.status];
  const cantShip = view.refundReason === "cant_ship_address";
  const anyFinalSale = view.items.some((i) => i.finalSale);

  return (
    <main className="shop-page shop-thanks">
      <Container>
        <div className="shop-thanks__card shop-order">
          <div className="shop-order__head">
            <h1 className="shop-h2">Order {view.code}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="shop-order__lede">
            {view.status === "paid" && <>Placed {view.placedLabel}. We&apos;ll ship it by <strong>{view.shipByLabel}</strong> and email you a tracking link.</>}
            {view.status === "shipped" && <>Shipped {view.shippedLabel} by USPS Ground Advantage. Most orders arrive in {SHOP.checkout.shipping_estimate_business_days.min} to {SHOP.checkout.shipping_estimate_business_days.max} business days.</>}
            {view.status === "refunded" && <>We refunded this order in full. It can take 5 to 10 business days to show on your statement.</>}
            {view.status === "canceled" && (cantShip ? <>{copy.errors.military} We refunded it in full.</> : <>This order was canceled and refunded in full.</>)}
          </p>
          {view.status === "paid" && view.afterCutoff && <p>This order will arrive after Christmas.</p>}
          {view.trackingUrl && (
            <div className="shop-order__tracking">
              <span>Tracking: <strong>{view.tracking}</strong></span>
              <a href={view.trackingUrl} target="_blank" rel="noopener noreferrer"><Button variant="primary" size="small">Track with USPS</Button></a>
            </div>
          )}

          <section className="shop-thanks__summary" aria-labelledby="order-items">
            <h2 id="order-items" className="shop-thanks__h">What you ordered</h2>
            <ul className="shop-thanks__items">
              {view.items.map((i) => (
                <li key={i.sku}><span>{i.quantity > 1 ? `${i.quantity} x ` : ""}{i.name}</span><span>{formatPrice(i.unitAmount * i.quantity)}</span></li>
              ))}
            </ul>
            <dl className="shop-cart__totals">
              <div><dt>{copy.cart.subtotal}</dt><dd>{formatPrice(view.amountSubtotal)}</dd></div>
              <div><dt>{copy.cart.shipping}</dt><dd>{copy.cart.shippingValue(view.amountShipping)}</dd></div>
              {view.amountTax > 0 && <div><dt>Sales tax</dt><dd>{formatPrice(view.amountTax)}</dd></div>}
              <div><dt>Total</dt><dd>{formatPrice(view.amountTotal)}</dd></div>
              {view.amountRefunded > 0 && view.status !== "refunded" && view.status !== "canceled" && (
                <div><dt>Refunded</dt><dd>−{formatPrice(view.amountRefunded)}</dd></div>
              )}
            </dl>
          </section>

          {view.shipTo.line1 && (
            <section className="shop-thanks__summary" aria-labelledby="order-ship">
              <h2 id="order-ship" className="shop-thanks__h">Shipping to</h2>
              <address className="shop-order__address">
                {view.shipTo.name}<br />{view.shipTo.line1}{view.shipTo.line2 ? <><br />{view.shipTo.line2}</> : null}<br />{view.shipTo.city}, {view.shipTo.state} {view.shipTo.postal}
              </address>
            </section>
          )}

          <section className="shop-thanks__summary" aria-labelledby="order-history">
            <h2 id="order-history" className="shop-thanks__h">History</h2>
            <Timeline variant="compact" items={[...view.timeline].reverse().map((e, i) => ({
              id: i, title: e.label, timestamp: e.atLabel, status: TIMELINE_STATUS[e.kind] ?? "default",
            }))} />
          </section>

          {view.digitalLists.length > 0 && (
            <section className="shop-thanks__summary" aria-labelledby="order-lists">
              <h2 id="order-lists" className="shop-thanks__h">Digital lists</h2>
              <ul className="shop-order__lists">
                {view.digitalLists.map((l) => <li key={l.id}><Link href={l.url}>{l.title}</Link></li>)}
              </ul>
            </section>
          )}

          {(owner || !user) && <ShopAccountPrompt member={owner} />}

          {anyFinalSale && <p className="shop-cart__note">{copy.cart.finalSale}</p>}
          <p className="shop-cart__note">Questions about this order? Email {copy.support} with your order number.</p>
          <div className="shop-thanks__actions">
            <Link href="/shop"><Button variant="secondary">Back to the shop</Button></Link>
            <Link href="/shop/policies">{copy.shipping.policiesLink}</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
