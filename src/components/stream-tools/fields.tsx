"use client";

/**
 * Shared Stream Tools form fields, used by the per-tool config cards in BOTH
 * the account Stream Tools tab and the Hub Stream Tools tab so the editing UX
 * is identical in both places.
 */

import type { CSSProperties } from "react";

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 34, height: 28, border: "1px solid var(--border-default)", borderRadius: 6, background: "none", padding: 0, cursor: "pointer" }}
      />
      {label}
    </label>
  );
}

/** Accent picker that follows the global brand theme by default ("brand"), with
 *  a Custom mode for a per-tool hex override. Store value is "brand" | hex. */
export function AccentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const brand = !value || value === "brand";
  const segBtn = (active: boolean): CSSProperties => ({
    padding: "3px 10px",
    fontSize: "var(--font-size-12)",
    fontWeight: "var(--font-weight-semibold)",
    cursor: "pointer",
    border: "none",
    background: active ? "var(--bg-primary)" : "transparent",
    color: active ? "var(--text-on-primary)" : "var(--text-secondary)",
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)", flexWrap: "wrap" }}>
      <span>{label}</span>
      <span style={{ display: "inline-flex", borderRadius: 999, border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <button type="button" style={segBtn(brand)} onClick={() => onChange("brand")}>Theme</button>
        <button type="button" style={segBtn(!brand)} onClick={() => onChange(brand ? "#2f6fd6" : value)}>Custom</button>
      </span>
      {brand ? (
        <span
          title="Follows your brand theme (set it in the Theme tab)"
          style={{ width: 34, height: 28, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--brand-primary)" }}
        />
      ) : (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 34, height: 28, border: "1px solid var(--border-default)", borderRadius: 6, background: "none", padding: 0, cursor: "pointer" }}
        />
      )}
    </span>
  );
}

/** Load a streamer module default config (gameSlug "*"). */
export async function loadModuleConfig<T>(moduleId: string): Promise<Partial<T> | null> {
  try {
    const res = await fetch(`/api/account/module-defaults?moduleId=${moduleId}&gameSlug=*`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return (body.config as Partial<T> | null) ?? null;
  } catch {
    return null;
  }
}

/** Save a streamer module default config (gameSlug "*"). */
export async function saveModuleConfig(moduleId: string, config: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/account/module-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, gameSlug: "*", config }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
