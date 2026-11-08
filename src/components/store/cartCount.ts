"use client";

/**
 * The shop cart outside the shop (the header's bag, picks 2026-11-08): how many things are in this browser's cart,
 * and a way to open it. The cart itself lives in ShopCart (localStorage `gs-shop-cart`); it announces each change
 * with CART_EVENT, and a page with a cart on it opens its drawer on CART_OPEN_EVENT. Anywhere else the bag goes to
 * /shop?cart=1, which opens it there.
 */

import { useSyncExternalStore } from "react";

export const CART_KEY = "gs-shop-cart";
export const CART_EVENT = "gs-shop-cart";
export const CART_OPEN_EVENT = "gs-shop-cart:open";

function readCount(): number {
  try {
    const lines = JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]") as unknown;
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((n: number, l: { quantity?: unknown }) => n + (Number.isInteger(l?.quantity) ? (l.quantity as number) : 0), 0);
  } catch {
    return 0;
  }
}

function subscribe(fn: () => void) {
  window.addEventListener(CART_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => { window.removeEventListener(CART_EVENT, fn); window.removeEventListener("storage", fn); };
}

/** Things in the cart; 0 on the server and before the browser has read it. */
export function useCartCount(): number {
  return useSyncExternalStore(subscribe, readCount, () => 0);
}

/** Opens the cart on this page if it has one (true), else false: go to /shop?cart=1. */
export function openCartHere(): boolean {
  const e = new CustomEvent(CART_OPEN_EVENT, { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}
