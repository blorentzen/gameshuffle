import type { Metadata } from "next";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { Container, StatCard } from "@empac/cascadeds";
import { notFound } from "next/navigation";
import { LivePresenceDot } from "@/components/social/LivePresenceDot";
import { GAMERTAG_PLATFORMS } from "@/data/gamertag-types";
import type { Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, socialHref, type Socials } from "@/data/socials-types";
import { PlatformIcon } from "@/components/PlatformIcon";
import { gameArt } from "@/data/favorite-games";
import { boardGameLevelLabel, boardGameLengthLabel } from "@/data/board-games";
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
import { ProfileTabs, type ProfileTab } from "@/components/profile/ProfileTabs";
import { getPostsByAuthor, getPost } from "@/lib/social/feed";
import { resolveAccent, resolveAccentOn } from "@/lib/profile/accents";
import { PostList } from "@/components/social/PostList";
import { COMMUNITY_PUBLICLY_ENABLED } from "@/lib/community/flags";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { brandCssVars } from "@/lib/theme/brand";
import { getBrandThemeForOwner } from "@/lib/theme/brand-server";
import { isPubliclyVisible } from "@/lib/moderation/status";
import { isBlocked } from "@/lib/moderation/blocks";
import { ReportProfileButton } from "@/components/profile/ReportProfileButton";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { BlockProfileButton } from "@/components/profile/BlockProfileButton";
import { CardImage } from "@/components/tcg/CardImage";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { getCommunityBySlug } from "@/lib/communities/membership";
import { getUserCrews } from "@/lib/communities/crews";
import { formatCompact } from "@/lib/format/number";
import { resolveProfileLayout, visibleSections, type ProfileSectionKey } from "@/lib/profile/layout";
import { resolveProfileSkin, skinBackground, skinCssVars, hasCustomBackground } from "@/lib/profile/skin";
import { resolveProfileLinks, resolveProfileSpotlight, spotlightEmbedUrl } from "@/lib/profile/links";
import { resolveProfileStatus, resolveNowPlaying } from "@/lib/profile/status";
import { getUserAnthem, getTrack } from "@/lib/anthems/store";
import { sanitizeCustomCss, CUSTOM_CSS_SCOPE } from "@/lib/profile/customCss";
import { resolveStreamSchedule } from "@/lib/schedule/streamSchedule";
import { StreamScheduleCard } from "@/components/schedule/StreamScheduleCard";
import { headers } from "next/headers";
import { getInventory } from "@/lib/economy/arcade";
import { ARCADE_ITEM_BY_ID, resolveNameColor } from "@/data/arcade-items";

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
    .eq("username", username.toLowerCase())
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
    description: `View ${displayName}'s GameShuffle profile: tournaments, saved configurations, and competitive stats.`,
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
    .select("id, display_name, username, gamertags, gamertag_visibility, is_public, created_at, email_verified, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, subscription_tier, role, circuit_tier, circuit_status, equipped_name_color")
    .eq("username", username.toLowerCase())
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

  // Gamertags only surface on the public profile when the user chose the
  // "public" visibility scope. `session_participants` / `streamer_only` /
  // `private` (and the default) keep them off this page — honoring the
  // Privacy-Policy visibility commitment. Default to session-scoped (not
  // public) so an unset value never over-exposes.
  const gamertagVisibility =
    (profile.gamertag_visibility as string | null) ?? "session_participants";
  const gamertags = (profile.gamertags as Gamertags) || {};
  const hasGamertags =
    gamertagVisibility === "public" && Object.values(gamertags).some((v) => v);

  // Identity fields (Phase 3) — guarded so a not-yet-applied migration
  // degrades to "no identity" rather than erroring the whole profile.
  const { data: identity } = await supabase
    .from("users")
    .select("bio, pronouns, location, socials, favorite_games, plays_board_games, board_game_genres, board_game_level, board_game_lengths, profile_banner_url")
    .eq("id", profile.id)
    .maybeSingle();
  const bannerUrl = (identity?.profile_banner_url as string | null) || null;
  const bio = (identity?.bio as string | null) || null;
  const pronouns = (identity?.pronouns as string | null) || null;
  const location = (identity?.location as string | null) || null;
  const socials = (identity?.socials as Socials | null) || {};
  const favoriteGames = (identity?.favorite_games as string[] | null) || [];
  const playsBoardGames = !!identity?.plays_board_games;
  const boardGameGenres = (identity?.board_game_genres as string[] | null) || [];
  const boardGameLevel = boardGameLevelLabel(identity?.board_game_level as string | null);
  const boardGameLengths = ((identity?.board_game_lengths as string[] | null) || []).map(boardGameLengthLabel);
  const hasBoardGames = playsBoardGames && (boardGameGenres.length > 0 || !!boardGameLevel || boardGameLengths.length > 0);
  const socialLinks = SOCIAL_PLATFORMS.filter(
    (p) => (socials[p.key as keyof Socials] || "").trim().length > 0,
  );

  // Brand theme re-skins this public profile (header banner + accents).
  // Default = the GameShuffle site brand, so unthemed profiles look as before.
  const brandStyle = brandCssVars(await getBrandThemeForOwner(profile.id as string));

  // Personalization (accents + featured content). Separate guarded read so an
  // unapplied migration degrades to "no personalization" instead of erroring.
  const { data: perso } = await supabase
    .from("users")
    .select("profile_tagline, profile_pinned_post_id, profile_featured_game, profile_featured_card_id, profile_accent")
    .eq("id", profile.id)
    .maybeSingle();
  const tagline = ((perso?.profile_tagline as string | null) || "").trim() || null;
  const featuredGame = ((perso?.profile_featured_game as string | null) || "").trim() || null;
  const pinnedPostId = (perso?.profile_pinned_post_id as string | null) || null;
  const featuredCardId = (perso?.profile_featured_card_id as string | null) || null;
  const accentColor = resolveAccent(perso?.profile_accent as string | null);
  const accentOn = resolveAccentOn(perso?.profile_accent as string | null);

  // Profile skin (background + card styling) — guarded: column may be unapplied,
  // and the gate strips anything but allowlisted values / our own image origin.
  const { data: skinRow } = await supabase.from("users").select("profile_skin").eq("id", profile.id).maybeSingle();
  const skin = resolveProfileSkin((skinRow as { profile_skin?: unknown } | null)?.profile_skin);
  const skinBg = skinBackground(skin);

  // Link buttons + spotlight (guarded). The spotlight embed is built from the
  // parsed id; Twitch needs the host as its `parent`.
  const { data: linksRow } = await supabase.from("users").select("profile_links, profile_spotlight").eq("id", profile.id).maybeSingle();
  const profileLinks = resolveProfileLinks((linksRow as { profile_links?: unknown } | null)?.profile_links);
  const spotlight = resolveProfileSpotlight((linksRow as { profile_spotlight?: unknown } | null)?.profile_spotlight);
  const hostHeader = (await headers()).get("host") ?? "gameshuffle.co";
  const spotlightUrl = spotlightEmbedUrl(spotlight, [hostHeader.split(":")[0], "gameshuffle.co"]);

  // Status + now-playing (guarded) + the walk-up anthem title (read-only display).
  const { data: statusRow } = await supabase.from("users").select("profile_status, profile_now_playing").eq("id", profile.id).maybeSingle();
  const profileStatus = resolveProfileStatus((statusRow as { profile_status?: unknown } | null)?.profile_status);
  const nowPlaying = resolveNowPlaying((statusRow as { profile_now_playing?: unknown } | null)?.profile_now_playing);
  const nowPlayingArt = nowPlaying ? gameArt(nowPlaying) : null;
  const walkupAnthem = await getUserAnthem(profile.id as string).catch(() => null);
  const walkupTitle =
    walkupAnthem?.enabled && walkupAnthem.trackId
      ? (await getTrack(walkupAnthem.trackId).catch(() => null))?.title ?? null
      : null;

  // Custom CSS (Level 3) — re-sanitized on read even though only sanitized CSS
  // is ever stored (never trust the blob). Scoped to `.u-custom`.
  const { data: cssRow } = await supabase.from("users").select("profile_custom_css").eq("id", profile.id).maybeSingle();
  const customCss = sanitizeCustomCss((cssRow as { profile_custom_css?: unknown } | null)?.profile_custom_css).css;

  // Stream schedule (guarded).
  const { data: schedRow } = await supabase.from("users").select("stream_schedule").eq("id", profile.id).maybeSingle();
  const streamSchedule = resolveStreamSchedule((schedRow as { stream_schedule?: unknown } | null)?.stream_schedule);

  const pageStyle: React.CSSProperties = {
    ...brandStyle,
    ...skinCssVars(skin),
    ...(accentColor
      ? ({ ["--profile-accent" as string]: accentColor, ["--profile-accent-on" as string]: accentOn } as React.CSSProperties)
      : {}),
    ...(skinBg
      ? {
          background: skinBg,
          ...(skin.bg.kind === "image"
            ? { backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "fixed" }
            : {}),
        }
      : {}),
  };
  const customBg = hasCustomBackground(skin);

  // Fetch this user's configs (both public and shared)
  const { data: configs } = await supabase
    .from("saved_configs")
    .select("id, config_name, randomizer_slug, share_token, created_at, config_data")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Wallet, communities, configs count, tournaments (service-client reads).
  const enrichment = await getProfileEnrichment(profile.id as string);
  let authorPosts = COMMUNITY_PUBLICLY_ENABLED
    ? await getPostsByAuthor(profile.id as string, viewer?.id ?? "")
    : [];

  // Pinned post (personalization) — only if it's one of this profile's own,
  // still exists, and community is live. Shown atop the feed + de-duped from it.
  let pinnedPost = null;
  if (COMMUNITY_PUBLICLY_ENABLED && pinnedPostId) {
    const p = await getPost(pinnedPostId, viewer?.id ?? "").catch(() => null);
    if (p && p.author.id === profile.id) {
      pinnedPost = p;
      authorPosts = authorPosts.filter((x) => x.id !== p.id);
    }
  }

  // Featured card — spotlight one of the profile's showcased cards.
  const featuredCard = featuredCardId
    ? enrichment.showcaseCards.find((c) => c.id === featuredCardId) ?? null
    : null;

  // Social graph: public counts + the viewer's relationship to this profile.
  const followCounts = await getFollowCounts(profile.id as string);
  const followState =
    viewer && viewer.id !== profile.id
      ? await getFollowState(viewer.id, profile.id as string)
      : { isFollowing: false, isMutual: false };
  const topFriends = await getTopFriends(profile.id as string);
  const userCrews = await getUserCrews(profile.id as string).catch(() => []);

  const tournamentTotal = enrichment.organized.length + enrichment.joined.length;
  const stats: { num: string; label: string }[] = [];
  // Token balance is intentionally NOT shown on the public profile — a wallet is
  // private to its owner (managed in the account), never public-facing.
  if (enrichment.communities.length)
    stats.push({ num: formatCompact(enrichment.communities.length), label: "Communities" });
  if (enrichment.configCount)
    stats.push({ num: formatCompact(enrichment.configCount), label: "Configs" });
  if (tournamentTotal) stats.push({ num: formatCompact(tournamentTotal), label: "Tournaments" });

  // Identity badges: Staff / GS Pro + a streamer "Watch live" link.
  const role = (profile.role as string | null) ?? null;
  const tier = (profile.subscription_tier as SubscriptionTier | null) ?? "free";
  const badges: { key: string; label: string; href?: string }[] = [];
  if (isStaffRole(role)) {
    badges.push({ key: "staff", label: "Staff" });
  } else if (effectiveTier({ tier, role, circuitTier: (profile.circuit_tier as string | null) ?? null, circuitStatus: (profile.circuit_status as string | null) ?? null }) === "pro") {
    badges.push({ key: "pro", label: "GS Pro" });
  }
  if (enrichment.isStreamer && profile.username) {
    badges.push(
      enrichment.isLive
        ? { key: "live", label: "Check out live page", href: `/live/${profile.username}` }
        : { key: "streamer", label: "Watch live", href: `/live/${profile.username}` },
    );
    // A creator's channel is also a joinable community.
    if (await getCommunityBySlug(profile.username as string)) {
      badges.push({ key: "community", label: "Community", href: `/c/${profile.username}` });
    }
  }

  // Owned Arcade cosmetics (badges) — the token-sink payoff, shown by the name.
  const cosmeticBadges = (await getInventory(profile.id as string).catch(() => []))
    .map((id) => ARCADE_ITEM_BY_ID[id])
    .filter((i) => i && i.kind === "badge");

  const displayName = (profile.display_name as string) || username;
  const memberSince = profile.created_at
    ? new Date(profile.created_at as string).toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : null;

  // ── Sidebar widgets (Overview) ──────────────────────────────────────────
  const statsWidget = (
    <div className="profile-statgrid">
      <FollowStats userId={profile.id as string} followers={followCounts.followers} following={followCounts.following} />
      {stats.map((s) => (
        <StatCard key={s.label} stat={s.num} label={s.label} />
      ))}
    </div>
  );

  const featuredArt = featuredGame ? gameArt(featuredGame) : null;
  const featuredWidget = featuredGame && (
    <div className="pcard profile-featured">
      <h3 className="pcard__title">Featured game</h3>
      <div className="profile-featured__body">
        {featuredArt ? (
          <img src={featuredArt} alt="" className="profile-featured__art" />
        ) : (
          <div className="profile-featured__art profile-featured__art--blank" />
        )}
        <span className="profile-featured__name">{featuredGame}</span>
      </div>
    </div>
  );

  const featuredCardWidget = featuredCard && (
    <div className="pcard profile-featured">
      <h3 className="pcard__title">Featured card</h3>
      <div className="profile-featured-card">
        <CardImage images={featuredCard.images} name={featuredCard.name} size="medium" />
        <span className="profile-featured-card__name">{featuredCard.name}</span>
      </div>
    </div>
  );

  const favGamesWidget = favoriteGames.length > 0 && (
    <div className="pcard">
      <h3 className="pcard__title">Favorite games</h3>
      <div className="game-card-grid game-card-grid--compact">
        {favoriteGames.map((g) => {
          const art = gameArt(g);
          return (
            <div key={g} className="game-card">
              {art ? <img src={art} alt="" className="game-card__art" /> : <div className="game-card__art game-card__art--blank" />}
              <span className="game-card__name">{g}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const topFriendsWidget = topFriends.length > 0 && (
    <div className="pcard">
      <h3 className="pcard__title">Top Friends</h3>
      <div className="friend-grid friend-grid--compact">
        {topFriends.map((f) => <FriendTile key={f.id} friend={f} />)}
      </div>
    </div>
  );

  const crewsWidget = userCrews.length > 0 && (
    <div className="pcard">
      <h3 className="pcard__title">Represents</h3>
      <ul className="urep">
        {userCrews.map((c) => (
          <li key={`${c.communityId}-${c.game}`} className="urep__row">
            <a href={`/c/${c.communitySlug}`} className="urep__community">{c.communityName}</a>
            <span className="urep__game">{c.game}</span>
            <span className={`crew__tier crew__tier--${c.tier}`}>{c.tier === "captain" ? "Captain" : c.tier === "representative" ? "Rep" : "Prospect"}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const communitiesWidget = enrichment.communities.length > 0 && (
    <div className="pcard">
      <h3 className="pcard__title">Communities</h3>
      <div className="profile-socials">
        {enrichment.communities.map((c) => (
          <a key={c.slug} href={`/live/${c.slug}`} className="profile-social-link">{c.name}</a>
        ))}
      </div>
    </div>
  );

  // Section layout — guarded: the column may not be applied yet, in which case
  // the read returns null and we fall back to the default order/visibility.
  const { data: layoutRow } = await supabase
    .from("users")
    .select("profile_layout")
    .eq("id", profile.id as string)
    .maybeSingle();
  const profileLayout = resolveProfileLayout((layoutRow as { profile_layout?: unknown } | null)?.profile_layout);

  // ── Panels ──────────────────────────────────────────────────────────────
  // Overview = at-a-glance widgets, ordered + toggled per the owner's saved
  // section layout (validated through resolveProfileLayout). Stats leads; the
  // rest flow in a grid whose column count the owner chooses.
  const widgetByKey: Record<ProfileSectionKey, React.ReactNode> = {
    stats: statsWidget,
    featured: featuredWidget,
    featuredCard: featuredCardWidget,
    crews: crewsWidget,
    favGames: favGamesWidget,
    topFriends: topFriendsWidget,
    communities: communitiesWidget,
  };
  const vis = visibleSections(profileLayout);
  const showStats = vis.includes("stats");
  const gridKeys = vis.filter((k) => k !== "stats");
  const hasWidgets = gridKeys.some((k) => Boolean(widgetByKey[k]));
  const overviewContent = (
    <div className="profile-overview2" style={{ marginBottom: "var(--spacing-24)" }}>
      {showStats && statsWidget}
      {hasWidgets && (
        <div className="profile-widgets" style={profileLayout.columns === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
          {gridKeys.map((k) => (widgetByKey[k] ? <Fragment key={k}>{widgetByKey[k]}</Fragment> : null))}
        </div>
      )}
    </div>
  );

  const activityPanel = (
    <div className="profile-activity">
      {pinnedPost && (
        <div className="profile-pinned">
          <span className="profile-pinned__label">📌 Pinned</span>
          <PostList posts={[pinnedPost]} currentUserId={viewer?.id ?? ""} />
        </div>
      )}
      {authorPosts.length > 0 ? (
        <PostList posts={authorPosts} currentUserId={viewer?.id ?? ""} />
      ) : (
        !pinnedPost && <div className="pcard"><p className="profile-empty">No posts yet.</p></div>
      )}
      {configs && configs.length > 0 && (
        <div style={{ marginTop: "var(--spacing-24)" }}>
          <ProfileConfigs configs={configs as ProfileConfig[]} />
        </div>
      )}
    </div>
  );

  const tournamentsPanel = (
    <div className="account-card">
      {enrichment.organized.length > 0 && (
        <>
          <h2 className="profile-section-heading">Tournaments organized</h2>
          <div className="tournament-list" style={{ marginBottom: enrichment.joined.length ? "2rem" : 0 }}>
            {enrichment.organized.map((t) => <TournamentRow key={t.id} t={t} />)}
          </div>
        </>
      )}
      {enrichment.joined.length > 0 && (
        <>
          <h2 className="profile-section-heading">Tournaments joined</h2>
          <div className="tournament-list">
            {enrichment.joined.map((t) => <TournamentRow key={t.id} t={t} />)}
          </div>
        </>
      )}
    </div>
  );

  const cardsPanel = (
    <div className="account-card">
      <h2 className="profile-section-heading">Card showcase</h2>
      <div className="profile-card-showcase">
        {enrichment.showcaseCards.map((card) => (
          <div key={card.id} className="profile-card-showcase__cell">
            <CardImage images={card.images} name={card.name} size="medium" />
            <span className="profile-card-showcase__name">{card.name}</span>
          </div>
        ))}
      </div>
      <TcgAttribution className="profile-card-showcase__attr" />
    </div>
  );

  const aboutPanel = (
    <div className="account-card">
      {spotlightUrl && (
        <div className="profile-spotlight">
          <h2 className="profile-section-heading">Spotlight</h2>
          <div className="profile-spotlight__frame">
            <iframe
              src={spotlightUrl}
              title="Spotlight"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      )}
      {streamSchedule && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 className="profile-section-heading">Stream schedule</h2>
          <StreamScheduleCard schedule={streamSchedule} />
        </div>
      )}
      {overviewContent}
      {bio && (
        <>
          <h2 className="profile-section-heading">Bio</h2>
          <p className="profile-bio" style={{ margin: "0 0 2rem" }}>{bio}</p>
        </>
      )}
      {hasBoardGames && (
        <>
          <h2 className="profile-section-heading">Board games</h2>
          <div className="bg-profile" style={{ marginBottom: "2rem" }}>
            {(boardGameLevel || boardGameLengths.length > 0) && (
              <div className="bg-profile__meta">
                {boardGameLevel && <span className="bg-badge bg-badge--level">{boardGameLevel}</span>}
                {boardGameLengths.map((l) => <span key={l} className="bg-badge">{l}</span>)}
              </div>
            )}
            {boardGameGenres.length > 0 && (
              <div className="bg-profile__genres">
                {boardGameGenres.map((g) => <span key={g} className="bg-tag">{g}</span>)}
              </div>
            )}
          </div>
        </>
      )}
      {socialLinks.length > 0 && (
        <>
          <h2 className="profile-section-heading">Find me on</h2>
          <div className="profile-socials" style={{ marginBottom: "2rem" }}>
            {socialLinks.map((p) => (
              <a key={p.key} href={socialHref(p.key, socials[p.key as keyof Socials] as string)} target="_blank" rel="noreferrer me" className="profile-social-link">
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
      <h2 className="profile-section-heading">Details</h2>
      <div className="about-details">
        {pronouns && <div className="about-details__row"><span>Pronouns</span><span>{pronouns}</span></div>}
        {location && <div className="about-details__row"><span>Location</span><span>{location}</span></div>}
        {memberSince && <div className="about-details__row"><span>Member since</span><span>{memberSince}</span></div>}
      </div>
    </div>
  );

  const hasActivity = Boolean(pinnedPost) || authorPosts.length > 0 || (configs && configs.length > 0);

  // Activity leads (default tab); Overview widgets are consolidated into About.
  const tabs: ProfileTab[] = [];
  if (hasActivity) tabs.push({ id: "activity", label: "Activity", content: activityPanel });
  tabs.push({ id: "about", label: "About", content: aboutPanel });
  if (enrichment.showcaseCards.length > 0) tabs.push({ id: "cards", label: "Cards", content: cardsPanel });
  if (tournamentTotal > 0) tabs.push({ id: "tournaments", label: "Tournaments", content: tournamentsPanel });

  return (
    <main className={`profile-page${customBg ? " profile-page--custom-bg" : ""}`} style={pageStyle}>
      <div
        className="profile-banner"
        aria-hidden="true"
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
      />
      {customCss && (
        // Sanitized (scoped/allowlisted/url-restricted) CSS only — safe to inline.
        <style dangerouslySetInnerHTML={{ __html: customCss }} />
      )}
      <Container>
        <div className={`profile-shell${customCss ? ` ${CUSTOM_CSS_SCOPE}` : ""}`}>
          <header className="profile-hero">
            <span className="profile-hero__avatar">
              <UserAvatar
                user={{
                  id: profile.id as string,
                  avatar_source: (profile.avatar_source as AvatarSource | null) ?? "dicebear",
                  avatar_seed: (profile.avatar_seed as string | null) ?? null,
                  avatar_options: (profile.avatar_options as Record<string, string> | null) ?? null,
                  discord_avatar: profile.discord_avatar as string | null,
                  twitch_avatar: profile.twitch_avatar as string | null,
                }}
                size={112}
                alt={displayName}
              />
              <LivePresenceDot userId={profile.id as string} fallback={enrichment.isOnline} className="profile-online-dot" />
            </span>
            <div className="profile-hero__meta">
              <h1 className="profile-hero__name">
                <span style={{ color: resolveNameColor(profile.equipped_name_color as string | null) ?? undefined }}>
                  {displayName}
                </span>
                {profile.email_verified && <VerifiedBadge />}
                {cosmeticBadges.map((b) => (
                  <span key={b.id} title={b.name} style={{ marginLeft: "0.25rem" }}>{b.emoji}</span>
                ))}
              </h1>
              <span className="profile-hero__handle">@{profile.username}</span>
              {(pronouns || location) && (
                <span className="profile-hero__sub">{[pronouns, location].filter(Boolean).join(" · ")}</span>
              )}
              {tagline && <p className="profile-hero__tagline">{tagline}</p>}
              {profileStatus && <p className="profile-hero__status">💬 {profileStatus}</p>}
              {(nowPlaying || walkupTitle) && (
                <div className="profile-hero__nowline">
                  {nowPlaying && (
                    <span className="profile-nowplaying">
                      {nowPlayingArt && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={nowPlayingArt} alt="" className="profile-nowplaying__art" />
                      )}
                      <span>🎮 Playing <strong>{nowPlaying}</strong></span>
                    </span>
                  )}
                  {walkupTitle && <span className="profile-walkup">🎵 {walkupTitle}</span>}
                </div>
              )}
              {bio && <p className="profile-hero__bio">{bio}</p>}
              {badges.length > 0 && (
                <div className="profile-badges">
                  {badges.map((b) =>
                    b.href ? (
                      <a key={b.key} href={b.href} className={`profile-badge profile-badge--${b.key}`}>{b.label}</a>
                    ) : (
                      <span key={b.key} className={`profile-badge profile-badge--${b.key}`}>{b.label}</span>
                    ),
                  )}
                </div>
              )}
              {profileLinks.length > 0 && (
                <div className="profile-links">
                  {profileLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="profile-link-btn">{l.label}</a>
                  ))}
                </div>
              )}
            </div>
            <div className="profile-hero__actions">
              {viewer && viewer.id === profile.id ? (
                <a href="/account?tab=profile#personalize" className="profile-edit-btn">Edit profile</a>
              ) : (
                <>
                  <ProfileFollow
                    targetUserId={profile.id as string}
                    initialFollowing={followState.isFollowing}
                    initialMutual={followState.isMutual}
                  />
                  <MessageButton targetUserId={profile.id as string} />
                </>
              )}
              <ShareProfileButton username={profile.username as string} displayName={displayName} />
            </div>
          </header>

          <ProfileTabs tabs={tabs} />

          <div className="profile-report">
            <BlockProfileButton targetUserId={profile.id as string} />
            <ReportProfileButton targetUserId={profile.id as string} />
          </div>
        </div>
      </Container>
    </main>
  );
}
