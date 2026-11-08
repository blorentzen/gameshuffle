/**
 * /shop/orders/GS-1005: one order, for the buyer (order tracking picks 2026-11-08). Where it is (a tracker with dates
 * and the arrival window), each box with its carrier's latest steps and a Track button, what was ordered with
 * pictures, "Need something?" (report a problem, fix the address before it ships, ask), the requests and our replies,
 * then the address and the receipt. Visible to the account that placed it (or whose confirmed email it used), to a
 * browser that unlocked it (lookup code or the email link, signed cookie), and to staff. Anyone else is sent to the
 * lookup form with the number filled in, which says nothing about whether the order exists.
 */

import { PrintButton } from "@/components/ui/PrintButton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { IconTruck } from "@tabler/icons-react";
import { parseOrderNumber } from "@/lib/store/access";
import { customerOrderView } from "@/lib/store/lookup";
import { orderForViewer } from "@/lib/store/orderViewer";
import { formatPrice, shopCopy } from "@/lib/store/copy";
import { ShopAccountPrompt } from "@/components/store/ShopAccountPrompt";
import { OrderSteps } from "@/components/store/order/OrderSteps";
import { OrderHelp } from "@/components/store/order/OrderHelp";
import { OrderRequests } from "@/components/store/order/OrderRequests";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

const copy = shopCopy();
const CHIP = { making: "blue", shipped: "green", delivered: "green", closed: "grey" } as const;

