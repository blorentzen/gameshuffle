import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getNight, getRsvps } from "@/lib/board-game-nights/store";
import { boardGameLevelLabel, boardGameLengthLabel } from "@/data/board-games";
import { RsvpControl } from "@/components/board-game-nights/RsvpControl";
import { NightMap } from "@/components/board-game-nights/NightMap";
import { ShareToFeedButton } from "@/components/social/ShareToFeedButton";
import { nightVisual, gameArtFallback } from "@/data/board-game-night-visuals";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { LiveNightAttendees, type LiveAttendee } from "@/components/board-game-nights/LiveNightAttendees";
import { effectiveTier, type SubscriptionTier } from "@/lib/subscription";
import type { RsvpStatus } from "@/lib/board-game-nights/types";

interface AttendeeRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_source?: string | null;
  avatar_seed?: string | null;
  avatar_options?: Record<string, string> | null;
  discord_avatar?: string | null;
  twitch_avatar?: string | null;
}

function fmtWhen(iso: string | null, tz: string | null): string {
  if (!iso) return "Date to be announced";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || undefined,
      timeZoneName: "short",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export default async function NightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const night = await getNight(id);
  if (!night) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rsvps = await getRsvps(id);
  const going = rsvps.filter((r) => r.status === "going");
  const myRsvp: RsvpStatus | null = user
    ? rsvps.find((r) => r.user_id === user.id)?.status ?? null
    : null;
  const isHost = user?.id === night.host_id;

  // Service client so a host who's opted their profile to private still renders
  // as the host (identity + tier for the live-updates gate) — going private
  // hides your profile, not the fact that you host a public night.
  const svc = createServiceClient();
  const { data: host } = await svc
    .from("users")
    .select("username, display_name, subscription_tier, role, circuit_tier, circuit_status")
    .eq("id", night.host_id)
    .maybeSingle();

  // Real-time attendee updates are a paid, live-environment feature → gated on
  // the host's tier (GS Pro / staff). Free hosts get the static snapshot.
  const liveEnabled = effectiveTier({
    tier: (host?.subscription_tier as SubscriptionTier | null) ?? "free",
    role: (host?.role as string | null) ?? null,
    circuitTier: (host?.circuit_tier as string | null) ?? null,
    circuitStatus: (host?.circuit_status as string | null) ?? null,
  }) === "pro";

  // Presenting community (community-organized night). Guarded — community_id is
  // absent pre-migration; a null id just means an individually-hosted night.
  let presentingCommunity: { slug: string; display_name: string | null } | null = null;
  if (night.community_id) {
    const { data: c } = await svc
      .from("gs_communities")
      .select("slug, display_name")
      .eq("id", night.community_id)
      .maybeSingle();
    presentingCommunity = (c as { slug: string; display_name: string | null } | null) ?? null;
  }

  const attendeeIds = going.map((r) => r.user_id).slice(0, 40);
  const { data: attendees } = attendeeIds.length
    ? await supabase.from("users").select("id, username, display_name, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", attendeeIds)
    : { data: [] as AttendeeRow[] };

  const level = boardGameLevelLabel(night.level);
  const visual = nightVisual(night.id);
  // A hosted night wears its host's theme (personalization principle). Guarded.
  // Remap the CDS primary CTA vars to the host color so buttons adopt the theme
  // (accent leads, brand preset falls back, site primary as the final default).
  const ownerTheme = await getOwnerThemeVars(night.host_id).catch(() => ({}));
  const pageStyle = {
    background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))",
    minHeight: "100vh",
    paddingBottom: "var(--spacing-64)",
    ...ownerTheme,
    ["--bg-primary" as string]: "var(--profile-accent, var(--brand-primary, var(--primary-600)))",
    ["--text-on-primary" as string]: "var(--profile-accent-on, var(--brand-on, #fff))",
  } as React.CSSProperties;
  const when = fmtWhen(night.starts_at, night.timezone);
  // Server Component: renders once per request, so reading the clock here is safe.
  // eslint-disable-next-line react-hooks/purity
  const isPast = night.starts_at ? new Date(night.starts_at).getTime() < Date.now() : false;

  // At-a-glance details (mirrors the tournament event page's details grid).
  const details: { label: string; value: string }[] = [
    { label: "When", value: when },
    { label: "Where", value: night.place || "To be announced" },
    ...(night.capacity != null ? [{ label: "Spots", value: `${going.length} / ${night.capacity} going` }] : [{ label: "Going", value: String(going.length) }]),
    ...(level ? [{ label: "Level", value: level }] : []),
    ...(night.games.length > 0 ? [{ label: "Games", value: `${night.games.length} on the table` }] : []),
  ];

  return (
    <main className="bgn-event-page" style={pageStyle}>
      {/* Full-bleed hero — the host's cover image if set, else a branded gradient
          (nights without a photo). Leads with an image the way the tournament
          page does. */}
      {night.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={night.cover_image_url} alt="" className="bgn-event-hero bgn-event-hero--img" />
      ) : (
        <div className="bgn-event-hero" style={{ background: visual.gradient }}>
          <span className="bgn-event-hero__emoji" aria-hidden>{visual.emoji}</span>
        </div>
      )}

      <Container>
        <div style={{ margin: "var(--spacing-24) 0 var(--spacing-8)" }}>
          <Breadcrumb
            items={[
              { label: "Board game nights", href: "/board-game-nights" },
              { label: night.title },
            ]}
          />
        </div>

        {/* Host bar */}
        {isHost && (
          <div className="comp-card bgn-event-hostbar">
            <span>You&rsquo;re hosting this night</span>
            <Link href={`/board-game-nights/${night.id}/manage`} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="small">Manage night</Button>
            </Link>
          </div>
        )}

        {/* Hero header — sits on the tinted page, no card */}
        <header className="bgn-event-head">
          <div className="bgn-event-head__badges">
            <span className={`lounge-status lounge-status--${isPast ? "complete" : "open"}`}>{isPast ? "Past" : "Upcoming"}</span>
            {level && <span className="bg-badge bg-badge--level">{level}</span>}
            {(night.genres ?? []).slice(0, 4).map((g) => <span key={g} className="bg-tag">{g}</span>)}
          </div>
          <h1 className="bgn-event-head__title">{night.title}</h1>
          {presentingCommunity && (
            <p className="bgn-event-head__host">
              Presented by{" "}
              <Link href={`/c/${presentingCommunity.slug}`}>{presentingCommunity.display_name || presentingCommunity.slug}</Link>
            </p>
          )}
          <p className="bgn-event-head__host">
            {presentingCommunity ? "Run by" : "Hosted by"}{" "}
            {host?.username ? (
              <Link href={`/u/${host.username}`}>{host.display_name || host.username}</Link>
            ) : (
              host?.display_name || "a GameShuffle member"
            )}
            {isHost && <span className="bgn-event-head__you"> · that&rsquo;s you</span>}
          </p>
          <p className="bgn-event-head__line">📅 {when}</p>
          {night.place && <p className="bgn-event-head__line">📍 {night.place}</p>}
          {night.visibility === "public" && (
            <div className="bgn-event-head__share">
              <ShareToFeedButton
                entityType="board_game_night"
                entityId={night.id}
                title={night.title}
                subtitle={[when, night.place].filter(Boolean).join(" · ") || undefined}
                url={`/board-game-nights/${night.id}`}
                label="Share to feed"
              />
            </div>
          )}
        </header>

        {/* Two-column body — content left, sticky RSVP rail right (same layout as
            the tournament event page). */}
        <div className="tournament-layout">
          <div className="tournament-layout__main">
            {/* At-a-glance details */}
            <div className="comp-card bgn-event-details">
              {details.map((d) => (
                <div key={d.label} className="bgn-event-details__item">
                  <span className="bgn-event-details__label">{d.label}</span>
                  <span className="bgn-event-details__value">{d.value}</span>
                </div>
              ))}
            </div>

            {night.description && (
              <div className="comp-card">
                <h2 className="bgn-event-h2">About this night</h2>
                <p className="bgn-detail__desc" style={{ margin: 0 }}>{night.description}</p>
              </div>
            )}

            {night.games.length > 0 && (
              <div className="comp-card">
                <h2 className="bgn-event-h2">Games on the table</h2>
                <ul className="bgn-gamelist">
                  {night.games.map((g, i) => (
                    <li key={`${g.name}-${i}`} className="bgn-gamelist__item">
                      {g.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.imageUrl} alt="" className="bgn-gamelist__art" />
                      ) : (() => {
                        const fpo = gameArtFallback(g.name, g.length);
                        return (
                          <span
                            className={`bgn-gamelist__art bgn-gamelist__art--fpo bgn-gamelist__art--fpo-${fpo.length}`}
                            style={{ backgroundImage: fpo.gradient }}
                            aria-hidden
                          >
                            {fpo.initials}
                          </span>
                        );
                      })()}
                      <span className="bgn-gamelist__name">{g.name}</span>
                      {g.length && <span className="bg-badge">{boardGameLengthLabel(g.length)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {night.lat != null && night.lng != null && (
              <div className="comp-card">
                <h2 className="bgn-event-h2">Where to find it</h2>
                {night.place && <p className="bgn-detail__desc" style={{ marginTop: 0 }}>{night.place}</p>}
                <NightMap lat={night.lat} lng={night.lng} place={night.place} />
              </div>
            )}
          </div>

          <aside className="tournament-layout__aside">
            <div className="comp-card">
              <h2 className="bgn-event-h2">{isHost ? "You're hosting" : "RSVP"}</h2>
              {isHost ? (
                <>
                  <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginBottom: "var(--spacing-12)" }}>
                    Share the link so players can find and RSVP.
                  </p>
                  <Link href={`/board-game-nights/${night.id}/manage`} style={{ textDecoration: "none" }}>
                    <Button variant="secondary" fullWidth>Manage night</Button>
                  </Link>
                </>
              ) : (
                <RsvpControl nightId={night.id} initial={myRsvp} signedIn={!!user} />
              )}

              <LiveNightAttendees
                nightId={night.id}
                initialAttendees={(attendees ?? []) as LiveAttendee[]}
                initialCount={going.length}
                live={liveEnabled}
              />
            </div>
          </aside>
        </div>

      </Container>
    </main>
  );
}
