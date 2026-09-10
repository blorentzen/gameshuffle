"use client";

/**
 * Banner crop / position editor. Wraps react-easy-crop in a CDS Modal:
 * drag to position, slider/wheel to zoom, then exports the visible crop to
 * a JPEG blob at a fixed banner size and hands it to onConfirm (which
 * uploads it). Shows a working state across the export + upload.
 */

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Modal } from "@empac/cascadeds";
import { getCroppedBlob } from "@/lib/images/crop";

const DEFAULT_ASPECT = 4; // wide banner crop
const DEFAULT_OUT_W = 1600;
const DEFAULT_OUT_H = 400;

export function BannerEditModal({
  file,
  imageSrc,
  onCancel,
  onConfirm,
  aspect = DEFAULT_ASPECT,
  outW = DEFAULT_OUT_W,
  outH = DEFAULT_OUT_H,
  title = "Position your banner",
}: {
  /** A freshly-picked file (new upload), OR... */
  file?: File;
  /** ...an existing image URL to re-crop (reposition). One is required. */
  imageSrc?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
  /** Crop aspect + output size. Defaults to the 4:1 profile banner. */
  aspect?: number;
  outW?: number;
  outH?: number;
  title?: string;
}) {
  const [src, setSrc] = useState(imageSrc ?? "");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    if (imageSrc) setSrc(imageSrc);
  }, [file, imageSrc]);

  const onCropComplete = useCallback((_area: Area, px: Area) => setAreaPx(px), []);

  async function confirm() {
    if (working || !areaPx) return;
    setWorking(true);
    try {
      const blob = await getCroppedBlob(src, areaPx, outW, outH);
      await onConfirm(blob);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={working ? () => {} : onCancel}
      title={title}
      size="large"
      primaryAction={{
        label: working ? "Saving…" : "Save banner",
        onClick: () => void confirm(),
      }}
      secondaryAction={{ label: "Cancel", onClick: onCancel }}
    >
      <div className="banner-crop">
        {src ? (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
          />
        ) : null}
        {working ? (
          <div className="banner-crop__loading">
            <span className="banner-crop__spinner" aria-label="Saving" />
          </div>
        ) : null}
      </div>

      <label className="banner-crop__zoom">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          disabled={working}
        />
      </label>
      <p className="banner-crop__hint">Drag to reposition · slider or scroll to zoom.</p>
    </Modal>
  );
}
