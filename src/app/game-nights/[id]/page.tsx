import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getNight, getRsvps } from "@/lib/game-nights/store";
import { getNightAccess, hasAnyAccessDetail } from "@/lib/game-nights/lobby";
import { boardGameLevelLabel, boardGameLengthLabel } from "@/data/board-games";
import { nightKindLabel } from "@/lib/game-nights/types";
import { RsvpControl } from "@/components/game-nights/RsvpControl";
import { NightMap } from "@/components/game-nights/NightMap";
import { ShareToFeedButton } from "@/components/social/ShareToFeedButton";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { LiveNightAttendees, type LiveAttendee } from "@/components/game-nights/LiveNightAttendees";
import { effectiveTier, type SubscriptionTier } from "@/lib/subscription";
import type { RsvpStatus } from "@/lib/game-nights/types";
import { EventShell, EventPanelHead } from "@/components/events/EventShell";
import { TicketCard } from "@/components/events/TicketCard";
import { TicketResult } from "@/components/events/TicketResult";
import { listTiers } from "@/lib/events/tickets";
import { TicketPurchase } from "@/components/events/TicketPurchase";
import { getFollowCounts, getFollowState } from "@/lib/social/follows";
import { listMoreFromOrganizer } from "@/lib/events/more";
import { getBaseUrl } from "@/lib/env";
import { boardGameLengthLabel as lengthLabel } from "@/data/board-games";
import { gameArtFallback } from "@/data/game-night-visuals";

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
    .select("id, username, display_name, subscription_tier, role, circuit_tier, circuit_status, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar")
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
  // A hosted night wears its host's theme (personalization principle). Guarded.
  // Remap the CDS primary CTA vars to the host color so buttons adopt the theme
  // (accent leads, brand preset falls back, site primary as the final default).
  const ownerTheme = await getOwnerThemeVars(night.host_id).catch(() => ({}));
  // Cheapest live ticket, so structured data doesn't advertise a paid event as free.
  const tiers = await listTiers("game-night", night.id).catch(() => []);
  const lowestPrice = tiers.length > 0 ? Math.min(...tiers.map((t) => t.amountCents)) / 100 : null;
  const pageStyle = {
    background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))",
    minHeight: "100vh",
    paddingBottom: "var(--spacing-64)",
    ...ownerTheme,
    ["--bg-primary" as string]: "var(--profile-accent, var(--brand-primary, var(--primary-600)))",
    ["--text-on-primary" as string]: "var(--profile-accent-on, var(--brand-on, #fff))",
  } as React.CSSProperties;
  const when = fmtWhen(night.starts_at, night.timezone);
  const locType = night.location_type ?? "in_person";
  /**
   * The private half of "where". RLS returns it only to the host and to people
   * whose RSVP is "going", so an unauthorised viewer gets null here and the
   * slot does not render — the gate is the database, not this condition.
   */
  const access = await getNightAccess(night.id);
  const showLobby = hasAnyAccessDetail(access);

  // Server Component: renders once per request, so reading the clock here is safe.
  // eslint-disable-next-line react-hooks/purity
  const isPast = night.starts_at ? new Date(night.starts_at).getTime() < Date.now() : false;
  /**
   * Same rule as tournaments: a night that has already happened has no RSVP
   * left to make, so the rail goes and the body takes the full width. Anyone
   * who was actually there keeps it — their ticket and their RSVP are theirs,
   * and the "Past" badge beside the title already says the rest.
   */
  const showActionRail = !isPast || !!myRsvp || isHost;

  // Shared shell inputs: organizer follow state, more-from rail, good-to-know.
  const [followState, followCounts, moreFromOrganizer] = await Promise.all([
    user ? getFollowState(user.id, night.host_id) : Promise.resolve({ isFollowing: false, isMutual: false }),
    getFollowCounts(night.host_id),
    listMoreFromOrganizer(night.host_id, { type: "game-night", id: night.id }),
  ]);
  const lengths = [...new Set(night.games.map((g) => g.length).filter(Boolean))] as string[];
  // Only facts this page states nowhere else. Level and kind are badges by the
  // title; the game count is the "Games on the table" section right below. The
  // attendance count lives here and NOT in the RSVP panel, which shows only the
  // states that change what the button means (spots left / full).
  const goodToKnow = [
    ...(night.capacity != null
      ? [{ label: "Spots", value: `${going.length} / ${night.capacity} going` }]
      : [{ label: "Going", value: `${going.length} ${going.length === 1 ? "person" : "people"}` }]),
    ...(lengths.length > 0 ? [{ label: "Game length", value: lengths.map((l) => lengthLabel(l)).join(" · ") }] : []),
    { label: "Visibility", value: night.visibility === "public" ? "Public" : "Unlisted (link only)" },
  ];
  const pageUrl = `${getBaseUrl()}/game-nights/${night.id}`;

  return (
    <EventShell
      type="game-night"
      id={night.id}
      title={night.title}
      hero={{ imageUrl: night.cover_image_url ?? null }}
      artKind={night.kind}
      badges={
        <>
          <span className={`lounge-status lounge-status--${isPast ? "complete" : "open"}`}>{isPast ? "Past" : "Upcoming"}</span>
          {night.kind && night.kind !== "board" && <span className="bg-badge bg-badge--kind">{nightKindLabel(night.kind, true)}</span>}
          {level && <span className="bg-badge bg-badge--level">{level}</span>}
          {(night.genres ?? []).slice(0, 4).map((g) => <span key={g} className="bg-tag">{g}</span>)}
        </>
      }
      breadcrumb={[{ label: "Game nights", href: "/game-nights" }, { label: night.title }]}
      presentedBy={presentingCommunity ? { slug: presentingCommunity.slug, name: presentingCommunity.display_name || presentingCommunity.slug } : null}
      organizer={{
        userId: night.host_id,
        username: host?.username ?? null,
        displayName: host?.display_name || host?.username || "a GameShuffle member",
        avatar: host ? { id: host.id as string, avatar_source: host.avatar_source, avatar_seed: host.avatar_seed, avatar_options: host.avatar_options, discord_avatar: host.discord_avatar, twitch_avatar: host.twitch_avatar } : null,
        followState,
        followerCount: followCounts.followers,
      }}
      isOrganizer={isHost}
      manageHref={isHost ? `/game-nights/${night.id}/manage` : null}
      manageLabel="Manage night"
      manageNote="You're hosting this night"
      when={{ startsAt: night.starts_at, label: when }}
      where={
        locType === "online"
          ? { kind: "online", label: "Online" }
          : { kind: night.place ? "in_person" : "tba", label: night.place }
      }
      calendarDescription={night.description}
      pageUrl={pageUrl}
      shareToFeed={night.visibility === "public" ? (
        <ShareToFeedButton
          entityType="board_game_night"
          entityId={night.id}
          title={night.title}
          subtitle={[when, night.place].filter(Boolean).join(" · ") || undefined}
          url={`/game-nights/${night.id}`}
          label="Share to feed"
        />
      ) : null}
      goodToKnow={goodToKnow}
      panel={{ heading: isHost ? "You're hosting" : "RSVP", goingCount: going.length, capacity: night.capacity }}
      action={!showActionRail ? undefined : (
        <>
        <TicketResult />
        {user && !isHost && myRsvp === "going" && <TicketCard type="game-night" eventId={night.id} />}
        {!isHost && <TicketPurchase type="game-night" eventId={night.id} />}
        <div className="comp-card">
          <EventPanelHead
            heading={isHost ? "You're hosting" : "RSVP"}
            goingCount={going.length}
            capacity={night.capacity}
          />
          {isHost ? (
            <>
              <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginBottom: "var(--spacing-12)" }}>
                Share the link so players can find and RSVP.
              </p>
              <Link href={`/game-nights/${night.id}/manage`} style={{ textDecoration: "none" }}>
                <Button variant="secondary" fullWidth>Manage night</Button>
              </Link>
            </>
          ) : (
            <RsvpControl nightId={night.id} initial={myRsvp} signedIn={!!user} />
          )}
        </div>
        </>
      )}
      moreFromOrganizer={moreFromOrganizer}
      schema={{ status: night.status === "cancelled" ? "cancelled" : isPast ? "ended" : "scheduled", registrationOpen: !isPast && night.status === "scheduled", price: lowestPrice, lat: night.lat, lng: night.lng }}
      style={pageStyle}
      slots={[
        {
          id: "about",
          label: "The night",
          content: (
            <>
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
                {night.games.some((g) => g.bggId) && (
                  <p className="bgn-credit">
                    Game data and cover art from{" "}
                    <a href="https://boardgamegeek.com" target="_blank" rel="noopener noreferrer">BoardGameGeek</a>.
                  </p>
                )}
              </div>
            )}
            {night.lat != null && night.lng != null && (
              <div className="comp-card" id="where">
                <h2 className="bgn-event-h2">Where to find it</h2>
                {night.place && <p className="bgn-detail__desc" style={{ marginTop: 0 }}>{night.place}</p>}
                <NightMap lat={night.lat} lng={night.lng} place={night.place} />
              </div>
            )}
            </>
          ),
        },
        // Only for people who are actually going — and only when the host has
        // filled something in. An empty "How to join" tab telling an attendee
        // there is nothing to tell them is worse than no tab.
        ...(showLobby
          ? [{
              id: "join",
              label: "How to join",
              content: (
                <div className="comp-card">
                  <h2 className="bgn-event-h2">How to join</h2>
                  <p className="bgn-lobby__who">
                    Only people going to this night can see this.
                  </p>
                  <dl className="bgn-lobby">
                    {access!.joinUrl && (
                      <div className="bgn-lobby__row">
                        <dt>{locType === "online" ? "Join link" : "Link"}</dt>
                        <dd>
                          <a href={access!.joinUrl} target="_blank" rel="noopener noreferrer">
                            {access!.joinUrl}
                          </a>
                        </dd>
                      </div>
                    )}
                    {access!.roomCode && (
                      <div className="bgn-lobby__row">
                        <dt>Room code</dt>
                        <dd><code className="bgn-lobby__code">{access!.roomCode}</code></dd>
                      </div>
                    )}
                    {access!.arrivalNote && (
                      <div className="bgn-lobby__row">
                        <dt>{locType === "online" ? "Notes" : "Getting in"}</dt>
                        <dd style={{ whiteSpace: "pre-wrap" }}>{access!.arrivalNote}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ),
            }]
          : []),
        {
          id: "people",
          label: "Who's going",
          badge: going.length,
          content: (
            <div className="comp-card">
              <LiveNightAttendees
                nightId={night.id}
                initialAttendees={(attendees ?? []) as LiveAttendee[]}
                initialCount={going.length}
                live={liveEnabled}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
