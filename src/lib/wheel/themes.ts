/**
 * Wheel themes — shared by the free `/wheel-spinner` tool and (later) the
 * Pro overlay so a streamer's chosen theme carries over.
 *
 * A theme is just a serializable bundle of colors: the slice `palette`
 * (cycled across segments) plus accent colors for the bezel, rim, hub,
 * pointer, and labels. Persist/transport the `id`; resolve with `getTheme`.
 */

export interface WheelTheme {
  id: string;
  name: string;
  /** Slice fills, cycled across segments. */
  palette: string[];
  /** Thick outer ring. */
  bezel: string;
  /** Thin inner accent ring + slice separators. */
  rim: string;
  /** Center hub fill + ring. */
  hub: string;
  hubRing: string;
  /** Pointer fill + outline. */
  pointer: string;
  pointerStroke: string;
  /** Label text fill + outline. */
  label: string;
  labelStroke: string;
  /** Glossy radial-sheen opacity (0–1). */
  sheen: number;
}

export const WHEEL_THEMES: WheelTheme[] = [
  {
    id: "classic",
    name: "Classic",
    palette: ["#0e75c1", "#1098ad", "#7048e8", "#e8590c", "#2f9e44", "#c2255c", "#1c7ed6", "#f08c00"],
    bezel: "#0b3a5c",
    rim: "rgba(255,255,255,0.55)",
    hub: "#0f1621",
    hubRing: "rgba(255,255,255,0.7)",
    pointer: "#ffd43b",
    pointerStroke: "rgba(0,0,0,0.45)",
    label: "#ffffff",
    labelStroke: "rgba(0,0,0,0.4)",
    sheen: 0.12,
  },
  {
    id: "midnight",
    name: "Midnight",
    palette: ["#2b3a67", "#3a5a8c", "#1f6f8b", "#4a3f7a", "#2c4a6e", "#155263", "#3d3a72", "#1b3b5a"],
    bezel: "#c6a24e",
    rim: "rgba(214,178,90,0.6)",
    hub: "#0c1830",
    hubRing: "#c6a24e",
    pointer: "#ffd86b",
    pointerStroke: "rgba(0,0,0,0.5)",
    label: "#f3ead2",
    labelStroke: "rgba(0,0,0,0.5)",
    sheen: 0.14,
  },
  {
    id: "neon",
    name: "Neon",
    palette: ["#ff2d95", "#00e5ff", "#b4ff39", "#ffd000", "#7a5cff", "#ff5e00", "#19f0c3", "#ff3860"],
    bezel: "#10131a",
    rim: "rgba(255,255,255,0.7)",
    hub: "#0a0c12",
    hubRing: "#ffffff",
    pointer: "#ffffff",
    pointerStroke: "rgba(0,0,0,0.6)",
    label: "#ffffff",
    labelStroke: "rgba(0,0,0,0.55)",
    sheen: 0.16,
  },
  {
    id: "sunset",
    name: "Sunset",
    palette: ["#ff6b6b", "#ff9f43", "#feca57", "#ff7eb3", "#c44569", "#e66767", "#f8a5c2", "#f78fb3"],
    bezel: "#7a2f5a",
    rim: "rgba(255,255,255,0.6)",
    hub: "#3a1230",
    hubRing: "rgba(255,255,255,0.75)",
    pointer: "#fff3b0",
    pointerStroke: "rgba(0,0,0,0.4)",
    label: "#ffffff",
    labelStroke: "rgba(0,0,0,0.4)",
    sheen: 0.13,
  },
  {
    id: "forest",
    name: "Forest",
    palette: ["#2f9e44", "#157a52", "#74b816", "#5c940d", "#0c8599", "#1098ad", "#2b8a3e", "#099268"],
    bezel: "#1b4332",
    rim: "rgba(255,255,255,0.55)",
    hub: "#0f2a1e",
    hubRing: "rgba(255,255,255,0.7)",
    pointer: "#ffd43b",
    pointerStroke: "rgba(0,0,0,0.4)",
    label: "#ffffff",
    labelStroke: "rgba(0,0,0,0.4)",
    sheen: 0.12,
  },
  {
    id: "candy",
    name: "Candy",
    palette: ["#ff8fab", "#a0e7e5", "#b4a7f5", "#ffd6a5", "#9bf6ff", "#ffadad", "#caffbf", "#fdffb6"],
    bezel: "#ff8fab",
    rim: "rgba(255,255,255,0.85)",
    hub: "#5a3e6b",
    hubRing: "#ffffff",
    pointer: "#ff4d8d",
    pointerStroke: "rgba(255,255,255,0.7)",
    label: "#43314f",
    labelStroke: "rgba(255,255,255,0.6)",
    sheen: 0.18,
  },
];

export const DEFAULT_THEME_ID = "classic";

const BY_ID = new Map(WHEEL_THEMES.map((t) => [t.id, t]));

export function getTheme(id: string | null | undefined): WheelTheme {
  return (id && BY_ID.get(id)) || WHEEL_THEMES[0];
}

/** How slice fills are drawn — orthogonal to the color theme. */
export type FillStyle = "solid" | "gradient" | "stripes" | "dots";

export const FILL_STYLES: { id: FillStyle; name: string }[] = [
  { id: "solid", name: "Solid" },
  { id: "gradient", name: "Gradient" },
  { id: "stripes", name: "Stripes" },
  { id: "dots", name: "Dots" },
];

export const DEFAULT_FILL_STYLE: FillStyle = "solid";

export function getFillStyle(id: string | null | undefined): FillStyle {
  return FILL_STYLES.some((f) => f.id === id) ? (id as FillStyle) : "solid";
}
