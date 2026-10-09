"use client";

/**
 * My Stuff ▸ Shop Orders: GameShuffle Shop orders placed with this account,
 * or with its confirmed email at checkout. Each opens the order page (status,
 * tracking, history). Orders placed with another email are found with the
 * lookup form.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@empac/cascadeds";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { formatPrice } from "@/lib/store/copy";
import type { AccountOrderSummary } from "@/lib/store/lookup";

const STATUS = {
  paid: { label: "Getting it ready", variant: "info" },
  shipped: { label: "On the way", variant: "success" },
  refunded: { label: "Refunded", variant: "default" },
  canceled: { label: "Canceled", variant: "default" },
} as const;

export function ShopOrdersTab() {
  const [orders, setOrders] = useState<AccountOrderSummary[] | null>(null);
  useEffect(() => {
    fetch("/api/account/shop-orders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { orders?: AccountOrderSummary[] } | null) => setOrders(j?.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  if (orders === null) return <LoadingLines label="Loading" />;
  return (
    <div className="account-card">
      <h2 className="account-card__title">Shop Orders</h2>
      {orders.length === 0 ? (
        <p className="account-card__hint">
          Orders from the GameShuffle Shop show up here when you check out signed in or with this account&apos;s email.
          Used a different email? <Link href="/shop/orders">Find an order</Link>.
        </p>
      ) : (
        <>
          <p className="account-card__hint">Open an order for tracking and its history. Used a different email? <Link href="/shop/orders">Find an order</Link>.</p>
          <div className="shop-orders-list">
            {orders.map((o) => (
              <Card key={o.id} padding="medium">
                <div className="shop-orders-list__row">
                  <div className="shop-orders-list__main">
                    <Link href={`/shop/orders/${o.code}`} className="shop-orders-list__code">Order {o.code}</Link>
                    <p className="shop-orders-list__meta">{o.placedLabel} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {formatPrice(o.total)}</p>
                  </div>
                  <div className="shop-orders-list__side">
                    <Badge variant={STATUS[o.status].variant} size="small">{STATUS[o.status].label}</Badge>
                    <Link href={`/shop/orders/${o.code}`}><Button size="small" variant="secondary">View order</Button></Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
