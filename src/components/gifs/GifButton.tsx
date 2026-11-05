"use client";

/** The GIF button beside a comment or message box: opens the picker and hands back what was picked. */

import { useState } from "react";
import { IconButton, Tooltip } from "@empac/cascadeds";
import { IconGif } from "@tabler/icons-react";
import { GifPicker, type Picked, type PickerTab } from "./GifPicker";

export function GifButton({ onPick, start, disabled }: { onPick: (p: Picked) => void; start?: PickerTab; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip content="Add a GIF or reaction">
        <IconButton variant="secondary" size="medium" aria-label="Add a GIF or reaction" disabled={disabled} onClick={() => setOpen(true)}>
          <IconGif size={20} aria-hidden />
        </IconButton>
      </Tooltip>
      <GifPicker open={open} onClose={() => setOpen(false)} onPick={onPick} start={start} />
    </>
  );
}
