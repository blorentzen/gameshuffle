"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Icon, Input, Select, Switch } from "@empac/cascadeds";
import { AccountSidebar } from "@/components/account/AccountSidebar";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isEmailVerified } from "@/lib/auth-utils";
import { GAMERTAG_PLATFORMS, type Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, type Socials } from "@/data/socials-types";
import { deleteConfig } from "@/lib/configs";
import { CONFIG_TYPE_LABELS, type ConfigType } from "@/data/config-types";
import { SetupCard } from "@/components/account/SetupCard";
import { deleteCompanionSaveAction } from "@/app/tcg-companion/save/actions";
import {
  defaultSaveName,
  type CompanionSavedState,
} from "@/lib/companion/saveStates";
import { formatByKey } from "@/lib/companion/gameSettings";
import { IntegrationsTab } from "@/components/account/IntegrationsTab";
import { ModsTab } from "@/components/account/ModsTab";
import { PlansTab } from "@/components/account/PlansTab";
import { GameModulesTab } from "@/components/account/GameModulesTab";
import { WheelsTab } from "@/components/account/WheelsTab";
import { ChatCommandsTab } from "@/components/account/ChatCommandsTab";
import { CommunityTab } from "@/components/account/CommunityTab";
import { ThemeTab } from "@/components/account/ThemeTab";
import { PlatformEventsTab } from "@/components/account/PlatformEventsTab";
import { PlatformVariablesTab } from "@/components/account/PlatformVariablesTab";
import { PlatformDefaultCommandsTab } from "@/components/account/PlatformDefaultCommandsTab";
import { PlatformComplianceTab } from "@/components/account/PlatformComplianceTab";
import { PlatformEngagementTab } from "@/components/account/PlatformEngagementTab";
import { PlatformEconomyTab } from "@/components/account/PlatformEconomyTab";
import { PlatformEconomySnapshotTab } from "@/components/account/PlatformEconomySnapshotTab";
import { PlatformHealthTab } from "@/components/account/PlatformHealthTab";
import { PlatformStaffTab } from "@/components/account/PlatformStaffTab";
import { EngagementTab } from "@/components/account/EngagementTab";
import { isStaffRole } from "@/lib/subscription";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";
import { SignInMethodsSection } from "@/components/account/SignInMethodsSection";
import { ConnectionsCard } from "@/components/account/ConnectionsCard";
import { AvatarSection } from "@/components/account/AvatarSection";
import { ThemeToggle } from "@/components/account/ThemeToggle";
import type { AvatarSource } from "@/components/UserAvatar";
import type { AvatarOptions } from "@/lib/avatar/dicebear";
import { getGameName } from "@/data/game-registry";

interface ContextProfile {
  playerCount?: number;
  ageContext?: "family" | "21+";
  consolesOwned?: string[];
}

interface SavedConfig {
  id: string;
  randomizer_slug: string;
  config_name: string;
  config_data: Record<string, any>;
  share_token: string | null;
  is_public: boolean;
  created_at: string;
}

interface TournamentEntry {
  id: string;
  title: string;
  game_slug: string;
  mode: string;
  status: string;
  date_time: string | null;
  role: "organizer" | "participant";
  participant_status?: string;
}

const CONSOLE_OPTIONS = [
  "Nintendo Switch", "PS5", "Xbox Series X/S", "PC", "Retro / Emulator",
];

