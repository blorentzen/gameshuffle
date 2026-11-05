"use client";

/**
 * A merch product page's working part (pick 6): the picture for the chosen
 * color (and any photos staff add), color dots, sizes (or a phone list grouped
 * by brand), quantity, Add to cart, then the arrival line, the details, the
 * size guide and the returns line. Sizes that cost more say how much more.
 * A staff preview of a product that isn't live shows it but can't add it.
 *
 * Made-when-ordered merch (personal.ts) adds the buyer's pick: chips for short
 * lists, a select for long ones, and "Your print" (the flat print of the pick on
 * the chosen color) beside the color's mockup. The pick rides on the cart line.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Accordion, Alert, Button, Chip, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconShoppingCartPlus } from "@tabler/icons-react";
import { formatPrice, merchCopy } from "@/lib/store/copy";
import { EVENTS, track } from "@/lib/analytics/events";
import type { MerchListing } from "@/lib/store/merchCatalog";
import { DEFAULT_PICK, fieldsFor, pickFromValues, pickLabel, previewPath, valuesFromPick, type PersonalProduct } from "@/lib/store/personal";
import type { ShopProduct } from "@/lib/store/products";
import { TableScroll } from "@/components/ui/TableScroll";
import { CartButton, QuantityStepper, ShopCartProvider, useShopCart } from "./ShopCart";

export function MerchProduct({ listing, products, preview = false, soon = false }: { listing: MerchListing; products: ShopProduct[]; preview?: boolean; soon?: boolean }) {
  return (
    <ShopCartProvider products={products}>
      {!soon && <CartButton />}
      <ProductBody listing={listing} preview={preview} soon={soon} />
    </ShopCartProvider>
  );
}

function ProductBody({ listing, preview, soon }: { listing: MerchListing; preview: boolean; soon: boolean }) {
  const copy = merchCopy();
  const cart = useShopCart();
  const phone = listing.optionLabel === "Phone";
  const [ci, setCi] = useState(0);
  const [option, setOption] = useState<string | null>(listing.options.length === 1 ? listing.options[0] : null);
  const [qty, setQty] = useState(1);
  const [pic, setPic] = useState(0);
  const [added, setAdded] = useState(false);

  const color = listing.colors[ci] ?? listing.colors[0];
  const forColor = useMemo(() => listing.variants.filter((v) => phone || !color || v.color === color.name), [listing.variants, phone, color]);
  const options = listing.options.filter((o) => forColor.some((v) => v.option === o));
  const variant = listing.optionLabel === "" ? forColor[0] : forColor.find((v) => v.option === option) ?? null;
  const prices = forColor.map((v) => v.priceCents);
  const base = Math.min(...prices);
  const varies = new Set(prices).size > 1;

  const main = (phone ? (variant?.image ?? forColor[0]?.image) : color?.image) ?? null;
  const gallery = [
    ...(main ? [{ url: main, alt: copy.imageAlt(listing.name, phone ? variant?.option ?? null : color?.name ?? null) }] : []),
    ...listing.photos.map((p) => ({ url: p.url, alt: p.alt || copy.yourPhoto(listing.name) })),
  ];
  const shown = gallery[Math.min(pic, gallery.length - 1)];

  const phoneGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const v of listing.variants) if (v.option) groups.set(v.group ?? "Other", [...new Set([...(groups.get(v.group ?? "Other") ?? []), v.option])]);
    // Newest phones first: Printful lists them oldest first.
    return [...groups.entries()].map(([label, opts]) => ({ label, options: [...opts].reverse().map((o) => ({ value: o, label: o })) }));
  }, [listing.variants]);

  const personal = variant?.personal ?? forColor[0]?.personal ?? null;
  const [pickValues, setPickValues] = useState<Record<string, string> | null>(null);
  const values = pickValues ?? (personal ? valuesFromPick(personal.kind, DEFAULT_PICK[personal.kind]) : null);
  const pick = personal && values ? pickFromValues(personal.kind, values) : null;

  const canAdd = !!variant && variant.onSale;
  const add = () => {
    if (!variant) return;
    cart.add(variant.sku, qty, pick ?? undefined);
    cart.open();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
    track(EVENTS.merchAddedToCart, { item: listing.itemType });
  };

  return (
    <div className="merch-product">
      <div className="merch-product__gallery">
        <div className="merch-product__main">
          {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups and our own photos are plain files */}
          {shown && <img src={shown.url} alt={shown.alt} width={720} height={720} />}
        </div>
        {gallery.length > 1 && (
          <div className="merch-product__thumbs" role="group" aria-label="Pictures">
            {gallery.map((g, i) => (
              <button key={g.url} type="button" className={`merch-product__thumb${i === pic ? " is-on" : ""}`} aria-pressed={i === pic} aria-label={g.alt} onClick={() => setPic(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt="" width={72} height={72} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="merch-product__info">
        {preview && !listing.live && <Alert variant="warning">{copy.notLive}</Alert>}
        {soon ? <p className="merch-product__soon"><Link href="/shop">{copy.soon}</Link></p>
          : <p className="merch-product__price">{!variant && varies ? copy.from(base) : formatPrice(variant?.priceCents ?? base)}</p>}

        {/* One color (all-over prints, stickers, bottles): nothing to choose, so no color line. */}
        {!phone && listing.colors.length > 1 && (
          <div className="merch-field">
            <p className="merch-field__label" id="merch-color">{copy.color} <span>{color?.name}</span></p>
            {(
              <div className="merch-field__chips" role="group" aria-labelledby="merch-color">
                {listing.colors.map((c, i) => (
                  <Chip
                    key={c.name}
                    clickable
                    selected={i === ci}
                    onClick={() => { setCi(i); setPic(0); }}
                    aria-label={c.name}
                    className="merch-swatch merch-swatch--lg"
                    icon={<span className="merch-dot" style={{ background: c.hex ?? "#ccc" }} aria-hidden="true" />}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {listing.optionLabel === "Size" && options.length > 0 && (
          <div className="merch-field">
            <p className="merch-field__label" id="merch-size">{copy.size} <span>{option ?? copy.pickSize}</span></p>
            {/* One size (a 32 oz bottle, a 15 by 17 inch bag): it's already chosen, so it's just the line above. */}
            {options.length > 1 && <div className="merch-field__chips" role="group" aria-labelledby="merch-size">
              {options.map((o) => {
                const extra = (forColor.find((v) => v.option === o)?.priceCents ?? base) - base;
                return <Chip key={o} clickable selected={option === o} variant={option === o ? "primary" : "default"} onClick={() => setOption(o)} label={extra > 0 ? `${o} +${formatPrice(extra).replace(/\.00$/, "")}` : o} />;
              })}
            </div>}
            {listing.sizeGuide && (
              <Accordion variant="flush" className="merch-guide" items={[{
                id: "size-guide",
                title: copy.sizeGuide,
                content: (
                  <TableScroll label={copy.sizeGuide}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{copy.size}</TableHead>
                          {listing.sizeGuide.columns.map((c) => <TableHead key={c}>{c}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {listing.sizeGuide.rows.map((r) => (
                          <TableRow key={r.size}>
                            <TableCell>{r.size}</TableCell>
                            {r.values.map((v, i) => <TableCell key={i}>{v}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="merch-guide__note">{copy.sizeGuideNote(listing.sizeGuide.unit)}</p>
                  </TableScroll>
                ),
              }]} />
            )}
          </div>
        )}

        {phone && (
          <div className="merch-field">
            <label className="merch-field__label" htmlFor="merch-phone">{copy.phone}</label>
            <Select id="merch-phone" groups={phoneGroups} value={option ?? ""} placeholder={copy.pickPhone} onChange={(v) => setOption(typeof v === "string" ? v : v[0] ?? null)} fullWidth />
          </div>
        )}

        {listing.optionLabel === "" && <p className="merch-field__note">{copy.oneSize}</p>}

        {personal && values && pick && (
          <PickFields personal={personal} values={values} onChange={setPickValues} colorHex={color?.hex ?? null} pick={pick} />
        )}

        {!soon && (
          <>
            <div className="merch-field">
              <p className="merch-field__label">Quantity</p>
              <QuantityStepper name={listing.name} value={qty} max={10} onChange={setQty} />
            </div>
            <div className="merch-product__buy">
              <Button variant="primary" iconBefore={IconShoppingCartPlus} disabled={!canAdd} onClick={add}>
                {added ? copy.added : !variant ? (phone ? copy.pickPhone : copy.pickSize) : copy.addToCart}
              </Button>
            </div>
          </>
        )}

        <div className="merch-product__about">
          <p>{copy.arrives(listing.deliveryMin, listing.deliveryMax)} {copy.shippingLine}</p>
          {listing.description && <p>{listing.description}</p>}
          {listing.facts.length > 0 && (
            <ul className="merch-product__facts">{listing.facts.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <p className="merch-product__returns">{copy.returns}</p>
        </div>
      </div>
    </div>
  );
}

/** The buyer's pick for made-when-ordered merch, and the flat print it makes on this color. */
function PickFields({ personal, values, onChange, colorHex, pick }: {
  personal: PersonalProduct; values: Record<string, string>; onChange: (v: Record<string, string>) => void; colorHex: string | null; pick: string;
}) {
  const fields = fieldsFor(personal.kind, personal.ink);
  const label = pickLabel(personal.kind, pick);
  const set = (id: string, value: string) => {
    const next = { ...values, [id]: value };
    // Choosing "Member since" needs a year: start on the newest.
    const year = fields.find((f) => f.when?.field === id);
    if (year && value === year.when!.value && !next[year.id]) next[year.id] = year.options[0]?.value ?? "";
    onChange(next);
  };
  return (
    <div className="merch-pick">
      {fields.filter((f) => !f.when || values[f.when.field] === f.when.value).map((f) => (
        f.options.length <= 6 ? (
          <div className="merch-field" key={f.id}>
            <p className="merch-field__label" id={`merch-pick-${f.id}`}>{f.label} <span>{f.options.find((o) => o.value === values[f.id])?.label}</span></p>
            <div className="merch-field__chips" role="group" aria-labelledby={`merch-pick-${f.id}`}>
              {f.options.map((o) => <Chip key={o.value} clickable selected={values[f.id] === o.value} variant={values[f.id] === o.value ? "primary" : "default"} onClick={() => set(f.id, o.value)} label={o.label} />)}
            </div>
          </div>
        ) : (
          <div className="merch-field" key={f.id}>
            <label className="merch-field__label" htmlFor={`merch-pick-${f.id}`}>{f.label}</label>
            <Select id={`merch-pick-${f.id}`} options={f.options} value={values[f.id] ?? ""} onChange={(v) => set(f.id, typeof v === "string" ? v : v[0] ?? "")} fullWidth />
          </div>
        )
      ))}
      <figure className="merch-pick__print">
        <div className="merch-pick__swatch" style={colorHex ? { background: colorHex } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a made-ahead flat print, a plain file */}
          <img src={previewPath(personal.kind, personal.ink, pick)} alt={`Your print: ${label}`} width={240} height={personal.kind === "cap" ? 105 : 320} />
        </div>
        <figcaption>Your print: {label}</figcaption>
      </figure>
    </div>
  );
}
