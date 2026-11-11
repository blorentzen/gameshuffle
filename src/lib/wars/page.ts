/**
 * The war page's address (war tools walkthrough https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT, picked
 * 2026-10-31): /wars/kc-vs-nor-1a2b3c4d5e6f. The tags make the link readable; only the last 12 characters (the
 * start of the war's id) find it, so a tag that changes or has no plain letters never breaks a link. Client-safe.
 */

export const WAR_SHORT_LENGTH = 12;

function slugPart(tag: string): string {
  return tag.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16).replace(/-+$/, "");
}

/** The start of a war's id, as the page's address carries it. */
export const warShort = (id: string) => id.replace(/-/g, "").slice(0, WAR_SHORT_LENGTH).toLowerCase();

export function warPagePath(war: { id: string; us: { tag: string }; them: { tag: string }; others?: { tag: string }[] }): string {
  // Every team's tag (several teams too: kc-vs-nor-vs-pbm), when each has letters to show.
  const parts = [war.us, war.them, ...(war.others ?? [])].map((t) => slugPart(t.tag));
  return `/wars/${parts.every(Boolean) ? `${parts.join("-vs-")}-` : ""}${warShort(war.id)}`;
}

/** The war's short id from a page address segment, or null. */
export function readWarSlug(slug: string): string | null {
  const m = /(?:^|-)([0-9a-f]{12})$/.exec(slug.trim().toLowerCase());
  return m ? m[1] : null;
}
