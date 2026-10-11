"use client";

/**
 * A product on /shop, in the usual store order: photo (top corners follow the
 * card), title, price, a short description, then Add to cart and View details
 * (a modal with the full description and contents). Sold-out products stay on
 * the shelf with Add to cart disabled. Coming soon (before launch): no price
 * or stock, a Coming soon badge, and Notify me (jumps to the signup) in place
 * of Add to cart.
 */

import { useState } from "react";
import { Badge, Button, Card, CardContent } from "@empac/cascadeds";
import { ImageComingSoon } from "@/components/ImageComingSoon";
import { shopCopy } from "@/lib/store/copy";
import type { ShopProduct } from "@/lib/store/products";
import { lineLimit, useShopCart } from "./ShopCart";
import { ProductDetailsModal } from "./ProductDetailsModal";
import { focusShopUpdates } from "./ShopUpdates";

const LOW_STOCK = 5;

export function ShopProductCard({ product, soon = false, notify = false }: { product: ShopProduct; soon?: boolean; notify?: boolean }) {
  const cart = useShopCart();
  const copy = shopCopy();
  const [details, setDetails] = useState(false);
  const soldOut = product.available < 1;
  const low = !soldOut && product.available <= LOW_STOCK;
  const inCart = cart.lines.find((l) => l.sku === product.sku)?.quantity ?? 0;
  const canAdd = !soldOut && inCart < lineLimit(product);

  return (
    <Card variant="outlined" padding="none" className="shop-card">
      {/* CDS defines CardMedia and CardFooter but doesn't export them yet, so this uses
          their classes: the media as first child gets the card's top corners only. */}
      <div className="empac-card__media shop-card__media">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- product photos are plain files on our CDN
          <img src={product.imageUrl} alt={copy.card.imageAlt(product.name)} loading="lazy" />
        ) : (
          <ImageComingSoon />
        )}
      </div>
      <CardContent className="shop-card__body">
        <h3 className="shop-card__name">{product.name}</h3>
        {!soon && <p className="shop-card__price">{copy.card.price(product.priceCents)}</p>}
        {product.blurb && <p className="shop-card__blurb">{product.blurb}</p>}
        {soon ? <Badge variant="info" size="small">{copy.soon.badge}</Badge>
          : soldOut ? <Badge variant="default" size="small">{copy.card.soldOut}</Badge>
          : low ? <Badge variant="warning" size="small">{copy.card.lowStock(product.available)}</Badge> : null}
      </CardContent>
      <div className="empac-card__footer shop-card__actions">
        {soon ? (notify && (
          <Button variant="primary" onClick={focusShopUpdates} aria-label={`${copy.soon.notify}: ${product.name}`}>{copy.soon.notify}</Button>
        )) : (
          <Button variant="primary" disabled={!canAdd} onClick={() => { cart.add(product.sku, 1); cart.open(); }} aria-label={soldOut ? undefined : `${copy.card.addToCart}: ${product.name}`}>
            {soldOut ? copy.card.soldOut : copy.card.addToCart}
          </Button>
        )}
        <Button variant="secondary" onClick={() => setDetails(true)} aria-label={`${copy.card.viewDetails}: ${product.name}`}>
          {copy.card.viewDetails}
        </Button>
      </div>
      <ProductDetailsModal product={product} isOpen={details} onClose={() => setDetails(false)} soon={soon} notify={notify} />
    </Card>
  );
}
