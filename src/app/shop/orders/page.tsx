/**
 * /shop/orders: find an order without an account (order number + the email or
 * phone from checkout, then a one-time code). Not hidden with the shop: anyone
 * who bought something can always reach their order. `?order=` prefills the
 * number (the order page sends people here when this browser can't see it);
 * `?link=expired` comes from an old email link.
 */

import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { OrderLookup } from "@/components/store/OrderLookup";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Find your order",
  description: "Look up a GameShuffle Shop order with its number and the email or phone you used at checkout.",
  robots: { index: false, follow: true },
};

export default async function ShopOrderLookupPage({ searchParams }: { searchParams: Promise<{ order?: string; link?: string }> }) {
  const { order, link } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const initialOrder = /^(gs-?)?\d{3,9}$/i.test(order ?? "") ? order!.toUpperCase() : "";
  return (
    <main className="shop-page shop-thanks">
      <Container>
        <div className="shop-thanks__card shop-lookup__card">
          <h1 className="shop-h2">Find your order</h1>
          <p>Enter your order number and the email or phone you used at checkout. We&apos;ll send you a code to open it.</p>
          <OrderLookup initialOrder={initialOrder} linkExpired={link === "expired"} signedIn={!!user} />
        </div>
      </Container>
    </main>
  );
}