const PLATFORM_ICONS: Record<string, string> = {
  discord: "/images/icons/discord.svg",
  twitch: "/images/icons/twitch.svg",
  psn: "/images/icons/playstation.svg",
  nso: "/images/icons/nintendo-switch.svg",
  xbox: "/images/icons/xbox.svg",
  steam: "/images/icons/steam.svg",
  epic: "/images/icons/epic.svg",
  // Socials — separate concept from gamertags but share the icon
  // pattern. Keys match SOCIAL_PLATFORMS.key in src/data/socials-types.ts.
  youtube: "/images/icons/youtube.svg",
  twitter: "/images/icons/twitter.svg",
  tiktok: "/images/icons/tiktok.svg",
  instagram: "/images/icons/instagram.svg",
  bluesky: "/images/icons/bluesky.svg",
  threads: "/images/icons/threads.svg",
};

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const src = PLATFORM_ICONS[platform];
  if (src) {
    return <img src={src} alt={platform} className="gs-platform-icon" style={{ width: size, height: size, flexShrink: 0, opacity: 0.6 }} />;
  }
  return <Icon name="link" size="16" />;
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
  // Legacy alias: /account?tab=twitch-hub still redirects here from the
  // Stripe / Twitch OAuth return URLs. Map it to the new Integrations tab.
  const initialTab = rawTab === "twitch-hub" ? "integrations" : rawTab;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Keep the URL in sync with the active tab so refreshes preserve
  // selection AND deep-links (e.g. shared Plans link) still land
  // viewers in the right place.
  const selectTab = (id: string) => {
    setActiveTab(id);
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
  const [avatarSource, setAvatarSource] = useState<AvatarSource>("dicebear");
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions | null>(null);
  const [discordAvatar, setDiscordAvatar] = useState<string | null>(null);
  const [twitchAvatar, setTwitchAvatar] = useState<string | null>(null);
  const [role, setRole] = useState<string>("user");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // App state
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
  const [companionSaves, setCompanionSaves] = useState<CompanionSavedState[]>([]);
  const [companionDeletingId, setCompanionDeletingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
      const [profileRes, configsRes, organizedRes, participatingRes, twitchConnRes, activeSubRes, companionSavesRes] = await Promise.all([
        supabase.from("users").select("display_name, username, is_public, show_recap_on_live_page, gamertag_visibility, gamertags, socials, context_profile, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, role, has_used_trial").eq("id", user.id).single(),
        supabase.from("saved_configs").select("id, randomizer_slug, config_name, config_data, share_token, is_public, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("tournaments").select("id, title, game_slug, mode, status, date_time").eq("organizer_id", user.id).order("created_at", { ascending: false }),
        supabase.from("tournament_participants").select("tournament_id, status, tournaments(id, title, game_slug, mode, status, date_time)").eq("user_id", user.id).order("joined_at", { ascending: false }),
        supabase.from("twitch_connections").select("id").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .in("status", ["trialing", "active", "past_due", "incomplete"])
          .maybeSingle(),
        // TCG Companion save states — RLS scopes to current user; the
        // explicit `.eq("account_id", user.id)` is defense-in-depth.
        supabase
          .from("companion_save_states")
          .select(
            "id, name, mode, game_settings, session_data, state_version, updated_at, created_at",
          )
          .eq("account_id", user.id)
          .order("updated_at", { ascending: false }),
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
        setAvatarSource((profileRes.data.avatar_source as AvatarSource) || "dicebear");
        setDiscordAvatar(profileRes.data.discord_avatar || null);
        setTwitchAvatar(profileRes.data.twitch_avatar || null);
        setRole(profileRes.data.role || "user");
      }

      setConfigs((configsRes.data as SavedConfig[]) || []);

      const entries: TournamentEntry[] = [];
      if (organizedRes.data) organizedRes.data.forEach((t: any) => entries.push({ ...t, role: "organizer" }));
      if (participatingRes.data) {
        participatingRes.data.forEach((p: any) => {
          const t = p.tournaments;
          if (t && !entries.find((e) => e.id === t.id)) entries.push({ ...t, role: "participant", participant_status: p.status });
        });
      }
      entries.sort((a, b) => {
        const order: Record<string, number> = { in_progress: 0, open: 1, draft: 2, complete: 3, cancelled: 4 };
        return (order[a.status] || 5) - (order[b.status] || 5);
      });
      setTournaments(entries);

      // Normalize companion saves into the client-side shape (jsonb
      // columns come back untyped; we trust the row schema).
      const saves = (companionSavesRes.data ?? []).map((r) => ({
        id: r.id as string,
        name: (r.name as string | null) ?? null,
        mode: r.mode as string,
        gameSettings: r.game_settings as CompanionSavedState["gameSettings"],
        sessionData: r.session_data as CompanionSavedState["sessionData"],
        stateVersion: r.state_version as number,
        updatedAt: r.updated_at as string,
        createdAt: r.created_at as string,
      })) as CompanionSavedState[];
      setCompanionSaves(saves);

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

  // Config handlers
  const handleDeleteConfig = async (configId: string) => {
    const { error } = await deleteConfig(configId, user.id);
    if (!error) setConfigs(configs.filter((c) => c.id !== configId));
  };

  const handleCopyLink = (shareToken: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/s/${shareToken}`);
    setCopied(shareToken);
    setTimeout(() => setCopied(null), 2000);
  };

  // TCG Companion saved-game handlers
  const handleDeleteCompanionSave = async (saveId: string) => {
    setCompanionDeletingId(saveId);
    const result = await deleteCompanionSaveAction(saveId);
    if (result.ok) {
      setCompanionSaves((prev) => prev.filter((s) => s.id !== saveId));
    }
    setCompanionDeletingId(null);
  };

  const handleResumeCompanionSave = (saveId: string) => {
    // The /tcg-companion page reads ?resume=<id> on mount and seeds
    // the session from the save row directly. `window.location.assign`
    // (vs setting `href`) is a method call rather than an assignment,
    // which is what the React hooks immutability lint rule cares about.
    window.location.assign(`/tcg-companion?resume=${encodeURIComponent(saveId)}`);
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

  const toggleConsole = (c: string) => {
    const current = context.consolesOwned || [];
    setContext({ ...context, consolesOwned: current.includes(c) ? current.filter((x) => x !== c) : [...current, c] });
  };

  const organizing = tournaments.filter((t) => t.role === "organizer");
  const participating = tournaments.filter((t) => t.role === "participant");

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

      <div className="account-layout">
        <AccountSidebar
          activeTab={activeTab}
          onChange={selectTab}
          isStaff={isStaffRole(role)}
        />

        <div className="account-content">

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
          </>
        )}

        {/* ═══════════ APP TAB ═══════════ */}
        {activeTab === "app" && (
          <>
            {/* Saved Configs */}
            {configs.length === 0 ? (
              <div className="account-card">
                <h2>Saved Configs</h2>
                <p style={{ color: "var(--text-tertiary)" }}>No saved items yet. Randomize a kart build and hit &quot;Save Build&quot; to get started.</p>
              </div>
            ) : (
              (["game-night-setup", "kart-build", "item-set", "track-list", "player-preset", "ruleset"] as ConfigType[]).map((type) => {
                const typeConfigs = configs.filter((c) => c.config_data?.type === type);
                if (typeConfigs.length === 0) return null;

                // Group by game within each type
                const gameGroups = new Map<string, typeof typeConfigs>();
                for (const config of typeConfigs) {
                  const slug = config.config_data?.gameSlug || config.randomizer_slug || "unknown";
                  if (!gameGroups.has(slug)) gameGroups.set(slug, []);
                  gameGroups.get(slug)!.push(config);
                }

                // If only one game, no need to sub-label
                if (gameGroups.size === 1) {
                  return (
                    <div key={type} className="account-card">
                      <h2>{CONFIG_TYPE_LABELS[type]}</h2>
                      <div className="saved-builds-grid">
                        {typeConfigs.map((config) => (
                          <SetupCard key={config.id} config={config} onCopyLink={handleCopyLink} onDelete={handleDeleteConfig} copied={copied} />
                        ))}
                      </div>
                    </div>
                  );
                }

                // Multiple games — sub-group with game labels
                return (
                  <div key={type} className="account-card">
                    <h2>{CONFIG_TYPE_LABELS[type]}</h2>
                    {Array.from(gameGroups.entries()).map(([slug, gameConfigs]) => (
                      <div key={slug} style={{ marginBottom: "var(--spacing-24)" }}>
                        <h3 style={{ fontSize: "var(--font-size-16)", fontWeight: "var(--font-weight-semibold)", color: "var(--text-secondary)", marginBottom: "var(--spacing-12)" }}>{getGameName(slug)}</h3>
                        <div className="saved-builds-grid">
                          {gameConfigs.map((config) => (
                            <SetupCard key={config.id} config={config} onCopyLink={handleCopyLink} onDelete={handleDeleteConfig} copied={copied} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
            )}

            {/* TCG Companion saved games — Free+ capability. Auth-only
                surface (this whole tab requires sign-in). Resume routes
                to /tcg-companion?resume=<id> which auto-loads. */}
            <div className="account-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-24)" }}>
                <h2>Saved TCG Companion Games</h2>
                <a href="/tcg-companion"><Button variant="primary" size="small">Open Companion</Button></a>
              </div>
              {companionSaves.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
                  No saved games yet. Start a game in the TCG Companion and tap Save to keep it for later.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
                  {companionSaves.map((save) => {
                    const formatLabel = formatByKey(save.gameSettings.format).label;
                    const displayName = save.name?.trim() || defaultSaveName(formatLabel, save.updatedAt);
                    const updated = new Date(save.updatedAt).toLocaleString();
                    const isDeleting = companionDeletingId === save.id;
                    return (
                      <div key={save.id} className="manage-participant-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>{displayName}</span>
                          <span style={{ fontSize: "var(--font-size-12)", color: "var(--primary-600)", marginLeft: "var(--spacing-8)" }}>
                            {formatLabel} · {save.gameSettings.prizeCount} {save.gameSettings.prizeCount === 1 ? "prize" : "prizes"}
                          </span>
                          <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                            {save.sessionData.playerNames.p1} vs {save.sessionData.playerNames.p2} · Saved {updated}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() => handleResumeCompanionSave(save.id)}
                            disabled={isDeleting}
                          >
                            Resume
                          </Button>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => handleDeleteCompanionSave(save.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "Deleting…" : "Delete"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tournaments */}
            <div className="account-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-24)" }}>
                <h2>My Tournaments</h2>
                <a href="/tournament/create"><Button variant="primary" size="small">Create Tournament</Button></a>
              </div>
              {organizing.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>You haven&apos;t created any tournaments yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
                  {organizing.map((t) => (
                    <div key={t.id} className="manage-participant-row">
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>{t.title}</span>
                        <span style={{ fontSize: "var(--font-size-12)", color: "var(--primary-600)", marginLeft: "var(--spacing-8)" }}>{getGameName(t.game_slug)}</span>
                        {t.date_time && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: "var(--spacing-8)" }}>{new Date(t.date_time).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                        <span className={`lounge-status lounge-status--${t.status}`} style={{ fontSize: "var(--font-size-12)" }}>{t.status}</span>
                        <a href={`/tournament/${t.id}/manage`}><Button variant="secondary" size="small">Manage</Button></a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="account-card">
              <h2 style={{ marginBottom: "var(--spacing-24)" }}>Tournaments I&apos;m In</h2>
              {participating.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
                  You haven&apos;t joined any tournaments yet. <a href="/tournament" style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>Browse tournaments</a>
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
                  {participating.map((t) => (
                    <div key={t.id} className="manage-participant-row">
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>{t.title}</span>
                        <span style={{ fontSize: "var(--font-size-12)", color: "var(--primary-600)", marginLeft: "var(--spacing-8)" }}>{getGameName(t.game_slug)}</span>
                        {t.date_time && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: "var(--spacing-8)" }}>{new Date(t.date_time).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                        <span className={`lounge-status lounge-status--${t.status}`} style={{ fontSize: "var(--font-size-12)" }}>{t.status}</span>
                        {t.participant_status && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{t.participant_status}</span>}
                        <a href={`/tournament/${t.id}`}><Button variant="secondary" size="small">View</Button></a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════ INTEGRATIONS TAB ═══════════ */}
        {activeTab === "integrations" && (
          <IntegrationsTab onLearnMore={() => selectTab("plans")} />
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

        {/* ═══════════ MODS TAB ═══════════ */}
        {activeTab === "mods" && <ModsTab />}

        {/* ═══════════ GAME MODULES TAB ═══════════ */}
        {activeTab === "game-modules" && <GameModulesTab />}

        {/* ═══════════ WHEELS TAB ═══════════ */}
        {activeTab === "wheels" && <WheelsTab />}

        {/* ═══════════ CHAT COMMANDS TAB ═══════════ */}
        {activeTab === "chat-commands" && <ChatCommandsTab />}

        {/* ═══════════ COMMUNITY TAB ═══════════ */}
        {activeTab === "community" && <CommunityTab />}

        {/* ═══════════ THEME TAB ═══════════ */}
        {activeTab === "theme" && <ThemeTab />}

        {/* ═══════════ PLATFORM EVENTS TAB (admin only) ═══════════ */}
        {activeTab === "platform-events" && isStaffRole(role) && (
          <PlatformEventsTab />
        )}

        {/* ═══════════ PLATFORM VARIABLES TAB (admin only) ═══════════ */}
        {activeTab === "platform-variables" && isStaffRole(role) && (
          <PlatformVariablesTab />
        )}

        {/* ═══════════ PLATFORM DEFAULT COMMANDS TAB (admin only) ═══════════ */}
        {activeTab === "platform-default-commands" && isStaffRole(role) && (
          <PlatformDefaultCommandsTab />
        )}

        {/* ═══════════ PLATFORM COMPLIANCE TAB (admin only) ═══════════ */}
        {activeTab === "platform-compliance" && isStaffRole(role) && (
          <PlatformComplianceTab />
        )}

        {/* ═══════════ PLATFORM ENGAGEMENT TAB (admin only) ═══════════ */}
        {activeTab === "platform-engagement" && isStaffRole(role) && (
          <PlatformEngagementTab />
        )}

        {/* ═══════════ PLATFORM ECONOMY TAB (admin only) ═══════════ */}
        {activeTab === "platform-economy" && isStaffRole(role) && (
          <PlatformEconomyTab />
        )}

        {/* ═══════════ PLATFORM ECONOMY SNAPSHOT TAB (admin only) ═══════════ */}
        {activeTab === "platform-snapshot" && isStaffRole(role) && (
          <PlatformEconomySnapshotTab />
        )}

        {/* ═══════════ PLATFORM HEALTH TAB (admin only) ═══════════ */}
        {activeTab === "platform-health" && isStaffRole(role) && (
          <PlatformHealthTab />
        )}

        {/* ═══════════ PLATFORM STAFF TAB (admin only) ═══════════ */}
        {activeTab === "platform-staff" && isStaffRole(role) && (
          <PlatformStaffTab />
        )}

        {/* ═══════════ STREAMER ENGAGEMENT TAB ═══════════ */}
        {activeTab === "engagement" && <EngagementTab />}

        {/* ═══════════ PLANS TAB ═══════════ */}
        {activeTab === "plans" && <PlansTab />}
        </div>
      </div>
    </>
  );
}
