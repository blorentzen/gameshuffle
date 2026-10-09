"use client";

/**
 * The shop's cart: lines kept in this browser (localStorage, a per-visitor
 * convenience; nothing is held until checkout), a CDS Drawer to review it, and
 * the sticky Cart button. Quantities are capped at the lower of the product's
 * per-order limit and what's in stock. Check out sends the whole cart to
 * /api/shop/checkout, which checks stock, holds it and opens Stripe Checkout.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Drawer, IconButton } from "@empac/cascadeds";
import { IconMinus, IconPlus, IconShoppingCart } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { formatPrice, shopCopy } from "@/lib/store/copy";
import { shippingCents, toFreeShippingCents } from "@/lib/store/rules";
import { isFinalSale } from "@/lib/store/config";
import type { ShopProduct } from "@/lib/store/products";

const STORAGE_KEY = "gs-shop-cart";
const UTM_KEY = "gs-shop-utm";
const UTM_FIELDS = ["source", "medium", "campaign", "content"] as const;

/** Keep the visit's utm_* tags (from an entry link) for the checkout, so the order records where it came from. */
function rememberUtm() {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_FIELDS) { const v = q.get(`utm_${k}`); if (v) utm[k] = v.slice(0, 60); }
    if (Object.keys(utm).length) window.sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch { /* storage off: the order just won't carry tags */ }
}
function storedUtm(): Record<string, string> | undefined {
  try { const raw = window.sessionStorage.getItem(UTM_KEY); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
}

export interface CartLine { sku: string; quantity: number }

interface CartApi {
  lines: CartLine[];
  product: (sku: string) => ShopProduct | undefined;
  limit: (sku: string) => number;
  add: (sku: string, quantity?: number) => void;
  setQuantity: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  count: number;
  subtotalCents: number;
  products: ShopProduct[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartApi | null>(null);

export function useShopCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useShopCart outside ShopCartProvider");
  return ctx;
}

/** The most of one product a cart can hold: its per-order limit, or less if stock is short. */
export const lineLimit = (p: ShopProduct | undefined) => (p && p.onSale ? Math.max(0, Math.min(p.maxPerOrder, p.available)) : 0);

function readStored(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((l): l is CartLine => !!l && typeof l.sku === "string" && Number.isInteger(l.quantity)) : [];
  } catch {
    return [];
  }
}

export function ShopCartProvider({ products, children }: { products: ShopProduct[]; children: ReactNode }) {
  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isOpen, setOpen] = useState(false);

  const clamp = useCallback((list: CartLine[]) => list
    .map((l) => ({ sku: l.sku, quantity: Math.min(l.quantity, lineLimit(bySku.get(l.sku))) }))
    .filter((l) => l.quantity > 0), [bySku]);

  // Load after mount so the server render and the first browser render match.
  useEffect(() => {
    rememberUtm();
    void Promise.resolve().then(() => { setLines(clamp(readStored())); setLoaded(true); });
  }, [clamp]);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); } catch { /* storage off: the cart still works for this visit */ }
  }, [lines, loaded]);

  const api = useMemo<CartApi>(() => {
    const limit = (sku: string) => lineLimit(bySku.get(sku));
    const setQuantity = (sku: string, quantity: number) => setLines((cur) => {
      const q = Math.max(0, Math.min(Math.floor(quantity), limit(sku)));
      const rest = cur.filter((l) => l.sku !== sku);
      if (q === 0) return rest;
      const at = cur.findIndex((l) => l.sku === sku);
      const next = [...rest];
      next.splice(at < 0 ? next.length : at, 0, { sku, quantity: q });
      return next;
    });
    return {
      lines,
      product: (sku) => bySku.get(sku),
      limit,
      add: (sku, quantity = 1) => {
        const have = lines.find((l) => l.sku === sku)?.quantity ?? 0;
        setQuantity(sku, have + quantity);
      },
      setQuantity,
      remove: (sku) => setLines((cur) => cur.filter((l) => l.sku !== sku)),
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotalCents: lines.reduce((n, l) => n + (bySku.get(l.sku)?.priceCents ?? 0) * l.quantity, 0),
      products,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
    };
  }, [lines, bySku, isOpen, products]);

  return (
    <CartContext.Provider value={api}>
      {children}
      <CartDrawer />
    </CartContext.Provider>
  );
}

/** − count + for one cart line or the details modal. */
export function QuantityStepper({ name, value, max, onChange }: { name: string; value: number; max: number; onChange: (n: number) => void }) {
  const copy = shopCopy();
  return (
    <div className="shop-qty" role="group" aria-label={`${copy.details.quantity}: ${name}`}>
      <IconButton variant="secondary" size="small" aria-label={copy.cart.less(name)} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <IconMinus size={16} aria-hidden />
      </IconButton>
      <span className="shop-qty__value" aria-live="polite">{value}</span>
      <IconButton variant="secondary" size="small" aria-label={copy.cart.more(name)} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <IconPlus size={16} aria-hidden />
      </IconButton>
    </div>
  );
}

