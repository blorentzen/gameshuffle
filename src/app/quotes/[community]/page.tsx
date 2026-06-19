/**
 * Public quote-pool page for a community.
 *
 * Renders the `!quote` pool entries (platform-default canon +
 * streamer-added community contributions) for the streamer whose
 * Twitch slug matches the URL param. Lets viewers browse what
 * `!quote` can return without having to spam the chat command.
 *
 * Routes:
 *   /quotes/[community]   — community slug from `gs_communities.slug`
 *                           (lowercased Twitch login by default)
 *
 * SEO:
 *   - Dynamic title + description via generateMetadata
 *   - Canonical URL pinned to the slug
 *   - Falls back to the generic main OG when the community has no
 *     custom imagery
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Container } from "@empac/cascadeds";
import { createServiceClient } from "@/lib/supabase/admin";

type Params = Promise<{ community: string }>;

interface CommunityRow {
  id: string;
  slug: string;
  display_name: string | null;
}

interface QuoteRow {
  id: string;
  response: string;
  sort_order: number;
  community_id: string | null;
  added_by_identity_id: string | null;
}

interface IdentityRow {
  id: string;
  display_name: string | null;
}

async function lookupCommunity(slug: string): Promise<CommunityRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_communities")
    .select("id, slug, display_name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return (data as CommunityRow | null) ?? null;
}

async function fetchPool(
  community: CommunityRow,
): Promise<{
  quotes: Array<{
    id: string;
    response: string;
    isPlatform: boolean;
    addedBy: string | null;
  }>;
  platformCount: number;
  communityCount: number;
}> {
  const admin = createServiceClient();
  const { data: cmdRow } = await admin
    .from("gs_default_commands")
    .select("id")
    .eq("trigger", "quote")
    .eq("enabled", true)
    .maybeSingle();
  const cmd = cmdRow as { id: string } | null;
  if (!cmd) {
    return { quotes: [], platformCount: 0, communityCount: 0 };
  }

  // Platform-default (community_id IS NULL) PLUS this community's
  // contributions. Engine merges both at chat fire time; the page
  // mirrors that scope.
  const { data: poolRows } = await admin
    .from("gs_default_command_responses")
    .select("id, response, sort_order, community_id, added_by_identity_id")
    .eq("command_id", cmd.id)
    .eq("enabled", true)
    .or(`community_id.is.null,community_id.eq.${community.id}`)
    .order("community_id", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true });
  const pool = (poolRows as QuoteRow[] | null) ?? [];

  const identityIds = pool
    .map((r) => r.added_by_identity_id)
    .filter((id): id is string => !!id);
  const identityByid = new Map<string, string>();
  if (identityIds.length > 0) {
    const { data: identityRows } = await admin
      .from("gs_identities")
      .select("id, display_name")
      .in("id", identityIds);
    for (const row of (identityRows as IdentityRow[] | null) ?? []) {
      if (row.display_name) identityByid.set(row.id, row.display_name);
    }
  }

  let platformCount = 0;
  let communityCount = 0;
  const quotes = pool.map((r) => {
    const isPlatform = r.community_id === null;
    if (isPlatform) platformCount += 1;
    else communityCount += 1;
    return {
      id: r.id,
      response: r.response,
      isPlatform,
      addedBy: r.added_by_identity_id
        ? identityByid.get(r.added_by_identity_id) ?? null
        : null,
    };
  });
  return { quotes, platformCount, communityCount };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { community: slug } = await params;
  const community = await lookupCommunity(slug);
  if (!community) {
    return {
      title: "Quote pool not found",
      robots: { index: false },
    };
  }
  const name = community.display_name || community.slug;
  return {
    title: `${name}'s Quotes`,
    description: `Random quote pool for ${name}'s chat — fires from \`!quote\` in stream.`,
    openGraph: {
      title: `${name}'s Quotes | GameShuffle`,
      description: `Random quote pool for ${name}'s chat.`,
      url: `https://gameshuffle.co/quotes/${community.slug}`,
      images: ["/images/opengraph/gameshuffle-main-og.jpg"],
    },
    alternates: {
      canonical: `https://gameshuffle.co/quotes/${community.slug}`,
    },
  };
}

export default async function CommunityQuotesPage({
  params,
}: {
  params: Params;
}) {
  const { community: slug } = await params;
  const community = await lookupCommunity(slug);
  if (!community) notFound();

  const { quotes, platformCount, communityCount } = await fetchPool(community);
  const name = community.display_name || community.slug;

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <header style={{ marginBottom: "var(--spacing-32)" }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-14)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-tertiary)",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              GameShuffle Quote Pool
            </p>
            <h1
              style={{
                margin:
                  "var(--spacing-8) 0 var(--spacing-12)",
                fontSize: "var(--font-size-32)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--text-primary)",
              }}
            >
              {name}&rsquo;s Quotes
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "var(--font-size-16)",
                color: "var(--text-secondary)",
                lineHeight: "var(--line-height-relaxed)",
              }}
            >
              {quotes.length === 0 ? (
                <>
                  No quotes yet. Mods can add one with{" "}
                  <code>!quote add &lt;text&gt;</code> in chat.
                </>
              ) : (
                <>
                  {quotes.length} total ({platformCount} platform
                  starter{platformCount === 1 ? "" : "s"},{" "}
                  {communityCount} from{" "}
                  <strong>{name}&rsquo;s chat</strong>). Random pick
                  fires when anyone types <code>!quote</code> in
                  stream.
                </>
              )}
            </p>
          </header>

          {quotes.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-12)",
              }}
            >
              {quotes.map((q, idx) => (
                <Card
                  key={q.id}
                  variant="outlined"
                  padding="medium"
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--spacing-16)",
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--font-size-16)",
                        fontWeight:
                          "var(--font-weight-semibold)",
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
                        minWidth: "2ch",
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "var(--font-size-16)",
                          color: "var(--text-primary)",
                          lineHeight:
                            "var(--line-height-relaxed)",
                        }}
                      >
                        {q.response}
                      </p>
                      <p
                        style={{
                          margin: "var(--spacing-8) 0 0",
                          fontSize: "var(--font-size-12)",
                          color: "var(--text-tertiary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {q.isPlatform
                          ? "Platform starter"
                          : q.addedBy
                            ? `Added by ${q.addedBy}`
                            : "Added in chat"}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <footer
            style={{
              marginTop: "var(--spacing-32)",
              padding:
                "var(--spacing-16) var(--spacing-20)",
              background: "var(--background-secondary)",
              borderRadius: "var(--radius-medium)",
              fontSize: "var(--font-size-14)",
              color: "var(--text-secondary)",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            <strong>Want to add one?</strong> Mods + the streamer can
            grow this pool from chat with{" "}
            <code>!quote add &lt;text&gt;</code>. Already added? Mods
            can remove with <code>!quote del &lt;n&gt;</code> where{" "}
            <code>n</code> is the row number above (community quotes
            only — platform starters stay curated).
          </footer>
        </div>
      </Container>
    </main>
  );
}
