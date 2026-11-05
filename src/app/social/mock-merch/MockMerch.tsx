"use client";

// TEMPORARY mockup for the merch shop picks (2026-11-03): the shop's real card classes, real CDS pieces, the real
// reaction stickers and logo, and drawn products. Prices are examples. Delete with page.tsx after the screenshots.

import { useState } from "react";
import { Badge, Button, Card, CardContent } from "@empac/cascadeds";
import { GsSticker } from "@/components/gifs/GsSticker";
import { IconField } from "@/components/events/EventHeaderArt";
import "@/styles/shop.css";
import "@/styles/gifs.css";
import "./mock.css";

const WHITE = "/images/fg/logos/gameshuffle-wht.svg";
const MARK = "/images/fg/logos/gs-mark.svg";

function Tee({ color = "#141a2e" }: { color?: string }) {
  return (
    <svg viewBox="0 0 200 200" className="mm-svg" aria-hidden="true">
      <path d="M60 22 L80 12 Q100 28 120 12 L140 22 L182 52 L162 84 L146 74 L146 188 L54 188 L54 74 L38 84 L18 52 Z" fill={color} />
      <image href={color === "#f4f5f8" ? "/images/fg/logos/gameshuffle-blk.svg" : WHITE} x="68" y="66" width="64" height="18" />
      <text x="100" y="98" textAnchor="middle" fill={color === "#f4f5f8" ? "#3d35b8" : "#cfe2ee"} fontSize="7" fontWeight="700" fontFamily="Outfit, sans-serif" letterSpacing=".6">SHUFFLE UP</text>
      <text x="100" y="108" textAnchor="middle" fill={color === "#f4f5f8" ? "#3d35b8" : "#cfe2ee"} fontSize="7" fontWeight="700" fontFamily="Outfit, sans-serif" letterSpacing=".6">YOUR GAME NIGHT</text>
    </svg>
  );
}

function Hoodie({ color = "#1d3fbf" }: { color?: string }) {
  return (
    <svg viewBox="0 0 200 200" className="mm-svg" aria-hidden="true">
      <path d="M58 30 L80 18 Q100 36 120 18 L142 30 L176 122 L156 130 L146 86 L146 190 L54 190 L54 86 L44 130 L24 122 Z" fill={color} />
      <path d="M76 22 Q100 0 124 22 Q118 48 100 50 Q82 48 76 22 Z" fill={color} />
      <path d="M84 24 Q100 10 116 24 Q111 42 100 43 Q89 42 84 24 Z" fill="rgba(0,0,0,.28)" />
      <rect x="70" y="140" width="60" height="28" rx="6" fill="rgba(0,0,0,.14)" />
      <image href={MARK} x="86" y="74" width="28" height="28" />
    </svg>
  );
}

function Mug() {
  return (
    <svg viewBox="0 0 200 200" className="mm-svg" aria-hidden="true">
      <path d="M132 78 q34 0 34 32 t-34 32" fill="none" stroke="#e8ebf3" strokeWidth="14" />
      <rect x="44" y="52" width="96" height="116" rx="10" fill="#f6f7fb" stroke="#dfe2ec" strokeWidth="2" />
      <foreignObject x="58" y="74" width="68" height="68"><div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%" }}><GsSticker id="gg" size="sm" still /></div></foreignObject>
    </svg>
  );
}

function Cap() {
  return (
    <svg viewBox="0 0 200 200" className="mm-svg" aria-hidden="true">
      <path d="M40 120 Q40 56 100 52 Q160 56 160 120 Z" fill="#141a2e" />
      <path d="M30 120 L180 120 Q188 132 150 138 L40 138 Q26 134 30 120 Z" fill="#0b0f1d" />
      <image href={MARK} x="86" y="74" width="28" height="28" />
    </svg>
  );
}

function DeskMat() {
  return (
    <div className="mm-mat">
      <IconField category="originals" seed="merch-mat" motion="none" opacity={0.22} />
      <img src={WHITE} alt="" className="mm-mat__logo" />
    </div>
  );
}

const SHEET = ["gg", "clutch", "nice", "hype", "called-it", "so-close", "nooo", "pain", "brb", "big-brain", "lets-go", "one-more"];
function Sheet({ big = false }: { big?: boolean }) {
  return (
    <div className={`mm-sheet${big ? " mm-sheet--big" : ""}`}>
      {SHEET.map((id) => <GsSticker key={id} id={id} size="sm" still />)}
    </div>
  );
}

