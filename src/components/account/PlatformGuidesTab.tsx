"use client";

/**
 * Platform Admin → Guides. Write and publish a guide without a commit.
 *
 * The reason this exists: guides used to live in a TypeScript manifest plus a
 * page file each, so publishing needed a laptop. The content plan assumes
 * drafting on a phone and pasting the result in, which this makes possible.
 *
 * Bodies are GFM markdown, matching what a drafting session hands back and what
 * GuideBody renders. No rich-text editor on purpose: markdown survives a paste
 * from anywhere, and a WYSIWYG would fight the source of the text.
 *
 * Layout (admin kit): header with "New guide", three counts, then every guide
 * in a table. Writing and editing happen in a modal; Delete sits in the row's
 * "more" menu and asks first.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Input, Modal, Select, StatCard, Switch, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, Textarea,
} from "@empac/cascadeds";
import { IconBook, IconEye, IconPlus, IconTarget } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { GUIDE_CLUSTERS } from "@/lib/guides/manifest";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminRowMenu, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";

interface Row {
  id: string; slug: string; title: string; description: string; cluster: string;
  body_md: string; minutes: number; game_specific: string | null;
  published: boolean; updated_at: string;
}

interface Form {
  id: string; slug: string; title: string; description: string; cluster: string;
  bodyMd: string; minutes: number; gameSpecific: string; published: boolean;
}

const BLANK: Form = {
  id: "", slug: "", title: "", description: "",
  cluster: GUIDE_CLUSTERS[0].id as string,
  bodyMd: "", minutes: 6, gameSpecific: "", published: false,
};

const PAGE = 25;
/** CDS Select treats "" as no choice (and hides its label), so "not about one
 *  game" uses this stand-in in the picker and goes back to "" when saved. */
const NO_GAME = "none";

const CLUSTER_OPTIONS = GUIDE_CLUSTERS.map((c) => ({ value: c.id, label: c.label }));
const clusterLabel = (id: string) => GUIDE_CLUSTERS.find((c) => c.id === id)?.label ?? id;
const GAME_OPTIONS = [
  { value: NO_GAME, label: "Not about one game" },
  { value: "mario-kart", label: "Mario Kart" },
  { value: "pokemon-tcg", label: "Pokémon TCG" },
];

/** Title to slug, matching the server's rule so the two never disagree. */
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
const words = (md: string) => (md.trim() ? md.trim().split(/\s+/).length : 0);

