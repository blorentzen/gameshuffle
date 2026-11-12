"use client";

/**
 * A driver's face for the roll card and results (client): a cast member's or
 * your DiceBear avatar drawn inline, or your Twitch or Discord picture, on a
 * circle in the driver's color.
 */

import { useMemo } from "react";
import { TONE_COLORS, type Driver } from "@/lib/kart/roster";
import { headSvg, type OwnAvatar } from "./engine/avatars";

export function DriverFace({ driver, own, size = 40 }: { driver: Driver; own: OwnAvatar | null; size?: number }) {
  const tone = TONE_COLORS[driver.tone] ?? TONE_COLORS.blue;
  const svg = useMemo(() => {
    if (driver.cast) return headSvg(driver.cast.seed, driver.cast.look);
    if (own?.kind === "dicebear") return headSvg(own.seed, own.options);
    if (!own) return headSvg("shuffle-kart", null);
    return null;
  }, [driver, own]);
  const style = { width: size, height: size, background: `linear-gradient(135deg, ${tone[0]}, ${tone[1]})` };
  if (svg) return <span className="kart-face" style={style} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
  return (
    <span className="kart-face" style={style} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- our own same-origin picture route */}
      <img src={own?.kind === "photo" ? own.url : ""} alt="" width={size} height={size} />
    </span>
  );
}
