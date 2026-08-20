import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPost } from "@/lib/social/feed";
import { canSeeCommunity } from "@/lib/community/flags";
import { PermalinkPost } from "@/components/social/PermalinkPost";

export const metadata = {
  title: "Post",
  robots: { index: false, follow: false },
};

export default async function PostPermalinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/community/post/${id}`);

  const { data: me } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  if (!canSeeCommunity((me as { role: string | null } | null)?.role)) redirect("/");

  const post = await getPost(id, user.id);
  if (!post) notFound();

  return (
    <Container className="community-page">
      <div className="feed" style={{ marginInline: "auto" }}>
        <Link href="/community" className="community__link">← Back to community</Link>
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <PermalinkPost post={post} currentUserId={user.id} />
        </div>
      </div>
    </Container>
  );
}