export function PlatformGuidesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "not_migrated" | "error">("loading");
  const [editing, setEditing] = useState<Form | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/guides", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503 && body.error === "not_migrated") { setState("not_migrated"); return; }
      if (!res.ok) { setState("error"); return; }
      setRows(body.guides ?? []);
      setState("ready");
    } catch { setState("error"); }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const edit = (r: Row) => setEditing({
    id: r.id, slug: r.slug, title: r.title, description: r.description,
    cluster: r.cluster, bodyMd: r.body_md, minutes: r.minutes,
    gameSpecific: r.game_specific ?? "", published: r.published,
  });

  const remove = async (r: Row) => {
    const ok = await confirm({
      title: `Delete "${r.title}"?`,
      body: r.published
        ? "It comes off the guides page straight away, and links to it stop working. This can't be undone."
        : "The draft is gone for good. This can't be undone.",
      confirmLabel: "Delete guide",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/guides?id=${r.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't delete that guide. Try again."); return; }
    toast.success("Guide deleted.");
    await load();
  };

  const header = (
    <AdminHeader
      title="Guides"
      intro="Write and publish the how-to guides on the guides page. Paste a finished draft, save it as a draft, and publish when it's ready."
      actions={state === "ready" ? <Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing({ ...BLANK })}>New guide</Button> : undefined}
    />
  );

  if (state === "loading") return <div className="account-card admin-screen">{header}<LoadingLines label="Loading guides" /></div>;

  if (state === "not_migrated") {
    return (
      <div className="account-card admin-screen">
        {header}
        <Alert variant="info" title="The guides editor needs a database update">
          Ask a developer to apply it, then reload this page. Until then the two built-in guides keep showing on the guides page, and nothing there changes.
        </Alert>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="account-card admin-screen">
        {header}
        <Alert variant="error">Couldn&apos;t load the guides. Your account may not have access to them, or the site had a hiccup: reload in a minute.</Alert>
      </div>
    );
  }

  const live = rows.filter((r) => r.published).length;
  const gameSpecificCount = rows.filter((r) => r.game_specific).length;
  const pct = rows.length ? Math.round((gameSpecificCount / rows.length) * 100) : 0;
  const shown = rows.slice(0, limit);

  return (
    <div className="account-card admin-screen admin-library-guides">
      {header}

      {rows.length > 0 && (
        <AdminStats label="Guides at a glance" columns={3}>
          <StatCard label="Guides written here" value={rows.length.toLocaleString()} source={`${(rows.length - live).toLocaleString()} ${rows.length - live === 1 ? "draft" : "drafts"}`} icon={<IconBook size={20} />} variant="accent" />
          <StatCard label="Live on the site" value={live.toLocaleString()} source="Anyone can read these" icon={<IconEye size={20} />} />
          <StatCard label="About one game" value={`${pct}%`} source={`${gameSpecificCount.toLocaleString()} of ${rows.length.toLocaleString()} · keep it under a third`} icon={<IconTarget size={20} />} />
        </AdminStats>
      )}

      {pct > 33 && (
        <Alert variant="warning" title="Too many guides are about one game">
          More than a third of these are about a single game. Write a few that work for any game night before adding more game-specific ones.
        </Alert>
      )}

      <AdminSection
        title="All guides"
        intro="Newest changes first. The two built-in guides aren't listed here because they're part of the site itself; anything written here shows next to them."
      >
        {rows.length === 0 ? (
          <EmptyState
            variant="bordered"
            icon={<IconBook size={28} />}
            title="No guides written here yet"
            description="Paste a finished draft to start one. It stays a draft until you publish it."
            action={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setEditing({ ...BLANK })}>New guide</Button>}
          />
        ) : (
          <>
            <AdminTable label="Guides">
              <Table variant="striped" hoverable dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guide</TableHead><TableHead>Topic</TableHead><TableHead>Status</TableHead>
                    <TableHead align="right">Read time</TableHead><TableHead>Last changed</TableHead><TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <button type="button" className="admin-table__link admin-library-open" onClick={() => edit(r)}>{r.title}</button>
                        <span className="admin-table__sub">/guides/{r.slug}{r.game_specific ? ` · ${GAME_OPTIONS.find((g) => g.value === r.game_specific)?.label ?? "One game"}` : ""}</span>
                      </TableCell>
                      <TableCell>{clusterLabel(r.cluster)}</TableCell>
                      <TableCell><Badge size="small" variant={r.published ? "success" : "default"}>{r.published ? "Live" : "Draft"}</Badge></TableCell>
                      <TableCell align="right" className="admin-num">{r.minutes} min</TableCell>
                      <TableCell className="admin-num">{day(r.updated_at)}</TableCell>
                      <TableCell align="right">
                        <span className="admin-row-actions">
                          <Button variant="ghost" size="small" onClick={() => edit(r)} aria-label={`Edit ${r.title}`}>Edit</Button>
                          <AdminRowMenu
                            label={`More for ${r.title}`}
                            items={[
                              ...(r.published ? [{ label: "Open on the site", onClick: () => window.open(`/guides/${r.slug}`, "_blank", "noopener") }] : []),
                              { label: "Delete", danger: true, onClick: () => void remove(r) },
                            ]}
                          />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
            {rows.length > limit && (
              <div>
                <Button variant="ghost" size="small" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, rows.length - limit)} more of {rows.length.toLocaleString()}
                </Button>
              </div>
            )}
          </>
        )}
      </AdminSection>

      {editing && (
        <GuideModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function GuideModal({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  // A new guide's address follows its title until someone types one.
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const isNew = !initial.id;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const requestClose = async () => {
    if (saving) return;
    if (dirty && !(await confirm({ title: "Close without saving?", body: "Your changes to this guide will be lost.", confirmLabel: "Discard changes" }))) return;
    onClose();
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guides", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error ?? "Couldn't save the guide. Try again."); return; }
      toast.success(form.published ? "Guide published." : "Draft saved.");
      await onSaved();
    } catch { toast.error("Couldn't reach the site. Check your connection and try again."); }
    finally { setSaving(false); }
  };

  const saveLabel = saving ? "Saving…" : !isNew ? "Save changes" : form.published ? "Publish" : "Save draft";
  const count = words(form.bodyMd);

  return (
    <Modal
      isOpen
      onClose={() => void requestClose()}
      title={isNew ? "New guide" : `Edit "${initial.title}"`}
      size="large"
      closeOnOverlayClick={false}
      primaryAction={{ label: saveLabel, onClick: () => void save() }}
      secondaryAction={{ label: "Cancel", onClick: () => void requestClose() }}
    >
      <div className="admin-form admin-library-form">
        <p className="admin-field__help admin-library-form__lead">
          Paste the finished draft as markdown (## for headings, - for lists). Any HTML in the text is ignored.
        </p>
        <Input
          fullWidth
          floatingLabel="Title"
          value={form.title}
          maxLength={140}
          onChange={(e) => {
            const title = e.target.value;
            setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
          }}
        />
        <div className="admin-field">
          <Input
            fullWidth
            floatingLabel="Web address"
            value={form.slug}
            aria-describedby="guide-slug-note"
            onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
          />
          <p id="guide-slug-note" className="admin-field__help">
            {form.slug ? `Lives at /guides/${form.slug}.` : "Filled in from the title."} Lowercase words joined with dashes. Changing it after publishing breaks links people already have.
          </p>
        </div>
        <div className="admin-field">
          <Textarea
            fullWidth
            floatingLabel="Description"
            value={form.description}
            rows={2}
            aria-describedby="guide-desc-note"
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <p id="guide-desc-note" className="admin-field__help">One sentence. It shows on the guides page and under the title in search results.</p>
        </div>
        <div className="admin-library-form__row">
          <Select fullWidth floatingLabel="Topic" value={form.cluster} onChange={(v) => setForm((f) => ({ ...f, cluster: typeof v === "string" ? v : v[0] }))} options={CLUSTER_OPTIONS} />
          <Select
            fullWidth
            floatingLabel="About one game?"
            value={form.gameSpecific || NO_GAME}
            onChange={(v) => { const g = typeof v === "string" ? v : v[0]; setForm((f) => ({ ...f, gameSpecific: g === NO_GAME ? "" : g })); }}
            options={GAME_OPTIONS}
          />
          <Input
            fullWidth
            type="number"
            min={1}
            max={90}
            floatingLabel="Read time (minutes)"
            value={String(form.minutes)}
            onChange={(e) => setForm((f) => ({ ...f, minutes: Number(e.target.value) || 6 }))}
          />
        </div>
        <div className="admin-field">
          <Textarea
            fullWidth
            floatingLabel="Guide text (markdown)"
            value={form.bodyMd}
            rows={16}
            spellCheck
            aria-describedby="guide-body-note"
            onChange={(e) => setForm((f) => ({ ...f, bodyMd: e.target.value }))}
          />
          <p id="guide-body-note" className="admin-field__help admin-num">
            {count ? `${count.toLocaleString()} ${count === 1 ? "word" : "words"}` : "Empty. A guide needs text before it can be published."}
          </p>
        </div>
        <Switch
          label="Published"
          helperText={form.published ? "Shows on the guides page as soon as you save." : "Off: saves as a draft, hidden from the site."}
          checked={form.published}
          onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
        />
      </div>
    </Modal>
  );
}
