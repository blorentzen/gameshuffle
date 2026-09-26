import "server-only";

/**
 * Guides, read from the database when it is there and from the file manifest
 * when it is not.
 *
 * The fallback is the whole point of the shape. `supabase/guides-m1.sql` has to
 * be applied by hand, so between this shipping and that running, every read
 * here has to keep working against the files exactly as before. Once the table
 * exists it becomes the source of truth and the manifest is left as the seed.
 *
 * Bodies are GFM markdown. The two file-backed guides predate this and are
 * still React pages under src/app/guides/<slug>/, which is why `body_md` is
 * optional on the merged type: a file guide has no markdown body, it has a
 * route. Both render; only DB guides go through the dynamic route.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  GUIDES, type GuideClusterId, type GuideMeta,
} from "./manifest";

export interface StoredGuide extends GuideMeta {
  id?: string;
  /** Markdown body. Absent for the file-backed guides, which own a route. */
  bodyMd?: string;
  /** True when this came from the database, so callers know which route serves it. */
  fromDb: boolean;
  updatedAt?: string;
}

type Row = {
  id: string; slug: string; title: string; description: string; cluster: string;
  body_md: string; minutes: number; game_specific: string | null;
  published: boolean; updated_at: string;
};

const toGuide = (r: Row): StoredGuide => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  cluster: r.cluster as GuideClusterId,
  minutes: r.minutes,
  gameSpecific: (r.game_specific as GuideMeta["gameSpecific"]) ?? null,
  published: r.published,
  bodyMd: r.body_md,
  fromDb: true,
  updatedAt: r.updated_at,
});

const fileGuides = (): StoredGuide[] => GUIDES.map((g) => ({ ...g, fromDb: false }));

/**
 * Every guide the site knows about, database first.
 *
 * A DB row with the same slug as a file guide wins, so a guide can be migrated
 * from a route to the editor without a redirect or a duplicate in the index.
 */
export async function allGuides(): Promise<StoredGuide[]> {
  let rows: StoredGuide[] = [];
  try {
    const { data, error } = await createServiceClient()
      .from("gs_guides")
      .select("id, slug, title, description, cluster, body_md, minutes, game_specific, published, updated_at")
      .order("updated_at", { ascending: false });
    // Any error falls through to the files. Pre-migration that error is
    // PostgREST's PGRST205 (table not in the schema cache), which is the
    // expected state until guides-m1.sql is applied, not an incident.
    if (!error && data) rows = (data as Row[]).map(toGuide);
  } catch {
    rows = [];
  }
  const bySlug = new Map<string, StoredGuide>();
  for (const g of fileGuides()) bySlug.set(g.slug, g);
  for (const g of rows) bySlug.set(g.slug, g);
  return [...bySlug.values()];
}

export async function publishedGuidesAsync(): Promise<StoredGuide[]> {
  return (await allGuides()).filter((g) => g.published);
}

export async function guidesInClusterAsync(id: GuideClusterId): Promise<StoredGuide[]> {
  return (await publishedGuidesAsync()).filter((g) => g.cluster === id);
}

/** A published guide by slug. Only returns DB-backed ones with a body, because
 *  the file-backed guides are served by their own route, not the dynamic one. */
export async function dbGuideBySlug(slug: string): Promise<StoredGuide | null> {
  const g = (await allGuides()).find((x) => x.slug === slug);
  if (!g || !g.published || !g.fromDb) return null;
  return g;
}

/** Whether the table exists yet. Drives whether the editor renders at all, so
 *  a staff member is not shown a form whose save would fail. */
export async function guidesTableReady(): Promise<boolean> {
  try {
    const { error } = await createServiceClient().from("gs_guides").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** Staff-only listing, drafts included. Uses the CALLER's client so RLS decides,
 *  rather than trusting a role check we did ourselves. */
export async function listAllForEditor(): Promise<StoredGuide[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("gs_guides")
      .select("id, slug, title, description, cluster, body_md, minutes, game_specific, published, updated_at")
      .order("updated_at", { ascending: false });
    if (error) return null;
    return (data as Row[]).map(toGuide);
  } catch {
    return null;
  }
}
