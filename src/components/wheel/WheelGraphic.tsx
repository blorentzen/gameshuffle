"use client";

/**
 * WheelGraphic — the SVG wheel itself (slices, labels, hub, fixed pointer,
 * plus a themed bezel + glossy sheen). Shared by the Pro `WheelOverlay` and
 * the free `/wheel-spinner` tool.
 *
 * It only draws; the parent owns spin state. `rotation` (deg) is applied to
 * the rotor. `theme` controls all colors; `fillStyle` controls how slices
 * are filled (solid / gradient / stripes / dots) via per-slice `<defs>`.
 * The viewBox is a fixed 420 space; display size is CSS (`svgClassName`).
 */

import { useId, useMemo, type CSSProperties } from "react";
import {
  computeSlices,
  rim,
  slicePath,
  type WheelGeoSegment,
} from "@/lib/wheel/geometry";
import { getTheme, type FillStyle, type WheelTheme } from "@/lib/wheel/themes";
import { shade } from "@/lib/wheel/color";

const SIZE = 420;
const C = SIZE / 2;
const R = 196;

export function WheelGraphic({
  segments,
  rotation,
  theme,
  fillStyle = "solid",
  rotorClassName,
  rotorStyle,
  svgClassName,
  labelMax = 16,
}: {
  segments: WheelGeoSegment[];
  rotation: number;
  theme?: WheelTheme;
  fillStyle?: FillStyle;
  rotorClassName?: string;
  rotorStyle?: CSSProperties;
  svgClassName?: string;
  labelMax?: number;
}) {
  const t = theme ?? getTheme(undefined);
  const uid = useId();

  // Memoized so per-frame rotation changes don't recompute geometry.
  const slices = useMemo(() => computeSlices(segments), [segments]);

  const baseColor = (seg: WheelGeoSegment, index: number) =>
    seg.color ?? t.palette[index % t.palette.length];
  const fillId = (index: number) => `${uid}-f${index}`;
  const fillFor = (seg: WheelGeoSegment, index: number) =>
    fillStyle === "solid" ? baseColor(seg, index) : `url(#${fillId(index)})`;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={svgClassName} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-sheen`} cx="0.34" cy="0.28" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity={Math.min(1, t.sheen * 2.2)} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity={t.sheen} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {fillStyle !== "solid"
          ? slices.map(({ seg, index }) => {
              const base = baseColor(seg, index);
              const id = fillId(index);
              if (fillStyle === "gradient") {
                return (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={shade(base, 0.24)} />
                    <stop offset="1" stopColor={shade(base, -0.16)} />
                  </linearGradient>
                );
              }
              if (fillStyle === "stripes") {
                return (
                  <pattern
                    key={id}
                    id={id}
                    width="16"
                    height="16"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="16" height="16" fill={base} />
                    <rect width="8" height="16" fill={shade(base, -0.16)} />
                  </pattern>
                );
              }
              // dots
              return (
                <pattern key={id} id={id} width="18" height="18" patternUnits="userSpaceOnUse">
                  <rect width="18" height="18" fill={base} />
                  <circle cx="9" cy="9" r="3" fill={shade(base, 0.34)} />
                </pattern>
              );
            })
          : null}
      </defs>

      {/* Outer bezel (static). */}
      <circle cx={C} cy={C} r={R + 6} fill="none" stroke={t.bezel} strokeWidth={12} />

      {/* Slices + labels (rotate). */}
      <g
        className={rotorClassName}
        style={{ transform: `rotate(${rotation}deg)`, ...rotorStyle }}
      >
        {slices.map(({ seg, start, end, mid, index }) => {
          const [lx, ly] = rim(mid, R * 0.62, C);
          const flip = mid > 90 && mid < 270;
          const rot = flip ? mid + 180 : mid;
          return (
            <g key={index}>
              <path
                d={slicePath(start, end, C, R)}
                fill={fillFor(seg, index)}
                stroke={t.rim}
                strokeWidth={1.5}
              />
              <text
                x={lx}
                y={ly}
                fill={t.label}
                fontSize={16}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${rot} ${lx} ${ly})`}
                style={{ paintOrder: "stroke", stroke: t.labelStroke, strokeWidth: 2 }}
              >
                {seg.label.length > labelMax
                  ? `${seg.label.slice(0, labelMax - 1)}…`
                  : seg.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* Inner rim ring + glossy sheen (static, overlay the slices). */}
      <circle cx={C} cy={C} r={R} fill="none" stroke={t.rim} strokeWidth={3} />
      <circle cx={C} cy={C} r={R} fill={`url(#${uid}-sheen)`} pointerEvents="none" />

      {/* Hub. */}
      <circle cx={C} cy={C} r={28} fill={t.hub} stroke={t.hubRing} strokeWidth={3} />
      <circle cx={C} cy={C} r={9} fill={t.hubRing} opacity={0.85} />

      {/* Fixed pointer at top, pointing down into the rim. */}
      <polygon
        points={`${C - 18},4 ${C + 18},4 ${C},44`}
        fill={t.pointer}
        stroke={t.pointerStroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
