/**
 * /shop/policies: shipping and returns for GameShuffle merch (since 2026-11-03;
 * the card packs, with their own condition and final-sale rules, are on hold).
 * Made to order and shipped by Printful: $4.99, free from $50, US only;
 * misprints and damage made right (pick 7A in the merch picks), reported with
 * a photo within 30 days, which is what Printful needs to reprint. Shipping
 * numbers and the support email come from the shop config. Linked from /shop,
 * Checkout and every order email. Hidden with the shop until `shop_open` is on
 * (staff always see it).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { SHOP } from "@/lib/store/config";
import { formatPrice } from "@/lib/store/copy";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isStaffRequest } from "@/lib/auth/raw";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shipping and returns",
  description: "How GameShuffle merch is made and shipped, delivery, returns, misprints and damage, and sales tax.",
  alternates: { canonical: "https://www.gameshuffle.co/shop/policies" },
};

export default async function ShopPoliciesPage() {
  const [open, staff] = await Promise.all([getPlatformFlag("shop_open", false), isStaffRequest()]);
  if (!open && !staff) notFound();

  const support = SHOP.contact.support_email;
  const days = SHOP.shipping.ship_within_business_days;
  const est = SHOP.checkout.shipping_estimate_business_days;
  const threshold = formatPrice(SHOP.shipping.rate.free_threshold_cents).replace(/\.00$/, "");
  const standard = formatPrice(SHOP.shipping.rate.standard_cents);

  const sections: LegalSection[] = [
    {
      id: "made-to-order",
      title: "Made to order",
      content: <p>Everything in the shop is printed or stitched when you order it, by our print partner. Most orders ship within {days} business days; embroidered pieces take the longest.</p>,
    },
    {
      id: "shipping",
      title: "Shipping",
      content: (
        <>
          <p>Shipping is free on orders of {threshold} or more, and {standard} on orders under {threshold}. We ship to all 50 states and DC.</p>
          <ul>
            <li>Every order ships with tracking. We email the tracking link when it&apos;s on the way.</li>
            <li>Most orders arrive {est.min} to {est.max} business days after you order. Checkout shows the estimate for your order.</li>
            <li>We can&apos;t ship outside the US, to US territories, or to APO, FPO or DPO addresses yet.</li>
          </ul>
        </>
      ),
    },
    {
      id: "orders-that-dont-arrive",
      title: "Orders that don't arrive",
      content: <p>If tracking shows delivered but you can&apos;t find the package, check with neighbors and your post office, then email us and we&apos;ll help. If tracking hasn&apos;t moved in a week, email us and we&apos;ll sort it out.</p>,
    },
    {
      id: "returns",
      title: "Returns",
      content: (
        <>
          <p>Because each piece is made for you, we can&apos;t take returns or exchanges for size or a change of mind. Each product page has a size guide with measurements.</p>
          <p>If something arrives misprinted, damaged or not what you ordered, email us within 30 days of delivery with a photo, and choose a replacement or a refund. The photo lets our print partner remake it.</p>
        </>
      ),
    },
    {
      id: "sales-tax",
      title: "Sales tax",
      content: <p>We collect sales tax where the law requires it. It shows at checkout before you pay.</p>,
    },
    {
      id: "contact",
      title: "Contact",
      content: (
        <>
          <p><a href={`mailto:${support}`}>{support}</a></p>
          <p><Link href="/shop">Back to the shop</Link></p>
        </>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="GameShuffle merch"
      title="Shipping and returns"
      sections={sections}
      current="shop-policies"
    />
  );
}
