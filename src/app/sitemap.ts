import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { HELP_ARTICLES } from "@/lib/help/manifest";

export const revalidate = 3600; // regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://gameshuffle.co";
  const now = new Date();

  // --- Static routes ---
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/randomizers/mario-kart-8-deluxe`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/randomizers/mario-kart-world`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/competitive/mario-kart-8-deluxe`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/tournament`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/contact-us`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/accessibility`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/help/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...HELP_ARTICLES.map((a) => ({
      url: `${baseUrl}${a.href}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  // --- Dynamic routes: public tournaments ---
  let tournamentRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("id, updated_at, status")
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (tournaments) {
      tournamentRoutes = tournaments.map((t) => ({
        url: `${baseUrl}/tournament/${t.id}`,
        lastModified: new Date(t.updated_at),
        changeFrequency: (t.status === "in_progress" ? "hourly" : "weekly") as "hourly" | "weekly",
        priority: t.status === "in_progress" ? 0.7 : 0.5,
      }));
    }
  } catch (err) {
    console.error("Sitemap: failed to fetch tournaments", err);
  }

  // --- Dynamic routes: public user profiles ---
  let profileRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const { data: users } = await supabase
      .from("users")
      .select("username, updated_at")
      .not("username", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (users) {
      profileRoutes = users.map((u) => ({
        url: `${baseUrl}/u/${u.username}`,
        lastModified: new Date(u.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.4,
      }));
    }
  } catch (err) {
    console.error("Sitemap: failed to fetch user profiles", err);
  }

  // --- Dynamic routes: public community quote pages ---
  // Each Twitch-connected community has a publicly-visible quote
  // pool at /quotes/{slug}. Listing them here lets crawlers discover
  // the pages without us having to push individual sitemaps per
  // streamer.
  let quoteRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const { data: communities } = await supabase
      .from("gs_communities")
      .select("slug, updated_at")
      .not("slug", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (communities) {
      quoteRoutes = communities.map((c) => ({
        url: `${baseUrl}/quotes/${c.slug}`,
        lastModified: new Date(c.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.3,
      }));
    }
  } catch (err) {
    console.error("Sitemap: failed to fetch communities", err);
  }

  return [
    ...staticRoutes,
    ...tournamentRoutes,
    ...profileRoutes,
    ...quoteRoutes,
  ];
}
