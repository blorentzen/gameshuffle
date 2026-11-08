"use client";

/**
 * Admin ▸ Shop ▸ Orders (order tracking picks 2026-11-08): what needs you comes first (a problem report, a question,
 * a new address, Printful trouble, late, a box that came back, no delivery); the stat cards switch between that and
 * where orders are (being made, on the way, delivered), and a search looks at every order. Each row opens the order's
 * own page, /admin/shop/GS-1021.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Select, StatCard, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconAlertTriangle, IconCircleCheck, IconPackage, IconRefresh, IconTruck } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { formatPrice } from "@/lib/store/copy";
import type { QueueFilter, QueueRow, QueueSummary } from "@/lib/store/manage";
import { when } from "./orderBits";

const EMPTY: Record<QueueFilter, string> = {
  needs: "Nothing needs you. Orders move on their own: Printful makes and ships them, and buyers hear from us at every step.",
  making: "No orders being made.", moving: "Nothing on the way.", delivered: "No deliveries yet.", closed: "No refunded or canceled orders.", all: "No orders yet.",
};

export function ShopOrdersQueue() {
  const [filter, setFilter] = useState<QueueFilter>("needs");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<QueueRow[] | null>(null);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const d = await fetch(`/api/admin/shop/orders?queue=${filter}&q=${encodeURIComponent(q)}&summary=1`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    setOrders(d?.ok ? d.orders : []);
    if (d?.summary) setSummary(d.summary);
  }, [filter, q]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const stat = (id: QueueFilter, label: string, value: number, source: string, icon: React.ReactNode, alert = false) => (
    <button type="button" className={`shop-queue__stat${filter === id ? " is-on" : ""}${alert && value > 0 ? " is-alert" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
      <StatCard label={label} value={String(value)} source={source} icon={icon} variant={filter === id ? "accent" : "default"} />
    </button>
  );

  return (
    <div className="account-card admin-screen shop-admin">
      <AdminHeader
        title="Orders"
        intro="What needs you comes first. The rest moves on its own: Printful makes and ships each order, and the buyer hears from us at every step."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} onClick={() => void load()}>Refresh</Button>}
      />
      {summary && (
        <AdminStats label="Orders at a glance">
          {stat("needs", "Needs you", summary.needs, summary.requests ? `${summary.requests} from buyers` : "Nothing from buyers", <IconAlertTriangle size={20} />, true)}
          {stat("making", "Being made", summary.making, summary.oldestShipBy ? `Oldest ships by ${summary.oldestShipBy}` : "Nothing waiting", <IconPackage size={20} />)}
          {stat("moving", "On the way", summary.moving, "Shipped, not delivered yet", <IconTruck size={20} />)}
          {stat("delivered", "Delivered, 30 days", summary.delivered30, `${formatPrice(summary.sales30)} sold in 30 days`, <IconCircleCheck size={20} />)}
        </AdminStats>
      )}
      <div className="admin-filters">
        <Input fullWidth floatingLabel="Search all orders: number, email or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select floatingLabel="Show" value={filter} onChange={(v) => setFilter(String(v) as QueueFilter)}
          options={[{ value: "needs", label: "Needs you" }, { value: "making", label: "Being made" }, { value: "moving", label: "On the way" }, { value: "delivered", label: "Delivered" }, { value: "closed", label: "Refunded and canceled" }, { value: "all", label: "All orders" }]} />
      </div>
      {orders === null ? <LoadingLines label="Loading" /> : (
        <AdminTable label="Orders">
          <Table variant="striped" hoverable dense>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead><TableHead>Items</TableHead><TableHead>Where it is</TableHead><TableHead>Needs</TableHead><TableHead align="right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow><TableCell colSpan={5}><TableEmpty title={q ? "No orders match that search" : filter === "needs" ? "All clear" : "No orders here"} description={q ? undefined : EMPTY[filter]} /></TableCell></TableRow>
              ) : orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/shop/${o.code}`} className="admin-table__link">{o.code}</Link>
                    <span className="admin-table__sub">{o.name ?? "No name"}{o.state ? ` · ${o.state}` : ""} · {when(o.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="shop-queue__thumbs">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                      {o.images.length ? o.images.map((u) => <img key={u} src={u} alt="" width={36} height={36} />) : <span className="admin-table__sub">{o.itemCount} {o.itemCount === 1 ? "item" : "items"}</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {o.stage !== "closed" && <span className="shop-queue__dots" aria-hidden="true">{[0, 1, 2, 3].map((k) => <i key={k} className={k < o.dots ? "d" : k === o.dots ? "n" : ""} />)}</span>}
                    <span className="shop-queue__where">{o.stageLine}</span>
                  </TableCell>
                  <TableCell>
                    {o.needs.length ? (
                      <span className="shop-queue__needs">{o.needs.map((n, k) => <span key={k} className={`shop-need shop-need--${n.tone}`}>{n.text}</span>)}</span>
                    ) : <span className="admin-table__sub">Nothing</span>}
                  </TableCell>
                  <TableCell align="right" className="admin-num">{formatPrice(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </div>
  );
}
