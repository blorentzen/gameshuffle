"use client";

/**
 * Overlay Layout tab — WYSIWYG editor for where each streamer tool sits on the
 * OBS overlay, per format (16:9 / 9:16 / 1:1). Renders the REAL overlay
 * components at true resolution scale (a 1920×1080 / 1080×1920 frame scaled to
 * fit) with sample data, so sizes match what OBS shows. Drag a handle to move a
 * tool; tune scale + visibility. A Preview toggle hides the handles + safe-area
 * guide so you see exactly what viewers will — no OBS/stream needed. Saves a
 * LayoutProfile per format to gs_overlay_layouts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox } from "@empac/cascadeds";
import {
  DEFAULT_SAFE_AREA,
  placementStyle,
  anchorPointPct,
  resolvedAnchor,
  offsetForAnchorAt,
  isPlacementEnabled,
  type ElementPlacement,
  type LayoutProfile,
  type OverlayFormat,
} from "@/lib/overlay/format";
import { DEFAULT_TIERS, DEFAULT_BINGO_PROMPTS } from "@/lib/modules/registry";
import { DiceOverlay } from "@/components/overlay/DiceOverlay";
import { CoinOverlay } from "@/components/overlay/CoinOverlay";
import { OracleOverlay } from "@/components/overlay/OracleOverlay";
import { NamePickerOverlay } from "@/components/overlay/NamePickerOverlay";
import { TimerOverlay } from "@/components/overlay/TimerOverlay";
import { BingoOverlay } from "@/components/overlay/BingoOverlay";
import { TierListOverlay } from "@/components/overlay/TierListOverlay";
import "@/styles/overlay.css";

const TOOLS: { id: string; label: string; emoji: string }[] = [
  { id: "dice", label: "Dice", emoji: "🎲" },
  { id: "coin", label: "Coin", emoji: "🪙" },
  { id: "oracle", label: "Oracle", emoji: "🎱" },
  { id: "name_picker", label: "Raffle", emoji: "🎟️" },
  { id: "timer", label: "Timer", emoji: "⏱️" },
  { id: "bingo", label: "Bingo", emoji: "🅱️" },
  { id: "tierlist", label: "Tier List", emoji: "📊" },
];

// Reference resolution per format. The frame renders at the reference
// resolution and is scaled to the responsive on-screen width so the real
// components size exactly as they will on stream. `cap` bounds the on-screen
// width (portrait is tall, so it's capped smaller to stay on screen).
const FORMATS: {
  id: OverlayFormat;
  label: string;
  refW: number;
  refH: number;
  cap: number;
}[] = [
  { id: "landscape", label: "16:9", refW: 1920, refH: 1080, cap: 1280 },
  { id: "portrait", label: "9:16", refW: 1080, refH: 1920, cap: 520 },
  { id: "square", label: "1:1", refW: 1080, refH: 1080, cap: 760 },
];

type Profiles = Partial<Record<OverlayFormat, LayoutProfile>>;

export function OverlayLayoutTab() {
  const [profiles, setProfiles] = useState<Profiles>({});
  const [format, setFormat] = useState<OverlayFormat>("landscape");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);
  const [containerW, setContainerW] = useState(720);

  // Track the available width so the preview fills the account content area
  // (capped per format) instead of a fixed small box.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Sample payloads for the real overlay components. Stable refs so entrance
  // animations (name-picker spin, dice tumble) run once, not on every drag.
  const samples = useMemo(() => {
    const bingoSquares = Array.from({ length: 25 }, (_, i) =>
      i === 12 ? "★" : DEFAULT_BINGO_PROMPTS[i % DEFAULT_BINGO_PROMPTS.length],
    );
    return {
      dice: { values: [4, 2], dieColor: "#eef1f6", pipColor: "#1b2740" },
      coin: { result: "heads" as const, headsColor: "#e6b23c", tailsColor: "#d9a94f" },
      oracle: {
        kind: "eightball" as const,
        title: "Magic 8-Ball",
        answer: "It is certain",
        tone: "yes" as const,
        accentColor: "#2f6fd6",
      },
      name_picker: {
        winners: ["luckyviewer"],
        entries: 34,
        sample: ["chatninja", "pixelqueen", "n00bslayer", "streamfan", "gg_ez", "kartgod"],
      },
      timer: {
        endsAt: new Date(Date.now() + 4 * 60_000 + 37_000).toISOString(),
        seconds: 277,
        label: "Break",
        accentColor: "#2f6fd6",
        stopped: false,
      },
      bingo: {
        size: 5,
        squares: bingoSquares,
        marked: [0, 1, 2, 3, 4, 12, 7, 18],
        freeCenter: true,
        lines: 1,
        accentColor: "#7c3aed",
        justWon: false,
        cleared: false,
      },
      tierlist: {
        title: "Tier List",
        tiers: DEFAULT_TIERS,
        items: [
          { id: 0, text: "Rainbow Road", tier: "S" },
          { id: 1, text: "Coconut Mall", tier: "S" },
          { id: 2, text: "Bowser's Castle", tier: "A" },
          { id: 3, text: "Baby Park", tier: "C" },
          { id: 4, text: "Moo Moo Meadows", tier: "B" },
        ],
        accentColor: "#2f6fd6",
        cleared: false,
      },
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
          [format]: { ...cur, elements: { ...cur.elements, [toolId]: { ...curEl, ...patch } } },
        };
      });
    },
    [format],
  );

  const pointerToPct = (clientX: number, clientY: number) => {
    const el = stageRef.current;
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
  const stageW = Math.max(280, Math.min(containerW - 4, fmt.cap));
  const scale = stageW / fmt.refW;
  const stageH = fmt.refH * scale;
  const safe = profile.safeArea ?? DEFAULT_SAFE_AREA[format];
  const selectedEl = selected ? profile.elements[selected] : undefined;
  const selectedScale = selectedEl?.scale ?? 1;
  const selectedEnabled = selected ? isPlacementEnabled(format, selected, profiles[format]) : true;

  // Editor-only: fan out handles that resolve to (nearly) the same point so
  // stacked tools (e.g. dice + coin default bottom-center) stay individually
  // grabbable. Display-only — never touches the stored placement.
  const handleStagger: Record<string, number> = {};
  const seenPts: { x: number; y: number; n: number }[] = [];
  for (const t of TOOLS) {
    const pt = anchorPointPct(format, t.id, profiles[format]);
    const hit = seenPts.find((s) => Math.abs(s.x - pt.x) < 4 && Math.abs(s.y - pt.y) < 6);
    if (hit) {
      hit.n += 1;
      handleStagger[t.id] = hit.n;
    } else {
      seenPts.push({ x: pt.x, y: pt.y, n: 0 });
      handleStagger[t.id] = 0;
    }
  }

  const renderComponent = (toolId: string) => {
    const style = placementStyle(format, toolId, profiles[format]);
    switch (toolId) {
      case "dice":
        return <DiceOverlay payload={samples.dice} style={style} />;
      case "coin":
        return <CoinOverlay payload={samples.coin} style={style} />;
      case "oracle":
        return <OracleOverlay payload={samples.oracle} style={style} />;
      case "name_picker":
        return <NamePickerOverlay payload={samples.name_picker} style={style} />;
      case "timer":
        return <TimerOverlay payload={samples.timer} style={style} />;
      case "bingo":
        return <BingoOverlay payload={samples.bingo} style={style} />;
      case "tierlist":
        return <TierListOverlay payload={samples.tierlist} style={style} />;
      default:
        return null;
    }
  };

  return (
    <div className="overlay-layout-tab" ref={rootRef}>
      <h2 className="account-tab__heading">Overlay Layout</h2>
      <p className="account-tab__intro">
        Position each tool on your OBS overlay — shown at real size with sample data, so it matches
        what viewers see. Drag a handle to move a tool, tune its size + visibility, then hit Preview
        to see the finished overlay. Each aspect ratio saves separately (16:9 for Twitch, 9:16 for a
        vertical/TikTok co-stream); untouched formats use the smart defaults.
      </p>
      {!preview && (
        <p
          style={{
            fontSize: "var(--font-size-13)",
            color: "var(--text-secondary)",
            margin: "0 0 var(--spacing-16)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 26,
              height: 15,
              border: "1px dashed rgba(160,160,160,0.9)",
              borderRadius: 3,
            }}
          />
          The dashed box is the <strong>safe area</strong> — keep tools inside it so they never
          land under your webcam, chat box, or the platform&rsquo;s own chrome.{" "}
          {format === "landscape"
            ? "Landscape reserves the lower third (webcam/alerts) + thin side/top margins."
            : format === "portrait"
              ? "Portrait reserves the top handle, bottom captions, and the right action rail (like/comment/share)."
              : "Square keeps even margins on all sides."}
        </p>
      )}

      {/* Toolbar: format + preview toggle */}
      <div style={{ display: "flex", gap: "var(--spacing-8)", marginBottom: "var(--spacing-16)", flexWrap: "wrap", alignItems: "center" }}>
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
        <span style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 4px" }} />
        <Button variant={preview ? "primary" : "secondary"} size="small" onClick={() => setPreview((p) => !p)}>
          {preview ? "◉ Preview" : "○ Preview"}
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)", alignItems: "flex-start" }}>
        {/* Stage — scaled real-component frame + drag handles */}
        <div
          ref={stageRef}
          style={{
            position: "relative",
            width: stageW,
            height: stageH,
            borderRadius: 12,
            border: "1px solid var(--border-default)",
            background:
              "repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, rgba(0,0,0,0.25) 0% 50%) 50% / 24px 24px, #14171c",
            overflow: "hidden",
            touchAction: "none",
            userSelect: "none",
            flex: "0 0 auto",
          }}
        >
          {/* Real components at reference resolution, scaled to fit */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: fmt.refW,
              height: fmt.refH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              opacity: preview ? 1 : 0.9,
            }}
          >
            {TOOLS.map((t) =>
              isPlacementEnabled(format, t.id, profiles[format]) ? (
                <div key={t.id}>{renderComponent(t.id)}</div>
              ) : null,
            )}
          </div>

          {/* Safe-area guide (edit mode only) — the zone that stays clear of
              webcam / chat / platform UI. Labeled so it's self-explanatory. */}
          {!preview && (
            <div
              style={{
                position: "absolute",
                left: `${safe.left}%`,
                top: `${safe.top}%`,
                right: `${safe.right}%`,
                bottom: `${safe.bottom}%`,
                border: "1px dashed rgba(255,255,255,0.45)",
                borderRadius: 6,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  left: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                Safe area
              </span>
            </div>
          )}

          {/* Drag handles (edit mode only) */}
          {!preview &&
            TOOLS.map((t) => {
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
                    transform: `translate(-50%, calc(-50% + ${handleStagger[t.id] * 22}px))`,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "2px 6px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    cursor: "grab",
                    border: isSel ? "2px solid var(--bg-primary, #2f6fd6)" : "1px solid rgba(255,255,255,0.35)",
                    background: enabled ? "rgba(20,25,35,0.92)" : "rgba(80,80,80,0.7)",
                    color: enabled ? "#fff" : "rgba(255,255,255,0.55)",
                    boxShadow: isSel
                      ? "0 0 0 3px color-mix(in srgb, var(--bg-primary, #2f6fd6) 35%, transparent)"
                      : "0 2px 8px rgba(0,0,0,0.5)",
                    zIndex: isSel ? 3 : 2,
                  }}
                >
                  <span aria-hidden>{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
        </div>

        {/* Inspector — a compact bar below the preview (selected tool's
            size + visibility), so the preview gets the full width. */}
        {!preview && (
          <div
            style={{
              width: "100%",
              maxWidth: stageW,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-16)",
              flexWrap: "wrap",
              minHeight: 56,
              padding: "10px 14px",
              borderRadius: "var(--radius-10, 0.625rem)",
              border: "1px solid var(--border-default)",
              background: "var(--surface-raised, var(--surface-default))",
            }}
          >
            {selected ? (
              <>
                <strong style={{ fontSize: "var(--font-size-15)", whiteSpace: "nowrap" }}>
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
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-14)", whiteSpace: "nowrap" }}>
                  Size {Math.round(selectedScale * 100)}%
                  <input
                    type="range"
                    min={50}
                    max={150}
                    step={5}
                    value={Math.round(selectedScale * 100)}
                    style={{ width: 160 }}
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
                    setProfiles((prev) => {
                      const cur = prev[format];
                      if (!cur) return prev;
                      const { [selected]: _drop, ...rest } = cur.elements;
                      void _drop;
                      return { ...prev, [format]: { ...cur, elements: rest } };
                    });
                  }}
                >
                  Reset to default
                </Button>
              </>
            ) : (
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
                Select a tool handle to adjust its size + visibility. Drag any handle to reposition it.
                Everything is shown at real size — <strong>Preview</strong> hides the handles.
              </p>
            )}
          </div>
        )}
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
function anchorToOffset(format: OverlayFormat, toolId: string, layout?: LayoutProfile | null) {
  const anchor = resolvedAnchor(format, toolId, layout);
  const pt = anchorPointPct(format, toolId, layout);
  return offsetForAnchorAt(format, anchor, pt.x, pt.y, layout?.safeArea);
}
