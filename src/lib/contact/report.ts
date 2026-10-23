/**
 * "Is something wrong? Let us know" (Britton, 2026-10-23): a link from a page with facts on it (a
 * trainer's team, a bio, today's duel) to the contact form, which opens on the "Something's wrong on
 * a page" topic and shows which page it's about. Client-safe.
 */

/** The contact form's topic for these (src/lib/email/contact.ts CONTACT_TOPIC_LABELS). */
export const REPORT_TOPIC = "correction";

/** A same-site path only ("/pokemon-trainers/kalos/viola"), never another site. */
const safePath = (page: string) => (/^\/(?!\/)[^\s\\]*$/.test(page) ? page.slice(0, 300) : null);

/** The contact form's address for a report about `about` ("Viola on Trainer Road") on `page`. */
export function reportHref(about: string, page: string): string {
  const q = new URLSearchParams({ topic: REPORT_TOPIC, about: about.slice(0, 120) });
  const path = safePath(page);
  if (path) q.set("page", path);
  return `/contact-us?${q.toString()}`;
}

/** What a report link carried (the contact form reads it from its address). */
export function readReport(search: string): { topic: string | null; about: string | null; page: string | null } {
  const q = new URLSearchParams(search);
  const about = (q.get("about") ?? "").trim().slice(0, 120) || null;
  return { topic: q.get("topic"), about, page: safePath(q.get("page") ?? "") };
}
