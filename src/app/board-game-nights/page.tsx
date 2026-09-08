import Link from "next/link";
import type { Metadata } from "next";
import { Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listPublicNights, listNightsForHost } from "@/lib/board-game-nights/store";
import { boardGameLevelLabel } from "@/data/board-games";

export const metadata: Metadata = {
  title: "Board-game nights",
  description: "Find board-game nights near you, or host your own. Set the games, the vibe, and who it's for.",
};

function fmtDate(iso: string | null, tz: string | null): string {
  if (!iso) return "Date TBA";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || undefined,
    });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

export default async function BoardGameNightsPage() {
  const nights = await listPublicNights();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myNights = user ? await listNightsForHost(user.id) : [];

  return (
    <>
      <header className="bgn-hero">
        <Container>
          <div className="bgn-hero__inner">
            <p className="marketing-eyebrow">Game nights, in real life</p>
            <h1 className="bgn-hero__title">Find your table. Bring a game.</h1>
            <p className="bgn-hero__sub">
              Public board-game nights hosted by the community. Set the games, the
              vibe, and who it&apos;s for, then meet players who like what you like.
            </p>
            <div className="bgn-hero__cta">
              <Link href="/board-game-nights/create" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">Host a night</Button>
              </Link>
            </div>
          </div>
        </Container>
        <svg className="bgn-hero__curve" viewBox="0 0 1440 72" preserveAspectRatio="none" aria-hidden>
          <path d="M0,72 H1440 V34 C 940,2 520,70 0,30 Z" fill="var(--background-primary)" />
        </svg>
      </header>

      <Container>
        <section id="bgn-list" className="bgn-browse" style={{ margin: "var(--spacing-40) 0 var(--spacing-64)", scrollMarginTop: "6rem" }}>
        {myNights.length > 0 && (
          <div style={{ marginBottom: "var(--spacing-40)" }}>
            <h2 className="bgn-side__heading" style={{ marginTop: 0 }}>Your nights</h2>
            <div className="bgn-grid">
              {myNights.map((n) => (
                <Link key={n.id} href={`/board-game-nights/${n.id}/manage`} className="bgn-card">
                  <span className="bgn-card__when">{fmtDate(n.starts_at, n.timezone)}</span>
                  <span className="bgn-card__title">{n.title}</span>
                  <span className="bgn-card__games">Manage →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {nights.length === 0 ? (
          <div className="bgn-empty">
            <p>No public nights yet. Be the first to host one.</p>
            <Link href="/board-game-nights/create" style={{ textDecoration: "none" }}>
              <Button variant="primary">Host a night</Button>
            </Link>
          </div>
        ) : (
          <>
          <div className="bgn-browse__head">
            <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", lineHeight: "var(--line-height-tight)", margin: 0 }}>
              Upcoming nights
            </h2>
            <Link href="/board-game-nights/create" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Host a night</Button>
            </Link>
          </div>
          <div className="bgn-grid">
            {nights.map((n) => {
              const level = boardGameLevelLabel(n.level);
              return (
                <Link key={n.id} href={`/board-game-nights/${n.id}`} className="bgn-card">
                  <span className="bgn-card__when">{fmtDate(n.starts_at, n.timezone)}</span>
                  <span className="bgn-card__title">{n.title}</span>
                  {n.place && <span className="bgn-card__place">{n.place}</span>}
                  <span className="bgn-card__tags">
                    {level && <span className="bg-badge bg-badge--level">{level}</span>}
                    {(n.genres ?? []).slice(0, 3).map((g) => (
                      <span key={g} className="bg-tag">{g}</span>
                    ))}
                  </span>
                  {n.games.length > 0 && (
                    <span className="bgn-card__games">
                      {n.games.length} game{n.games.length === 1 ? "" : "s"} on the table
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          </>
        )}
        </section>
      </Container>
    </>
  );
}
