import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { NightForm } from "@/components/board-game-nights/NightForm";
import { listTemplates, getTemplate } from "@/lib/board-game-nights/templates";
import type { BoardGameNight, NightLevel } from "@/lib/board-game-nights/types";

export const metadata: Metadata = {
  title: "Host a board-game night",
  description: "Set up your own board-game night — place, time, game types, and the games you're bringing.",
};

export default async function CreateNightPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/board-game-nights/create");

  const { template: templateId } = await searchParams;
  const templates = await listTemplates().catch(() => []);

  // Prefill from a template (date left blank for the new night).
  let initial: BoardGameNight | undefined;
  if (templateId) {
    const tmpl = await getTemplate(templateId).catch(() => null);
    if (tmpl) {
      const d = tmpl.data;
      initial = {
        id: "", host_id: "", title: d.title ?? "", description: d.description ?? null,
        place: d.place ?? null, lat: null, lng: null, starts_at: null, timezone: null,
        capacity: d.capacity ?? null, visibility: d.visibility ?? "public",
        genres: d.genres ?? null, level: (d.level ?? null) as NightLevel | null,
        games: d.games ?? [], status: "scheduled", created_at: "", updated_at: "",
      };
    }
  }

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

        {templates.length > 0 && (
          <div className="bgn-templates">
            <span className="bgn-templates__label">Start from a template</span>
            <div className="bgn-templates__row">
              {templates.map((t) => (
                <Link
                  key={t.id}
                  href={`/board-game-nights/create?template=${t.id}`}
                  className={`bgn-template-chip${templateId === t.id ? " bgn-template-chip--active" : ""}`}
                >
                  {t.name}
                </Link>
              ))}
              {templateId && (
                <Link href="/board-game-nights/create" className="bgn-template-chip">Start blank</Link>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: "var(--spacing-32)" }}>
          {/* key forces the form to re-init when switching templates */}
          <NightForm key={templateId ?? "blank"} initial={initial} />
        </div>
      </section>
    </Container>
  );
}
