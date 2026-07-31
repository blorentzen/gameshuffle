import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { listPendingIdeas, listPublicIdeas } from "@/lib/ideas/store";
import { listCycles } from "@/lib/ideas/admin";
import { IdeaReviewClient } from "./IdeaReviewClient";

export const metadata = {
  title: "Idea review",
  robots: { index: false, follow: false },
};

export default async function IdeaReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/ideas/review");

  const admin = createServiceClient();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if (!isStaffRole((data?.role as string | null) ?? null)) notFound();

  const [pending, inReview, planned, cycles] = await Promise.all([
    listPendingIdeas(),
    listPublicIdeas({ status: "in_review", limit: 200 }),
    listPublicIdeas({ status: "planned", limit: 200 }),
    listCycles(),
  ]);

  return (
    <IdeaReviewClient pending={pending} inReview={inReview} planned={planned} cycles={cycles} />
  );
}
