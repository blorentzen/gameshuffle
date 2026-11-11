/**
 * Browser-only: a still picture made small enough to upload (found 2026-11-10: phone photos over 4.5 MB never reached
 * us, because Vercel turns those requests away). Draws the picture upright (EXIF turns applied) at most `maxSide`
 * pixels on its long side and saves it as WebP, or JPEG where the browser can't write WebP. Saving it again also
 * drops the photo's metadata, location included. Animated pictures come out as their first frame.
 */

const loadBitmap = async (file: Blob): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_load_failed"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** The picture redrawn for upload, or null when the browser can't open it as a picture. */
export async function shrinkPicture(file: Blob, opts: { maxSide?: number; quality?: number; ground?: string } = {}): Promise<Blob | null> {
  const { maxSide = 1920, quality = 0.88, ground = "#ffffff" } = opts;
  let img: ImageBitmap | HTMLImageElement;
  try { img = await loadBitmap(file); } catch { return null; }
  const w0 = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h0 = "naturalHeight" in img ? img.naturalHeight : img.height;
  if (!w0 || !h0) return null;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if ("close" in img) img.close();
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.type === "image/webp") return webp;
  // JPEG has no see-through: lay the picture on the ground it will sit on.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fctx = flat.getContext("2d");
  if (!fctx) return null;
  fctx.fillStyle = ground;
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(canvas, 0, 0);
  return toBlob(flat, "image/jpeg", quality);
}

/** A GIF, or a WebP with an animation chunk (redrawing either would leave one still frame). */
export async function isMoving(file: Blob): Promise<boolean> {
  if (file.type === "image/gif") return true;
  if (file.type !== "image/webp") return false;
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  // RIFF....WEBPVP8X, then the flags byte: bit 2 (0x02) = animation.
  return String.fromCharCode(...head.slice(12, 16)) === "VP8X" && (head[20] & 0x02) !== 0;
}

/**
 * A picture made to fit one request (Vercel turns away bodies over 4.5 MB, found 2026-11-10): a file within `budget`
 * goes exactly as it is; a bigger still picture is redrawn smaller until it fits. GIFs (which would stop moving) and
 * files the browser can't draw come back unchanged, so the route still says what's wrong. `budget` is what this file
 * may use when several share one request.
 */
export async function fitPicture(file: File, budget = 4 * 1024 * 1024): Promise<File> {
  if (file.size <= budget || (await isMoving(file))) return file;
  for (const [maxSide, quality] of [[2560, 0.9], [1920, 0.86], [1280, 0.82], [960, 0.78]] as const) {
    const blob = await shrinkPicture(file, { maxSide, quality });
    if (!blob) return file;
    if (blob.size <= budget) {
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "picture"}.${ext}`, { type: blob.type, lastModified: file.lastModified });
    }
  }
  return file;
}
