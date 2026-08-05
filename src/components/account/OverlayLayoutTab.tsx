"use client";

/**
 * Overlay Layout tab — WYSIWYG editor for where each streamer tool sits on the
 * OBS overlay, per format (16:9 landscape + 9:16 portrait + 1:1 square). Drag a
 * tool marker in the preview frame to reposition it; tune scale + visibility per
 * tool. Saves a LayoutProfile per format to gs_overlay_layouts; the overlay
 * applies it (falling back to the built-in defaults for any format left alone).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox } from "@empac/cascadeds";
import {
  DEFAULT_SAFE_AREA,
  anchorPointPct,
  resolvedAnchor,
  offsetForAnchorAt,
  isPlacementEnabled,
  type ElementPlacement,
  type LayoutProfile,
  type OverlayFormat,
} from "@/lib/overlay/format";

const TOOLS: { id: string; label: string; emoji: string }[] = [
  { id: "dice", label: "Dice", emoji: "🎲" },
  { id: "coin", label: "Coin", emoji: "🪙" },
  { id: "oracle", label: "Oracle", emoji: "🎱" },
  { id: "name_picker", label: "Raffle", emoji: "🎟️" },
  { id: "timer", label: "Timer", emoji: "⏱️" },
  { id: "bingo", label: "Bingo", emoji: "🅱️" },
  { id: "tierlist", label: "Tier List", emoji: "📊" },
];

const FORMATS: { id: OverlayFormat; label: string; ratio: number; width: number }[] = [
  { id: "landscape", label: "16:9", ratio: 16 / 9, width: 480 },
  { id: "portrait", label: "9:16", ratio: 9 / 16, width: 260 },
  { id: "square", label: "1:1", ratio: 1, width: 340 },
];

type Profiles = Partial<Record<OverlayFormat, LayoutProfile>>;

export function OverlayLayoutTab() {
  const [profiles, setProfiles] = useState<Profiles>({});
  const [format, setFormat] = useState<OverlayFormat>("landscape");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/account/overlay-layout", { cache: "no-store" });
      if (!alive) return;
      if (res.status === 401) {
        setHidden(true);
        return;
      }
      if (res.ok) {
        const body = await res.json();
        setProfiles((body.layouts as Profiles) ?? {});
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const profile = profiles[format] ?? { safeArea: null, elements: {} };

  const updateElement = useCallback(
    (toolId: string, patch: Partial<ElementPlacement>) => {
      setProfiles((prev) => {
        const cur = prev[format] ?? { safeArea: null, elements: {} };
        const curEl = cur.elements[toolId] ?? {};
        return {
          ...prev,
          [format]: {
            ...cur,
            elements: { ...cur.elements, [toolId]: { ...curEl, ...patch } },
          },
        };
      });
    },
    [format],
  );

  const pointerToPct = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const toolId = dragRef.current;
      if (!toolId) return;
      const pt = pointerToPct(e.clientX, e.clientY);
      if (!pt) return;
      const anchor = resolvedAnchor(format, toolId, profiles[format]);
      const offset = offsetForAnchorAt(format, anchor, pt.x, pt.y, profiles[format]?.safeArea);
      const existing = profiles[format]?.elements[toolId] ?? {};
      updateElement(toolId, {
        anchor,
        offsetPct: offset,
        scale: existing.scale ?? 1,
        enabled: existing.enabled ?? true,
      });
    },
    [format, profiles, updateElement],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const startDrag = (toolId: string, e: React.PointerEvent) => {
    e.preventDefault();
    setSelected(toolId);
    dragRef.current = toolId;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/account/overlay-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, profile }),
    });
    setSaving(false);
    setStatus(res.ok ? `${format} layout saved.` : "Couldn't save layout.");
    window.setTimeout(() => setStatus(null), 3500);
  };

  const resetFormat = async () => {
    setSaving(true);
    await fetch("/api/account/overlay-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, reset: true }),
    });
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[format];
      return next;
    });
    setSaving(false);
    setSelected(null);
    setStatus(`${format} reset to defaults.`);
    window.setTimeout(() => setStatus(null), 3500);
  };

  if (hidden) return null;
  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;

  const fmt = FORMATS.find((f) => f.id === format)!;
  const safe = profile.safeArea ?? DEFAULT_SAFE_AREA[format];
  const selectedEl = selected ? profile.elements[selected] : undefined;
  const selectedScale = selectedEl?.scale ?? 1;
  const selectedEnabled = selected ? isPlacementEnabled(format, selected, profiles[format]) : true;

  return (
    <div className="overlay-layout-tab">
      <h2 className="account-tab__heading">Overlay Layout</h2>
      <p className="account-tab__intro">
        Position each tool on your OBS overlay. Drag a marker to move it, then tune its size and
        visibility. Each aspect ratio saves separately — set up 16:9 for Twitch and 9:16 for a
        TikTok/vertical co-stream. Untouched formats use the smart defaults.
      </p>

      {/* Format switch */}
      <div style={{ display: "flex", gap: "var(--spacing-8)", marginBottom: "var(--spacing-16)" }}>
        {FORMATS.map((f) => (
          <Button
            key={f.id}
            variant={f.id === format ? "primary" : "secondary"}
            size="small"
            onClick={() => {
              setFormat(f.id);
              setSelected(null);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "var(--spacing-24)", flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Preview canvas */}
        <div
          ref={canvasRef}
          style={{
            position: "relative",
            width: fmt.width,
            aspectRatio: String(fmt.ratio),
            borderRadius: 12,
            border: "1px solid var(--border-default)",
            background:
              "repeating-conic-gradient(var(--surface-raised, #2a2a2a) 0% 25%, var(--surface-default, #1e1e1e) 0% 50%) 50% / 24px 24px",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {/* Safe-area guide */}
          <div
            style={{
              position: "absolute",
              left: `${safe.left}%`,
              top: `${safe.top}%`,
              right: `${safe.right}%`,
              bottom: `${safe.bottom}%`,
              border: "1px dashed var(--border-strong, #888)",
              borderRadius: 6,
              pointerEvents: "none",
              opacity: 0.5,
            }}
          />
          {/* Tool markers */}
          {TOOLS.map((t) => {
            const pt = anchorPointPct(format, t.id, profiles[format]);
            const enabled = isPlacementEnabled(format, t.id, profiles[format]);
            const isSel = selected === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onPointerDown={(e) => startDrag(t.id, e)}
                onClick={() => setSelected(t.id)}
                title={`${t.label} — drag to move`}
                style={{
                  position: "absolute",
                  left: `${pt.x}%`,
                  top: `${pt.y}%`,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 7px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  cursor: "grab",
                  border: isSel ? "2px solid var(--bg-primary, #2f6fd6)" : "1px solid rgba(255,255,255,0.3)",
                  background: enabled ? "rgba(20,25,35,0.9)" : "rgba(80,80,80,0.6)",
                  color: enabled ? "#fff" : "rgba(255,255,255,0.5)",
                  opacity: enabled ? 1 : 0.6,
                  boxShadow: isSel ? "0 0 0 3px color-mix(in srgb, var(--bg-primary, #2f6fd6) 30%, transparent)" : "0 2px 8px rgba(0,0,0,0.4)",
                  zIndex: isSel ? 2 : 1,
                }}
              >
                <span aria-hidden>{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Inspector */}
        <div style={{ minWidth: 220, flex: 1, display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          {selected ? (
            <>
              <strong style={{ fontSize: "var(--font-size-16)" }}>
                {TOOLS.find((t) => t.id === selected)?.emoji} {TOOLS.find((t) => t.id === selected)?.label}
              </strong>
              <Checkbox
                label="Show on this format"
                checked={selectedEnabled}
                onChange={(e) =>
                  updateElement(selected, {
                    enabled: e.target.checked,
                    anchor: resolvedAnchor(format, selected, profiles[format]),
                    offsetPct: anchorToOffset(format, selected, profiles[format]),
                    scale: selectedScale,
                  })
                }
              />
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--font-size-14)" }}>
                Size: {Math.round(selectedScale * 100)}%
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={Math.round(selectedScale * 100)}
                  onChange={(e) =>
                    updateElement(selected, {
                      scale: Number(e.target.value) / 100,
                      anchor: resolvedAnchor(format, selected, profiles[format]),
                      offsetPct: anchorToOffset(format, selected, profiles[format]),
                      enabled: selectedEnabled,
                    })
                  }
                />
              </label>
              <Button
                variant="ghost"
                size="small"
                onClick={() => {
                  // Remove this tool's override → back to its default.
                  setProfiles((prev) => {
                    const cur = prev[format];
                    if (!cur) return prev;
                    const { [selected]: _drop, ...rest } = cur.elements;
                    void _drop;
                    return { ...prev, [format]: { ...cur, elements: rest } };
                  });
                }}
              >
                Reset {TOOLS.find((t) => t.id === selected)?.label} to default
              </Button>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
              Select a tool marker to adjust its size and visibility. Drag any marker to reposition it.
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--spacing-8)", marginTop: "var(--spacing-16)", alignItems: "center" }}>
        <Button variant="primary" loading={saving} onClick={save}>
          Save {fmt.label} layout
        </Button>
        <Button variant="ghost" onClick={resetFormat} disabled={saving}>
          Reset {fmt.label} to defaults
        </Button>
        {status ? <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>{status}</span> : null}
      </div>
    </div>
  );
}

/** Keep a tool's current on-screen anchor point when we edit scale/enabled
 *  (so toggling visibility or size never nudges its position). */
function anchorToOffset(
  format: OverlayFormat,
  toolId: string,
  layout?: LayoutProfile | null,
) {
  const anchor = resolvedAnchor(format, toolId, layout);
  const pt = anchorPointPct(format, toolId, layout);
  return offsetForAnchorAt(format, anchor, pt.x, pt.y, layout?.safeArea);
}
