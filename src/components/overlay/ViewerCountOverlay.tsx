import type { CSSProperties } from "react";

/**
 * All-up viewer count badge for the OBS overlay. Sums live viewers across the
 * streamer's platforms (Twitch today). Renders only when live; the payload
 * comes from the overlay /latest poll. `sample` draws a fixed number for the
 * layout editor.
 */
export interface ViewerCountView {
  total: number;
  live: boolean;
  platforms: { platform: string; count: number; live: boolean }[];
}

const SAMPLE: ViewerCountView = {
  total: 1284,
  live: true,
  platforms: [{ platform: "twitch", count: 1284, live: true }],
};

export function ViewerCountOverlay({
  viewers,
  style,
  sample = false,
}: {
  viewers?: ViewerCountView | null;
  style?: CSSProperties;
  sample?: boolean;
}) {
  const v = sample ? SAMPLE : viewers;
  if (!v || !v.live) return null;
  const multi = v.platforms.filter((p) => p.live).length > 1;

  return (
    <div className="viewers-ov" style={style}>
      <span className="viewers-ov__dot" aria-hidden />
      <span className="viewers-ov__count">{v.total.toLocaleString()}</span>
      <span className="viewers-ov__label">watching{multi ? " · all platforms" : ""}</span>
    </div>
  );
}
