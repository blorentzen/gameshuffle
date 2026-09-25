"use client";

/**
 * Brand-theme picker for an event's public page, opened from the OwnerBar.
 *
 * The theme already existed, buried in "Page branding" on the manage route —
 * a grid of swatches whose whole effect is on a DIFFERENT page. You picked one
 * blind, navigated to the public page, and found out. It is the clearest case
 * for the drawer: the thing being chosen is only visible where it is not being
 * chosen.
 *
 * The header image stays on manage. It is an upload and a crop, not a choice
 * you make by looking, and the manage card already previews the result.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/ToastProvider";
import { BRAND_THEMES, getBrandTheme, brandCssVars, DEFAULT_BRAND_THEME_ID } from "@/lib/theme/brand";

/** Every var brandCssVars can emit, so switching back to Default clears the
 *  ones the previous theme set instead of leaving them on the element. */
const BRAND_VARS = ["--brand-primary", "--brand-accent", "--brand-gradient", "--brand-on", "--brand-fill", "--brand-ink"];

export function EventCustomizeEditor({
  table,
  rowId,
  initialTheme,
}: {
  /** Which table holds the row. Both public event pages render EventShell. */
  table: "tournaments" | "board_game_nights";
  rowId: string;
  initialTheme: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme || DEFAULT_BRAND_THEME_ID);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  const paint = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>("main.event-shell");
    if (!el) return;
    const vars = brandCssVars(getBrandTheme(id)) as Record<string, string>;
    for (const k of BRAND_VARS) {
      if (k in vars) el.style.setProperty(k, vars[k]);
      else el.style.removeProperty(k);
    }
  }, []);

  useEffect(() => { if (open) paint(theme); }, [open, theme, paint]);

  const pick = (id: string) => { dirty.current = true; setTheme(id); };

  const save = async () => {
    setSaving(true);
    const { error } = await createClient().from(table).update({ brand_theme: theme }).eq("id", rowId);
    setSaving(false);
    if (error) { toast.error("Couldn't save the theme. Try again."); return; }
    toast.success("Theme saved.");
    dirty.current = false;
    setOpen(false);
    router.refresh();
  };

  const cancel = () => {
    // Put the saved theme back, not the default: the page may already have had
    // one before the drawer opened.
    if (dirty.current) { setTheme(initialTheme || DEFAULT_BRAND_THEME_ID); paint(initialTheme || DEFAULT_BRAND_THEME_ID); dirty.current = false; }
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" size="small" onClick={() => setOpen(true)}>Customize</Button>
      <Drawer
        open={open}
        onClose={cancel}
        position="right"
        size="compact"
        title="Customize this page"
        subtitle="Pick a theme and watch the page change behind this panel."
        /* No overlay: the page behind IS the preview. */
        showOverlay={false}
        primaryAction={{ label: saving ? "Saving…" : "Save", onClick: save }}
        secondaryAction={{ label: "Cancel", onClick: cancel }}
      >
        <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Brand color theme</span>
        <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          {BRAND_THEMES.map((bt) => (
            <button
              key={bt.id}
              type="button"
              onClick={() => pick(bt.id)}
              aria-pressed={theme === bt.id}
              title={bt.name}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                border: `2px solid ${theme === bt.id ? "var(--primary-500)" : "var(--border-default)"}`,
                borderRadius: "var(--radius-8, 8px)", padding: "var(--spacing-6, 6px)",
                background: "var(--surface-default)", cursor: "pointer",
              }}
            >
              <span style={{ width: 52, height: 28, borderRadius: 6, background: bt.gradient, display: "block" }} />
              <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>{bt.name}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "var(--spacing-12)" }}>
          Header images and the rest of the event&rsquo;s setup are on the manage page.
        </p>
      </Drawer>
    </>
  );
}
