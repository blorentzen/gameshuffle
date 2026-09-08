import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { NightForm } from "@/components/board-game-nights/NightForm";

export const metadata: Metadata = {
  title: "Host a board-game night",
  description: "Set up your own board-game night — place, time, game types, and the games you're bringing.",
};

export default async function CreateNightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/board-game-nights/create");

  return (
    <Container>
      <section style={{ margin: "var(--spacing-48) 0 var(--spacing-64)", maxWidth: "80rem" }}>
        <p className="marketing-eyebrow">Board game nights</p>
        <h1
          style={{
            fontSize: "var(--font-size-fluid-h2)",
            fontWeight: "var(--font-weight-bold)",
            lineHeight: "var(--line-height-tight)",
            margin: "0 0 var(--spacing-12)",
          }}
        >
          Host a night
        </h1>
        <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", lineHeight: "var(--line-height-relaxed)", maxWidth: "44rem" }}>
          Set the place and time, say who it&apos;s for, and list the games you&apos;re bringing.
          Players who match can find it and RSVP.
        </p>
        <div style={{ marginTop: "var(--spacing-32)" }}>
          <NightForm />
        </div>
      </section>
    </Container>
  );
}
