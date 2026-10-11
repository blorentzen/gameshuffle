"use client";

/**
 * Shared Stream Tools form fields, used by the per-tool config cards in BOTH
 * the account Stream Tools tab and the Hub Stream Tools tab so the editing UX
 * is identical in both places.
 */

import { ColorPicker, Switch } from "@empac/cascadeds";
export { isImageUrl } from "@/lib/overlay/imageItem";

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
    <span className="tool-color">
      <span className="tool-color__label">{label}</span>
      <ColorPicker variant="popover" allowCustom size="small" value={value} onChange={onChange} aria-label={label} />
    </span>
  );
}

/** Accent that follows the brand theme by default ("brand"), or a color of the
 *  tool's own. Store value is "brand" | hex. */
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
  return (
    <span className="tool-color tool-color--accent">
      <Switch label={`${label}: match my theme`} checked={brand} onChange={(e) => onChange(e.target.checked ? "brand" : "#2f6fd6")} />
      {brand ? (
        <span className="tool-color__brand" title="Your brand theme color (Account ▸ Theming)" aria-hidden />
      ) : (
        <ColorPicker variant="popover" allowCustom size="small" value={value} onChange={onChange} aria-label={label} />
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

/** Upload a tool image to R2; returns its public URL, or null on failure. */
export async function uploadToolImage(file: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/account/tool-image", { method: "POST", body: form });
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
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
