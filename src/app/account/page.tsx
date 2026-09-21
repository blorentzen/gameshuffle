"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Combobox, Icon, Input, Select, Switch, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isEmailVerified } from "@/lib/auth-utils";
import { validateUsername } from "@/lib/username";
import { GAMERTAG_PLATFORMS, type Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, type Socials } from "@/data/socials-types";
import { PlansTab } from "@/components/account/PlansTab";
import { ThemeTab } from "@/components/account/ThemeTab";
import { ProfileLayoutEditor } from "@/components/account/ProfileLayoutEditor";
import { ProfileSkinEditor } from "@/components/account/ProfileSkinEditor";
import { ProfileLinksEditor } from "@/components/account/ProfileLinksEditor";
import { ProfileStatusEditor } from "@/components/account/ProfileStatusEditor";
import { ProfileCssEditor } from "@/components/account/ProfileCssEditor";
import { AnthemSettings } from "@/components/account/AnthemSettings";
import { BlockedUsersManager } from "@/components/account/BlockedUsersManager";
import { BannerUploader } from "@/components/account/BannerUploader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import { PROFILE_ACCENTS } from "@/lib/profile/accents";
import { BOARD_GAME_GENRE_SUGGESTIONS, BOARD_GAME_LEVELS, BOARD_GAME_LENGTHS } from "@/data/board-games";
import { TopFriendsEditor } from "@/components/account/TopFriendsEditor";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";
import { sectionForTab, hrefForTab, ACCOUNT_TAB_ALIAS } from "@/lib/account/nav";
import { SignInMethodsSection } from "@/components/account/SignInMethodsSection";
import { ConnectionsCard } from "@/components/account/ConnectionsCard";
import { AvatarSection } from "@/components/account/AvatarSection";
import { ThemeToggle } from "@/components/account/ThemeToggle";
import type { AvatarSource } from "@/components/UserAvatar";
import type { AvatarOptions } from "@/lib/avatar/dicebear";
import { allTimeZones, currentZoneLabel, isValidTimeZone } from "@/lib/time/format";
import { useToast } from "@/components/toast/ToastProvider";

interface ContextProfile {
  playerCount?: number;
  ageContext?: "family" | "21+";
  consolesOwned?: string[];
}

export default function AccountPage() {
  return <Suspense><AccountContent /></Suspense>;
}