export function CartButton() {
  const cart = useShopCart();
  const copy = shopCopy();
  return (
    <div className="shop-toolbar">
      <Button variant={cart.count > 0 ? "primary" : "secondary"} iconBefore={IconShoppingCart} onClick={cart.open}>
        {copy.cart.open(cart.count)}
      </Button>
    </div>
  );
}

function CartDrawer() {
  const cart = useShopCart();
  const toast = useToast();
  const copy = shopCopy();
  const [busy, setBusy] = useState(false);

  const checkout = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.lines, source: window.location.pathname, utm: storedUtm() }),
      });
      const d = await res.json().catch(() => null);
      if (d?.ok && typeof d.url === "string") { window.location.assign(d.url); return; }
      // Stock moved since the page loaded: fix that line so the next try works.
      if ((d?.error === "sold_out" || d?.error === "unavailable") && typeof d.sku === "string") {
        cart.remove(d.sku);
        toast.error(copy.errors.soldOut);
      } else if (d?.error === "not_enough" && typeof d.sku === "string" && typeof d.available === "number") {
        cart.setQuantity(d.sku, d.available);
        toast.error(copy.errors.notEnough(d.available));
      } else toast.error(copy.errors.checkoutFailed);
    } catch {
      toast.error(copy.errors.checkoutFailed);
    }
    setBusy(false);
  };

  return (
    <Drawer open={cart.isOpen} onClose={cart.close} position="right" title={copy.cart.title}>
      {cart.lines.length === 0 ? (
        <div className="shop-cart__empty">
          <p>{copy.cart.empty}</p>
          <Button variant="secondary" onClick={cart.close}>{copy.cart.emptyAction}</Button>
        </div>
      ) : (
        <div className="shop-cart">
          <ul className="shop-cart__lines">
            {cart.lines.map((l) => {
              const p = cart.product(l.sku);
              if (!p) return null;
              const max = cart.limit(l.sku);
              return (
                <li key={l.sku} className="shop-cart__line">
                  <div className="shop-cart__line-head">
                    <strong>{p.name}</strong>
                    <span className="shop-cart__line-price">{formatPrice(p.priceCents * l.quantity)}</span>
                  </div>
                  <div className="shop-cart__line-controls">
                    <QuantityStepper name={p.name} value={l.quantity} max={max} onChange={(n) => cart.setQuantity(l.sku, n)} />
                    <Button variant="ghost" size="small" onClick={() => cart.remove(l.sku)}>{copy.cart.remove}</Button>
                  </div>
                  {l.quantity >= max && <p className="shop-cart__note">{max < p.maxPerOrder ? copy.cart.leftOnly(max) : copy.cart.maxed(max)}</p>}
                </li>
              );
            })}
          </ul>
          <FreeShippingNudge />
          <dl className="shop-cart__totals">
            <div><dt>{copy.cart.subtotal}</dt><dd>{formatPrice(cart.subtotalCents)}</dd></div>
            <div><dt>{copy.cart.shipping}</dt><dd>{copy.cart.shippingValue(shippingCents(cart.subtotalCents))}</dd></div>
          </dl>
          <p className="shop-cart__note">{copy.cart.tax}</p>
          {cart.lines.some((l) => { const p = cart.product(l.sku); return p ? isFinalSale(p.category) : false; }) && <p className="shop-cart__note">{copy.cart.finalSale}</p>}
          <Button variant="primary" fullWidth loading={busy} disabled={busy} onClick={() => void checkout()}>{copy.cart.checkout}</Button>
        </div>
      )}
    </Drawer>
  );
}

/** How far the cart is from free shipping, with single packs that would get it there. */
function FreeShippingNudge() {
  const cart = useShopCart();
  const copy = shopCopy();
  const short = toFreeShippingCents(cart.subtotalCents);
  if (short === 0) return <p className="shop-cart__free is-reached">{copy.cart.freeReached}</p>;
  const ideas = cart.products
    .filter((p) => p.kind === "single" && lineLimit(p) > (cart.lines.find((l) => l.sku === p.sku)?.quantity ?? 0))
    .slice(0, 2);
  return (
    <div className="shop-cart__free">
      <p>{copy.cart.toFree(short)}</p>
      {ideas.length > 0 && (
        <div className="shop-cart__ideas">
          <span className="shop-cart__ideas-h">{copy.cart.suggest}</span>
          {ideas.map((p) => (
            <div key={p.sku} className="shop-cart__idea">
              <span>{p.name} <span className="shop-cart__idea-price">{formatPrice(p.priceCents)}</span></span>
              <Button variant="secondary" size="small" onClick={() => cart.add(p.sku, 1)} aria-label={copy.cart.suggestAdd(p.name)}>{copy.cart.add}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
