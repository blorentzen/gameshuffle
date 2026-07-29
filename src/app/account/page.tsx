"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Combobox, Icon, Input, Select, Switch, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isEmailVerified } from "@/lib/auth-utils";
import { GAMERTAG_PLATFORMS, type Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, type Socials } from "@/data/socials-types";
import { PlansTab } from "@/components/account/PlansTab";
import { ThemeTab } from "@/components/account/ThemeTab";
import { AnthemSettings } from "@/components/account/AnthemSettings";
import { BlockedUsersManager } from "@/components/account/BlockedUsersManager";
import { BannerUploader } from "@/components/account/BannerUploader";
import { PlatformIcon } from "@/components/PlatformIcon";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import { TopFriendsEditor } from "@/components/account/TopFriendsEditor";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";
import { sectionForTab, hrefForTab, ACCOUNT_TAB_ALIAS } from "@/lib/account/nav";
import { SignInMethodsSection } from "@/components/account/SignInMethodsSection";
import { ConnectionsCard } from "@/components/account/ConnectionsCard";
import { AvatarSection } from "@/components/account/AvatarSection";
import { ThemeToggle } from "@/components/account/ThemeToggle";
import type { AvatarSource } from "@/components/UserAvatar";
import type { AvatarOptions } from "@/lib/avatar/dicebear";

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
  const [favoriteGames, setFavoriteGames] = useState<string[]>([]);
  const [gameQuery, setGameQuery] = useState("");
  const [avatarSource, setAvatarSource] = useState<AvatarSource>("dicebear");
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions | null>(null);
  const [discordAvatar, setDiscordAvatar] = useState<string | null>(null);
  const [twitchAvatar, setTwitchAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

  const [hasTwitchConnection, setHasTwitchConnection] = useState(false);
  const [trialEligible, setTrialEligible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const [profileRes, twitchConnRes, activeSubRes] = await Promise.all([
        supabase.from("users").select("display_name, username, is_public, show_recap_on_live_page, gamertag_visibility, gamertags, socials, context_profile, bio, pronouns, location, favorite_games, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, role, has_used_trial").eq("id", user.id).single(),
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
        setFavoriteGames((profileRes.data.favorite_games as string[] | null) || []);
        setAvatarSource((profileRes.data.avatar_source as AvatarSource) || "dicebear");
        setDiscordAvatar(profileRes.data.discord_avatar || null);
        setTwitchAvatar(profileRes.data.twitch_avatar || null);
      }

      setLoading(false);
    };

    load();
  }, [user]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!user || loading) {
    return <div className="account-card"><p>Loading...</p></div>;
  }

  // Profile handlers
  const handleSaveProfile = async () => {
    setSaving(true);
    setSaved(false);
    setUsernameError(null);
    setSaveError(null);

    if (username) {
      const clean = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (clean !== username) { setUsernameError("Username can only contain lowercase letters, numbers, hyphens, and underscores."); setSaving(false); return; }
      if (clean.length < 3) { setUsernameError("Username must be at least 3 characters."); setSaving(false); return; }
    }

    const { error } = await supabase.from("users").update({
      display_name: displayName, username: username || null, is_public: isPublic, show_recap_on_live_page: showRecapOnLivePage, gamertag_visibility: gamertagVisibility, gamertags, socials, context_profile: context,
      bio: bio.trim().slice(0, 280) || null, pronouns: pronouns.trim().slice(0, 40) || null, location: location.trim().slice(0, 60) || null, favorite_games: favoriteGames.length ? favoriteGames.slice(0, 12) : null,
    }).eq("id", user.id);

    if (error) {
      if (error.message.includes("username")) {
        setUsernameError("This username is already taken.");
      } else {
        // Any other error — surface it so the user can see what's wrong
        // rather than the save silently failing. Common culprit when a
        // migration hasn't been applied yet: "column X does not exist".
        setSaveError(error.message);
        console.error("[handleSaveProfile] update failed", error);
      }
      setSaving(false);
      return;
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    // Notify navbar to refresh avatar
    window.dispatchEvent(new Event("profile-updated"));
  };

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
      const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" } });
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
                  <Switch checked={isPublic} onChange={() => setIsPublic(!isPublic)} />
                  <div>
                    <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>Public Profile</span>
                    <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", margin: 0 }}>Allow others to see your profile, gamertags, and shared configs</p>
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

            {/* Connections — single source of truth for Discord / Twitch / future OAuth */}
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
                  <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Search and add the games you play — they show with art on your profile.</p>
                </div>
              </div>
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
                    { value: "public", label: "Public — visible on my profile page and to everyone in shared sessions" },
                    { value: "session_participants", label: "Session participants only — visible to others in the same session" },
                    { value: "streamer_only", label: "Streamer only — visible just to the host of a session I join" },
                    { value: "private", label: "Private — never shared" },
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
              <div style={{ display: "flex", gap: "var(--spacing-16)", alignItems: "center" }}>
                <Button variant="primary" onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
                {saved && <span style={{ color: "var(--success-700)", fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>Saved!</span>}
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
                    <label style={{ fontSize: "var(--font-size-12)", color: "var(--error-700)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "var(--spacing-6)" }}>Type DELETE to confirm</label>
                    <Input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder="DELETE" style={{ maxWidth: 200 }} />
                  </div>
                  <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                    <Button variant="danger" onClick={handleDeleteAccount} disabled={deleteInput !== "DELETE" || deleting}>{deleting ? "Deleting..." : "Permanently Delete"}</Button>
                    <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); setDeleteError(null); }}>Cancel</Button>
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
            <AnthemSettings />
          </>
        )}

        {/* ═══════════ PLANS TAB ═══════════ */}
        {activeTab === "plans" && <PlansTab />}
    </>
  );
}