export default async function ShopOrderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const n = parseOrderNumber(code);
  if (!n) redirect("/shop/orders");
  const lookup = `/shop/orders?order=${encodeURIComponent(`GS-${n}`)}`;
  const who = await orderForViewer(code);
  if (!who) redirect(lookup);
  const view = await customerOrderView(who.order.id);
  if (!view) redirect(lookup);
  const anyFinalSale = view.items.some((i) => i.finalSale);

  return (
    <main className="shop-page shop-thanks">
      <Container>
        <div className="shop-thanks__card order-page">
          <section className="order-sec order-top" aria-labelledby="order-title">
            <div className="order-top__row">
              <span className="order-code">Order {view.code} · placed {view.placedLabel}</span>
              <span className={`order-chip order-chip--${CHIP[view.stage]}`}>{view.stageLabel}</span>
            </div>
            <h1 id="order-title" className="order-big">{view.headline}</h1>
            <p className="order-lede">{view.lede}</p>
            {view.status === "paid" && view.afterCutoff && <p className="order-lede">This order will arrive after Christmas.</p>}
            <OrderSteps steps={view.steps} />
          </section>

          {view.boxes.length > 0 && (
            <section className="order-sec" aria-labelledby="order-boxes">
              <h2 id="order-boxes" className="order-h">{view.boxes.length > 1 ? "Your boxes" : "Your box"}</h2>
              <div className="order-boxes">
                {view.boxes.map((b) => (
                  <div key={b.id} className={`order-box order-box--${b.status}`}>
                    <div className="order-box__top">
                      <span><b>{b.label}</b>{b.carrier ? ` · ${b.carrier}` : ""}</span>
                      <span className="order-box__status">{b.statusLine}</span>
                    </div>
                    {b.events.length > 0 && (
                      <ol className="order-box__events" aria-label={`Latest from ${b.carrier ?? "the carrier"}`}>
                        {b.events.map((e, k) => <li key={k}>{e.text}<span>{e.at}</span></li>)}
                      </ol>
                    )}
                    <div className="order-box__foot">
                      <span className="order-thumbs">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                        {b.items.map((x, k) => (x.image ? <img key={k} src={x.image} alt={x.name} width={44} height={44} /> : <span key={k} className="order-thumbs__name">{x.quantity > 1 ? `${x.quantity} × ` : ""}{x.name}</span>))}
                      </span>
                      {b.trackingUrl && b.status !== "delivered" && (
                        <a className="empac-button empac-button--primary empac-button--medium order-btn" href={b.trackingUrl} target="_blank" rel="noopener noreferrer">
                          <IconTruck size={20} aria-hidden="true" /><span>{view.boxes.length > 1 ? `Track ${b.label.split(" of ")[0].toLowerCase()}` : "Track your package"}</span>
                        </a>
                      )}
                    </div>
                    {b.tracking && <p className="order-box__num">Tracking number {b.tracking}</p>}
                  </div>
                ))}
                {view.waiting.length > 0 && (
                  <div className="order-box order-box--waiting">
                    <div className="order-box__top"><b>Still to ship</b><span className="order-box__status">Ships separately</span></div>
                    <span className="order-thumbs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {view.waiting.map((x, k) => (x.image ? <img key={k} src={x.image} alt={x.name} width={44} height={44} /> : <span key={k} className="order-thumbs__name">{x.name}</span>))}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="order-sec" aria-labelledby="order-items">
            <h2 id="order-items" className="order-h">What you ordered</h2>
            <ul className="order-items">
              {view.items.map((i) => (
                <li key={i.sku} className="order-item">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                  {i.image ? <img src={i.image} alt="" width={64} height={64} /> : <span className="order-item__ph" aria-hidden="true" />}
                  <span className="order-item__text"><b>{i.quantity > 1 ? `${i.quantity} × ` : ""}{i.name}</b>{i.detail && <small>{i.detail}</small>}</span>
                  <span className="order-item__price">{formatPrice(i.unitAmount * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="order-totals">
              <div><dt>{copy.cart.subtotal}</dt><dd>{formatPrice(view.amountSubtotal)}</dd></div>
              <div><dt>{copy.cart.shipping}</dt><dd className={view.amountShipping === 0 ? "order-totals__free" : undefined}>{copy.cart.shippingValue(view.amountShipping)}</dd></div>
              {view.amountTax > 0 && <div><dt>Sales tax</dt><dd>{formatPrice(view.amountTax)}</dd></div>}
              <div className="order-totals__total"><dt>Total</dt><dd>{formatPrice(view.amountTotal)}</dd></div>
              {view.amountRefunded > 0 && view.status !== "refunded" && view.status !== "canceled" && (
                <div><dt>Refunded</dt><dd>−{formatPrice(view.amountRefunded)}</dd></div>
              )}
            </dl>
          </section>

          <OrderRequests code={view.code} requests={view.requests} />
          <OrderHelp code={view.code} items={view.items.map((i) => ({ sku: i.sku, name: i.name, detail: i.detail, image: i.image }))} can={view.can} shipTo={view.shipTo} />

          {view.shipTo.line1 && (
            <section className="order-sec" aria-labelledby="order-ship">
              <h2 id="order-ship" className="order-h">Shipping to</h2>
              <address className="shop-order__address">
                {view.shipTo.name}<br />{view.shipTo.line1}{view.shipTo.line2 ? <><br />{view.shipTo.line2}</> : null}<br />{view.shipTo.city}, {view.shipTo.state} {view.shipTo.postal}
              </address>
            </section>
          )}

          {view.digitalLists.length > 0 && (
            <section className="order-sec" aria-labelledby="order-lists">
              <h2 id="order-lists" className="order-h">Digital lists</h2>
              <ul className="shop-order__lists">
                {view.digitalLists.map((l) => <li key={l.id}><Link href={l.url}>{l.title}</Link></li>)}
              </ul>
            </section>
          )}

          {(who.owner || !who.signedIn) && <ShopAccountPrompt member={who.owner} />}

          <section className="order-sec order-foot">
            {anyFinalSale && <p className="shop-cart__note">{copy.cart.finalSale}</p>}
            <div className="shop-thanks__actions">
              <PrintButton label="Print receipt" className="shop-order__print" />
              <Link href="/shop/policies">{copy.shipping.policiesLink}</Link>
              <Link href="/shop">Back to the shop</Link>
            </div>
          </section>
        </div>
      </Container>
    </main>
  );
}
