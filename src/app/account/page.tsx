"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Icon, Input, Switch, Tabs } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isEmailVerified } from "@/lib/auth-utils";
import { isStaffRole } from "@/lib/subscription";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { GAMERTAG_PLATFORMS, type Gamertags } from "@/data/gamertag-types";
import { deleteConfig } from "@/lib/configs";
import { CONFIG_TYPE_LABELS, type ConfigType } from "@/data/config-types";
import { SetupCard } from "@/components/account/SetupCard";
import { IntegrationsTab } from "@/components/account/IntegrationsTab";
import { PlansTab } from "@/components/account/PlansTab";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";
import { SignInMethodsSection } from "@/components/account/SignInMethodsSection";
import { ConnectionsCard } from "@/components/account/ConnectionsCard";
import { AvatarSection } from "@/components/account/AvatarSection";
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
};

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const src = PLATFORM_ICONS[platform];
  if (src) {
    return <img src={src} alt={platform} style={{ width: size, height: size, flexShrink: 0, opacity: 0.6 }} />;
  }
  return <Icon name="link" size="16" />;
}

export default function AccountPage() {
  return <Suspense><AccountContent /></Suspense>;
}

function AccountContent() {
  const { user, signOut } = useAuth();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "profile";
  // Legacy alias: /account?tab=twitch-hub still redirects here from the
  // Stripe / Twitch OAuth return URLs. Map it to the new Integrations tab.
  const initialTab = rawTab === "twitch-hub" ? "integrations" : rawTab;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [gamertagVisibility, setGamertagVisibility] = useState<string>("session_participants");
  const [gamertags, setGamertags] = useState<Gamertags>({});
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
  const [resendCooldown, setResendCooldown] = useState(0);

  // App state
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
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
      const [profileRes, configsRes, organizedRes, participatingRes, twitchConnRes, activeSubRes] = await Promise.all([
        supabase.from("users").select("display_name, username, is_public, gamertag_visibility, gamertags, context_profile, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, role, has_used_trial").eq("id", user.id).single(),
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
        setGamertagVisibility((profileRes.data.gamertag_visibility as string) || "session_participants");
        setAvatarSeed((profileRes.data.avatar_seed as string | null) ?? null);
        setAvatarOptions((profileRes.data.avatar_options as AvatarOptions | null) ?? null);
        setGamertags((profileRes.data.gamertags as Gamertags) || {});
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

    if (username) {
      const clean = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (clean !== username) { setUsernameError("Username can only contain lowercase letters, numbers, hyphens, and underscores."); setSaving(false); return; }
      if (clean.length < 3) { setUsernameError("Username must be at least 3 characters."); setSaving(false); return; }
    }

    const { error } = await supabase.from("users").update({
      display_name: displayName, username: username || null, is_public: isPublic, gamertag_visibility: gamertagVisibility, gamertags, context_profile: context,
    }).eq("id", user.id);

    if (error) {
      if (error.message.includes("username")) setUsernameError("This username is already taken.");
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

  const staff = isStaffRole(role);
  // Integrations tab is always visible — Coming Soon cards for non-linked
  // platforms, functional cards for connected ones. We still track the
  // hasTwitchConnection state for existing downstream consumers.
  void hasTwitchConnection;

  return (
    <>
      {staff && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "#fff8e1",
            color: "#7a5b00",
            padding: "0.4rem 0.75rem",
            borderRadius: "999px",
            border: "1px solid #f0d97a",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            marginBottom: "1rem",
          }}
        >
          Staff
          <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "#806020" }}>
            Pro-tier access for testing
          </span>
        </div>
      )}
      <TrialOfferBanner
        isEligible={trialEligible}
        onLearnMore={() => setActiveTab("plans")}
      />

      <Tabs
        variant="pills"
        size="medium"
        tabs={[
          { id: "profile", label: "Profile", content: <></> },
          { id: "app", label: "My Stuff", content: <></> },
          { id: "integrations", label: "Integrations", content: <></> },
          { id: "plans", label: "Plans", content: <></> },
          { id: "security", label: "Security", content: <></> },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      <div style={{ marginTop: "1.5rem" }}>

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

              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Display Name</label>
                  <Input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" />
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Username</label>
                  <Input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="your-username" />
                  {usernameError && <span style={{ color: "#C11A10", fontSize: "13px", marginTop: "0.25rem", display: "block" }}>{usernameError}</span>}
                  {username && !usernameError && <span style={{ color: "#808080", fontSize: "13px", marginTop: "0.25rem", display: "block" }}>gameshuffle.co/u/{username}</span>}
                </div>
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Email</label>
                  <Input type="email" value={user.email || ""} disabled />
                </div>
                <div className="account-card__row" style={{ border: "none", padding: 0 }}>
                  <span className="account-card__label">Email Status</span>
                  <span className="account-card__value">
                    {isEmailVerified(user) ? <VerifiedBadge /> : (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: "#856404", fontWeight: 600, fontSize: "13px" }}>Unverified</span>
                        <Button variant="secondary" size="small" onClick={handleResendVerification} disabled={resendCooldown > 0}>
                          {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend Email"}
                        </Button>
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <Switch checked={isPublic} onChange={() => setIsPublic(!isPublic)} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "15px" }}>Public Profile</span>
                    <p style={{ color: "#808080", fontSize: "13px", margin: 0 }}>Allow others to see your profile, gamertags, and shared configs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connections — single source of truth for Discord / Twitch / future OAuth */}
            <ConnectionsCard />

            <div className="account-card">
              <h2>Gamertags</h2>
              <p style={{ marginBottom: "1.5rem", fontSize: "14px", color: "#606060" }}>
                Add the handles you use on consoles and PC storefronts so friends can find you.
                Discord and Twitch handles come from your{" "}
                <a
                  href="#connections"
                  onClick={(e) => {
                    e.preventDefault();
                    document.querySelector(".account-card h2")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  style={{ color: "#0E75C1", fontWeight: 600 }}
                >
                  linked Connections
                </a>
                {" "}automatically.
              </p>

              <div style={{ marginBottom: "1.5rem", maxWidth: 450 }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Who can see your gamertags?
                </label>
                <select
                  value={gamertagVisibility}
                  onChange={(e) => setGamertagVisibility(e.target.value)}
                  style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.5rem", border: "1px solid #D0D0D0", fontSize: "14px", background: "#fff", color: "#202020" }}
                >
                  <option value="public">Public — visible on my profile page and to everyone in shared sessions</option>
                  <option value="session_participants">Session participants only — visible to others in the same session</option>
                  <option value="streamer_only">Streamer only — visible just to the host of a session I join</option>
                  <option value="private">Private — never shared</option>
                </select>
                <p style={{ fontSize: "12px", color: "#808080", marginTop: "0.35rem" }}>
                  Controls how your gamertags surface in sessions, on your public profile, and via shared lobbies.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 450 }}>
                {GAMERTAG_PLATFORMS.map((platform) => (
                  <div key={platform.key}>
                    <label className="account-card__label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
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

            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
              <Button variant="primary" onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
              {saved && <span style={{ color: "#17A710", fontWeight: 600, fontSize: "14px" }}>Saved!</span>}
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
                <p style={{ color: "#808080" }}>No saved items yet. Randomize a kart build and hit &quot;Save Build&quot; to get started.</p>
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
                      <div key={slug} style={{ marginBottom: "1.5rem" }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#606060", marginBottom: "0.75rem" }}>{getGameName(slug)}</h3>
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

            {/* Tournaments */}
            <div className="account-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h2>My Tournaments</h2>
                <a href="/tournament/create"><Button variant="primary" size="small">Create Tournament</Button></a>
              </div>
              {organizing.length === 0 ? (
                <p style={{ color: "#808080", fontSize: "14px" }}>You haven&apos;t created any tournaments yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {organizing.map((t) => (
                    <div key={t.id} className="manage-participant-row">
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{t.title}</span>
                        <span style={{ fontSize: "12px", color: "#0E75C1", marginLeft: "0.5rem" }}>{getGameName(t.game_slug)}</span>
                        {t.date_time && <span style={{ fontSize: "12px", color: "#808080", marginLeft: "0.5rem" }}>{new Date(t.date_time).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={`lounge-status lounge-status--${t.status}`} style={{ fontSize: "10px" }}>{t.status}</span>
                        <a href={`/tournament/${t.id}/manage`}><Button variant="secondary" size="small">Manage</Button></a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="account-card">
              <h2 style={{ marginBottom: "1.5rem" }}>Tournaments I&apos;m In</h2>
              {participating.length === 0 ? (
                <p style={{ color: "#808080", fontSize: "14px" }}>
                  You haven&apos;t joined any tournaments yet. <a href="/tournament" style={{ color: "#0E75C1", fontWeight: 600 }}>Browse tournaments</a>
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {participating.map((t) => (
                    <div key={t.id} className="manage-participant-row">
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{t.title}</span>
                        <span style={{ fontSize: "12px", color: "#0E75C1", marginLeft: "0.5rem" }}>{getGameName(t.game_slug)}</span>
                        {t.date_time && <span style={{ fontSize: "12px", color: "#808080", marginLeft: "0.5rem" }}>{new Date(t.date_time).toLocaleDateString()}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={`lounge-status lounge-status--${t.status}`} style={{ fontSize: "10px" }}>{t.status}</span>
                        {t.participant_status && <span style={{ fontSize: "10px", color: "#808080" }}>{t.participant_status}</span>}
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
          <IntegrationsTab onLearnMore={() => setActiveTab("plans")} />
        )}

        {/* ═══════════ SECURITY TAB ═══════════ */}
        {activeTab === "security" && (
          <>
            <SignInMethodsSection />

            <div className="account-card">
              <h2>Change Password</h2>
              {passwordError && <div className="auth-page__error" style={{ marginBottom: "1rem" }}>{passwordError}</div>}
              {passwordSuccess && <p style={{ color: "#155724", fontWeight: 600, marginBottom: "1rem" }}>Password updated successfully.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 400 }}>
                <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <p style={{ fontSize: "12px", color: "#808080", marginTop: "-0.5rem" }}>Min 8 characters, with uppercase, lowercase, number, and special character.</p>
                <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <Button variant="primary" onClick={handleChangePassword} disabled={changingPassword}>{changingPassword ? "Updating..." : "Update Password"}</Button>
              </div>
            </div>


            <div className="account-card">
              <h2>Privacy</h2>
              <p style={{ color: "#606060", fontSize: "14px", marginBottom: "1rem" }}>
                Submit a privacy request to access, correct, or delete your data, or to opt out of marketing. We&apos;ll respond within 30 days.
              </p>
              <Button variant="secondary" onClick={() => { window.location.href = "/account/privacy/data-request"; }}>
                Submit a Privacy Request
              </Button>
            </div>

            <div className="account-card">
              <h2 style={{ color: "#C11A10" }}>Delete Account</h2>
              <p style={{ color: "#606060", fontSize: "14px", marginBottom: "1rem" }}>Permanently delete your account and all associated data. This action cannot be undone.</p>
              {!showDeleteConfirm ? (
                <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
              ) : (
                <div style={{ padding: "1.5rem", background: "#fef2f2", borderRadius: "0.5rem", border: "1px solid #fecaca" }}>
                  <p style={{ fontWeight: 600, color: "#991b1b", marginBottom: "0.75rem" }}>This will permanently delete your account, saved configs, tournament history, and all associated data.</p>
                  {deleteError && <div className="auth-page__error" style={{ marginBottom: "0.75rem" }}>{deleteError}</div>}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ fontSize: "13px", color: "#991b1b", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Type DELETE to confirm</label>
                    <Input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder="DELETE" style={{ maxWidth: 200 }} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button variant="danger" onClick={handleDeleteAccount} disabled={deleteInput !== "DELETE" || deleting}>{deleting ? "Deleting..." : "Permanently Delete"}</Button>
                    <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); setDeleteError(null); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════ PLANS TAB ═══════════ */}
        {activeTab === "plans" && <PlansTab />}
      </div>
    </>
  );
}
