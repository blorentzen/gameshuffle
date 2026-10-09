/**
 * /shop/policies: shipping, returns and card condition, from
 * docs/specs/shop/shop-copy.md, with the cutoff dates, shipping rate and
 * support email from the shop config. Shipping and "Orders that don't arrive"
 * follow Britton's 2026-10-09 rule (every order tracked, $4.99 under $25);
 * "Returns and final sale" follows his same-day rule (Pokémon card products
 * are final sale). Linked from /shop, Checkout and every order email. Hidden
 * with the shop until `shop_open` is on (staff always see it).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { SHOP } from "@/lib/store/config";
import { formatPrice, shopDate } from "@/lib/store/copy";
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
  const threshold = formatPrice(SHOP.shipping.rate.free_threshold_cents).replace(/\.00$/, "");
  const standard = formatPrice(SHOP.shipping.rate.standard_cents);

  const sections: LegalSection[] = [
    {
      id: "shipping",
      title: "Shipping",
      content: (
        <>
          <p>We ship from Washington State within {days} business days of your order (Pacific Time, weekdays), to all 50 states and DC. Shipping is free on orders of {threshold} or more, and {standard} on orders under {threshold}.</p>
          <ul>
            <li>Every order ships by USPS Ground Advantage with tracking.</li>
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
      title: "Orders that don't arrive",
      content: <p>If your tracking shows delivered but you can&apos;t find the package, check with neighbors and your post office, then email us and we&apos;ll help. If tracking hasn&apos;t moved for {reship} days, email us and we&apos;ll sort it out.</p>,
    },
    {
      id: "returns",
      title: "Returns and final sale",
      content: (
        <>
          <p>Pokémon card products are final sale. Every pack and set has a guaranteed part (each listing says exactly what) and the luck of the pack, so we can&apos;t take returns or exchanges because of which Pikachu or hit you got.</p>
          <p>If something arrives damaged, or an order is missing something its listing guarantees, email us and we&apos;ll make it right (see below).</p>
        </>
      ),
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
