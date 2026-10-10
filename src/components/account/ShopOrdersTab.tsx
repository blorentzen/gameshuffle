"use client";

/**
 * My Stuff ▸ Purchases ▸ Shop orders: GameShuffle Shop orders placed with this
 * account, or with its confirmed email at checkout. Each opens the order page
 * (status, tracking, history). Orders placed with another email are found with
 * the lookup form.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconShoppingBag } from "@tabler/icons-react";
import { AdminScreen, AdminTable } from "@/components/account/admin/AdminKit";
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
  const router = useRouter();
  const [orders, setOrders] = useState<AccountOrderSummary[] | null>(null);
  useEffect(() => {
    fetch("/api/account/shop-orders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { orders?: AccountOrderSummary[] } | null) => setOrders(j?.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  const find = <>Used a different email? <Link href="/shop/orders">Find an order</Link>.</>;
  if (orders === null) return <AdminScreen title="Shop orders"><LoadingLines label="Loading your orders" /></AdminScreen>;

  return (
    <AdminScreen title="Shop orders" intro={orders.length ? <>Open an order for tracking and its history. {find}</> : undefined}>
      {orders.length === 0 ? (
        <EmptyState
          variant="bordered"
          icon={<IconShoppingBag size={40} stroke={1.4} />}
          title="No shop orders yet"
          description="Orders from the GameShuffle Shop show up here when you check out signed in or with this account's email."
          action={
            <div className="stuff-empty-actions">
              <Button variant="secondary" onClick={() => router.push("/shop")}>Visit the shop</Button>
              <Button variant="ghost" onClick={() => router.push("/shop/orders")}>Find an order</Button>
            </div>
          }
        />
      ) : (
        <AdminTable label="Shop orders">
          <Table variant="striped" dense>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead align="right">Items</TableHead>
                <TableHead align="right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell><Link href={`/shop/orders/${o.code}`} className="stuff-cell__title">{o.code}</Link></TableCell>
                  <TableCell>{o.placedLabel}</TableCell>
                  <TableCell align="right" className="admin-num">{o.itemCount}</TableCell>
                  <TableCell align="right" className="admin-num">{formatPrice(o.total)}</TableCell>
                  <TableCell><Badge variant={STATUS[o.status].variant} size="small">{STATUS[o.status].label}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminScreen>
  );
}
