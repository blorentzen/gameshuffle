/**
 * /shop/thanks?session_id=…: back from Stripe Checkout. Reads the session on
 * the server and makes the order if the webhook hasn't yet (same idempotent
 * path), so the order number is always there. Clears the browser cart.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { fulfilShopSession } from "@/lib/store/orders";
import { formatPrice, shopCopy } from "@/lib/store/copy";
import { ClearShopCart } from "@/components/store/ClearShopCart";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thanks for your order", robots: { index: false, follow: false } };

const copy = shopCopy();

export default async function ShopThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  let failure: string | null = null;
  const result = sessionId ? await fulfilShopSession(sessionId).catch((err) => { console.error("[shop/thanks]", err); failure = err instanceof Error ? err.message : String(err); return null; }) : null;
  if (result && !result.ok) failure = result.reason;
  const order = result?.ok ? result.order : null;

  return (
    <main className="shop-page shop-thanks">
      <Container>
        <div className="shop-thanks__card">
          {result && !result.ok && result.reason === "not_paid" ? (
            <>
              <h1 className="shop-h2">Your payment is processing</h1>
              <p>Some payment methods take a little while to clear. We&apos;ll email you your order number as soon as it does.</p>
            </>
          ) : !order ? (
            <>
              <h1 className="shop-h2">We couldn&apos;t find that order</h1>
              <p>If you paid, your order is safe and we&apos;ll email you about it. Questions? Email {copy.support}.</p>
              {process.env.NODE_ENV !== "production" && failure && <p className="shop-cart__note">Dev only: {failure}</p>}
            </>
          ) : order.status === "canceled" ? (
            <>
              <h1 className="shop-h2">We couldn&apos;t ship order {order.code}</h1>
              <p>{copy.errors.military}</p>
              <p>We&apos;ve refunded it in full and sent you an email.</p>
            </>
          ) : (
            <>
              <ClearShopCart />
              <h1 className="shop-h2">{`Order ${order.code} is in`}</h1>
              <p>We&apos;ll ship it within 2 business days and email you a tracking link when it&apos;s on the way.</p>
              <p className="shop-thanks__shipby">Ships by {order.shipByLabel}</p>
              {order.afterCutoff && <p>This order will arrive after Christmas.</p>}
              <section className="shop-thanks__summary" aria-labelledby="thanks-items">
                <h2 id="thanks-items" className="shop-thanks__h">What you ordered</h2>
                <ul className="shop-thanks__items">
                  {order.items.map((i) => (
                    <li key={i.sku}><span>{i.quantity > 1 ? `${i.quantity} x ` : ""}{i.name}</span><span>{formatPrice(i.unitAmount * i.quantity)}</span></li>
                  ))}
                </ul>
                <dl className="shop-cart__totals">
                  <div><dt>{copy.cart.subtotal}</dt><dd>{formatPrice(order.amountSubtotal)}</dd></div>
                  <div><dt>{copy.cart.shipping}</dt><dd>{copy.cart.shippingValue(order.amountShipping)}</dd></div>
                  {order.amountTax > 0 && <div><dt>Sales tax</dt><dd>{formatPrice(order.amountTax)}</dd></div>}
                  <div><dt>Total</dt><dd>{formatPrice(order.amountTotal)}</dd></div>
                </dl>
                {order.shipName && <p className="shop-cart__note">Shipping to {[order.shipName, order.shipCity, order.shipState].filter(Boolean).join(", ")}</p>}
              </section>
            </>
          )}
          <div className="shop-thanks__actions">
            <Link href="/shop"><Button variant="primary">Back to the shop</Button></Link>
            <Link href="/shop/policies">{copy.shipping.policiesLink}</Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
