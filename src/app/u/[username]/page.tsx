import Link from "next/link";
import type { Metadata } from "next";
import { CameFrom } from "@/components/social/CameFrom";
import { ownerHasPro } from "@/lib/profile/proLooks";
import { ownerHasLooks } from "@/lib/support/looks";
import { FOUNDING_BRAIN_ANSWERS } from "@/lib/chatbrain/rules";
import { createClient } from "@/lib/supabase/server";
import { OwnerBar } from "@/components/owner/OwnerBar";
import { ProfileCustomizeEditor } from "@/components/owner/ProfileCustomizeEditor";
import { Container } from "@empac/cascadeds";
import { notFound } from "next/navigation";
import { LivePresenceDot } from "@/components/social/LivePresenceDot";
import { GAMERTAG_PLATFORMS } from "@/data/gamertag-types";
import type { Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, socialHref, type Socials } from "@/data/socials-types";
import { PlatformIcon } from "@/components/PlatformIcon";
import { GameCover } from "@/components/games/GameCover";
import { boardGameLevelLabel, boardGameLengthLabel } from "@/data/board-games";
import { getGameArtwork } from "@/lib/games/artwork";
import { getProfileEnrichment, type TournamentLite } from "@/lib/profile/enrichment";
import { userSeason } from "@/lib/seasons/store";
import { rivalsFor } from "@/lib/party/rivals";
import { isSeasonKey, recentSeasonKeys, seasonKey as currentSeasonKey } from "@/lib/seasons/ranks";
import { SeasonPicker } from "@/components/seasons/SeasonPicker";
import { SeasonPanel } from "@/components/seasons/SeasonPanel";
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
import { resolveAccent, accentCssVars } from "@/lib/profile/accents";
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
import { DailiesCards } from "@/components/originals/DailiesCards";
import { MmrCard } from "@/components/mmr/MmrCard";
import { MedalCredit } from "@/components/mmr/MedalCredit";
import { profileMmr } from "@/lib/mmr/store";
import { playerBests } from "@/lib/timeTrials/store";
import { formatTime as ttFormat, ordinal as ttOrdinal } from "@/lib/timeTrials/rules";
import { trackPath as ttPath, ttTrack, TT_GAMES } from "@/lib/timeTrials/tracks";
import "@/styles/mmr-card.css";
import { RoadTrainerCard } from "@/components/originals/duel/road/RoadCard";
import { roadProgressView } from "@/lib/originals/duel/roadProgress";
import { roadShown } from "@/lib/games-visibility";
import "@/styles/road-card.css";
import "@/styles/time-trials.css";
import { dailiesShown, DAILIES } from "@/lib/originals/dailies";
import { playRecords } from "@/lib/profile/playRecords";
import { PlayRecords } from "@/components/profile/PlayRecords";
import { RankBlock, type RankLine } from "@/components/rank/RankBlock";
import { profileRows } from "@/lib/mmr/profileCard";
import { spaceFor, spaceOpen } from "@/lib/games/spaces";
import { gsDay } from "@/lib/time/gsClock";
import { medalSrc } from "@/lib/mmr/medals";
import { divisionLook } from "@/lib/mmr/look";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveProfileSkin, skinBackground, skinBackgroundLayout, skinCssVars, hasCustomBackground } from "@/lib/profile/skin";
import { resolveProfileLinks, resolveProfileSpotlight, spotlightEmbedUrl } from "@/lib/profile/links";
import { resolveProfileStatus, resolveNowPlaying } from "@/lib/profile/status";
import { getUserAnthem, getTrack } from "@/lib/anthems/store";
import { sanitizeCustomCss, CUSTOM_CSS_SCOPE } from "@/lib/profile/customCss";
import { resolveStreamSchedule } from "@/lib/schedule/streamSchedule";
import { StreamScheduleCard } from "@/components/schedule/StreamScheduleCard";
import { headers } from "next/headers";
import { getInventory } from "@/lib/economy/arcade";
import { ARCADE_ITEM_BY_ID, resolveNameColor } from "@/data/arcade-items";
import { ArcadeBadgeIcon } from "@/components/arcade/ArcadeBadgeIcon";
import { IconDeviceGamepad2, IconHeart, IconMessageCircle, IconMusic, IconPin } from "@tabler/icons-react";
import { SupporterBadge } from "@/components/support/SupporterBadge";
import { getBannerGif } from "@/lib/gifs/banner";
import { ProfileGifBanner } from "@/components/profile/ProfileGifBanner";
import { HappeningCard } from "@/components/home/HappeningBand";
import { joinRow } from "@/lib/profile/frontWindow";
import { highlightCandidates, shownHighlights } from "@/lib/profile/highlights";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { catalogGame } from "@/data/game-catalog";
import { wideArt } from "@/lib/home/art";
import "@/styles/happening.css";
import "@/styles/profile-front.css";

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
    // Profiles are thin, user-generated pages: keep them out of the index but
    // let crawlers follow through to the tournaments and pages they link.
    robots: { index: false, follow: true },
    description: `View ${displayName}'s GameShuffle profile: tournaments, saved configurations, and competitive stats.`,
    openGraph: {
      siteName: "GameShuffle",
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

/**
 * The overview's tiles in the wide column (6A), on its own 12 columns: a wide tile (a list or card that wants room,
 * or the dailies with three or more games) takes the row; the others go two to a row, taking the next one that isn't
 * wide as a partner so rows stay even; one left over takes the row. One column stacks everything.
 */
const WIDE_TILES = new Set<ProfileSectionKey>(["timeTrials", "road"]);
function wideSpans(keys: ProfileSectionKey[], oneColumn: boolean, full: Set<ProfileSectionKey>): [ProfileSectionKey, number][] {
  const out: [ProfileSectionKey, number][] = [];
  const wide = (k: ProfileSectionKey) => oneColumn || WIDE_TILES.has(k) || full.has(k);
  const q = [...keys];
  while (q.length) {
    const k = q.shift()!;
    if (wide(k)) { out.push([k, 12]); continue; }
    const ni = q.findIndex((x) => !wide(x));
    if (ni < 0) { out.push([k, 12]); continue; }
    const [n] = q.splice(ni, 1);
    out.push([k, 6], [n, 6]);
  }
  return out;
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
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
          <div className="profile-shell" style={{ padding: "calc(64px + var(--spacing-64)) 0 var(--spacing-64)", textAlign: "center" }}>
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
  // Only the platforms the page lists (an old key with a value used to show the heading with nothing under it).
  const hasGamertags =
    gamertagVisibility === "public" && GAMERTAG_PLATFORMS.some((p) => gamertags[p.key as keyof Gamertags]);

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

  // Profile skin (background + card styling) — guarded: column may be unapplied,
  // and the gate strips anything but allowlisted values / our own image origin.
  const { data: skinRow } = await supabase.from("users").select("profile_skin").eq("id", profile.id).maybeSingle();
  // Skins and custom CSS are GS Pro: shown while the owner has it (kept either way).
  // Skins and custom CSS are looks: GS Pro, or support sold with looks (Supporter looks, 2026-10-29).
  const [ownerPro, bannerGif] = await Promise.all([ownerHasLooks(profile.id), getBannerGif(profile.id)]);
  const skin = resolveProfileSkin(ownerPro ? (skinRow as { profile_skin?: unknown } | null)?.profile_skin : null);
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
  // One status line and one game (2026-10-09): the old tagline / featured game
  // stand in only while the new column has never been saved (NULL; "" = cleared).
  const statusCols = (statusRow ?? {}) as { profile_status?: string | null; profile_now_playing?: string | null };
  const profileStatus = statusCols.profile_status == null ? tagline : resolveProfileStatus(statusCols.profile_status);
  const nowPlaying = statusCols.profile_now_playing == null ? (featuredGame ? resolveNowPlaying(featuredGame) : null) : resolveNowPlaying(statusCols.profile_now_playing);
  const walkupAnthem = await getUserAnthem(profile.id as string).catch(() => null);
  const walkupTitle =
    walkupAnthem?.enabled && walkupAnthem.trackId
      ? (await getTrack(walkupAnthem.trackId).catch(() => null))?.title ?? null
      : null;

  // Custom CSS (Level 3) — re-sanitized on read even though only sanitized CSS
  // is ever stored (never trust the blob). Scoped to `.u-custom`.
  const { data: cssRow } = await supabase.from("users").select("profile_custom_css").eq("id", profile.id).maybeSingle();
  const customCss = ownerPro ? sanitizeCustomCss((cssRow as { profile_custom_css?: unknown } | null)?.profile_custom_css).css : "";

  // Stream schedule (guarded).
  const { data: schedRow } = await supabase.from("users").select("stream_schedule").eq("id", profile.id).maybeSingle();
  const streamSchedule = resolveStreamSchedule((schedRow as { stream_schedule?: unknown } | null)?.stream_schedule);

  const pageStyle: React.CSSProperties = {
    ...brandStyle,
    ...skinCssVars(skin),
    ...(accentColor
      ? (accentCssVars(perso?.profile_accent as string | null) as React.CSSProperties)
      : {}),
    ...(skinBg
      ? {
          background: skinBg,
          ...skinBackgroundLayout(skin),
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
  // This month for everyone; past months (?season=) while the profile owner has GS Pro.
  const thisSeason = currentSeasonKey();
  const seasonHistory = await ownerHasPro(profile.id as string);
  const season = isSeasonKey(sp.season) && seasonHistory && recentSeasonKeys().includes(sp.season) ? sp.season : thisSeason;
  const [enrichment, seasonData, rivals, mmr, road, ttBests] = await Promise.all([
    getProfileEnrichment(profile.id as string),
    userSeason(profile.id as string, season).catch(() => null),
    rivalsFor(profile.id as string).catch(() => []),
    profileMmr(profile.id as string).catch(() => null),
    roadShown() ? roadProgressView(profile.id as string).catch(() => null) : Promise.resolve(null),
    playerBests(`u:${profile.id as string}`).then((bs) => bs.filter((b) => b.items === "shrooms" && b.vehicle === "any")).catch(() => []),
  ]);
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

  // Favorite TCG card: spotlight one of the profile's showcased cards.
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
  const count = (n: number, one: string, many: string) => stats.push({ num: formatCompact(n), label: n === 1 ? one : many });
  // Token balance is intentionally NOT shown on the public profile — a wallet is
  // private to its owner (managed in the account), never public-facing.
  if (enrichment.communities.length) count(enrichment.communities.length, "community", "communities");
  if (enrichment.configCount) count(enrichment.configCount, "saved setup", "saved setups");
  if (tournamentTotal) count(tournamentTotal, "tournament", "tournaments");
  if (enrichment.triviaNights) count(enrichment.triviaNights, "trivia night", "trivia nights");

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

  // Supports GameShuffle (once in the last year, or monthly). Backers and Champions show their level.
  const levelName = enrichment.supportLevel === "champion" ? "Champion" : enrichment.supportLevel === "backer" ? "Backer" : "Supporter";
  const supporterLabel = enrichment.supporterSince
    ? `${levelName} since ${new Date(enrichment.supporterSince).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Los_Angeles" })}`
    : levelName;
  if (enrichment.supporter) badges.push({ key: "supporter", label: supporterLabel, href: "/support" });
  // One of the first 100 supporters keeps this for good, even after their support ends.
  if (enrichment.foundingSupporter) badges.push({ key: "founding-supporter", label: "Founding supporter", href: "/credits" });

  // GameShuffle team series (the GS Summer Series): champions, and everyone who played.
  for (const h of enrichment.seriesHonors ?? []) {
    badges.push({ key: `series:${h.path}`, label: h.champion ? `${h.title} champion` : h.title, href: h.path });
  }

  // Weekly Challenge: a top-10 week (the count shows once there's more than one).
  if (enrichment.weeklyTopTen) {
    badges.push({ key: "weekly", label: enrichment.weeklyTopTen > 1 ? `Weekly top 10 ×${enrichment.weeklyTopTen}` : "Weekly top 10", href: "/weekly" });
  }

  // Chat Brain: answered enough questions while the game was being built.
  if (enrichment.brainAnswers >= FOUNDING_BRAIN_ANSWERS) {
    badges.push({ key: "brain", label: "Founding Brain", href: "/chat-brain" });
  }

  // Owned Arcade cosmetics (badges) — the token-sink payoff, shown by the name.
  const cosmeticBadges = (await getInventory(profile.id as string).catch(() => []))
    .map((id) => ARCADE_ITEM_BY_ID[id])
    .filter((i) => i && i.kind === "badge");

  const displayName = (profile.display_name as string) || username;
  const memberSince = profile.created_at
    ? new Date(profile.created_at as string).toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : null;


  const featuredWidget = nowPlaying && (
    <div className="pcard profile-featured">
      <h2 className="pcard__title">Featured game</h2>
      <div className="profile-featured__body">
        <GameCover name={nowPlaying} className="profile-featured__art" />
        <span className="profile-featured__name">{nowPlaying}</span>
      </div>
    </div>
  );

  const featuredCardWidget = featuredCard && (
    <div className="pcard profile-featured">
      <h2 className="pcard__title">Favorite TCG card</h2>
      <div className="profile-featured-card">
        <CardImage images={featuredCard.images} name={featuredCard.name} size="medium" />
        <span className="profile-featured-card__name">{featuredCard.name}</span>
      </div>
    </div>
  );

  const favGamesWidget = favoriteGames.length > 0 && (
    <div className="pcard">
      <h2 className="pcard__title">Favorite games</h2>
      <ol className="game-shelf">
        {favoriteGames.map((g) => (
          <li key={g} className="game-shelf__item" title={g}>
            <GameCover name={g} />
            <span className="game-shelf__name">{g}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  // The dailies: a streak card per game they've played (Britton's pick, 2026-10-16), one column each (Britton,
  // 2026-11-05: three or four across, by what they play, with room to breathe). Four is the most: with all four
  // dailies and the Weekly, the Weekly becomes a line under them.
  const dl = enrichment.dailies;
  const dailyPlayed = dailiesShown().filter((id) => (id === "weekly" ? !!dl.weekly?.weeks?.played : !!dl[id]?.stats?.played));
  const dailyCols = dailyPlayed.length > 4 ? dailyPlayed.filter((id) => id !== "weekly") : dailyPlayed;
  const weeklyAside = dailyPlayed.length > 4 && dl.weekly?.weeks
    ? `Weekly Challenge: ${dl.weekly.weeks.played} ${dl.weekly.weeks.played === 1 ? "week" : "weeks"}${dl.weekly.weeks.topTen ? `, top 10 ${dl.weekly.weeks.topTen === 1 ? "once" : `${dl.weekly.weeks.topTen} times`}` : ""}`
    : null;
  const dailiesWidget = dailyPlayed.length ? (
    <div className="pcard" id="dailies" style={{ "--cols": dailyCols.length } as React.CSSProperties}>
      <h2 className="pcard__title">Dailies</h2>
      <DailiesCards entries={dl} shown={dailyCols} heading={null} />
      {weeklyAside && <p className="pf-aside"><Link href="/weekly">{weeklyAside}</Link></p>}
    </div>
  ) : null;

  // The MMR card's sticker, in the owner's own look (picks 2026-10-20), when they've set one up and show it.
  const mmrWidget = mmr ? (
    <div className="pcard profile-mmr" id="mmr">
      <h2 className="pcard__title">Lounge MMR</h2>
      <div className="mmr-frame"><MmrCard view={mmr.view} look={mmr.look} /></div>
      <MedalCredit className="profile-mmr__credit" />
    </div>
  ) : null;

  // Time trials (picks 2026-10-29): their best places, once they've added a time.
  const ttRecords = ttBests.filter((b) => b.place === 1).length;
  const timeTrialsWidget = ttBests.length ? (
    <div className="pcard profile-tt" id="time-trials">
      <h2 className="pcard__title"><Link href="/time-trials">Time trials</Link></h2>
      <p className="profile-tt__sum">{ttBests.length} {ttBests.length === 1 ? "track" : "tracks"}{ttRecords ? `, ${ttRecords} ${ttRecords === 1 ? "record" : "records"}` : ""}</p>
      <ul className="profile-tt__list">
        {ttBests.slice(0, 6).map((b) => {
          const t = ttTrack(b.game, b.track);
          if (!t) return null;
          return (
            <li key={`${b.game}-${b.track}-${b.cc}`}>
              <Link href={ttPath(t, b.cc)}>{t.name}</Link>
              <span className="profile-tt__meta">{TT_GAMES[b.game].short}{TT_GAMES[b.game].classes.length > 1 ? ` ${b.cc}cc` : ""}</span>
              <b>{ttFormat(b.timeMs)}</b>
              <span className="profile-tt__meta">{ttOrdinal(b.place)} of {b.total}</span>
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  // Trainer Road's trainer card (phase 2 picks, 2026-10-23), once they've earned anything on the road.
  const roadWidget = road ? (
    <div className="pcard pf-bare profile-road">
      <h2 className="pcard__title"><Link href="/pokemon-trainers">Trainer Road</Link></h2>
      <RoadTrainerCard p={road} regions={false} />
    </div>
  ) : null;

  const topFriendsWidget = topFriends.length > 0 && (
    <div className="pcard">
      <h2 className="pcard__title">Top Friends</h2>
      <div className="friend-grid friend-grid--compact">
        {topFriends.map((f) => <FriendTile key={f.id} friend={f} />)}
      </div>
    </div>
  );

  const crewsWidget = userCrews.length > 0 && (
    <div className="pcard">
      <h2 className="pcard__title">Represents</h2>
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
      <h2 className="pcard__title">Communities</h2>
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
    // The counts sit in the header as one line of words (no stat boxes): followers and following always, the rest
    // while the owner shows "Stats".
    stats: null,
    featured: featuredWidget,
    featuredCard: featuredCardWidget,
    crews: crewsWidget,
    favGames: favGamesWidget,
    dailies: dailiesWidget,
    mmr: mmrWidget,
    timeTrials: timeTrialsWidget,
    road: roadWidget,
    topFriends: topFriendsWidget,
    communities: communitiesWidget,
  };
  const vis = visibleSections(profileLayout);
  const showStats = vis.includes("stats");
  // Two columns (context + rooms picks 2026-11-05, 6A): who they are in a narrow one (the games they play, friends,
  // crews, communities, where to find them), what they do in a wide one (Highlights, playing with them, then tabs).
  // Each column keeps the owner's own order; stats sit in the counts line under the name.
  // Rank (Britton, 2026-11-06): their MMR card and standing sit in this column too, only when they have a card.
  const NARROW = new Set<ProfileSectionKey>(["featured", "favGames", "topFriends", "mmr", "crews", "communities"]);
  // The games they play are the records at the top now (step 4), not a cover grid here.
  const narrowKeys = vis.filter((k) => NARROW.has(k) && k !== "featured" && k !== "favGames");
  const narrowBy: Record<string, React.ReactNode> = { topFriends: topFriendsWidget, crews: crewsWidget, communities: communitiesWidget, mmr: null };
  // The player card (game spaces picks 6A, step 4): the dailies, the MMR card, time trials and the trainer card are facts
  // in the records now, not a tile each. The overview keeps what isn't about one game.
  const RECORDED = new Set<ProfileSectionKey>(["dailies", "mmr", "timeTrials", "road"]);
  const tileKeys = vis.filter((k) => k !== "stats" && !NARROW.has(k) && !RECORDED.has(k) && Boolean(widgetByKey[k]));
  const tileSpans = wideSpans(tileKeys, profileLayout.columns === 1, new Set<ProfileSectionKey>(dailyCols.length >= 3 ? ["dailies"] : []));
  const joinCards = await joinRow({
    userId: profile.id as string, name: displayName, username: profile.username as string,
    dailies: enrichment.dailies, organized: enrichment.organized, joined: enrichment.joined,
    streamer: enrichment.isStreamer, live: enrichment.isLive, banner: bannerUrl ?? bannerGif?.still ?? null,
  }).catch(() => []);

  // Highlights (7A): rings they pin, the automatic ones until they do.
  const dlStreaks = enrichment.dailies;
  const highlightOptions = highlightCandidates({
    records: ttBests.filter((b) => b.place === 1 && b.vehicle === "any").map((b) => ({ game: b.game, track: b.track, cc: b.cc })),
    streaks: { shuffle: dlStreaks.shuffle?.stats?.streak ?? 0, dex: dlStreaks.dex?.stats?.streak ?? 0, fire: dlStreaks.fire?.stats?.streak ?? 0, duel: dlStreaks.duel?.stats?.streak ?? 0 },
    division: mmr && vis.includes("mmr") ? { name: mmr.view.division, game: mmr.view.game } : null,
    road: road ? { regionsCleared: road.regionsCleared, badges: road.badges, champion: road.champion, firstRegion: road.regions.find((r) => r.cleared)?.name ?? null } : null,
  });
  const highlights = shownHighlights(highlightOptions, profileLayout.highlights);

  const activityPanel = (
    <div className="profile-activity">
      {pinnedPost && (
        <div className="profile-pinned">
          <span className="profile-pinned__label"><IconPin size={13} stroke={2} aria-hidden /> Pinned</span>
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

  // Where to find them (narrow column): links, socials, gamertags and board game tastes.
  const hasAbout = Boolean(hasBoardGames || socialLinks.length || hasGamertags || profileLinks.length);
  const aboutWidget = hasAbout && (
    <div className="pcard pf-about">
      <h2 className="pcard__title">About</h2>
      {profileLinks.length > 0 && (
        <div className="profile-links">
          {profileLinks.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="profile-link-btn">{l.label}</a>
          ))}
        </div>
      )}
      {socialLinks.length > 0 && (
        <div className="pf-about__part">
          <h3 className="pf-about__label">Find me on</h3>
          <div className="profile-socials">
            {socialLinks.map((p) => (
              <a key={p.key} href={socialHref(p.key, socials[p.key as keyof Socials] as string)} target="_blank" rel="noreferrer me" className="profile-social-link">
                <PlatformIcon platform={p.key} size={16} dim={false} decorative />
                {p.label}
              </a>
            ))}
          </div>
        </div>
      )}
      {hasGamertags && (
        <div className="pf-about__part">
          <h3 className="pf-about__label">Gamertags</h3>
          <div className="gamertag-list">
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
        </div>
      )}
      {hasBoardGames && (
        <div className="pf-about__part">
          <h3 className="pf-about__label">Board games</h3>
          <div className="bg-profile">
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
        </div>
      )}
    </div>
  );

  const hasActivity = Boolean(pinnedPost) || authorPosts.length > 0 || (configs && configs.length > 0);

  // The overview: their tiles in their order (two to a row, a wide one across), then a spotlight and a stream schedule.
  const overview = (tileKeys.length > 0 || spotlightUrl || streamSchedule) ? (
    <div className="pf-tiles">
      {tileSpans.map(([k, span]) => (
        <div key={k} className="pf-cell" data-span={span} style={{ "--span": span } as React.CSSProperties}>
          {widgetByKey[k]}
        </div>
      ))}
      {spotlightUrl && (
        <div className="pf-cell" style={{ "--span": 12 } as React.CSSProperties}>
          <div className="pcard profile-spotlight">
            <h2 className="pcard__title">Spotlight</h2>
            <div className="profile-spotlight__frame">
              <iframe src={spotlightUrl} title="Spotlight" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          </div>
        </div>
      )}
      {streamSchedule && (
        <div className="pf-cell" style={{ "--span": 12 } as React.CSSProperties}>
          <div className="pcard">
            <h2 className="pcard__title">Stream schedule</h2>
            <StreamScheduleCard schedule={streamSchedule} />
          </div>
        </div>
      )}
    </div>
  ) : null;

  // Tabs as the apps people know name them (6A): Overview, Posts, Events, Results; ids stay so old links still open.
  const tabs: ProfileTab[] = [];
  if (overview) tabs.push({ id: "overview", label: "Overview", content: overview });
  if (hasActivity) tabs.push({ id: "activity", label: "Posts", content: activityPanel });
  if (tournamentTotal > 0) tabs.push({ id: "tournaments", label: "Events", content: tournamentsPanel });
  if (seasonData && (season !== thisSeason || seasonData.points > 0 || rivals.length > 0 || seasonData.rosters.some((r) => r.won.length))) {
    tabs.push({ id: "season", label: "Results", content: (
      <>
        <SeasonPicker value={season} months={recentSeasonKeys()} allowPast={seasonHistory} ownerUpsell={viewer?.id === profile.id} extra={{ tab: "season" }} />
        <SeasonPanel seasonKey={season} season={seasonData} rivals={rivals} />
      </>
    ) });
  }
  if (enrichment.showcaseCards.length > 0) tabs.push({ id: "cards", label: "Cards", content: cardsPanel });

  const isOwner = !!viewer && viewer.id === profile.id;
  // The cover (8A): their banner, else the main game's art (what they're playing, then their games), else their colors;
  // never stock. Only a picture: the person sits on the page under it.
  const coverGame = bannerGif || bannerUrl ? null : [nowPlaying, ...favoriteGames].map((n) => (n ? catalogGame(n)?.slug : null)).find((slug) => !!wideArt(slug)) ?? null;
  const coverArt = coverGame ? wideArt(coverGame) : null;
  // MKCentral's medals are credited once on the page: under Plays when a record shows one, else under Highlights.
  const medalShown = highlights.some((h) => h.medal);
  const avatarUser = {
    id: profile.id as string,
    avatar_source: (profile.avatar_source as AvatarSource | null) ?? "dicebear",
    avatar_seed: (profile.avatar_seed as string | null) ?? null,
    avatar_options: (profile.avatar_options as Record<string, string> | null) ?? null,
    discord_avatar: profile.discord_avatar as string | null,
    twitch_avatar: profile.twitch_avatar as string | null,
  };

  // Plays: one record per game (step 4), from what the owner shows. A record links its game's space once it's open,
  // or for staff before then.
  const viewerStaff = viewer ? isStaffRole(((await createServiceClient().from("users").select("role").eq("id", viewer.id).maybeSingle()).data as { role: string | null } | null)?.role ?? null) : false;
  const today = gsDay();
  const bestByTrack = new Map<string, { game: string; place: number }>();
  for (const b of ttBests) {
    const k = `${b.game}:${b.track}`;
    const was = bestByTrack.get(k);
    if (!was || b.place < was.place) bestByTrack.set(k, { game: b.game, place: b.place });
  }
  const { records, also } = playRecords({
    username: profile.username as string,
    displayName,
    nowPlaying: vis.includes("featured") ? nowPlaying : null,
    favorites: vis.includes("favGames") ? favoriteGames : [],
    lounge: mmr && vis.includes("mmr") ? { name: mmr.view.name, game: mmr.view.game, mmr: mmr.view.mmr, division: mmr.view.division, medal: medalSrc(divisionLook(mmr.view.division).base) } : null,
    times: vis.includes("timeTrials") ? [...bestByTrack.values()] : [],
    crews: vis.includes("crews") ? userCrews.map((c) => ({ name: c.communityName, slug: c.communitySlug, game: c.game })) : [],
    road: road && vis.includes("road") ? { badges: road.badges, regionsCleared: road.regionsCleared, champion: road.champion } : null,
    dailies: vis.includes("dailies") ? dailyPlayed.filter((id) => id !== "weekly").map((id) => ({ name: DAILIES[id].short.replace(/^Daily /, ""), href: DAILIES[id].href, streak: dl[id]?.stats?.streak ?? 0, played: dl[id]?.stats?.played ?? 0 })) : [],
    weekly: vis.includes("dailies") ? dl.weekly?.weeks ?? null : null,
    spaceOpen: (key) => { const sp = spaceFor(key); return !!sp && (spaceOpen(sp, today) || viewerStaff); },
  });
  // Rank: the MMR card in their look, then what the card doesn't say. Only when they have a card to show.
  if (mmr && vis.includes("mmr")) {
    const v = mmr.view;
    const loungeSpace = spaceFor(v.game);
    // What's under the number is the owner's choice, from the studio's "On your profile" tab (picks 4A).
    const show = mmr.look.profile;
    const lines: RankLine[] = profileRows(v, show, seasonData && season === thisSeason ? { label: seasonData.rank.label, points: seasonData.points, href: "?tab=season" } : null);
    narrowBy.mmr = (
      <RankBlock
        id="pf-rank"
        mmr={{ view: v, look: mmr.look, last10: show.last10 }}
        lines={lines}
        links={[
          { href: `/lounge/${encodeURIComponent(v.name)}?game=${v.game}`, label: "Lounge page" },
          ...(loungeSpace && (spaceOpen(loungeSpace, today) || viewerStaff) ? [{ href: `/games/${loungeSpace.id}?tab=lounge`, label: `${displayName} in ${loungeSpace.name}` }] : []),
        ]}
      />
    );
  }
  const narrow = narrowKeys.filter((k) => Boolean(narrowBy[k]));
  const recordMedal = records.some((r) => r.facts.some((f) => f.medal));
  const hasTop = highlights.length > 0 || (isOwner && highlightOptions.length > 0) || joinCards.length > 0 || records.length > 0 || also.length > 0;

  return (
    <main className={`profile-page profile-front${customBg ? " profile-page--custom-bg gs-skinned" : ""}`} style={pageStyle}>
      {/* A visitor who signs up after this page is offered to follow this player (bring-along picks). */}
      <CameFrom userId={profile.id as string} />
      {customCss && (
        // Sanitized (scoped/allowlisted/url-restricted) CSS only — safe to inline.
        <style dangerouslySetInnerHTML={{ __html: customCss }} />
      )}
      {/* The custom CSS scope covers the header and the body, as it covered the old hero card and its tabs. */}
      <div className={customCss ? CUSTOM_CSS_SCOPE : undefined}>
        {/* Profiles, familiar but fresh (context + rooms picks 2026-11-05, 6A and 8A): a cover that's only a picture,
            the face on its edge, the name, bio, counts and badges on the page, then two columns. */}
        <header className={`pf-cover${bannerGif || bannerUrl ? " pf-cover--banner" : coverArt ? " pf-cover--game" : " pf-cover--colors"}`}>
          <div className="pf-cover__art" aria-hidden="true">
            {bannerGif ? (
              <ProfileGifBanner url={bannerGif.url} still={bannerGif.still} x={bannerGif.x} y={bannerGif.y} animate={ownerPro} />
            ) : bannerUrl ? (
              <div className="profile-banner" style={{ backgroundImage: `url(${bannerUrl})` }} />
            ) : coverArt ? (
              // eslint-disable-next-line @next/next/no-img-element -- the game's key art (ours or our CDN)
              <img className="pf-cover__img" src={coverArt} alt="" />
            ) : null}
          </div>
          {isOwner && (
            <OwnerBar
              note="Your profile"
              customize={<ProfileCustomizeEditor />}
              manageHref="/settings/profile?tab=page"
              manageLabel="Edit details"
              className="owner-bar--overlay"
            />
          )}
        </header>

        <section className="pf-id profile-hero" aria-labelledby="pf-name">
          <Container>
            <div className="pf-id__inner">
              <span className={`profile-hero__avatar pf-id__face${enrichment.supporter ? " profile-hero__avatar--supporter" : ""}`}>
                <UserAvatar user={avatarUser} size={136} alt={displayName} />
                <LivePresenceDot userId={profile.id as string} fallback={enrichment.isOnline} className="profile-online-dot" />
                {enrichment.supporter && <span className="profile-hero__heart" aria-hidden="true"><IconHeart size={14} stroke={2.5} /></span>}
              </span>
              <div className="profile-hero__meta pf-id__who">
                <h1 id="pf-name" className="profile-hero__name">
                  <span style={{ color: resolveNameColor(profile.equipped_name_color as string | null) ?? undefined }}>
                    {displayName}
                  </span>
                  {profile.email_verified && <VerifiedBadge />}
                  {cosmeticBadges.map((b) => (
                    <span key={b.id} title={b.name} role="img" aria-label={b.name} className="profile-hero__cosmetic">{b.icon ? <ArcadeBadgeIcon name={b.icon} size={20} /> : null}</span>
                  ))}
                </h1>
                <span className="profile-hero__handle">{[`@${profile.username}`, pronouns, location].filter(Boolean).join(" · ")}</span>
              </div>
              {/* After the name in the page (read in that order); beside the face on wide screens. */}
              <div className="profile-hero__actions pf-id__actions">
                {/* Edit is on the owner bar above; these are for people who are NOT you. */}
                {!isOwner && (
                  <>
                    <ProfileFollow
                      targetUserId={profile.id as string}
                      initialFollowing={followState.isFollowing}
                      initialMutual={followState.isMutual}
                      friendsLabel
                    />
                    <MessageButton targetUserId={profile.id as string} />
                  </>
                )}
                <ShareProfileButton username={profile.username as string} displayName={displayName} />
              </div>
              {profileStatus && <p className="profile-hero__status"><IconMessageCircle size={16} stroke={1.9} aria-hidden /> {profileStatus}</p>}
              {bio && <p className="profile-hero__bio">{bio}</p>}
              {(nowPlaying || walkupTitle) && (
                <div className="profile-hero__nowline">
                  {nowPlaying && <span className="profile-nowplaying"><IconDeviceGamepad2 size={16} stroke={1.9} aria-hidden /> Playing <strong>{nowPlaying}</strong></span>}
                  {walkupTitle && <span className="profile-walkup"><IconMusic size={16} stroke={1.9} aria-hidden /> {walkupTitle}</span>}
                </div>
              )}
              <p className="pf-counts">
                <FollowStats userId={profile.id as string} followers={followCounts.followers} following={followCounts.following} line />
                {showStats && stats.map((st) => <span key={st.label} className="pf-count pf-count--still"><b>{st.num}</b> {st.label}</span>)}
                {memberSince && <span className="pf-count pf-count--still">Joined {memberSince}</span>}
              </p>
              {badges.length > 0 && (
                <div className="profile-badges">
                  {badges.map((b) =>
                    // Your own Supporter badge shares your supporter card.
                    b.key === "supporter" && isOwner ? (
                      <SupporterBadge key={b.key} label={b.label} />
                    ) : b.href ? (
                      <a key={b.key} href={b.href} className={`profile-badge profile-badge--${b.key.split(":")[0]}`}>{b.label}</a>
                    ) : (
                      <span key={b.key} className={`profile-badge profile-badge--${b.key.split(":")[0]}`}>{b.label}</span>
                    ),
                  )}
                </div>
              )}
            </div>
          </Container>
        </section>

        <Container>
          <div className="profile-shell pf-body">
            <div className="pf-cols">
              {/* What they do, first in the page (so phones and keyboards reach it right after the name). */}
              {hasTop && <div className="pf-col pf-col--top">
                <ProfileHighlights items={highlights} options={highlightOptions} pinned={profileLayout.highlights} owner={isOwner} creditMedal={medalShown && !recordMedal} />
                <PlayRecords records={records} also={also} creditMedal={recordMedal} />
                {joinCards.length > 0 && (
                  <section className="pf-join" aria-labelledby="pf-join-title">
                    <h2 id="pf-join-title" className="pf-section-title">Play with {displayName}</h2>
                    <ul className={`band__row band__row--${joinCards.length}`}>
                      {joinCards.map((h, i) => <li key={h.id}><HappeningCard h={h} from="profile" k={i} /></li>)}
                    </ul>
                  </section>
                )}
              </div>}
              {/* Who they are: the narrow column, the room's people rail's twin. */}
              {(narrow.length > 0 || aboutWidget) && (
                <div className="pf-col pf-col--narrow">
                  {narrow.map((k) => <div key={k} className="pf-block">{narrowBy[k]}</div>)}
                  {aboutWidget && <div className="pf-block">{aboutWidget}</div>}
                </div>
              )}
              <div className="pf-col pf-col--main">
                {/* One section needs no tab bar: its name is its heading. */}
                {tabs.length > 1 ? (
                  <ProfileTabs tabs={tabs} />
                ) : tabs.length === 1 ? (
                  <section className="pf-one" aria-labelledby="pf-one-title">
                    <h2 id="pf-one-title" className="pf-section-title">{tabs[0].label}</h2>
                    {tabs[0].content}
                  </section>
                ) : null}
              </div>
            </div>

            <div className="profile-report">
              <BlockProfileButton targetUserId={profile.id as string} />
              <ReportProfileButton targetUserId={profile.id as string} />
            </div>
          </div>
        </Container>
      </div>
    </main>
  );
}
