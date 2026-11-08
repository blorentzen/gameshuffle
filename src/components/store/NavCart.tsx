"use client";

/**
 * The header's bag (shop picks 2026-11-08): beside the bell on desktop and beside the menu button on phones, once
 * visitors can see the shop. It counts what's in this browser's cart and opens it: in place on a page with the cart
 * (the shop, a product), else on /shop.
 */

import { useRouter } from "next/navigation";
import { IconShoppingBag } from "@tabler/icons-react";
import { openCartHere, useCartCount } from "./cartCount";

export function NavCart() {
  const count = useCartCount();
  const router = useRouter();
  const label = count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart";
  return (
    <button type="button" className="comms-icon nav-cart" aria-label={label} onClick={() => { if (!openCartHere()) router.push("/shop?cart=1"); }}>
      <IconShoppingBag aria-hidden="true" />
      {count > 0 && <span className="comms-icon__badge comms-icon__badge--cart" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </button>
  );
}
