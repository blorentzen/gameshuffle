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
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Switch, Textarea } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { GUIDE_CLUSTERS } from "@/lib/guides/manifest";
import { IconAction, RowActions } from "@/components/actions/IconAction";
import { IconPencil, IconTrash } from "@tabler/icons-react";

interface Row {
  id: string; slug: string; title: string; description: string; cluster: string;
  body_md: string; minutes: number; game_specific: string | null;
  published: boolean; updated_at: string;
}

const BLANK = {
  id: "", slug: "", title: "", description: "",
  cluster: GUIDE_CLUSTERS[0].id as string,
  bodyMd: "", minutes: 6, gameSpecific: "", published: false,
};

const CLUSTER_OPTIONS = GUIDE_CLUSTERS.map((c) => ({ value: c.id, label: c.label }));
const GAME_OPTIONS = [
  { value: "", label: "Not about one game" },
  { value: "mario-kart", label: "Mario Kart" },
  { value: "pokemon-tcg", label: "Pokémon TCG" },
];

/** Title to slug, matching the server's rule so the two never disagree. */
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function PlatformGuidesTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "not_migrated" | "error">("loading");
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

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

  useEffect(() => { void load(); }, [load]);

  const edit = (r: Row) => {
    setForm({
      id: r.id, slug: r.slug, title: r.title, description: r.description,
      cluster: r.cluster, bodyMd: r.body_md, minutes: r.minutes,
      gameSpecific: r.game_specific ?? "", published: r.published,
    });
    setSlugTouched(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guides", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error ?? "Couldn't save."); return; }
      toast.success(form.published ? "Guide published." : "Draft saved.");
      setForm({ ...BLANK });
      setSlugTouched(false);
      await load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  };

  const remove = async (r: Row) => {
    const res = await fetch(`/api/admin/guides?id=${r.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't delete."); return; }
    toast.success("Guide deleted.");
    await load();
  };

  if (state === "loading") return <div className="account-card"><p>Loading guides…</p></div>;

  if (state === "not_migrated") {
    return (
      <div className="account-card">
        <h2>Guides</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          The editor is ready but its table is not. Apply{" "}
          <code>supabase/guides-m1.sql</code> and reload. Until then the two
          file-backed guides keep serving, and nothing on <code>/guides</code> is affected.
        </p>
      </div>
    );
  }

  if (state === "error") {
    return <div className="account-card"><p>Couldn&rsquo;t load guides. You may not have permission.</p></div>;
  }

  const gameSpecificCount = rows.filter((r) => r.game_specific).length;
  const pct = rows.length ? Math.round((gameSpecificCount / rows.length) * 100) : 0;

  return (
    <>
      <div className="account-card">
        <h2>{form.id ? "Edit guide" : "New guide"}</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-20)" }}>
          Paste a finished draft as markdown. It renders server-side, so it is in the
          HTML for crawlers. Raw HTML is ignored by design.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
          <label className="hub-form__field">
            <span className="account-card__label">Title</span>
            <Input
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
              }}
              placeholder="How to seed a tournament fairly"
            />
          </label>

          <label className="hub-form__field">
            <span className="account-card__label">Slug</span>
            <Input
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
              placeholder="how-to-seed-a-tournament"
            />
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
              Lives at /guides/{form.slug || "…"}. Changing it after publishing breaks existing links.
            </span>
          </label>

          <label className="hub-form__field">
            <span className="account-card__label">Description</span>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              fullWidth
              placeholder="One sentence. This is the meta description and the index card."
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))", gap: "var(--spacing-16)" }}>
            <label className="hub-form__field">
              <span className="account-card__label">Cluster</span>
              <Select value={form.cluster} onChange={(v) => setForm((f) => ({ ...f, cluster: typeof v === "string" ? v : v[0] }))} options={CLUSTER_OPTIONS} fullWidth />
            </label>
            <label className="hub-form__field">
              <span className="account-card__label">About one game?</span>
              <Select value={form.gameSpecific} onChange={(v) => setForm((f) => ({ ...f, gameSpecific: typeof v === "string" ? v : v[0] }))} options={GAME_OPTIONS} fullWidth />
            </label>
            <label className="hub-form__field">
              <span className="account-card__label">Read time (minutes)</span>
              <Input type="number" value={String(form.minutes)} onChange={(e) => setForm((f) => ({ ...f, minutes: Number(e.target.value) || 6 }))} />
            </label>
          </div>

          <label className="hub-form__field">
            <span className="account-card__label">Body (markdown)</span>
            <Textarea
              value={form.bodyMd}
              onChange={(e) => setForm((f) => ({ ...f, bodyMd: e.target.value }))}
              rows={18}
              fullWidth
              spellCheck
              placeholder={"## Work backwards from how long you have\n\nDecide the finish time first…"}
            />
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
              {form.bodyMd.trim() ? `${form.bodyMd.trim().split(/\s+/).length} words` : "Empty"}
            </span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
            <Switch checked={form.published} onChange={() => setForm((f) => ({ ...f, published: !f.published }))} />
            <span>Published{form.published ? "" : " (saves as a draft, invisible to everyone)"}</span>
          </label>

          <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={save} loading={saving}>
              {form.id ? "Save changes" : form.published ? "Publish" : "Save draft"}
            </Button>
            {form.id && (
              <Button variant="secondary" onClick={() => { setForm({ ...BLANK }); setSlugTouched(false); }}>
                New guide instead
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="account-card">
        <h2>All guides <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {rows.length}</span></h2>
        {rows.length > 0 && (
          <p style={{ fontSize: "var(--font-size-13, 13px)", color: pct > 33 ? "var(--warning-600, #b4530f)" : "var(--text-tertiary)", marginBottom: "var(--spacing-16)" }}>
            {gameSpecificCount} of {rows.length} ({pct}%) are about one game.
            {pct > 33 ? " Over the third we hold to; add game-agnostic guides." : " Ceiling is a third."}
          </p>
        )}
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            Nothing here yet. The two original guides still live in the repo; anything written
            here joins them on /guides.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", padding: "var(--spacing-12)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-8, 8px)", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, flex: 1, minWidth: "14rem" }}>{r.title}</span>
                <span style={{ fontSize: "var(--font-size-12)", padding: "0.15rem 0.5rem", borderRadius: 999, background: r.published ? "color-mix(in srgb, #16a34a 16%, transparent)" : "var(--surface-muted, rgba(0,0,0,0.05))", color: r.published ? "#15803d" : "var(--text-tertiary)" }}>
                  {r.published ? "Live" : "Draft"}
                </span>
                <RowActions>
                  <IconAction label="Edit this guide" icon={IconPencil} onClick={() => edit(r)} />
                  <IconAction label="Delete this guide" icon={IconTrash} variant="danger" onClick={() => remove(r)} />
                </RowActions>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
