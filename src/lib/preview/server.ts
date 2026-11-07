import "server-only";

/**
 * Persona previews on the server (./persona.ts has the shape). Only staff and admins get a preview: the cookie on
 * anyone else's request is ignored, like the older tier cookies (src/lib/capabilities/staff-impersonation.ts).
 *
 * Also the dev-only "Back to my account" cookie for the test persona accounts (./devAccounts.ts): it carries the
 * staff account's id, signed, so signing back in needs no password on the dev database.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { realStaffRole } from "@/lib/capabilities/realStaffRole";
import { PERSONA_COOKIE, decodePersona, type PersonaPreview } from "./persona";

/** The preview a staff member set, or null (everyone else, or no preview). One read per request. */
export const personaPreview = cache(async (): Promise<PersonaPreview | null> => {
  const raw = (await cookies()).get(PERSONA_COOKIE)?.value;
  if (!raw) return null;
  if (!(await realStaffRole())) return null;
  return decodePersona(raw);
});

/** Whether the page should treat the viewer as GS Pro: the preview's plan when previewing, else what's real. */
export async function previewPro(real: boolean): Promise<boolean> {
  const p = await personaPreview();
  return p ? p.plan === "pro" : real;
}

// ─── dev: back to my account ───────────────────────────────────────────────

export const DEV_RETURN_COOKIE = "gs_dev_persona_return";

function returnKey(): Buffer {
  const base = process.env.ACTIVITY_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHmac("sha256", base).update("gs-dev-persona-return").digest();
}

/** `<user id>.<signature>`: who to sign back in as. */
export function signReturn(userId: string): string {
  const sig = createHmac("sha256", returnKey()).update(userId).digest("base64url");
  return `${userId}.${sig}`;
}

export function readReturn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const id = raw.slice(0, i);
  const want = Buffer.from(createHmac("sha256", returnKey()).update(id).digest("base64url"));
  const got = Buffer.from(raw.slice(i + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}
