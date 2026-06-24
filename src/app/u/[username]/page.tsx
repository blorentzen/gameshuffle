import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@empac/cascadeds";
import { notFound } from "next/navigation";
import { GAMERTAG_PLATFORMS } from "@/data/gamertag-types";
import type { Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, socialHref, type Socials } from "@/data/socials-types";
import { PlatformIcon } from "@/components/PlatformIcon";
import { gameArt } from "@/data/favorite-games";
import { getGameArtwork } from "@/lib/games/artwork";
import { getProfileEnrichment, type TournamentLite } from "@/lib/profile/enrichment";
import { effectiveTier, isStaffRole, type SubscriptionTier } from "@/lib/subscription";
import { getFollowCounts, getFollowState } from "@/lib/social/follows";
import { getTopFriends } from "@/lib/social/topFriends";
import { ProfileFollow } from "@/components/profile/ProfileFollow";
import { MessageButton } from "@/components/profile/MessageButton";
import { FriendTile } from "@/components/social/FriendTile";
import { FollowStats } from "@/components/social/FollowStats";
import { ProfileConfigs, type ProfileConfig } from "@/components/profile/ProfileConfigs";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { brandCssVars } from "@/lib/theme/brand";
import { getBrandThemeForOwner } from "@/lib/theme/brand-server";
import { isPubliclyVisible } from "@/lib/moderation/status";
import { isBlocked } from "@/lib/moderation/blocks";
import { ReportProfileButton } from "@/components/profile/ReportProfileButton";
import { BlockProfileButton } from "@/components/profile/BlockProfileButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("users")
    .select("display_name, username, is_public, moderation_status, moderation_until")
    .eq("username", username)
    .single();

  if (!user) return { title: "Player Not Found" };

  // Don't leak a private or moderated profile's name into <title>/OG/search —
  // the page body is hidden, so the metadata must be too.
  const visible =
    user.is_public &&
    isPubliclyVisible(
      user.moderation_status as string | null,
      user.moderation_until as string | null,
    );
  if (!visible) {
    return { title: "Profile unavailable", robots: { index: false, follow: false } };
  }

  const displayName = user.display_name || user.username;
  return {
    title: `${displayName}'s Profile`,
    description: `View ${displayName}'s GameShuffle profile — tournaments, saved configurations, and competitive stats.`,
    openGraph: {
      title: `${displayName} | GameShuffle`,
      description: `View ${displayName}'s GameShuffle profile.`,
      url: `https://www.gameshuffle.co/u/${username}`,
      images: ["/images/opengraph/gameshuffle-main-og.jpg"],
    },
    alternates: {
      canonical: `https://www.gameshuffle.co/u/${username}`,
    },
  };
}

