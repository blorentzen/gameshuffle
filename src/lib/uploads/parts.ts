/**
 * Uploads in parts (found 2026-11-10: GIF backgrounds on MMR cards never arrived). Vercel turns away any request body
 * over 4.5 MB before our code runs (413 FUNCTION_PAYLOAD_TOO_LARGE), so a file bigger than DIRECT_MAX goes up as parts
 * of PART_BYTES each to /api/uploads/part, and the route that wants it is sent `{ upload, parts }` instead of the file
 * (takeUpload in partsServer.ts puts it back together). Shared by the browser and the server.
 */

/** Files up to this size go in one request. */
export const DIRECT_MAX = 4 * 1024 * 1024;
/** One part's size: well under Vercel's 4.5 MB. */
export const PART_BYTES = 3.5 * 1024 * 1024;
/** Enough parts for the biggest file any route takes (14 MB). */
export const MAX_PARTS = 4;

export interface UploadRef { upload: string; parts: number }

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An upload id and part count as sent by the browser, or null. */
export function readUploadRef(v: unknown): UploadRef | null {
  const r = v as { upload?: unknown; parts?: unknown } | null;
  if (!r || typeof r.upload !== "string" || !ID.test(r.upload)) return null;
  const parts = Number(r.parts);
  return Number.isInteger(parts) && parts >= 1 && parts <= MAX_PARTS ? { upload: r.upload, parts } : null;
}

export const isUploadId = (v: string | null): v is string => !!v && ID.test(v);

/**
 * Browser side: sends a file as parts and returns where it waits, or an error code the caller words
 * (signin, slow_down, storage_off, too_big, failed).
 */
export async function sendInParts(file: Blob): Promise<UploadRef | { error: string }> {
  const parts = Math.ceil(file.size / PART_BYTES);
  if (parts > MAX_PARTS) return { error: "too_big" };
  const upload = crypto.randomUUID();
  for (let i = 0; i < parts; i++) {
    const body = file.slice(i * PART_BYTES, Math.min(file.size, (i + 1) * PART_BYTES));
    let res: Response | null = null;
    for (let tries = 0; tries < 2 && !res?.ok; tries++) {
      res = await fetch(`/api/uploads/part?upload=${upload}&i=${i}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body }).catch(() => null);
      if (res && res.status < 500 && !res.ok) break;
    }
    if (!res?.ok) {
      const j = (await res?.json().catch(() => null)) as { error?: string } | null;
      return { error: j?.error ?? "failed" };
    }
  }
  return { upload, parts };
}
