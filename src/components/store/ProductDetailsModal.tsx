"use client";

/**
 * View details: the product's photo, price, full description, everything
 * that's inside, how it ships, and a quantity to add to the cart.
 */

import { useState } from "react";
import { Badge, Button, Modal } from "@empac/cascadeds";
import { ImageComingSoon } from "@/components/ImageComingSoon";
import { shopCopy } from "@/lib/store/copy";
import type { ShopProduct } from "@/lib/store/products";
import { QuantityStepper, lineLimit, useShopCart } from "./ShopCart";

export function ProductDetailsModal({ product, isOpen, onClose }: { product: ShopProduct; isOpen: boolean; onClose: () => void }) {
  const cart = useShopCart();
  const copy = shopCopy();
  const inCart = cart.lines.find((l) => l.sku === product.sku)?.quantity ?? 0;
  const room = Math.max(0, lineLimit(product) - inCart);
  const soldOut = product.available < 1;
  const [qty, setQty] = useState(1);
  const quantity = Math.min(Math.max(qty, 1), Math.max(room, 1));

  const add = () => {
    cart.add(product.sku, quantity);
    setQty(1);
    onClose();
    cart.open();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product.name}
      size="large"
      footer={
        <div className="shop-details__footer">
          {room > 0 && <QuantityStepper name={product.name} value={quantity} max={room} onChange={setQty} />}
          <Button variant="primary" disabled={room < 1} onClick={add}>
            {soldOut ? copy.card.soldOut : copy.card.addToCart}
          </Button>
        </div>
      }
    >
      <div className="shop-details">
        <div className="shop-details__media">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- product photos are plain files on our CDN
            <img src={product.imageUrl} alt={copy.card.imageAlt(product.name)} />
          ) : (
            <ImageComingSoon />
          )}
        </div>
        <div className="shop-details__info">
          <p className="shop-details__price">
            {copy.card.price(product.priceCents)} <span className="shop-card__ship">· {copy.card.freeShipping}</span>
          </p>
          {soldOut ? <Badge variant="default" size="small">{copy.card.soldOut}</Badge>
            : product.available <= 5 ? <Badge variant="warning" size="small">{copy.card.lowStock(product.available)}</Badge> : null}
          {(product.description ?? product.blurb) && <p className="shop-details__text">{product.description ?? product.blurb}</p>}
          {product.contents.length > 0 && (
            <section>
              <h3 className="shop-details__h">{copy.details.inside}</h3>
              <ul className="shop-details__list">{product.contents.map((c) => <li key={c}>{c}</li>)}</ul>
            </section>
          )}
          <section>
            <h3 className="shop-details__h">{copy.details.shipsHeading}</h3>
            <p className="shop-details__text">{product.kind === "bundle" ? copy.details.shipsParcel : copy.details.shipsSingle}</p>
          </section>
        </div>
      </div>
    </Modal>
  );
}
