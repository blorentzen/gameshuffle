"use client";

import { useEffect } from "react";

/** After a successful order, empty the cart kept in this browser. */
export function ClearShopCart() {
  useEffect(() => {
    try { window.localStorage.removeItem("gs-shop-cart"); } catch { /* storage off: nothing to clear */ }
  }, []);
  return null;
}
