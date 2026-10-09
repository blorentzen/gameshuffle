/**
 * /shop/policies: shipping, returns and card condition, verbatim from
 * docs/specs/shop/shop-copy.md, with the cutoff dates and support email from
 * the shop config. Linked from /shop, Checkout and every order email. Hidden
 * with the shop until `shop_open` is on (staff always see it).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { SHOP } from "@/lib/store/config";
import { shopDate } from "@/lib/store/copy";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isStaffRequest } from "@/lib/auth/raw";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shipping, returns and card condition",
  description: "How the GameShuffle Shop ships, what happens if mail doesn't arrive, returns, damage in transit, card condition and sales tax.",
  alternates: { canonical: "https://www.gameshuffle.co/shop/policies" },
};

export default async function ShopPoliciesPage() {
  const [open, staff] = await Promise.all([getPlatformFlag("shop_open", false), isStaffRequest()]);
  if (!open && !staff) notFound();

  const cutoff = shopDate(SHOP.holiday.cutoff_lower48, { weekday: true });
  const cutoffAkHi = shopDate(SHOP.holiday.cutoff_ak_hi, { weekday: true });
  const support = SHOP.contact.support_email;
  const days = SHOP.shipping.ship_within_business_days;
  const reship = SHOP.shipping.reship_after_days;

  const sections: LegalSection[] = [
    {
      id: "shipping",
      title: "Shipping",
      content: (
        <>
          <p>We ship from Washington State within {days} business days of your order (Pacific Time, weekdays). Shipping is free to all 50 states and DC.</p>
          <ul>
            <li>Bundles ship by USPS Ground Advantage with tracking.</li>
            <li>Single packs ship by USPS First-Class Mail without tracking. If you order {SHOP.shipping.flat_max_singles + 1} or more single packs, we ship them tracked.</li>
            <li>Most orders arrive in {SHOP.checkout.shipping_estimate_business_days.min} to {SHOP.checkout.shipping_estimate_business_days.max} business days after they ship.</li>
            <li>We can&apos;t ship outside the US, to US territories, or to APO, FPO or DPO addresses yet.</li>
          </ul>
        </>
      ),
    },
    {
      id: "christmas-delivery",
      title: "Christmas delivery",
      content: <p>Order by {cutoff} for delivery by Dec 25 in the lower 48 states, or by {cutoffAkHi} for Alaska and Hawaii. These dates give us time to ship ahead of USPS&apos;s recommended holiday deadlines. USPS doesn&apos;t guarantee holiday delivery, so neither can we.</p>,
    },
    {
      id: "mail-that-doesnt-arrive",
      title: "Mail that doesn't arrive",
      content: <p>If an untracked order hasn&apos;t arrived {reship} days after we mail it, email us and we&apos;ll send it again, once per order. If a tracked order shows delivered but you can&apos;t find it, check with neighbors and your post office, then email us and we&apos;ll help.</p>,
    },
    {
      id: "returns",
      title: "Returns",
      content: <p>Unopened packs and sets can be returned within 14 days of delivery for a refund of the item price. Email us first and we&apos;ll send the return address. Opened packs can&apos;t be returned.</p>,
    },
    {
      id: "damaged-in-transit",
      title: "Damaged in transit",
      content: <p>If something arrives damaged, email a photo within 7 days and we&apos;ll replace it or refund it.</p>,
    },
    {
      id: "card-condition",
      title: "Card condition",
      content: <p>Every card is a real Pokémon TCG card, sorted and checked by hand. Cards in packs are near mint: no creases, bends or heavy wear. Each listing says exactly what&apos;s guaranteed in the pack. Beyond that, what you get is the luck of the pack, and there&apos;s no guaranteed value.</p>,
    },
    {
      id: "sales-tax",
      title: "Sales tax",
      content: <p>We collect sales tax on orders shipped to Washington State addresses. It shows at checkout.</p>,
    },
    {
      id: "contact",
      title: "Contact",
      content: (
        <>
          <p><a href={`mailto:${support}`}>{support}</a></p>
          <p>GameShuffle is not affiliated with or endorsed by The Pokémon Company or Nintendo. Pokémon is a trademark of its owners.</p>
          <p><Link href="/shop">Back to the shop</Link></p>
        </>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="GameShuffle Shop"
      title="Shipping, returns and card condition"
      sections={sections}
      current="shop-policies"
    />
  );
}
