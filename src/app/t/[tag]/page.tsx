import type { Metadata } from "next";
import { Container, Card } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listFeedByTag } from "@/lib/social/feed";
import { PostList } from "@/components/social/PostList";

function cleanTag(raw: string): string {
  return decodeURIComponent(raw).replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 50);
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const label = cleanTag(tag);
  return {
    title: label,
    description: `Posts about ${label} on GameShuffle.`,
    alternates: { canonical: `https://www.gameshuffle.co/t/${encodeURIComponent(label)}` },
  };
}

export default async function TopicPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const label = cleanTag(tag);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const posts = await listFeedByTag({ tag: label, viewerId: user?.id ?? "", limit: 30 }).catch(() => []);

  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh", paddingBottom: "var(--spacing-64)" }}>
      <Container>
        <section style={{ padding: "var(--spacing-48) 0 var(--spacing-24)", maxWidth: 720, margin: "0 auto" }}>
          <p className="marketing-eyebrow" style={{ marginBottom: "var(--spacing-8)" }}>Topic</p>
          <h1 style={{ fontSize: "var(--font-size-36)", fontWeight: 800, margin: "0 0 var(--spacing-8)", lineHeight: 1.1 }}>{label}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
            {posts.length > 0 ? `${posts.length} recent post${posts.length === 1 ? "" : "s"}` : "No posts yet"}
          </p>
        </section>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {posts.length === 0 ? (
            <Card padding="large">
              <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
                Nothing tagged <strong>{label}</strong> yet. Be the first — add it as a topic on a post.
              </p>
            </Card>
          ) : (
            <PostList posts={posts} currentUserId={user?.id ?? ""} />
          )}
        </div>
      </Container>
    </main>
  );
}
