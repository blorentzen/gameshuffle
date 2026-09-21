"use client";

/**
 * Custom CSS editor (Brand & Theme tab, Advanced) — power-user CSS for the /u
 * profile. Saving sends the raw CSS to /api/account/profile-css, which sanitizes
 * it server-side (scopes selectors to your profile, allowlists properties,
 * restricts url() to GameShuffle's CDN, strips @import/expression/etc.) and
 * returns the applied result + a list of anything it removed. Only the sanitized
 * CSS is ever stored or rendered.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function ProfileCssEditor() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [css, setCss] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile-css")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && typeof j?.css === "string") { setCss(j.css); if (j.css.trim()) setOpen(true); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setWarnings([]);
    try {
      const res = await fetch("/api/account/profile-css", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ css }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setCss(typeof j.css === "string" ? j.css : "");
        setWarnings(Array.isArray(j.warnings) ? j.warnings : []);
        toast.success("Custom CSS saved.");
      } else {
        toast.error(j?.error === "migration_pending" ? "Custom CSS isn't enabled yet." : "Couldn't save. Try again.");
      }
    } catch { toast.error("Network error. Try again."); }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 className="account-tab__heading" style={{ margin: 0 }}>Custom CSS <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", fontWeight: 400 }}>Advanced</span></h2>
        {!open && <Button variant="secondary" size="small" onClick={() => setOpen(true)}>Open editor</Button>}
      </div>
      <p className="account-tab__intro">
        Fine-tune your profile with your own CSS. Selectors are automatically scoped to your profile
        (write <code>.pcard</code>, not <code>.u-custom .pcard</code>), only safe properties are kept, and
        images must come from your GameShuffle uploads. Anything else is removed on save and listed below.
      </p>

      {open && (
        <>
          <textarea
            value={css}
            onChange={(e) => setCss(e.target.value)}
            spellCheck={false}
            placeholder={".pcard { border-radius: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.25); }\n.profile-hero__name { letter-spacing: .02em; }"}
            style={{
              width: "100%", minHeight: 220, resize: "vertical",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "var(--font-size-14)", lineHeight: 1.5,
              padding: "var(--spacing-12)", borderRadius: "var(--gs-radius-sm, 0.6rem)",
              border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
          {warnings.length > 0 && (
            <ul style={{ margin: "var(--spacing-12) 0 0", paddingLeft: "1.1rem", color: "var(--warning-700, #a15c00)", fontSize: "var(--font-size-12)" }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <div style={{ display: "flex", gap: "var(--spacing-8)", marginTop: "var(--spacing-12)" }}>
            <Button variant="primary" size="small" loading={saving} onClick={save}>Save CSS</Button>
            <Button variant="ghost" size="small" disabled={saving} onClick={() => { setCss(""); }}>Clear</Button>
          </div>
        </>
      )}
    </div>
  );
}
