"use client";

/**
 * Overlay Layout tab — WYSIWYG editor for where each streamer tool + app sits on
 * the OBS overlay, per format (16:9 / 9:16). Renders the REAL overlay components
 * at true resolution scale (a 1920×1080 / 1080×1920 frame scaled to fit) with
 * sample data, so sizes match what OBS shows. You click a piece directly in the
 * preview (or a chip in the palette, for hidden/stacked ones) to select it, then
 * drag the piece itself to reposition; tune scale + visibility in the inspector.
 * A Preview toggle drops the selection ring + safe-area guide so you see exactly
 * what viewers will — no OBS/stream needed. Saves a LayoutProfile per format to
 * gs_overlay_layouts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Button, Checkbox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { BrandThemeBar } from "@/components/account/BrandThemeBar";
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
import { TournamentRaceOverlay } from "@/components/overlay/TournamentRaceOverlay";
import { ComboOverlay } from "@/components/overlay/ComboOverlay";
import { WheelOverlay } from "@/components/overlay/WheelOverlay";
import { PollOverlay } from "@/components/overlay/PollOverlay";
import "@/styles/overlay.css";

type OverlayElement = { id: string; label: string; emoji: string };

/** Stream tools — the free tools ported onto the overlay. */
const TOOLS: OverlayElement[] = [
  { id: "dice", label: "Dice", emoji: "🎲" },
  { id: "coin", label: "Coin", emoji: "🪙" },
  { id: "oracle", label: "Oracle", emoji: "🎱" },
  { id: "name_picker", label: "Raffle", emoji: "🎟️" },
  { id: "timer", label: "Timer", emoji: "⏱️" },
  { id: "bingo", label: "Bingo", emoji: "🅱️" },
  { id: "tierlist", label: "Tier List", emoji: "📊" },
  { id: "poll", label: "Poll", emoji: "🗳️" },
];

/** Apps — the larger game surfaces on the overlay. More (overlay wheel, the
 *  randomizer combo card) land here as their overlay components become
 *  placement-aware. */
const APPS: OverlayElement[] = [
  { id: "tournament_race", label: "Tournament Race", emoji: "🏁" },
  { id: "randomizer_mk8dx", label: "MK8DX Combo", emoji: "🏎️" },
  { id: "randomizer_mkw", label: "MK World Combo", emoji: "🌎" },
  { id: "wheel", label: "Wheel", emoji: "🎡" },
];

const ALL_ELEMENTS: OverlayElement[] = [...TOOLS, ...APPS];

type ElementCategory = "tools" | "apps";

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
];

type Profiles = Partial<Record<OverlayFormat, LayoutProfile>>;

