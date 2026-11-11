import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 (S3-compatible) storage for user-generated content —
 * the `gameshuffle-ugc` bucket, served publicly via `gs-ugc.empac.co`.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *      R2_BUCKET, R2_PUBLIC_BASE. Absent any of these → isR2Configured()
 *      is false and callers degrade to "uploads unavailable" (503).
 */

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicBase = process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_BASE;

export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucket && publicBase);
}

let client: S3Client | null = null;
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }
  return client;
}

export function publicUrl(key: string): string {
  return `${publicBase!.replace(/\/$/, "")}/${key}`;
}

/** Object key from one of our public URLs (for deletes). null if not ours. */
export function keyFromPublicUrl(url: string): string | null {
  if (!publicBase) return null;
  const base = publicBase.replace(/\/$/, "");
  return url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null;
}

export async function uploadToR2(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  await r2().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
  return publicUrl(key);
}

/** Best-effort delete — never throws (cleanup must not block the response). */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    /* swallow — orphaned objects are acceptable, a failed UX is not */
  }
}

/** An object's bytes, or null when it isn't there (or storage can't be reached). */
export async function getFromR2(key: string): Promise<Uint8Array | null> {
  try {
    const res = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return res.Body ? await res.Body.transformToByteArray() : null;
  } catch {
    return null;
  }
}

/** Deletes every object under `prefix` last changed before `olderThan`; how many went. Never throws. */
export async function sweepR2(prefix: string, olderThan: Date): Promise<number> {
  let gone = 0;
  try {
    let token: string | undefined;
    do {
      const page = await r2().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
      const old = (page.Contents ?? []).filter((o) => o.Key && o.LastModified && o.LastModified < olderThan).map((o) => ({ Key: o.Key! }));
      if (old.length) {
        await r2().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: old, Quiet: true } }));
        gone += old.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  } catch (err) {
    console.error("[r2] sweep failed:", err instanceof Error ? err.message : err);
  }
  return gone;
}
