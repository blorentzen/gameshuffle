import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { CreateGroupForm } from "@/components/communities/CreateGroupForm";

export const metadata: Metadata = {
  title: "Create a community",
  description: "Start a community for your family, friend group, organization, or event.",
};

export default async function NewCommunityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/communities/new");

  return (
    <Container>
      <section style={{ margin: "var(--spacing-48) 0 var(--spacing-64)", maxWidth: "48rem" }}>
        <p className="marketing-eyebrow">Communities</p>
        <h1 style={{ fontSize: "var(--font-size-fluid-h2)", fontWeight: "var(--font-weight-bold)", lineHeight: "var(--line-height-tight)", margin: "0 0 var(--spacing-12)" }}>
          Create a community
        </h1>
        <p style={{ fontSize: "var(--font-size-16)", color: "var(--text-secondary)", lineHeight: "var(--line-height-relaxed)", margin: "0 0 var(--spacing-32)" }}>
          For your family, friend group, organization, or event. It gets its own page with a
          feed, members, and game nights. You can turn on more later from Customize.
          (Streamers already get a community automatically from their channel.)
        </p>
        <CreateGroupForm />
      </section>
    </Container>
  );
}
