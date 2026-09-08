import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { getNight } from "@/lib/board-game-nights/store";
import { NightForm } from "@/components/board-game-nights/NightForm";

export const metadata: Metadata = { title: "Manage board-game night" };

export default async function ManageNightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/board-game-nights/${id}/manage`);

  const night = await getNight(id);
  if (!night) notFound();
  if (night.host_id !== user.id) redirect(`/board-game-nights/${id}`);

  return (
    <Container>
      <section style={{ margin: "var(--spacing-48) 0 var(--spacing-64)", maxWidth: "80rem" }}>
        <p className="marketing-eyebrow">Board game nights</p>
        <h1
          style={{
            fontSize: "var(--font-size-fluid-h2)",
            fontWeight: "var(--font-weight-bold)",
            lineHeight: "var(--line-height-tight)",
            margin: "0 0 var(--spacing-8)",
          }}
        >
          Manage night
        </h1>
        <p>
          <Link href={`/board-game-nights/${id}`}>View public page →</Link>
        </p>
        <div style={{ marginTop: "var(--spacing-24)" }}>
          <NightForm nightId={id} initial={night} />
        </div>
      </section>
    </Container>
  );
}
