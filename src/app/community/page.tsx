import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getFollowingProfiles } from "@/lib/social/topFriends";
import { canSeeCommunity } from "@/lib/community/flags";
import { CommunityHub } from "@/components/social/CommunityHub";

export const metadata = {
  title: "Community",
  // Signed-in social home over public accounts — keep out of the index
  // (individual /u profiles stay indexable).
  robots: { index: false, follow: false },
};

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community");

  // Suppressed until launch — staff only (see community/flags).
  const { data: me } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  if (!canSeeCommunity((me as { role: string | null } | null)?.role)) redirect("/");

  const friends = await getFollowingProfiles(user.id);

  return (
    <Container className="community-page">
      <CommunityHub friends={friends} />
    </Container>
  );
}
