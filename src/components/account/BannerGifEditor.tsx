"use client";

/**
 * The animated banner (GIFs pick 8A; GS Pro or Supporter looks): pick one of your GIFs (it loops in the picker's
 * preview first), then frame it by dragging it inside a banner-shaped window or with the two sliders (the keyboard
 * way). No crop, so it keeps moving: on the profile it plays once, then rests on its first frame. A profile has one
 * banner, a picture or a GIF: saving a GIF replaces the picture (src/lib/profile/banner.ts).
 */

import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { Button, Modal, RangeSlider } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { GifPicker } from "@/components/gifs/GifPicker";

interface Banner { gifId: string; url: string; still: string; alt: string; x: number; y: number }
interface Framing { gifId: string; url: string; x: number; y: number }

function FrameModal({ start, onCancel, onSave, saving }: { start: Framing; onCancel: () => void; onSave: (f: Framing) => void; saving: boolean }) {
  const [x, setX] = useState(start.x);
  const [y, setY] = useState(start.y);
  const drag = useRef<{ px: number; py: number; x: number; y: number; w: number; h: number } | null>(null);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { px: e.clientX, py: e.clientY, x, y, w: r.width, h: r.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Dragging the picture right shows more of its left side.
    setX(clamp(d.x - ((e.clientX - d.px) / d.w) * 100));
    setY(clamp(d.y - ((e.clientY - d.py) / d.h) * 100));
  };
  return (
    <Modal isOpen onClose={onCancel} title="Frame your banner" size="large">
      <div className="banner-gif__frame-wrap">
        <div
          className="banner-gif__frame"
          role="img"
          aria-label="Your banner GIF, framed"
          style={{ backgroundImage: `url(${start.url})`, backgroundPosition: `${x}% ${y}%` }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        />
        <p className="banner-gif__hint">Drag the GIF to frame it, or use the sliders.</p>
        <RangeSlider label="Left to right" min={0} max={100} step={1} value={x} onChange={(v) => setX(clamp(v))} />
        <RangeSlider label="Top to bottom" min={0} max={100} step={1} value={y} onChange={(v) => setY(clamp(v))} />
        <div className="banner-gif__actions">
          <Button variant="primary" loading={saving} onClick={() => onSave({ ...start, x, y })}>Save banner</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

export interface BannerGifState { ready: boolean; allowed: boolean; banner: Banner | null }
export type { Banner as BannerGif };

/** The animated-GIF side of the banner control (BannerUploader holds the choice between a picture and a GIF). */
export function BannerGifControls({ state, onChange, replacesPicture }: { state: BannerGifState; onChange: (banner: Banner | null) => void; replacesPicture: boolean }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [framing, setFraming] = useState<Framing | null>(null);
  const [saving, setSaving] = useState(false);
  const { allowed, banner } = state;

  const save = async (f: Framing) => {
    setSaving(true);
    const res = await fetch("/api/account/banner/gif", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gifId: f.gifId, x: f.x, y: f.y }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { banner?: Banner; error?: string } | null;
    setSaving(false);
    if (!res?.ok || !j?.banner) {
      toast.error(j?.error === "looks_required" ? "An animated banner comes with GS Pro or Supporter looks." : j?.error === "not_found" ? "That GIF isn't available. Pick another." : "Couldn't save the banner. Try again.");
      return;
    }
    onChange(j.banner);
    setFraming(null);
    toast.success("Banner updated");
  };
  const remove = async () => {
    const res = await fetch("/api/account/banner/gif", { method: "DELETE" }).catch(() => null);
    if (res?.ok) { onChange(null); toast.success("Banner removed"); }
  };

  return (
    <>
      {banner ? (
        <div className="banner-gif__actions">
          <Button size="small" variant="secondary" disabled={!allowed} onClick={() => setFraming({ gifId: banner.gifId, url: banner.url, x: banner.x, y: banner.y })}>Reposition</Button>
          <Button size="small" variant="secondary" disabled={!allowed} onClick={() => setPicking(true)}>Change GIF</Button>
          <Button size="small" variant="secondary" onClick={() => void remove()}>Remove</Button>
        </div>
      ) : allowed ? (
        <div className="banner-gif__actions">
          <Button size="small" variant="secondary" onClick={() => setPicking(true)}>Pick one of your GIFs</Button>
        </div>
      ) : null}
      <p className="banner-gif__note">
        {!allowed && !banner ? <>An animated banner from one of your GIFs comes with <Link href="/gs-pro?from=banner-gif">GS Pro</Link> or Supporter looks.</>
          : !allowed ? "Your plan no longer includes looks, so your profile shows the GIF's first frame, still."
          : replacesPicture ? "Your banner is a picture now. Picking a GIF replaces it."
          : "An animated GIF from your GIFs. It plays once on your profile, then rests on its first frame."}
      </p>
      <GifPicker
        open={picking}
        onClose={() => setPicking(false)}
        start="mine"
        tabs={["mine", "upload"]}
        title="A GIF for your banner"
        useLabel="Use as my banner"
        onPick={(p) => { if (p.view.kind === "gif") setFraming({ gifId: p.view.gif.id, url: p.view.gif.url, x: 50, y: 50 }); }}
      />
      {framing && <FrameModal start={framing} saving={saving} onCancel={() => setFraming(null)} onSave={(f) => void save(f)} />}
    </>
  );
}
