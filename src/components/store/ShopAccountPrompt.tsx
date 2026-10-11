/**
 * "Keep your orders in one place" (Britton, 2026-10-09): on the order page and
 * the thanks page, a buyer without an account gets a free signup that lands on
 * My Stuff ▸ Shop Orders, where every order with their confirmed email shows
 * up. A buyer whose account owns the order gets a link there instead.
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";

const MY_ORDERS = "/account/stuff?tab=orders";
const next = encodeURIComponent(MY_ORDERS);

export function ShopAccountPrompt({ member }: { member: boolean }) {
  if (member) {
    return (
      <p className="shop-account shop-account--member">
        This order is in your GameShuffle account. <Link href={MY_ORDERS}>See it under My Stuff</Link>
      </p>
    );
  }
  return (
    <section className="shop-account" aria-labelledby="shop-account-title">
      <h2 id="shop-account-title" className="shop-thanks__h">Keep your orders in one place</h2>
      <p>Make a free GameShuffle account with the email you used for this order, and every order shows up under My Stuff with its tracking and digital lists.</p>
      <div className="shop-account__actions">
        <Link href={`/signup?redirect=${next}`}><Button variant="primary">Create a free account</Button></Link>
        <Link href={`/login?redirect=${next}`}><Button variant="secondary">Sign in</Button></Link>
      </div>
    </section>
  );
}
