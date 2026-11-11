import "server-only";

/** Server side of uploads in parts (parts.ts): parts wait in storage under tmp/uploads/<account>/<upload>/<n>. */

import { deleteFromR2, getFromR2, uploadToR2 } from "@/lib/storage/r2";
import { MAX_PARTS, PART_BYTES, type UploadRef } from "./parts";

export const PARTS_PREFIX = "tmp/uploads/";
const keyOf = (userId: string, upload: string, i: number) => `${PARTS_PREFIX}${userId}/${upload}/${i}`;

/** Keeps one part. */
export async function putPart(userId: string, upload: string, i: number, bytes: Uint8Array): Promise<void> {
  if (i < 0 || i >= MAX_PARTS || bytes.byteLength > PART_BYTES) throw new Error("bad part");
  await uploadToR2(keyOf(userId, upload, i), bytes, "application/octet-stream");
}

/**
 * The whole file from its parts, which are deleted either way: "missing" when a part never arrived (or was taken
 * already), "too_big" over `max`. Only the account that sent the parts can take them (the account is in their path).
 */
export async function takeUpload(userId: string, ref: UploadRef, max: number): Promise<Buffer | "missing" | "too_big"> {
  const keys = Array.from({ length: ref.parts }, (_, i) => keyOf(userId, ref.upload, i));
  const parts = await Promise.all(keys.map((k) => getFromR2(k)));
  await Promise.all(keys.map((k) => deleteFromR2(k)));
  if (parts.some((p) => !p)) return "missing";
  const file = Buffer.concat(parts.map((p) => Buffer.from(p!)));
  return file.length > max ? "too_big" : file;
}