const PRODUCTS: { sku: string; name: string; price: string; blurb: string; art: React.ReactNode; tag?: string }[] = [
  { sku: "stickers", name: "Reaction sticker sheet", price: "$6", blurb: "Twelve of our reaction stickers, die-cut, vinyl. For a laptop, a controller case or a Switch dock.", art: <Sheet /> },
  { sku: "tee", name: "Shuffle up your game night tee", price: "$28", blurb: "Soft cotton tee with the GameShuffle wordmark. Navy, white or heather.", art: <Tee /> },
  { sku: "hoodie", name: "GameShuffle hoodie", price: "$54", blurb: "Midweight hoodie with the GS mark on the chest. Blue or black.", art: <Hoodie /> },
  { sku: "deskmat", name: "Glyph desk mat", price: "$32", blurb: "A big mouse pad in the GameShuffle glyph pattern. 31.5 by 15.5 inches.", art: <DeskMat /> },
  { sku: "mug", name: "GG mug", price: "$18", blurb: "Ceramic 11 oz mug with the GG sticker. For the cup of coffee before a long night of races.", art: <Mug /> },
  { sku: "cap", name: "GS cap", price: "$26", blurb: "Embroidered GS mark on a black dad cap. One size.", art: <Cap /> },
];

function ProductCard({ p }: { p: (typeof PRODUCTS)[number] }) {
  return (
    <Card variant="outlined" padding="none" className="shop-card">
      <div className="empac-card__media shop-card__media mm-media">{p.art}</div>
      <CardContent className="shop-card__body">
        <h3 className="shop-card__name">{p.name}</h3>
        <p className="shop-card__price">{p.price}</p>
        <p className="shop-card__blurb">{p.blurb}</p>
        <Badge variant="default" size="small">Made to order</Badge>
      </CardContent>
      <div className="empac-card__footer shop-card__actions">
        <Button variant="primary">Choose options</Button>
        <Button variant="secondary">View details</Button>
      </div>
    </Card>
  );
}

const COLORS = [{ name: "Navy", hex: "#141a2e" }, { name: "White", hex: "#f4f5f8" }, { name: "Heather gray", hex: "#9aa1ae" }];
const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

function Details() {
  const [color, setColor] = useState(0);
  const [size, setSize] = useState("L");
  return (
    <div className="mm-details">
      <div className="mm-details__media mm-media"><Tee color={COLORS[color].hex} /></div>
      <div className="mm-details__body">
        <h2 className="mm-details__name">Shuffle up your game night tee</h2>
        <p className="shop-card__price">$28</p>
        <p className="shop-card__blurb">Soft cotton tee with the GameShuffle wordmark and the line under it. Printed when you order.</p>
        <div className="mm-opt">
          <p className="mm-opt__label">Color: <b>{COLORS[color].name}</b></p>
          <div className="mm-swatches" role="group" aria-label="Color">
            {COLORS.map((c, i) => <button key={c.name} type="button" aria-pressed={i === color} aria-label={c.name} className="mm-swatch" style={{ background: c.hex }} onClick={() => setColor(i)} />)}
          </div>
        </div>
        <div className="mm-opt">
          <p className="mm-opt__label">Size: <b>{size}</b> <a href="#size">Size chart</a></p>
          <div className="mm-sizes" role="group" aria-label="Size">
            {SIZES.map((s) => <Button key={s} size="small" variant={s === size ? "primary" : "secondary"} aria-pressed={s === size} onClick={() => setSize(s)}>{s}</Button>)}
          </div>
        </div>
        <ul className="mm-facts">
          <li>Made to order: ships in 3 to 7 business days, tracked.</li>
          <li>Shipping $4.99, free from $50. US only for now.</li>
          <li>A misprint or damage: we replace it or refund you.</li>
        </ul>
        <Button variant="primary" fullWidth>Add to cart</Button>
      </div>
    </div>
  );
}

export function MockMerch() {
  return (
    <main className="mm">
      <h1 className="sr-only">Merch mockups</h1>
      <section id="shelf" className="mm-shot">
        <div className="mm-head">
          <p className="mm-eyebrow">Shop</p>
          <h2 className="mm-h">GameShuffle merch</h2>
          <p className="shop-card__blurb">Made to order in our own art: the wordmark, the GS mark, our reaction stickers and the glyph pattern.</p>
        </div>
        <div className="shop-grid mm-grid">{PRODUCTS.map((p) => <ProductCard key={p.sku} p={p} />)}</div>
      </section>
      <section id="details" className="mm-shot"><Details /></section>
      <section id="sheet" className="mm-shot mm-sheet-wrap"><Sheet big /></section>
    </main>
  );
}
