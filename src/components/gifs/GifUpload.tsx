"use client";

/**
 * Upload a GIF: choose or drop one (GIF or animated WebP, up to 8 MB), we shrink it and check it, then you set its
 * description, tags and sharing. `onUse` adds a "Use it" button (the picker).
 */

import { useRef, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconCircleCheck, IconClockHour4, IconPhotoUp } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { GIF_MAX_BYTES, GIF_TYPES, type MyGif } from "@/lib/gifs/rules";
import { GifImage } from "./GifImage";
import { GifDetailsForm } from "./GifDetailsForm";

const ERRORS: Record<string, string> = {
  bad_type: "That isn't a GIF. Choose a .gif or an animated .webp file.",
  too_big: "That file is over 8 MB. Choose a smaller GIF.",
  bad_file: "That file couldn't be opened as a GIF.",
  too_many_frames: "That GIF is too long. Keep it under 600 frames.",
  not_animated: "That picture doesn't move. GIFs here are animated; use a still picture as a picture instead.",
  blocked: "That GIF was taken down before, so it can't be uploaded.",
  storage_off: "Uploads are switched off right now. Try again later.",
  not_ready: "GIFs are coming soon.",
  slow_down: "That's a lot of uploads. Wait a few minutes and try again.",
  signin: "Sign in to upload GIFs.",
};

export function GifUpload({ onUploaded, onUse }: { onUploaded?: (gif: MyGif) => void; onUse?: (gif: MyGif) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gif, setGif] = useState<MyGif | null>(null);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!(GIF_TYPES as readonly string[]).includes(file.type)) return setError(ERRORS.bad_type);
    if (file.size > GIF_MAX_BYTES) return setError(ERRORS.too_big);
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/gifs", { method: "POST", body }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { gif?: MyGif; error?: string; reason?: string | null; limit?: number } | null;
    setBusy(false);
    if (res?.ok && j?.gif) {
      setGif(j.gif);
      onUploaded?.(j.gif);
      return;
    }
    if (j?.error === "refused") return setError(`We can't take that GIF: ${j.reason || "it breaks our rules for what's shown on GameShuffle"}.`);
    if (j?.error === "full") return setError(`You have ${j.limit ?? 25} GIFs, the most you can keep. Delete one in My Stuff ▸ GIFs to make room.`);
    setError(ERRORS[j?.error ?? ""] ?? "Couldn't upload that. Try again.");
  };

  if (gif) {
    return (
      <div className="gif-upload">
        <div className="gif-upload__row">
          <GifImage gif={gif} maxWidth={160} />
          <div className="gif-upload__fields">
            {gif.status === "ok" ? (
              <span className="gif-upload__status gif-upload__status--ok"><IconCircleCheck size={18} aria-hidden />Checked and ready</span>
            ) : (
              <span className="gif-upload__status gif-upload__status--held">
                <IconClockHour4 size={18} aria-hidden />Waiting for a staff check{gif.reason ? `: ${gif.reason}` : ""}. Only you can see it until then.
              </span>
            )}
            <GifDetailsForm gif={gif} onSaved={setGif} />
          </div>
        </div>
        <div className="gif-picker__bar">
          {onUse && gif.status === "ok" ? <Button variant="primary" onClick={() => onUse(gif)}>Use it</Button> : null}
          <Button variant="secondary" onClick={() => { setGif(null); setError(null); }}>Upload another</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="gif-upload">
      <div
        className={`gif-upload__drop${over ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files?.[0]); }}
      >
        {busy ? (
          <LoadingLines label="Shrinking and checking your GIF" />
        ) : (
          <>
            <IconPhotoUp size={32} stroke={1.6} aria-hidden />
            <p className="gif-picker__note">Drop a GIF here, or choose one. Up to 8 MB.</p>
            <Button variant="secondary" onClick={() => input.current?.click()}>Choose a GIF</Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={GIF_TYPES.join(",")}
          hidden
          onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {error ? <p className="gif-picker__note" role="alert">{error}</p> : null}
      <p className="gif-picker__note">Every GIF gets an automatic check before others can see it. GIFs you upload stay private until you share them.</p>
    </div>
  );
}
