"use client";

/**
 * Profile layout editor (Brand & Theme tab) — reorder + show/hide the widget
 * blocks on the public /u profile, and choose a 1- or 2-column grid. Autosaves
 * (debounced) through /api/account/profile-layout, which re-validates the shape
 * server-side.
 *
 * Ordering is drag-and-drop via the shared SortableList, with Move up / Move
 * down kept as the non-drag path (see that file for why both exist).
 */

import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Icon, Switch } from "@empac/cascadeds";
import { SortableList, moveWithin } from "@/components/ui/SortableList";
import { useToast } from "@/components/toast/ToastProvider";
import {
  DEFAULT_PROFILE_LAYOUT,
  PROFILE_SECTION_LABELS,
  resolveProfileLayout,
  type ProfileLayout,
  type ProfileSectionKey,
} from "@/lib/profile/layout";

export function ProfileLayoutEditor() {
  const toast = useToast();
  const [layout, setLayout] = useState<ProfileLayout>(DEFAULT_PROFILE_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const armed = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile-layout")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.layout) setLayout(resolveProfileLayout(j.layout)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Autosave edits (debounced), skipping the initial load.
  useEffect(() => {
    if (!armed.current) { armed.current = true; return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/account/profile-layout", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }),
        });
        if (res.ok) setSaveState("saved");
        else { setSaveState("error"); if ((await res.json().catch(() => null))?.error === "migration_pending") toast.error("Layout saving isn't enabled yet."); }
      } catch { setSaveState("error"); }
    }, 600);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const move = (i: number, dir: -1 | 1) =>
    setLayout((l) => ({ ...l, order: moveWithin(l.order, i, dir) }));
  const reorder = (order: ProfileSectionKey[]) => setLayout((l) => ({ ...l, order }));
  const toggle = (key: ProfileSectionKey) => {
    setLayout((l) => ({
      ...l,
      hidden: l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key],
    }));
  };

  if (loading) {
    return <div className="account-card"><p style={{ color: "var(--text-secondary)" }}>Loading layout…</p></div>;
  }

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 className="account-tab__heading" style={{ margin: 0 }}>Profile layout</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>
      <p className="account-tab__intro">
        Choose which blocks appear on your public profile and the order they show in.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-16)" }}>
        <span className="account-card__label">Columns</span>
        {([1, 2] as const).map((c) => (
          <Button
            key={c}
            variant={layout.columns === c ? "primary" : "secondary"}
            size="small"
            onClick={() => setLayout((l) => ({ ...l, columns: c }))}
          >
            {c === 1 ? "Single" : "Two"}
          </Button>
        ))}
      </div>

      <SortableList
        items={layout.order}
        getId={(key) => key}
        onReorder={reorder}
        handleLabel={(key) => `Reorder ${PROFILE_SECTION_LABELS[key]}`}
        style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}
      >
        {(key, handle, i) => {
          const visible = !layout.hidden.includes(key);
          return (
            <div
              style={{
                display: "flex", alignItems: "center", gap: "var(--spacing-8)",
                padding: "var(--spacing-8) var(--spacing-12)",
                border: "1px solid var(--border-subtle, var(--border-default))",
                borderRadius: "var(--gs-radius-sm, 0.6rem)",
                background: "var(--surface-default)",
                opacity: visible ? 1 : 0.6,
              }}
            >
              {handle}
              <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{PROFILE_SECTION_LABELS[key]}</span>
              <Switch checked={visible} onChange={() => toggle(key)} aria-label={`Show ${PROFILE_SECTION_LABELS[key]}`} />
              <IconButton variant="tertiary" size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="chevron-up" size="18" />
              </IconButton>
              <IconButton variant="tertiary" size="small" aria-label="Move down" disabled={i === layout.order.length - 1} onClick={() => move(i, 1)}>
                <Icon name="chevron-down" size="18" />
              </IconButton>
            </div>
          );
        }}
      </SortableList>
    </div>
  );
}
