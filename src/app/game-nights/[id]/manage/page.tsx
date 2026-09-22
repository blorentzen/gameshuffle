import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { getNight } from "@/lib/game-nights/store";
import { suggestPlayersForNight } from "@/lib/game-nights/suggest";
import { boardGameLevelLabel } from "@/data/board-games";
import { NightForm } from "@/components/game-nights/NightForm";
import { AttendeeTable } from "@/components/events/AttendeeTable";
import { TicketingManager } from "@/components/events/TicketingManager";
import { SaveTemplateButton } from "@/components/game-nights/SaveTemplateButton";
import { NightCommunityPicker } from "@/components/game-nights/NightCommunityPicker";

export const metadata: Metadata = { title: "Manage game night" };

export default async function ManageNightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/game-nights/${id}/manage`);

  const night = await getNight(id);
  if (!night) notFound();
  if (night.host_id !== user.id) redirect(`/game-nights/${id}`);

  const suggestions = await suggestPlayersForNight(id).catch(() => []);

  return (
    <Container>
      <section style={{ margin: "var(--spacing-48) 0 var(--spacing-64)", maxWidth: "80rem" }}>
        <p className="marketing-eyebrow">Game nights</p>
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-16)", flexWrap: "wrap" }}>
          <Link href={`/game-nights/${id}`}>View public page →</Link>
          <Link href={`/game-nights/${id}/display`} target="_blank" rel="noopener noreferrer">Display mode ↗</Link>
          <SaveTemplateButton nightId={id} />
        </div>
        <div style={{ marginTop: "var(--spacing-24)" }}>
          <NightCommunityPicker nightId={id} initialCommunityId={night.community_id} />
        </div>
        <div style={{ marginTop: "var(--spacing-24)" }}>
          <NightForm nightId={id} initial={night} />
        </div>

        {/* Tickets + payouts (free nights simply have no tiers). */}
        <div className="comp-card" style={{ marginTop: "var(--spacing-24)" }}>
          <TicketingManager type="game-night" eventId={id} />
        </div>

        {/* Attendees: RSVPs + waitlist, check-in, message, export. */}
        <div className="comp-card" style={{ marginTop: "var(--spacing-24)" }}>
          <h2 className="event-shell__h2">Attendees</h2>
          <AttendeeTable type="game-night" eventId={id} capacity={night.capacity} checkInHref={`/game-nights/${id}/manage/check-in`} />
        </div>

        {/* Who fits this night — public players whose board-game prefs match the
            night's genres/level, so the host can invite the right people. */}
        {suggestions.length > 0 && (
          <div className="bgn-suggest">
            <h2 className="bgn-side__heading">Players who might fit this night</h2>
            <p className="bgn-suggest__sub">
              Public members whose board-game tastes line up with this night. Reach out and invite them.
            </p>
            <div className="bgn-suggest__grid">
              {suggestions.map((p) => {
                const lvl = boardGameLevelLabel(p.level);
                return (
                  <Link key={p.userId} href={`/u/${p.username}`} className="bgn-suggest__card">
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatarUrl} alt="" className="bgn-suggest__avatar" />
                    ) : (
                      <span className="bgn-suggest__avatar bgn-suggest__avatar--fallback">
                        {p.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="bgn-suggest__body">
                      <span className="bgn-suggest__name">{p.displayName}</span>
                      <span className="bgn-suggest__tags">
                        {lvl && <span className="bg-badge bg-badge--level">{lvl}</span>}
                        {p.sharedGenres.slice(0, 3).map((g) => (
                          <span key={g} className="bg-tag">{g}</span>
                        ))}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </Container>
  );
}