function AccountContent() {
  const { user, signOut } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "profile";
  // The /account page only renders the Account-section tabs. A `?tab=` that
  // belongs to another section (Streamer / Platform Admin) — including legacy
  // deep-links and the Stripe / Twitch OAuth return URL (`tab=twitch-hub`
  // → Integrations, now a Streamer tab) — is redirected to the right section
  // route. `sectionForTab` resolves aliases + owning section.
  const section = sectionForTab(rawTab);
  const needsRedirect = !!section && section.route !== "/account";

  useEffect(() => {
    if (needsRedirect) router.replace(hrefForTab(rawTab));
  }, [needsRedirect, rawTab, router]);

  // Resolve legacy/renamed tab ids (e.g. the old combined "app" My Stuff tab →
  // "setups"). Fall back to Profile if the tab is unknown or belongs elsewhere
  // (while the redirect above resolves).
  const activeTab =
    section?.route === "/account"
      ? (ACCOUNT_TAB_ALIAS[rawTab] ?? rawTab)
      : "profile";

  // Deep-links to sibling Account tabs stay within this page.
  const selectTab = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [showRecapOnLivePage, setShowRecapOnLivePage] = useState(true);
  const [gamertagVisibility, setGamertagVisibility] = useState<string>("session_participants");
  const [gamertags, setGamertags] = useState<Gamertags>({});
  const [socials, setSocials] = useState<Socials>({});
  const [context, setContext] = useState<ContextProfile>({});
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("");
  const [favoriteGames, setFavoriteGames] = useState<string[]>([]);
  const [gameQuery, setGameQuery] = useState("");
  const [playsBoardGames, setPlaysBoardGames] = useState(false);
  const [boardGameGenres, setBoardGameGenres] = useState<string[]>([]);
  const [genreQuery, setGenreQuery] = useState("");
  const [boardGameLevel, setBoardGameLevel] = useState("");
  const [boardGameLengths, setBoardGameLengths] = useState<string[]>([]);
  const [avatarSource, setAvatarSource] = useState<AvatarSource>("dicebear");
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions | null>(null);
  const [discordAvatar, setDiscordAvatar] = useState<string | null>(null);
  const [twitchAvatar, setTwitchAvatar] = useState<string | null>(null);
  // Personalization (accents + featured content). persoAvailable gates the UI +
  // save so a not-yet-applied migration hides the section instead of erroring.
  const [profileTagline, setProfileTagline] = useState("");
  const [profileFeaturedGame, setProfileFeaturedGame] = useState("");
  const [profilePinnedPostId, setProfilePinnedPostId] = useState("");
  const [profileFeaturedCardId, setProfileFeaturedCardId] = useState("");
  const [profileAccent, setProfileAccent] = useState("");
  const [persoAvailable, setPersoAvailable] = useState(false);
  const [myPosts, setMyPosts] = useState<{ id: string; label: string }[]>([]);
  const [myCards, setMyCards] = useState<{ id: string; label: string }[]>([]);
  const toast = useToast();
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Saved configs, tournaments, companion saves + My Cards now live in the
  // My Stuff section (/account/stuff) — see SetupsTab / TournamentsTab /
  // StuffTabs. This page only handles Profile · Theme · Plans · Security.

  // Security state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const [hasTwitchConnection, setHasTwitchConnection] = useState(false);
  const [trialEligible, setTrialEligible] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auto-save (debounced). `hydratedRef` blocks a save on the initial load;
  // `savedUsernameRef` is the last successfully-stored handle so a bad handle
  // never blocks saving the rest of the profile; `autoStatus` drives the inline
  // "Saving… / Saved" indicator in place of a Save button.
  const hydratedRef = useRef(false);
  const savedUsernameRef = useRef("");
  const lastSavedRef = useRef<string | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoStatus, setAutoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!user) return;
    let active = true;

    const load = async () => {
      const [profileRes, twitchConnRes, activeSubRes] = await Promise.all([
        supabase.from("users").select("display_name, username, is_public, show_recap_on_live_page, gamertag_visibility, gamertags, socials, context_profile, bio, pronouns, location, timezone, favorite_games, plays_board_games, board_game_genres, board_game_level, board_game_lengths, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, role, has_used_trial").eq("id", user.id).single(),
        supabase.from("twitch_connections").select("id").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .in("status", ["trialing", "active", "past_due", "incomplete"])
          .maybeSingle(),
      ]);
      setHasTwitchConnection(!!twitchConnRes.data);
      const role = (profileRes.data?.role as string | null) ?? null;
      const hasUsedTrial = !!profileRes.data?.has_used_trial;
      const hasActiveSub = !!activeSubRes.data;
      const staffLike = role === "staff" || role === "admin";
      setTrialEligible(!staffLike && !hasUsedTrial && !hasActiveSub);

      if (profileRes.data) {
        setDisplayName(profileRes.data.display_name || "");
        setUsername(profileRes.data.username || "");
        savedUsernameRef.current = profileRes.data.username || "";
        setIsPublic(profileRes.data.is_public || false);
        // Default-on: column lands `true` for existing rows post-migration;
        // null-safe in case the column hasn't shipped to a dev DB yet.
        setShowRecapOnLivePage(
          (profileRes.data.show_recap_on_live_page as boolean | null) !== false,
        );
        setGamertagVisibility((profileRes.data.gamertag_visibility as string) || "session_participants");
        setAvatarSeed((profileRes.data.avatar_seed as string | null) ?? null);
        setAvatarOptions((profileRes.data.avatar_options as AvatarOptions | null) ?? null);
        setGamertags((profileRes.data.gamertags as Gamertags) || {});
        setSocials((profileRes.data.socials as Socials) || {});
        setContext((profileRes.data.context_profile as ContextProfile) || {});
        setBio((profileRes.data.bio as string | null) || "");
        setPronouns((profileRes.data.pronouns as string | null) || "");
        setLocation((profileRes.data.location as string | null) || "");
        setTimezone((profileRes.data.timezone as string | null) || "");
        setFavoriteGames((profileRes.data.favorite_games as string[] | null) || []);
        setPlaysBoardGames(!!profileRes.data.plays_board_games);
        setBoardGameGenres((profileRes.data.board_game_genres as string[] | null) || []);
        setBoardGameLevel((profileRes.data.board_game_level as string | null) || "");
        setBoardGameLengths((profileRes.data.board_game_lengths as string[] | null) || []);
        setAvatarSource((profileRes.data.avatar_source as AvatarSource) || "dicebear");
        setDiscordAvatar(profileRes.data.discord_avatar || null);
        setTwitchAvatar(profileRes.data.twitch_avatar || null);
      }

      // Personalization columns — guarded so an unapplied migration just hides
      // the section (no error). Plus the user's own posts for the pinned picker.
      const [persoRes, postsRes, cardsRes] = await Promise.all([
        supabase.from("users").select("profile_tagline, profile_pinned_post_id, profile_featured_game, profile_featured_card_id, profile_accent").eq("id", user.id).maybeSingle(),
        supabase.from("gs_posts").select("id, body, kind, created_at").eq("author_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(25),
        supabase.from("gs_user_cards").select("showcase_rank, card:tcg_cards(id, name)").eq("user_id", user.id).not("showcase_rank", "is", null).order("showcase_rank", { ascending: true }),
      ]);
      if (active && !persoRes.error && persoRes.data) {
        setPersoAvailable(true);
        setProfileTagline((persoRes.data.profile_tagline as string | null) || "");
        setProfileFeaturedGame((persoRes.data.profile_featured_game as string | null) || "");
        setProfilePinnedPostId((persoRes.data.profile_pinned_post_id as string | null) || "");
        setProfileFeaturedCardId((persoRes.data.profile_featured_card_id as string | null) || "");
        setProfileAccent((persoRes.data.profile_accent as string | null) || "");
      }
      if (active && postsRes.data) {
        setMyPosts((postsRes.data as Array<{ id: string; body: string | null; kind: string }>).map((p) => ({
          id: p.id,
          label: (p.body || "").trim().slice(0, 50) || (p.kind === "game_night" ? "Game night post" : p.kind === "share" ? "Shared post" : "Post"),
        })));
      }
      if (active && cardsRes.data) {
        setMyCards(
          (cardsRes.data as Array<{ card: { id: string; name: string } | { id: string; name: string }[] | null }>)
            .map((r) => (Array.isArray(r.card) ? r.card[0] : r.card))
            .filter((c): c is { id: string; name: string } => !!c)
            .map((c) => ({ id: c.id, label: c.name })),
        );
      }

      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Serialized fingerprint of the profile fields — drives change detection for
  // the debounced auto-save (skips no-op saves + the initial hydration).
  const profileSnapshot = () => JSON.stringify({
    displayName, username, isPublic, showRecapOnLivePage, gamertagVisibility,
    gamertags, socials, context, bio, pronouns, location, timezone,
    favoriteGames, playsBoardGames, boardGameGenres, boardGameLevel, boardGameLengths,
    profileTagline, profileFeaturedGame, profilePinnedPostId, profileFeaturedCardId, profileAccent,
  });

  const saveProfile = async () => {
    if (!user) return;
    setSaveError(null);
    setAutoStatus("saving");

    // Resolve the handle: unchanged → keep as-is (no check); changed → validate +
    // check availability. On failure we KEEP the last-saved handle so a bad edit
    // never blocks saving the rest of the profile (the field shows the error).
    const typed = username.trim().toLowerCase();
    let usernameToSave: string | null = savedUsernameRef.current || null;
    if (typed !== (savedUsernameRef.current || "")) {
      if (!typed) {
        usernameToSave = null;
        setUsernameError(null);
      } else {
        const check = validateUsername(typed);
        if (!check.ok) {
          setUsernameError(check.error);
          usernameToSave = savedUsernameRef.current || null;
        } else {
          let available = true;
          try {
            const res = await fetch(`/api/account/username?u=${encodeURIComponent(check.value)}`);
            const j = await res.json();
            available = !!j.available;
            if (!available) setUsernameError(j.error || "This username is already taken.");
          } catch { /* network — DB unique index is the backstop */ }
          usernameToSave = available ? check.value : (savedUsernameRef.current || null);
          if (available) setUsernameError(null);
        }
      }
    } else {
      setUsernameError(null);
    }

    // A public profile needs a username — it's the /u/[username] address and how
    // discovery/search finds it.
    if (isPublic && !usernameToSave) {
      setUsernameError("Choose a username before making your profile public.");
      setAutoStatus("error");
      return;
    }

    const update: Record<string, unknown> = {
      display_name: displayName, username: usernameToSave, is_public: isPublic, show_recap_on_live_page: showRecapOnLivePage, gamertag_visibility: gamertagVisibility, gamertags, socials, context_profile: context,
      bio: bio.trim().slice(0, 280) || null, pronouns: pronouns.trim().slice(0, 40) || null, location: location.trim().slice(0, 60) || null, timezone: timezone || null, favorite_games: favoriteGames.length ? favoriteGames.slice(0, 12) : null,
      plays_board_games: playsBoardGames,
      board_game_genres: playsBoardGames && boardGameGenres.length ? boardGameGenres.slice(0, 20) : null,
      board_game_level: playsBoardGames ? (boardGameLevel || null) : null,
      board_game_lengths: playsBoardGames && boardGameLengths.length ? boardGameLengths : null,
    };
    // Only write personalization columns when the migration is applied.
    if (persoAvailable) {
      update.profile_tagline = profileTagline.trim().slice(0, 80) || null;
      update.profile_featured_game = profileFeaturedGame || null;
      update.profile_pinned_post_id = profilePinnedPostId || null;
      update.profile_featured_card_id = profileFeaturedCardId || null;
      update.profile_accent = profileAccent || null;
    }
    const { error } = await supabase.from("users").update(update).eq("id", user.id);

    if (error) {
      if (error.message.includes("username")) setUsernameError("This username is already taken.");
      else {
        setSaveError(error.message);
        toast.error("Couldn't save your profile. Try again.");
        console.error("[saveProfile] update failed", error);
      }
      setAutoStatus("error");
      return;
    }

    savedUsernameRef.current = usernameToSave || "";
    if (usernameToSave !== null && usernameToSave !== username) setUsername(usernameToSave);
    lastSavedRef.current = profileSnapshot();
    window.dispatchEvent(new Event("profile-updated"));
    setAutoStatus("saved");
  };

  // Debounced auto-save: wait ~1.8s after the last edit, skip the initial
  // hydration and no-op changes.
  useEffect(() => {
    if (loading) return;
    if (!hydratedRef.current) { hydratedRef.current = true; lastSavedRef.current = profileSnapshot(); return; }
    if (profileSnapshot() === lastSavedRef.current) return;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => { void saveProfile(); }, 1800);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, displayName, username, isPublic, showRecapOnLivePage, gamertagVisibility, gamertags, socials, context, bio, pronouns, location, timezone, favoriteGames, playsBoardGames, boardGameGenres, boardGameLevel, boardGameLengths, profileTagline, profileFeaturedGame, profilePinnedPostId, profileFeaturedCardId, profileAccent]);

  if (!user || loading) {
    return <div className="account-card"><p>Loading...</p></div>;
  }

  // Profile handlers
  const handleResendVerification = async () => {
    await supabase.auth.resend({ type: "signup", email: user.email! });
    setResendCooldown(60);
  };

  // Security handlers
  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(newPassword)) { setPasswordError("Password must include an uppercase letter."); return; }
    if (!/[a-z]/.test(newPassword)) { setPasswordError("Password must include a lowercase letter."); return; }
    if (!/[0-9]/.test(newPassword)) { setPasswordError("Password must include a number."); return; }
    if (!/[^A-Za-z0-9]/.test(newPassword)) { setPasswordError("Password must include a special character."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordError(error.message); } else { setPasswordSuccess(true); setNewPassword(""); setConfirmPassword(""); }
    setChangingPassword(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason || null }),
      });
      if (!res.ok) { const data = await res.json(); setDeleteError(data.error || "Failed to delete account."); setDeleting(false); return; }
      await signOut();
    } catch { setDeleteError("Something went wrong. Please try again."); setDeleting(false); }
  };

  // Integrations tab is always visible — Coming Soon cards for non-linked
  // platforms, functional cards for connected ones. We still track the
  // hasTwitchConnection state for existing downstream consumers.
  void hasTwitchConnection;

  return (
    <>
      <TrialOfferBanner
        isEligible={trialEligible}
        onLearnMore={() => selectTab("plans")}
      />

        {/* ═══════════ PROFILE TAB ═══════════ */}
        {activeTab === "profile" && (
          <>
            <div className="account-card">
              <h2>Profile</h2>

              {/* Avatar Picker — DiceBear default + conditional Twitch/Discord */}
              <AvatarSection
                userId={user.id}
                initialSource={avatarSource}
                initialSeed={avatarSeed}
                initialOptions={avatarOptions}
                twitchAvatar={twitchAvatar}
                discordAvatar={discordAvatar}
                onSaved={({ source, seed, options }) => {
                  setAvatarSource(source);
                  setAvatarSeed(seed);
                  setAvatarOptions(options);
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Display Name</label>
                  <Input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" />
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-4)", display: "block" }}>Public: shown on your profile, live pages, and tournaments.</span>
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Username</label>
                  <Input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="your-username" error={!!usernameError} />
                  {usernameError && <span style={{ color: "var(--error-700)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-4)", display: "block" }}>{usernameError}</span>}
                  {username && !usernameError && <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-4)", display: "block" }}>gameshuffle.co/u/{username}</span>}
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Email</label>
                  <Input type="email" value={user.email || ""} disabled />
                  {isEmailVerified(user) ? (
                    <span
                      style={{
                        color: "var(--success-700)",
                        fontSize: "var(--font-size-12)",
                        fontWeight: "var(--font-weight-semibold)",
                        marginTop: "var(--spacing-4)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--spacing-4)",
                      }}
                    >
                      <Icon name="circle-check" size="16" />
                      Verified
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--spacing-8)",
                        marginTop: "var(--spacing-4)",
                        fontSize: "var(--font-size-12)",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--warning-700)",
                          fontWeight: "var(--font-weight-semibold)",
                        }}
                      >
                        Unverified
                      </span>
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendCooldown > 0}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--primary-600)",
                          textDecoration: "underline",
                          cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                          fontSize: "inherit",
                          fontFamily: "inherit",
                          opacity: resendCooldown > 0 ? 0.5 : 1,
                        }}
                      >
                        {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend email"}
                      </button>
                    </span>
                  )}
                </div>
                <ThemeToggle />
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-16)" }}>
                  <Switch
                    checked={isPublic}
                    onChange={() => {
                      // Can't go public without a handle — it's the profile URL.
                      if (!isPublic && !username.trim()) {
                        setUsernameError("Choose a username before making your profile public.");
                        return;
                      }
                      setIsPublic(!isPublic);
                    }}
                  />
                  <div>
                    <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>Public Profile</span>
                    <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", margin: 0 }}>Allow others to see your profile, gamertags, and shared configs. Requires a username.</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-16)" }}>
                  <Switch
                    checked={showRecapOnLivePage}
                    onChange={() => setShowRecapOnLivePage(!showRecapOnLivePage)}
                  />
                  <div>
                    <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>
                      Show last-stream recap on my live page
                    </span>
                    <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", margin: 0 }}>
                      When you&rsquo;re offline, /live/your-slug shows a &ldquo;This happened
                      last time&rdquo; recap of your most recent stream. Turn off to keep the
                      offline state minimal.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connections — single source of truth for Discord / Twitch / YouTube */}
            <ConnectionsCard />

            <div className="account-card">
              <h2>About you</h2>
              <p style={{ marginBottom: "var(--spacing-24)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                These appear on your public profile.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)", maxWidth: 450 }}>
                <BannerUploader />
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Bio</label>
                  <Textarea
                    fullWidth
                    rows={3}
                    maxLength={280}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell people a little about you…"
                  />
                  <p style={{ marginTop: "var(--spacing-4)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{bio.length}/280</p>
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Pronouns</label>
                  <Input type="text" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="they/them" />
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Region / location</label>
                  <Input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Pacific NW, UK" />
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Timezone</label>
                  <select className="save-setup-input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option value="">Use default (Pacific / Eastern)</option>
                    {allTimeZones().map((tz) => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, " ")}{isValidTimeZone(tz) ? ` (${currentZoneLabel(tz)})` : ""}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                    We auto-detect this on sign-in. Set it so tournament times show in your zone. Left as default, you&apos;ll see Pacific &amp; Eastern.
                  </p>
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Favorite games</label>
                  <div className="game-select">
                    <Combobox
                      value={gameQuery}
                      onChange={(v) => {
                        const match = FAVORITE_GAME_CATALOG.find((g) => g.name === v);
                        if (match && !favoriteGames.includes(v)) {
                          setFavoriteGames([...favoriteGames, v]);
                          setGameQuery("");
                        } else {
                          setGameQuery(v);
                        }
                      }}
                      options={FAVORITE_GAME_CATALOG.filter(
                        (g) => !favoriteGames.includes(g.name),
                      ).map((g) => ({ value: g.name, label: g.name }))}
                      placeholder="Search games to add…"
                      size="medium"
                    />
                    {favoriteGames.length > 0 && (
                      <div className="game-chips">
                        {favoriteGames.map((name) => {
                          const g = FAVORITE_GAME_CATALOG.find((x) => x.name === name);
                          return (
                            <span key={name} className="game-chip">
                              {g?.image ? (
                                <img src={g.image} alt="" className="game-chip__art" />
                              ) : null}
                              <span>{name}</span>
                              <button
                                type="button"
                                className="game-chip__remove"
                                aria-label={`Remove ${name}`}
                                onClick={() =>
                                  setFavoriteGames(favoriteGames.filter((x) => x !== name))
                                }
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Search and add the games you play. They show with art on your profile.</p>
                </div>
              </div>
            </div>

            {persoAvailable && (
              <div className="account-card" id="personalize">
                <h2>Personalize your profile</h2>
                <p style={{ marginBottom: "var(--spacing-20)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                  Accents and featured content shown on your public profile at gameshuffle.co/u/{username || "you"}. Changes save automatically.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Tagline / status</label>
                    <Input value={profileTagline} onChange={(e) => setProfileTagline(e.target.value)} placeholder="e.g. Grinding MK8DX 200cc" maxLength={80} />
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Featured game</label>
                    <Select
                      options={[{ value: "", label: "None" }, ...FAVORITE_GAME_CATALOG.map((g) => ({ value: g.name, label: g.name }))]}
                      value={profileFeaturedGame}
                      onChange={(v) => setProfileFeaturedGame(v as string)}
                      fullWidth
                    />
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Pinned post</label>
                    <Select
                      options={[{ value: "", label: myPosts.length ? "None" : "No posts yet" }, ...myPosts.map((p) => ({ value: p.id, label: p.label }))]}
                      value={profilePinnedPostId}
                      onChange={(v) => setProfilePinnedPostId(v as string)}
                      fullWidth
                    />
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Featured card</label>
                    <Select
                      options={[{ value: "", label: myCards.length ? "None" : "Showcase cards in My Cards first" }, ...myCards.map((c) => ({ value: c.id, label: c.label }))]}
                      value={profileFeaturedCardId}
                      onChange={(v) => setProfileFeaturedCardId(v as string)}
                      fullWidth
                    />
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Accent color</label>
                    <Select
                      options={[{ value: "", label: "Default (brand)" }, ...PROFILE_ACCENTS.map((a) => ({ value: a.key, label: a.label }))]}
                      value={profileAccent}
                      onChange={(v) => setProfileAccent(v as string)}
                      fullWidth
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="account-card" id="board-games">
              <h2>Board games</h2>
              <p style={{ marginBottom: "var(--spacing-20)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                Tell other players what you like to play, so the right people find your game
                nights. This shows on your public profile.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", cursor: "pointer" }}>
                <Switch checked={playsBoardGames} onChange={() => setPlaysBoardGames(!playsBoardGames)} />
                <span>I play board games</span>
              </label>

              {playsBoardGames && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-24)", marginTop: "var(--spacing-24)" }}>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Genres you enjoy</label>
                    <div className="game-select">
                      <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <Combobox
                            value={genreQuery}
                            onChange={(v) => {
                              if (BOARD_GAME_GENRE_SUGGESTIONS.includes(v) && !boardGameGenres.includes(v)) {
                                setBoardGameGenres([...boardGameGenres, v]);
                                setGenreQuery("");
                              } else {
                                setGenreQuery(v);
                              }
                            }}
                            options={BOARD_GAME_GENRE_SUGGESTIONS.filter((g) => !boardGameGenres.includes(g)).map((g) => ({ value: g, label: g }))}
                            placeholder="Add a genre — or type your own…"
                            size="medium"
                          />
                        </div>
                        <Button
                          variant="secondary"
                          size="medium"
                          onClick={() => {
                            const t = genreQuery.trim();
                            if (t && !boardGameGenres.includes(t)) {
                              setBoardGameGenres([...boardGameGenres, t]);
                              setGenreQuery("");
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                      {boardGameGenres.length > 0 && (
                        <div className="game-chips">
                          {boardGameGenres.map((name) => (
                            <span key={name} className="game-chip">
                              <span>{name}</span>
                              <button
                                type="button"
                                className="game-chip__remove"
                                aria-label={`Remove ${name}`}
                                onClick={() => setBoardGameGenres(boardGameGenres.filter((x) => x !== name))}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                      Pick from suggestions or type your own. No limits on what you play.
                    </p>
                  </div>

                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Your comfort level</label>
                    <Select
                      value={boardGameLevel}
                      onChange={(value) => setBoardGameLevel(typeof value === "string" ? value : value[0] ?? "")}
                      options={[{ value: "", label: "Prefer not to say" }, ...BOARD_GAME_LEVELS.map((l) => ({ value: l.value, label: l.label }))]}
                    />
                  </div>

                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Preferred game length</label>
                    <div className="bg-toggle-row">
                      {BOARD_GAME_LENGTHS.map((l) => {
                        const on = boardGameLengths.includes(l.value);
                        return (
                          <button
                            type="button"
                            key={l.value}
                            className={on ? "bg-toggle bg-toggle--on" : "bg-toggle"}
                            aria-pressed={on}
                            onClick={() =>
                              setBoardGameLengths(on ? boardGameLengths.filter((x) => x !== l.value) : [...boardGameLengths, l.value])
                            }
                          >
                            {l.label}
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                      Pick any that fit — a quick filler, a long epic, or both.
                    </p>
                  </div>
                </div>
              )}
              <p style={{ marginTop: "var(--spacing-20)", fontSize: "var(--font-size-14)" }}>
                <Link href="/board-game-nights" style={{ color: "var(--primary-600)" }}>Find or host board-game nights →</Link>
              </p>
            </div>

            <div className="account-card">
              <h2>Gamertags</h2>
              <p style={{ marginBottom: "var(--spacing-24)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                Add the handles you use on consoles and PC storefronts so friends can find you.
                Discord and Twitch handles come from your{" "}
                <a
                  href="#connections"
                  onClick={(e) => {
                    e.preventDefault();
                    document.querySelector(".account-card h2")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}
                >
                  linked Connections
                </a>
                {" "}automatically.
              </p>

              <div style={{ marginBottom: "var(--spacing-24)", maxWidth: 450 }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>
                  Who can see your gamertags?
                </label>
                <Select
                  fullWidth
                  value={gamertagVisibility}
                  onChange={(value) => setGamertagVisibility(typeof value === "string" ? value : value[0] ?? "")}
                  options={[
                    { value: "public", label: "Public: visible on my profile page and to everyone in shared sessions" },
                    { value: "session_participants", label: "Session participants only: visible to others in the same session" },
                    { value: "streamer_only", label: "Streamer only: visible just to the host of a session I join" },
                    { value: "private", label: "Private: never shared" },
                  ]}
                />
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "var(--spacing-6)" }}>
                  Controls how your gamertags surface in sessions, on your public profile, and via shared lobbies.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)", maxWidth: 450 }}>
                {GAMERTAG_PLATFORMS.map((platform) => (
                  <div key={platform.key}>
                    <label className="account-card__label" style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-8)" }}>
                      <PlatformIcon platform={platform.key} />
                      {platform.label}
                    </label>
                    <Input
                      type="text"
                      value={gamertags[platform.key as keyof Gamertags] || ""}
                      onChange={(e) => setGamertags({ ...gamertags, [platform.key]: e.target.value || undefined })}
                      placeholder={platform.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="account-card">
              <h2>Socials</h2>
              <p style={{ marginBottom: "var(--spacing-24)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                Add your content-platform handles. These become available as
                template variables (<code>$youtube</code>, <code>$twitter</code>, etc.) in your{" "}
                <a
                  href="/twitch/commands"
                  style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}
                >
                  custom chat commands
                </a>
                {" "}so you only enter them once.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)", maxWidth: 450 }}>
                {SOCIAL_PLATFORMS.map((platform) => (
                  <div key={platform.key}>
                    <label className="account-card__label" style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-8)" }}>
                      <PlatformIcon platform={platform.key} />
                      {platform.label}
                    </label>
                    <Input
                      type="text"
                      value={socials[platform.key as keyof Socials] || ""}
                      onChange={(e) =>
                        setSocials({
                          ...socials,
                          [platform.key]: e.target.value || undefined,
                        })
                      }
                      placeholder={platform.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "var(--spacing-24)", display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
              <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
                <Icon name={autoStatus === "saving" ? "loader" : autoStatus === "error" ? "alert-triangle" : "check"} size="16" />
                <span>
                  {autoStatus === "saving" ? "Saving changes…"
                    : autoStatus === "error" ? "Couldn't save — check the highlighted fields"
                    : autoStatus === "saved" ? "All changes saved"
                    : "Changes save automatically"}
                </span>
              </div>
              {saveError && (
                <Alert variant="error" onClose={() => setSaveError(null)}>
                  Couldn&apos;t save: {saveError}
                </Alert>
              )}
            </div>

            <TopFriendsEditor />
          </>
        )}

        {/* ═══════════ SECURITY TAB ═══════════ */}
        {activeTab === "security" && (
          <>
            <SignInMethodsSection />

            <div className="account-card">
              <h2>Change Password</h2>
              {passwordError && (
                <div style={{ marginBottom: "var(--spacing-16)" }}>
                  <Alert variant="error" onClose={() => setPasswordError(null)}>{passwordError}</Alert>
                </div>
              )}
              {passwordSuccess && (
                <div style={{ marginBottom: "var(--spacing-16)" }}>
                  <Alert variant="success" onClose={() => setPasswordSuccess(false)}>Password updated successfully.</Alert>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)", maxWidth: 400 }}>
                <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "calc(var(--spacing-8) * -1)" }}>Min 8 characters, with uppercase, lowercase, number, and special character.</p>
                <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <Button variant="primary" onClick={handleChangePassword} disabled={changingPassword}>{changingPassword ? "Updating..." : "Update Password"}</Button>
              </div>
            </div>


            <BlockedUsersManager />

            <div className="account-card">
              <h2>Privacy</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-16)" }}>
                Submit a privacy request to access, correct, or delete your data, or to opt out of marketing. We&apos;ll respond within 30 days.
              </p>
              <Button variant="secondary" onClick={() => { window.location.href = "/account/privacy/data-request"; }}>
                Submit a Privacy Request
              </Button>
            </div>

            <div className="account-card">
              <h2 style={{ color: "var(--error-700)" }}>Delete Account</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-16)" }}>Permanently delete your account and all associated data. This action cannot be undone.</p>
              {!showDeleteConfirm ? (
                <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
              ) : (
                <div style={{ padding: "var(--spacing-20)", background: "var(--surface-error)", borderRadius: "var(--radius-8)", border: "1px solid var(--error-200)" }}>
                  <p style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--error-700)", marginBottom: "var(--spacing-12)" }}>This will permanently delete your account, saved configs, tournament history, and all associated data.</p>
                  {deleteError && (
                    <div style={{ marginBottom: "var(--spacing-12)" }}>
                      <Alert variant="error" onClose={() => setDeleteError(null)}>{deleteError}</Alert>
                    </div>
                  )}
                  <div style={{ marginBottom: "var(--spacing-12)" }}>
                    <label style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "var(--spacing-6)" }}>Mind sharing why? (optional)</label>
                    <select
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      style={{ maxWidth: 320, width: "100%", height: 36, borderRadius: "var(--radius-8)", border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
                    >
                      <option value="">Prefer not to say</option>
                      <option value="not_using">Not using it enough</option>
                      <option value="missing_features">Missing features I need</option>
                      <option value="too_expensive">Too expensive</option>
                      <option value="found_alternative">Found an alternative</option>
                      <option value="just_testing">Was just testing</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: "var(--spacing-12)" }}>
                    <label style={{ fontSize: "var(--font-size-12)", color: "var(--error-700)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "var(--spacing-6)" }}>Type DELETE to confirm</label>
                    <Input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder="DELETE" style={{ maxWidth: 200 }} />
                  </div>
                  <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                    <Button variant="danger" onClick={handleDeleteAccount} disabled={deleteInput !== "DELETE" || deleting}>{deleting ? "Deleting..." : "Permanently Delete"}</Button>
                    <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); setDeleteError(null); setDeleteReason(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════ THEME TAB ═══════════ */}
        {activeTab === "theme" && (
          <>
            <ThemeTab />
            <ProfileStatusEditor />
            <ProfileSkinEditor />
            <ProfileLinksEditor />
            <ProfileLayoutEditor />
            <ProfileCssEditor />
            <AnthemSettings />
          </>
        )}

        {/* ═══════════ PLANS TAB ═══════════ */}
        {activeTab === "plans" && <PlansTab />}
    </>
  );
}