function TournamentRow({ t }: { t: TournamentLite }) {
  const art = getGameArtwork(t.game_slug);
  return (
    <a href={`/tournament/${t.id}`} className="tournament-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art.artworkUrl} alt="" className="tournament-row__art" />
      <span className="tournament-row__body">
        <span className="tournament-row__title">{t.title}</span>
        <span className="tournament-row__meta">
          {art.shortName}
          {t.date_time ? ` · ${new Date(t.date_time).toLocaleDateString()}` : ""}
        </span>
      </span>
      {t.status ? (
        <span className={`tournament-row__status tournament-row__status--${t.status}`}>
          {t.status.replace(/_/g, " ")}
        </span>
      ) : null}
    </a>
  );
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("id, display_name, username, gamertags, is_public, created_at, email_verified, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, subscription_tier, role")
    .eq("username", username)
    .eq("is_public", true)
    .single();

  if (!profile) {
    notFound();
  }

  // Trust & Safety: a suspended/banned profile is withheld from the public.
  // Separate, guarded query so a not-yet-applied migration degrades to
  // "visible" rather than 404-ing every profile.
  const { data: mod } = await supabase
    .from("users")
    .select("moderation_status, moderation_until")
    .eq("id", profile.id)
    .maybeSingle();
  const moderationHidden = !isPubliclyVisible(
    mod?.moderation_status as string | null,
    mod?.moderation_until as string | null,
  );

  // Hide the profile from a blocked viewer (either direction).
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const blockHidden =
    !!viewer &&
    viewer.id !== profile.id &&
    (await isBlocked(viewer.id, profile.id as string));

  if (moderationHidden || blockHidden) {
    return (
      <main className="profile-page">
        <Container>
          <div className="profile-shell" style={{ padding: "var(--spacing-64) 0", textAlign: "center" }}>
            <h1 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-12)" }}>
              This profile is unavailable
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
              This profile isn&rsquo;t available right now.
            </p>
          </div>
        </Container>
      </main>
    );
  }

  const gamertags = (profile.gamertags as Gamertags) || {};
  const hasGamertags = Object.values(gamertags).some((v) => v);

  // Identity fields (Phase 3) — guarded so a not-yet-applied migration
  // degrades to "no identity" rather than erroring the whole profile.
  const { data: identity } = await supabase
    .from("users")
    .select("bio, pronouns, location, socials, favorite_games, profile_banner_url")
    .eq("id", profile.id)
    .maybeSingle();
  const bannerUrl = (identity?.profile_banner_url as string | null) || null;
  const bio = (identity?.bio as string | null) || null;
  const pronouns = (identity?.pronouns as string | null) || null;
  const location = (identity?.location as string | null) || null;
  const socials = (identity?.socials as Socials | null) || {};
  const favoriteGames = (identity?.favorite_games as string[] | null) || [];
  const socialLinks = SOCIAL_PLATFORMS.filter(
    (p) => (socials[p.key as keyof Socials] || "").trim().length > 0,
  );

  // Brand theme re-skins this public profile (header banner + accents).
  // Default = the GameShuffle site brand, so unthemed profiles look as before.
  const brandStyle = brandCssVars(await getBrandThemeForOwner(profile.id as string));

  // Fetch this user's configs (both public and shared)
  const { data: configs } = await supabase
    .from("saved_configs")
    .select("id, config_name, randomizer_slug, share_token, created_at, config_data")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Wallet, communities, configs count, tournaments (service-client reads).
  const enrichment = await getProfileEnrichment(profile.id as string);

  // Social graph: public counts + the viewer's relationship to this profile.
  const followCounts = await getFollowCounts(profile.id as string);
  const followState =
    viewer && viewer.id !== profile.id
      ? await getFollowState(viewer.id, profile.id as string)
      : { isFollowing: false, isMutual: false };
  const topFriends = await getTopFriends(profile.id as string);

  const tournamentTotal = enrichment.organized.length + enrichment.joined.length;
  const stats: { num: string; label: string }[] = [];
  if (enrichment.tokenBalance !== null)
    stats.push({ num: enrichment.tokenBalance.toLocaleString(), label: "Tokens" });
  if (enrichment.communities.length)
    stats.push({ num: String(enrichment.communities.length), label: "Communities" });
  if (enrichment.configCount)
    stats.push({ num: String(enrichment.configCount), label: "Configs" });
  if (tournamentTotal) stats.push({ num: String(tournamentTotal), label: "Tournaments" });

  // Identity badges: Staff / GS Pro + a streamer "Watch live" link.
  const role = (profile.role as string | null) ?? null;
  const tier = (profile.subscription_tier as SubscriptionTier | null) ?? "free";
  const badges: { key: string; label: string; href?: string }[] = [];
  if (isStaffRole(role)) {
    badges.push({ key: "staff", label: "Staff" });
  } else if (effectiveTier({ tier, role }) === "pro") {
    badges.push({ key: "pro", label: "GS Pro" });
  }
  if (enrichment.isStreamer && profile.username) {
    badges.push(
      enrichment.isLive
        ? { key: "live", label: "Check out live page", href: `/live/${profile.username}` }
        : { key: "streamer", label: "Watch live", href: `/live/${profile.username}` },
    );
  }

  return (
    <main className="profile-page" style={brandStyle}>
      <div
        className="profile-banner"
        aria-hidden="true"
        style={
          bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined
        }
      />
      <Container>
        <div className="profile-shell">
          <header className="profile-headcard">
            <div className="profile-headcard__top">
              <span className="profile-headcard__avatar">
                <UserAvatar
                  user={{
                    id: profile.id as string,
                    avatar_source: (profile.avatar_source as AvatarSource | null) ?? "dicebear",
                    avatar_seed: (profile.avatar_seed as string | null) ?? null,
                    avatar_options: (profile.avatar_options as Record<string, string> | null) ?? null,
                    discord_avatar: profile.discord_avatar as string | null,
                    twitch_avatar: profile.twitch_avatar as string | null,
                  }}
                  size={104}
                  alt={profile.display_name || username}
                />
                {enrichment.isOnline && (
                  <span className="profile-online-dot" title="Online" aria-label="Online" />
                )}
              </span>
              <div className="profile-headcard__meta">
                <h1 className="profile-headcard__name">
                  {profile.display_name || username}
                  {profile.email_verified && <VerifiedBadge />}
                </h1>
                <span className="profile-headcard__handle">@{profile.username}</span>
                {(pronouns || location) && (
                  <span className="profile-headcard__sub">
                    {[pronouns, location].filter(Boolean).join(" · ")}
                  </span>
                )}
                {badges.length > 0 && (
                  <div className="profile-badges">
                    {badges.map((b) =>
                      b.href ? (
                        <a key={b.key} href={b.href} className={`profile-badge profile-badge--${b.key}`}>
                          {b.label}
                        </a>
                      ) : (
                        <span key={b.key} className={`profile-badge profile-badge--${b.key}`}>
                          {b.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
                <div className="profile-actions">
                  <ProfileFollow
                    targetUserId={profile.id as string}
                    initialFollowing={followState.isFollowing}
                    initialMutual={followState.isMutual}
                  />
                  <MessageButton targetUserId={profile.id as string} />
                </div>
              </div>
            </div>
            {bio && <p className="profile-bio">{bio}</p>}
          </header>

          {topFriends.length > 0 && (
            <div className="account-card">
              <h2 className="profile-section-heading">Top Friends</h2>
              <div className="friend-grid">
                {topFriends.map((f) => (
                  <FriendTile key={f.id} friend={f} />
                ))}
              </div>
            </div>
          )}

          <div className="profile-stats">
            <FollowStats
              userId={profile.id as string}
              followers={followCounts.followers}
              following={followCounts.following}
            />
            {stats.map((s) => (
              <div key={s.label} className="profile-stat">
                <span className="profile-stat__num">{s.num}</span>
                <span className="profile-stat__label">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="account-card">
            {favoriteGames.length > 0 && (
              <>
                <h2 className="profile-section-heading">Favorite games</h2>
                <div className="game-card-grid" style={{ marginBottom: "2rem" }}>
                  {favoriteGames.map((g) => {
                    const art = gameArt(g);
                    return (
                      <div key={g} className="game-card">
                        {art ? (
                          <img src={art} alt="" className="game-card__art" />
                        ) : (
                          <div className="game-card__art game-card__art--blank" />
                        )}
                        <span className="game-card__name">{g}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {socialLinks.length > 0 && (
              <>
                <h2 className="profile-section-heading">Find me on</h2>
                <div className="profile-socials" style={{ marginBottom: "2rem" }}>
                  {socialLinks.map((p) => (
                    <a
                      key={p.key}
                      href={socialHref(p.key, socials[p.key as keyof Socials] as string)}
                      target="_blank"
                      rel="noreferrer me"
                      className="profile-social-link"
                    >
                      <PlatformIcon platform={p.key} size={16} dim={false} />
                      {p.label}
                    </a>
                  ))}
                </div>
              </>
            )}

            {hasGamertags && (
              <>
                <h2 className="profile-section-heading">Gamertags</h2>
                <div className="gamertag-list" style={{ marginBottom: "2rem" }}>
                  {GAMERTAG_PLATFORMS.map((platform) => {
                    const value = gamertags[platform.key as keyof Gamertags];
                    if (!value) return null;
                    return (
                      <div key={platform.key} className="gamertag-row">
                        <span className="gamertag-row__label">
                          <PlatformIcon platform={platform.key} size={20} dim={false} />
                          {platform.label}
                        </span>
                        <span className="gamertag-row__value">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {configs && configs.length > 0 && (
              <ProfileConfigs configs={configs as ProfileConfig[]} />
            )}
          </div>
          {(enrichment.organized.length > 0 || enrichment.joined.length > 0) && (
            <div className="account-card">
              {enrichment.organized.length > 0 && (
                <>
                  <h2 className="profile-section-heading">Tournaments organized</h2>
                  <div
                    className="tournament-list"
                    style={{ marginBottom: enrichment.joined.length ? "2rem" : 0 }}
                  >
                    {enrichment.organized.map((t) => (
                      <TournamentRow key={t.id} t={t} />
                    ))}
                  </div>
                </>
              )}
              {enrichment.joined.length > 0 && (
                <>
                  <h2 className="profile-section-heading">Tournaments joined</h2>
                  <div className="tournament-list">
                    {enrichment.joined.map((t) => (
                      <TournamentRow key={t.id} t={t} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {enrichment.communities.length > 0 && (
            <div className="account-card">
              <h2 className="profile-section-heading">Communities</h2>
              <div className="profile-socials">
                {enrichment.communities.map((c) => (
                  <a key={c.slug} href={`/live/${c.slug}`} className="profile-social-link">
                    {c.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="profile-report">
            <BlockProfileButton targetUserId={profile.id as string} />
            <ReportProfileButton targetUserId={profile.id as string} />
          </div>
        </div>
      </Container>
    </main>
  );
}