export function OverlayLayoutTab() {
  const [profiles, setProfiles] = useState<Profiles>({});
  const [format, setFormat] = useState<OverlayFormat>("landscape");
  const [category, setCategory] = useState<ElementCategory>("tools");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [overlayToken, setOverlayToken] = useState<string | null>(null);
  const toast = useToast();
  // The streamer's saved brand theme, applied to the preview frame so the stage
  // renders with their ACTUAL colors (WYSIWYG with the live overlay).
  const { vars: brandVars } = useBrandTheme();
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);
  // Grab point offset (pointer pct − element anchor pct at pointer-down) so the
  // piece follows the cursor from where you grabbed it, instead of snapping its
  // anchor under the cursor.
  const grabOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
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
        setOverlayToken((body.overlayToken as string | null) ?? null);
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
        accentColor: "brand",
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
        accentColor: "brand",
        stopped: false,
      },
      bingo: {
        size: 5,
        squares: bingoSquares,
        marked: [0, 1, 2, 3, 4, 12, 7, 18],
        freeCenter: true,
        lines: 1,
        accentColor: "brand",
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
        accentColor: "brand",
        cleared: false,
      },
      tournament_race: {
        tournamentTitle: "Spring Kart Cup",
        label: "Race 3 of 8",
        name: "Rainbow Road",
        img: null,
        index: 2,
        total: 8,
        cleared: false,
      },
      randomizer_mk8dx: {
        displayName: "streamer",
        slots: [
          { name: "Mario", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/mario.png" },
          { name: "Standard Kart", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/vehicles/standard-kart.webp" },
          { name: "Standard", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/wheels/standard.webp" },
          { name: "Super", img: "https://cdn.empac.co/gameshuffle/images/mk8dx/gliders/super.webp" },
        ],
      },
      randomizer_mkw: {
        displayName: "streamer",
        slots: [
          { name: "Baby Daisy", img: "https://cdn.empac.co/gameshuffle/images/mkworld/characters/BabyDaisy.png" },
          { name: "Bowser Bruiser", img: "https://cdn.empac.co/gameshuffle/images/mkworld/vehicles/ATV_Bowser_Bruiser.png" },
        ],
      },
      wheel: {
        id: "sample",
        segments: [
          { label: "Rainbow Road" },
          { label: "Baby Park" },
          { label: "Bowser's Castle" },
          { label: "Coconut Mall" },
          { label: "Moo Moo Meadows" },
          { label: "DK Summit" },
        ],
        winningIndex: 0,
        winningLabel: "Rainbow Road",
        triggeredBy: null,
      },
      poll: {
        id: "sample",
        question: "Which track next?",
        options: [
          { id: "1", label: "Rainbow Road" },
          { id: "2", label: "Coconut Mall" },
          { id: "3", label: "Baby Park" },
        ],
        tally: { total: 42, byOption: { "1": 22, "2": 13, "3": 7 } },
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
      const targetX = pt.x - grabOffsetRef.current.dx;
      const targetY = pt.y - grabOffsetRef.current.dy;
      const anchor = resolvedAnchor(format, toolId, profiles[format]);
      const offset = offsetForAnchorAt(format, anchor, targetX, targetY, profiles[format]?.safeArea);
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
    e.stopPropagation();
    setSelected(toolId);
    dragRef.current = toolId;
    // Record where on the piece the grab happened, relative to its anchor.
    const pt = pointerToPct(e.clientX, e.clientY);
    const anchorPt = anchorPointPct(format, toolId, profiles[format]);
    grabOffsetRef.current = pt
      ? { dx: pt.x - anchorPt.x, dy: pt.y - anchorPt.y }
      : { dx: 0, dy: 0 };
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
    if (res.ok) toast.success("Layout saved");
    else toast.error("Couldn't save your layout. Try again.");
  };

  const resetFormat = async () => {
    setSaving(true);
    const res = await fetch("/api/account/overlay-layout", {
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
    if (res.ok) toast.success("Layout reset to defaults");
    else toast.error("Couldn't reset your layout. Try again.");
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

  // The whole overlay always renders (so you see the finished picture), but
  // only the active category (Tools or Apps) is interactive — you click/drag the
  // real UI to move it, and select from the palette for hidden/overlapping ones.
  const activeList = category === "apps" ? APPS : TOOLS;
  const isActiveId = (id: string) => activeList.some((a) => a.id === id);

  // Placement (and the selection outline) goes on the component's own root via
  // `style` — the root shrink-wraps its visible card, so the outline hugs the
  // item exactly. The interactive wrapper below is boxless (display:contents).
  const renderComponent = (toolId: string, style: CSSProperties) => {
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
      case "tournament_race":
        return <TournamentRaceOverlay payload={samples.tournament_race} style={style} />;
      case "randomizer_mk8dx":
        return <ComboOverlay payload={samples.randomizer_mk8dx} style={style} />;
      case "randomizer_mkw":
        return <ComboOverlay payload={samples.randomizer_mkw} style={style} />;
      case "wheel":
        return <WheelOverlay spin={samples.wheel} style={style} />;
      case "poll":
        return <PollOverlay poll={samples.poll} style={style} />;
      default:
        return null;
    }
  };

  return (
    <div className="overlay-layout-tab" ref={rootRef}>
      <h2 className="account-tab__heading">Overlay Layout</h2>
      <p className="account-tab__intro">
        Position each tool and app on your OBS overlay, shown at real size with sample data, so it
        matches what viewers see. Use the <strong>Tools / Apps</strong> switch to choose which set
        you&rsquo;re arranging, then <strong>click a piece right in the preview</strong> (or a chip
        below) to select it and <strong>drag it</strong> where you want. Tune its size + visibility,
        then hit Preview to see the finished overlay. Each aspect ratio saves separately (16:9 for
        Twitch, 9:16 for a vertical/TikTok co-stream); untouched formats use the smart defaults.
      </p>
      <BrandThemeBar context="this preview" />
      <OverlayLinks token={overlayToken} activeFormat={format} />

      {!preview && (
        <p
          style={{
            fontSize: "var(--font-size-12)",
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
              border: "1px dashed var(--border-default)",
              borderRadius: 3,
            }}
          />
          The dashed box is the <strong>safe area</strong>. Keep tools inside it so they never
          land under your webcam, chat box, or the platform&rsquo;s own chrome.{" "}
          {format === "landscape"
            ? "Landscape keeps a small clearance off every edge (a bit more at the bottom for OBS bars/captions)."
            : format === "portrait"
              ? "Portrait reserves the top handle, bottom captions, and the right action rail (like/comment/share)."
              : "Square keeps even margins on all sides."}
        </p>
      )}

      {/* Aspect ratio + preview toggle */}
      <div style={{ display: "flex", gap: "var(--spacing-8)", marginBottom: "var(--spacing-24)", flexWrap: "wrap", alignItems: "center" }}>
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

      {/* Category toggle — which set of overlay pieces you're arranging. The
          full overlay stays visible; this just controls which handles show. */}
      {!preview && (
        <div style={{ display: "flex", gap: "var(--spacing-8)", marginBottom: "var(--spacing-24)", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--font-size-12)", fontWeight: "var(--font-weight-semibold)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Arranging
          </span>
          {(["tools", "apps"] as const).map((c) => (
            <Button
              key={c}
              variant={c === category ? "primary" : "secondary"}
              size="small"
              onClick={() => {
                setCategory(c);
                setSelected(null);
              }}
            >
              {c === "tools" ? "🛠️ Tools" : "🎮 Apps"}
            </Button>
          ))}
        </div>
      )}

      {/* Selection palette — click a chip to select any piece, including ones
          that are hidden or stacked behind another. The selected piece gets a
          ring in the preview; drag the piece itself to move it. */}
      {!preview && (
        <div style={{ display: "flex", gap: "var(--spacing-6)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--spacing-24)" }}>
          <span style={{ fontSize: "var(--font-size-12)", fontWeight: "var(--font-weight-semibold)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 2 }}>
            Select
          </span>
          {activeList.map((t) => {
            const enabled = isPlacementEnabled(format, t.id, profiles[format]);
            const isSel = selected === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: "var(--font-size-12)",
                  fontWeight: "var(--font-weight-semibold)",
                  cursor: "pointer",
                  border: isSel ? "2px solid var(--bg-primary)" : "1px solid var(--border-default)",
                  background: isSel ? "color-mix(in srgb, var(--bg-primary) 12%, var(--surface-default))" : "var(--surface-default)",
                  color: enabled ? "var(--text-primary)" : "var(--text-tertiary)",
                }}
              >
                <span aria-hidden>{t.emoji}</span>
                {t.label}
                {!enabled ? <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>(hidden)</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)", alignItems: "flex-start" }}>
        {/* Stage — scaled real-component frame; click/drag the UI directly */}
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
          {/* Real components at reference resolution, scaled to fit. The
              streamer's --brand-* vars ride on this frame so every piece that
              reads `var(--brand-primary)` shows their real theme, matching the
              live overlay. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: fmt.refW,
              height: fmt.refH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              ...brandVars,
            }}
          >
            {ALL_ELEMENTS.map((t) => {
              if (!isPlacementEnabled(format, t.id, profiles[format])) return null;
              const interactive = !preview && isActiveId(t.id);
              const isSel = selected === t.id;
              // Placement + interactivity + selection ring all ride on the
              // component's own root, so the outline is concentric with the item.
              const style: CSSProperties = {
                ...placementStyle(format, t.id, profiles[format]),
                cursor: interactive ? "grab" : "default",
                pointerEvents: interactive ? "auto" : "none",
                // Dim the set you're NOT arranging so the active pieces pop and
                // are easier to place. Preview shows everything at full.
                opacity: preview || isActiveId(t.id) ? 1 : 0.3,
                transition: "opacity 140ms ease",
                outline: isSel && !preview ? "3px solid var(--bg-primary)" : undefined,
                outlineOffset: 6,
                borderRadius: 12,
                touchAction: "none",
                // Stack by role while editing so BOTH Tools and Apps place the
                // same way: the selected piece sits above everything (beating
                // Apps' high intrinsic z-index like the wheel's 9999), and the
                // set you're arranging sits above the dimmed set. Preview mode
                // restores the real overlay stacking.
                zIndex: preview
                  ? undefined
                  : isSel
                    ? 100000
                    : isActiveId(t.id)
                      ? 3
                      : 1,
              };
              return (
                // Boxless wrapper — just carries the pointer handler + title; the
                // component root (with `style`) is the real positioned/outlined box.
                <div
                  key={t.id}
                  style={{ display: "contents" }}
                  onPointerDown={interactive ? (e) => startDrag(t.id, e) : undefined}
                  title={interactive ? `${t.label}: drag to move` : undefined}
                >
                  {renderComponent(t.id, style)}
                </div>
              );
            })}
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
            />
          )}

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
                <strong style={{ fontSize: "var(--font-size-14)", whiteSpace: "nowrap" }}>
                  {ALL_ELEMENTS.find((t) => t.id === selected)?.emoji} {ALL_ELEMENTS.find((t) => t.id === selected)?.label}
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
                Click a piece in the preview (or a chip above) to select it, then drag it to move it.
                Selecting shows its size + visibility here. Everything is at real size;{" "}
                <strong>Preview</strong> shows the clean overlay.
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

/**
 * OverlayLinks — the copyable browser-source URLs for OBS / Streamlabs, one per
 * aspect ratio (each carries a `?format=` override so the overlay renders the
 * layout saved for that ratio). Shows a connect prompt when Twitch isn't linked
 * yet (no overlay token). The row matching the format currently being arranged
 * is highlighted.
 */
function OverlayLinks({
  token,
  activeFormat,
}: {
  token: string | null;
  activeFormat: OverlayFormat;
}) {
  const toast = useToast();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const card: CSSProperties = {
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-12, 12px)",
    background: "var(--bg-secondary, var(--surface-secondary))",
    padding: "var(--spacing-16)",
    marginBottom: "var(--spacing-24)",
  };

  if (!token) {
    return (
      <div style={card}>
        <h3 style={{ fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-6)" }}>
          Add to OBS or Streamlabs
        </h3>
        <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", margin: "0 0 var(--spacing-12)" }}>
          Connect your Twitch integration to get your overlay browser-source link.
        </p>
        <Link href="/account/streamer?tab=integrations" style={{ textDecoration: "none" }}>
          <Button variant="secondary" size="small">
            Connect Twitch
          </Button>
        </Link>
      </div>
    );
  }

  const rows: { fmt: OverlayFormat; label: string; dims: string }[] = [
    { fmt: "landscape", label: "Landscape (16:9)", dims: "1920 × 1080" },
    { fmt: "portrait", label: "Portrait (9:16)", dims: "1080 × 1920" },
  ];

  const copy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} link copied`);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  };

  return (
    <div style={card}>
      <h3 style={{ fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-6)" }}>
        Add to OBS or Streamlabs
      </h3>
      <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", margin: "0 0 var(--spacing-16)" }}>
        Add a <strong>Browser Source</strong>, paste the link for the layout you want, and set its
        size to match. It&rsquo;s transparent, so it sits on top of your game capture.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
        {rows.map((r) => {
          const url = `${origin}/overlay/${token}?format=${r.fmt}`;
          const isActive = r.fmt === activeFormat;
          return (
            <div
              key={r.fmt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-12)",
                padding: "var(--spacing-12)",
                borderRadius: 8,
                border: isActive
                  ? "1px solid var(--bg-primary, var(--primary-500))"
                  : "1px solid var(--border-default)",
                background: "var(--surface-default)",
              }}
            >
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-semibold)" }}>
                  {r.label}{" "}
                  <span style={{ color: "var(--text-tertiary)", fontWeight: "var(--font-weight-regular)" }}>
                    · {r.dims}
                  </span>
                </div>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    fontSize: "var(--font-size-12)",
                    fontFamily: "var(--font-mono, monospace)",
                    color: "var(--text-secondary)",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    outline: "none",
                    textOverflow: "ellipsis",
                  }}
                />
              </div>
              <Button variant="secondary" size="small" onClick={() => copy(url, r.label)}>
                Copy
              </Button>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", margin: "var(--spacing-12) 0 0" }}>
        Use the 16:9 link for a normal stream and the 9:16 link for a vertical / TikTok layout. Each
        uses the arrangement you saved for that aspect ratio.
      </p>
    </div>
  );
}
