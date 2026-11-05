"use client";

/**
 * Platform ▸ Shop ▸ Merch (staff): arrange what's made in Printful.
 *   Sync from Printful pulls every product; Printful's product webhooks do it
 *   too once connected. Each shop product (listing) groups Printful products
 *   by design and item. Drag to set the shelf order; Live puts it on /shop;
 *   Edit sets the name, link, collection, series, item, description, details, which
 *   colors show, photos of real samples, and moves a Printful product to
 *   another listing. Prices come from Printful; this screen shows each size's
 *   price, Printful's cost and what an order keeps, and warns about mismatched
 *   prices, back-view pictures and thin margins.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Checkbox, EmptyState, Input, Modal, Select, StatCard, Switch, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconPlugConnected, IconRefresh, IconShirt, IconUpload } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { SortableList } from "@/components/ui/SortableList";
import { COLLECTIONS, ITEM_TYPES, collectionOf } from "@/lib/store/merch";
import { formatPrice } from "@/lib/store/copy";
import type { AdminListing, ListingPatch } from "@/lib/store/merchCatalog";
import type { SyncSummary } from "@/lib/store/merchSync";
import "@/styles/merch-admin.css";

const ERRORS: Record<string, string> = {
  not_ready: "Merch needs supabase/merch-m1.sql first.", not_configured: "PRINTFUL_API_TOKEN isn't set on this server.",
  bad_name: "Name: 1 to 60 characters.", bad_slug: "Link: letters, numbers and dashes.", slug_taken: "Another product has that link.",
  bad_collection: "Pick a collection.", bad_series: "Series: 40 characters at most.", bad_type: "Pick an item.", bad_description: "Description: 1,000 characters at most.",
  bad_photo: "Photos must be uploaded here (8 at most).", admin_only: "Only admins can connect Printful's updates.",
  needs_https: "Printful can only send updates to the live site. Connect it from www.gameshuffle.co.", printful: "Printful didn't answer.",
  no_storage: "Photo uploads aren't set up on this server.", too_big: "Photo is too big (8 MB at most).", bad_type_file: "Use a JPG, PNG or WebP photo.",
};
const errorText = (code?: string, message?: string) => (code === "printful" && message ? `Printful: ${message}` : ERRORS[code ?? ""] ?? "That didn't work.");
const range = (a: number, b: number) => (a === b ? formatPrice(a) : `${formatPrice(a)} to ${formatPrice(b)}`);

interface Data { listings: AdminListing[]; unassigned: { id: number; name: string }[]; lastSync: string | null; configured: boolean }

export function PlatformShopMerchTab() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [hooks, setHooks] = useState<{ connected: boolean; types: string[] } | null>(null);

  const apply = (d: Data & { ok?: boolean }) => setData({ listings: d.listings, unassigned: d.unassigned, lastSync: d.lastSync, configured: d.configured ?? data?.configured ?? true });
  const load = useCallback(async () => {
    const d = await fetch("/api/admin/shop/merch", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { setError(null); setData({ listings: d.listings, unassigned: d.unassigned, lastSync: d.lastSync, configured: d.configured }); }
    else setError(d?.error ?? "failed");
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/shop/merch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    if (!d?.ok) { toast.error(errorText(d?.error, d?.message)); return null; }
    if (d.listings) apply(d);
    return d;
  };

  const sync = async (full = false) => {
    setSyncing(true);
    // A sync reads every Printful product at Printful's pace (2 to 4 minutes); a reply that isn't ours (a timeout page)
    // still leaves what was written, and the next sync carries on.
    const res = await fetch("/api/admin/shop/merch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", full }) }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setSyncing(false);
    if (!d?.ok) {
      toast.error(d?.error ? errorText(d.error, d.message) : "The sync didn't finish. Wait a minute, then press Sync from Printful again: it carries on from what's saved.");
      void load();
      return;
    }
    if (d.listings) apply(d);
    setSummary(d.summary);
    const left = d.summary.unfinished ? ` Shipping and size guides for ${d.summary.unfinished} still to come: press Sync again.` : "";
    toast.success(`Synced ${d.summary.printfulProducts} Printful products${d.summary.listingsCreated.length ? `, ${d.summary.listingsCreated.length} new` : ""}.${left}`);
  };
  const checkHooks = async () => {
    const d = await post({ action: "webhooks" });
    if (d) setHooks({ connected: d.connected, types: d.types ?? [] });
  };
  const connectHooks = async () => {
    const d = await post({ action: "connect" });
    if (d) { setHooks({ connected: true, types: d.types ?? [] }); toast.success("Printful will send updates here."); }
  };

  if (error === "not_ready") {
    return (
      <div className="account-card admin-screen shop-admin">
        <AdminHeader title="Merch" intro="Products made in Printful, arranged for the shop." />
        <EmptyState icon={<IconShirt size={32} />} title="Not set up yet" description="Run supabase/merch-m1.sql in the database, then come back and press Sync from Printful." />
      </div>
    );
  }
  if (!data) return <div className="account-card admin-screen shop-admin"><AdminHeader title="Merch" /><LoadingLines lines={4} /></div>;

  const live = data.listings.filter((l) => l.live && !l.archived);
  const active = data.listings.filter((l) => !l.archived);
  const warnings = active.flatMap((l) => l.warnings.map((w) => ({ id: l.id, name: l.name, text: w })));

  return (
    <div className="account-card admin-screen shop-admin merch-admin">
      <AdminHeader
        title="Merch"
        intro="Make products in Printful, then arrange them here: names, collections, which colors show, the order on the shelf and what's live. Prices come from Printful."
        actions={<Button variant="primary" size="small" iconBefore={IconRefresh} loading={syncing} disabled={syncing || !data.configured} onClick={() => void sync()}>Sync from Printful</Button>}
      />
      {!data.configured && <Alert variant="warning" title="Printful isn't connected">PRINTFUL_API_TOKEN isn&apos;t set on this server.</Alert>}

      <AdminStats columns={3} label="Merch at a glance">
        <StatCard label="Live on /shop" value={`${live.length} of ${active.length}`} />
        <StatCard label="Printful products" value={String(active.reduce((n, l) => n + l.printful.filter((p) => !p.removed).length, 0))} />
        <StatCard label="Sizes and colors selling" value={String(active.reduce((n, l) => n + l.selling, 0))} />
      </AdminStats>
      <p className="merch-admin__sync">
        {data.lastSync ? `Last synced ${new Date(data.lastSync).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} Pacific.` : "Not synced yet."}{" "}
        <Button variant="ghost" size="small" onClick={() => void sync(true)} disabled={syncing}>Full sync (shipping and size guides too)</Button>
      </p>
      {syncing && <p className="merch-admin__sync" role="status">Syncing at Printful&apos;s pace: this takes 2 to 4 minutes. Keep this page open and press it once.</p>}

      {summary && summary.listingsCreated.length > 0 && (
        <Alert variant="info" title="New products">{summary.listingsCreated.join(", ")}. They start hidden: check each one, then turn on Live.</Alert>
      )}

      {warnings.length > 0 && (
        <AdminSection title="Worth a look">
          <ul className="merch-admin__warnings">
            {warnings.map((w, i) => (
              <li key={i}><strong>{w.name}</strong>: {w.text} <Button variant="ghost" size="small" onClick={() => setEditing(w.id)}>Open</Button></li>
            ))}
          </ul>
        </AdminSection>
      )}

      <AdminSection title="Products" intro="Drag to set the order within each collection on /shop.">
        {active.length === 0 ? (
          <EmptyState icon={<IconShirt size={32} />} title="No products yet" description="Press Sync from Printful to bring in what you've made there." />
        ) : (
          <SortableList
            items={active}
            getId={(l) => l.id}
            handleLabel={(l) => `Reorder ${l.name}`}
            onReorder={(next) => { setData({ ...data, listings: [...next, ...data.listings.filter((l) => l.archived)] }); void post({ action: "reorder", ids: next.map((l) => l.id) }); }}
            className="merch-admin__list"
          >
            {(l, handle) => (
              <div className="merch-admin__row">
                {handle}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="merch-admin__pic" src={l.colors.find((c) => !c.hidden)?.image ?? l.colors[0]?.image ?? ""} alt="" width={56} height={56} />
                <div className="merch-admin__name">
                  <strong>{l.name}</strong>
                  <span>{collectionOf(l.collection).name}{l.series ? ` · ${l.series}` : ""} · {l.itemType} · from {l.printful.length} Printful product{l.printful.length === 1 ? "" : "s"}</span>
                </div>
                <div className="merch-admin__facts">
                  <span>{l.optionLabel === "Phone" ? `${l.sizes.length} phones` : `${l.colors.filter((c) => !c.hidden).length} of ${l.colors.length} colors`}</span>
                  {l.sizes.length > 0 && <span>{range(Math.min(...l.sizes.map((s) => s.priceCents)), Math.max(...l.sizes.map((s) => s.priceCents)))}</span>}
                  {l.warnings.length > 0 && <Badge variant="warning" size="small">{l.warnings.length} to check</Badge>}
                </div>
                <Switch label="Live" checked={l.live} onChange={(e) => void post({ action: "update", id: l.id, patch: { live: e.target.checked } })} />
                <Button variant="secondary" size="small" onClick={() => setEditing(l.id)}>Edit</Button>
              </div>
            )}
          </SortableList>
        )}
      </AdminSection>

      <AdminSection title="Printful updates" intro="Printful tells the shop when an order ships or runs into trouble, and when you change a product.">
        <div className="merch-admin__hooks">
          {hooks ? (hooks.connected ? <Badge variant="success">Connected</Badge> : <Badge variant="warning">Not connected</Badge>) : null}
          <Button variant="secondary" size="small" onClick={() => void checkHooks()}>Check</Button>
          <Button variant="secondary" size="small" iconBefore={IconPlugConnected} onClick={() => void connectHooks()}>Connect Printful updates</Button>
        </div>
        <p className="merch-admin__note">Connect from the live site (admins). Printful sends to one address per store, so this replaces any other.</p>
      </AdminSection>

      {editing && (() => {
        const l = data.listings.find((x) => x.id === editing);
        return l ? <ListingEditor key={l.id} listing={l} all={data.listings} onClose={() => setEditing(null)} post={post} /> : null;
      })()}
    </div>
  );
}

function ListingEditor({ listing, all, onClose, post }: { listing: AdminListing; all: AdminListing[]; onClose: () => void; post: (b: Record<string, unknown>) => Promise<unknown> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(listing.name);
  const [slug, setSlug] = useState(listing.slug);
  const [collection, setCollection] = useState(listing.collection);
  const [series, setSeries] = useState(listing.series ?? "");
  const [itemType, setItemType] = useState(listing.itemType);
  const [description, setDescription] = useState(listing.description ?? "");
  const [facts, setFacts] = useState(listing.facts.join("\n"));
  const [hidden, setHidden] = useState<string[]>(listing.hiddenColors);
  const [photos, setPhotos] = useState(listing.photos);
  const [live, setLive] = useState(listing.live);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    setBusy(true);
    const patch: ListingPatch = { name, slug, collection, series, itemType, description, facts: facts.split("\n"), hiddenColors: hidden, photos, live };
    const d = await post({ action: "update", id: listing.id, patch });
    setBusy(false);
    if (d) { toast.success("Saved"); onClose(); }
  };
  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("listingId", listing.id);
    const d = await fetch("/api/admin/shop/merch/photo", { method: "POST", body: form }).then((r) => r.json()).catch(() => null);
    setUploading(false);
    if (d?.ok) setPhotos((p) => [...p, { url: d.url, alt: "" }].slice(0, 8));
    else toast.error(errorText(d?.error === "bad_type" ? "bad_type_file" : d?.error));
  };
  const archive = async () => {
    if (!(await confirm({ title: `Archive ${listing.name}?`, body: "It comes off the shop and out of this list. Printful keeps the products; a sync won't bring it back.", confirmLabel: "Archive" }))) return;
    if (await post({ action: "update", id: listing.id, patch: { archived: true, live: false } })) onClose();
  };
  const others = all.filter((x) => x.id !== listing.id && !x.archived);
  const seriesInUse = [...new Set(others.map((x) => x.series).filter((x): x is string => !!x))];

  return (
    <Modal isOpen onClose={onClose} title={listing.name} size="large"
      footer={<div className="merch-editor__foot">
        <Button variant="ghost" onClick={() => void archive()}>Archive</Button>
        <span className="merch-editor__spacer" />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void save()}>Save</Button>
      </div>}
    >
      <div className="merch-editor">
        <Switch label="Live on /shop" checked={live} onChange={(e) => setLive(e.target.checked)} />
        <div className="merch-editor__grid">
          <AdminField label="Name">{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</AdminField>
          <AdminField label="Link" helper={`gameshuffle.co/shop/${slug}`}>{(id, d) => <Input id={id} aria-describedby={d} value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value)} />}</AdminField>
          <AdminField label="Collection">{(id) => <Select id={id} value={collection} onChange={(v) => setCollection(String(v))} options={COLLECTIONS.map((c) => ({ value: c.id, label: c.name }))} />}</AdminField>
          <AdminField label="Item">{(id) => <Select id={id} value={itemType} onChange={(v) => setItemType(String(v))} options={ITEM_TYPES.map((t) => ({ value: t, label: t }))} />}</AdminField>
        </div>
        <AdminField
          label="Series"
          helper={`Optional. Products with the same series sit together in their own section on /shop.${seriesInUse.length ? ` In use: ${seriesInUse.join(", ")}` : ""}`}
        >{(id, d) => <Input id={id} aria-describedby={d} value={series} maxLength={40} onChange={(e) => setSeries(e.target.value)} />}</AdminField>
        <AdminField label="Description" helper="Optional. A line or two above the details.">{(id, d) => <Textarea id={id} aria-describedby={d} value={description} maxLength={1000} rows={2} onChange={(e) => setDescription(e.target.value)} />}</AdminField>
        <AdminField label="Details" helper="One per line, shown as a list on the product page.">{(id, d) => <Textarea id={id} aria-describedby={d} value={facts} rows={4} onChange={(e) => setFacts(e.target.value)} />}</AdminField>

        {listing.colors.length > 1 && (
          <fieldset className="merch-editor__colors">
            <legend>Colors shown</legend>
            <div className="merch-editor__color-grid">
              {listing.colors.map((c) => (
                <div key={c.name} className="merch-editor__color">
                  <span className="merch-dot" style={{ background: c.hex ?? "#ccc" }} aria-hidden="true" />
                  <Checkbox label={c.name} checked={!hidden.includes(c.name)} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== c.name) : [...h, c.name]))} />
                  {c.back && <Badge variant="warning" size="small">Back view</Badge>}
                  {!c.available && <Badge variant="default" size="small">Not in Printful</Badge>}
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="merch-editor__photos">
          <p className="admin-field__label">Your photos</p>
          <p className="admin-field__help">Each color&apos;s Printful picture comes first on the product page. Add photos of real samples here.</p>
          <div className="merch-editor__photo-row">
            {photos.map((p) => (
              <div key={p.url} className="merch-editor__photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" width={88} height={88} />
                <Button variant="ghost" size="small" onClick={() => setPhotos((x) => x.filter((y) => y.url !== p.url))} aria-label="Remove this photo">Remove</Button>
              </div>
            ))}
            {photos.length < 8 && (
              <label className="merch-editor__upload">
                <IconUpload size={20} aria-hidden />
                <span>{uploading ? "Uploading…" : "Add a photo"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>

        <AdminTable label="Prices by size">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{listing.optionLabel === "Phone" ? "Phone" : "Size"}</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Printful&apos;s cost</TableHead>
                <TableHead>Keeps an order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listing.sizes.map((s) => (
                <TableRow key={s.option || "one"}>
                  <TableCell>{s.option || "One size"}</TableCell>
                  <TableCell>{formatPrice(s.priceCents)}{s.printfulPrices.length > 1 && <span className="merch-editor__mismatch"> (Printful: {s.printfulPrices.map((p) => formatPrice(p)).join(", ")})</span>}</TableCell>
                  <TableCell>{s.costCents != null ? formatPrice(s.costCents) : "?"}</TableCell>
                  <TableCell>{s.keepCents != null ? formatPrice(s.keepCents) : "?"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
        <p className="admin-field__help">Keeps = price plus $4.99 shipping (free from $50), minus Printful&apos;s cost, Printful&apos;s shipping for one ({listing.shipCostCents != null ? formatPrice(listing.shipCostCents) : "not priced yet"}) and Stripe&apos;s fee. Change prices in Printful, then sync.</p>

        <div className="merch-editor__built">
          <p className="admin-field__label">Built from</p>
          {listing.printful.map((p) => (
            <div key={p.id} className="merch-editor__pf">
              <span className="merch-editor__pf-name">{p.name}{p.removed ? " (gone from Printful)" : ""} <span className="admin-field__help">{p.variants} sizes and colors</span></span>
              {others.length > 0 && (
                <Select
                  value=""
                  placeholder="Move to…"
                  onChange={(v) => { if (v) void post({ action: "move", productId: p.id, listingId: String(v) }).then((d) => { if (d) { toast.success("Moved"); onClose(); } }); }}
                  options={others.map((o) => ({ value: o.id, label: o.name }))}
                  size="small"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
