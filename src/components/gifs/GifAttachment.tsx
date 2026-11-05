"use client";

/** A GIF or sticker attached to a comment or message. A sticker plays its motion again when tapped. */

import { useState } from "react";
import { STICKER_BY_ID, stickerText } from "@/data/stickers";
import type { AttachmentView } from "@/lib/gifs/rules";
import { GifImage } from "./GifImage";
import { GsSticker } from "./GsSticker";

export function GifAttachment({ att, maxWidth = 240 }: { att: AttachmentView; maxWidth?: number }) {
  const [play, setPlay] = useState(0);
  if (att.kind === "gone") return <span className="gs-gif gs-gif--gone">This GIF was removed.</span>;
  if (att.kind === "gif") return <GifImage gif={att.gif} maxWidth={maxWidth} />;
  const s = STICKER_BY_ID[att.id];
  if (!s) return null;
  return (
    <button type="button" className="gs-sticker-btn" title={s.meaning} aria-label={`${stickerText(s)}: ${s.meaning}. Play it again`} onClick={() => setPlay((n) => n + 1)}>
      <GsSticker id={att.id} size="md" play={play} />
    </button>
  );
}
