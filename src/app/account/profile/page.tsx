"use client";

import { useEffect, useState } from "react";
import { Button, Input, Switch } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { GAMERTAG_PLATFORMS, type Gamertags } from "@/data/gamertag-types";

interface ContextProfile {
  playerCount?: number;
  ageContext?: "family" | "21+";
  consolesOwned?: string[];
  gamesOwned?: string[];
}

const CONSOLE_OPTIONS = [
  "Nintendo Switch",
  "PS5",
  "Xbox Series X/S",
  "PC",
  "Retro / Emulator",
];

export default function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [gamertags, setGamertags] = useState<Gamertags>({});
  const [context, setContext] = useState<ContextProfile>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    supabase
      .from("users")
      .select("display_name, username, is_public, gamertags, context_profile")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name || "");
          setUsername(data.username || "");
          setIsPublic(data.is_public || false);
          setGamertags((data.gamertags as Gamertags) || {});
          setContext((data.context_profile as ContextProfile) || {});
        }
      });

  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setUsernameError(null);

    const supabase = createClient();

    // Validate username if set
    if (username) {
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (cleanUsername !== username) {
        setUsernameError("Username can only contain lowercase letters, numbers, hyphens, and underscores.");
        setSaving(false);
        return;
      }
      if (cleanUsername.length < 3) {
        setUsernameError("Username must be at least 3 characters.");
        setSaving(false);
        return;
      }
    }

    const { error } = await supabase
      .from("users")
      .update({
        display_name: displayName,
        username: username || null,
        is_public: isPublic,
        gamertags,
        context_profile: context,
      })
      .eq("id", user.id);

    if (error) {
      if (error.message.includes("username")) {
        setUsernameError("This username is already taken.");
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const updateGamertag = (platform: string, value: string) => {
    setGamertags({ ...gamertags, [platform]: value || undefined });
  };

  const toggleConsole = (console: string) => {
    const current = context.consolesOwned || [];
    setContext({
      ...context,
      consolesOwned: current.includes(console)
        ? current.filter((c) => c !== console)
        : [...current, console],
    });
  };

  if (!user) {
    return <div className="account-card"><p>Loading...</p></div>;
  }

  return (
    <>
      <div className="account-card">
        <h2>Profile</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
              Display Name
            </label>
            <Input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
            />
          </div>

          <div>
            <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
              Username
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="your-username"
            />
            {usernameError && (
              <span style={{ color: "#C11A10", fontSize: "13px", marginTop: "0.25rem", display: "block" }}>
                {usernameError}
              </span>
            )}
            {username && !usernameError && (
              <span style={{ color: "#808080", fontSize: "13px", marginTop: "0.25rem", display: "block" }}>
                gameshuffle.co/u/{username}
              </span>
            )}
          </div>

          <div>
            <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
              Email
            </label>
            <Input type="email" value={user.email || ""} disabled />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Switch
              checked={isPublic}
              onChange={() => setIsPublic(!isPublic)}
            />
            <div>
              <span style={{ fontWeight: 600, fontSize: "15px" }}>Public Profile</span>
              <p style={{ color: "#808080", fontSize: "13px", margin: 0 }}>
                Allow others to see your profile, gamertags, and shared configs
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="account-card">
        <h2>Gamertags</h2>
        <p style={{ marginBottom: "1.5rem", fontSize: "14px", color: "#606060" }}>
          Add your gamertags so friends can find and play with you.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {GAMERTAG_PLATFORMS.map((platform) => (
            <div key={platform.key}>
              <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
                {platform.label}
              </label>
              <Input
                type="text"
                value={gamertags[platform.key as keyof Gamertags] || ""}
                onChange={(e) => updateGamertag(platform.key, e.target.value)}
                placeholder={platform.placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="account-card">
        <h2>Game Night Profile</h2>
        <p style={{ marginBottom: "1.5rem", fontSize: "14px", color: "#606060" }}>
          Help us personalize your experience. All fields are optional.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
              How many people usually play?
            </label>
            <Input
              type="number"
              min={1}
              max={24}
              value={context.playerCount ?? ""}
              onChange={(e) =>
                setContext({
                  ...context,
                  playerCount: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="e.g. 4"
            />
          </div>

          <div>
            <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
              Content Preference
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant={context.ageContext === "family" ? "primary" : "secondary"}
                size="small"
                onClick={() => setContext({ ...context, ageContext: "family" })}
              >
                Family Friendly
              </Button>
              <Button
                variant={context.ageContext === "21+" ? "primary" : "secondary"}
                size="small"
                onClick={() => setContext({ ...context, ageContext: "21+" })}
              >
                21+
              </Button>
            </div>
          </div>

          <div>
            <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
              Consoles You Own
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {CONSOLE_OPTIONS.map((c) => (
                <Button
                  key={c}
                  variant={(context.consolesOwned || []).includes(c) ? "primary" : "secondary"}
                  size="small"
                  onClick={() => toggleConsole(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {saved && (
          <span style={{ color: "#17A710", fontWeight: 600, fontSize: "14px" }}>
            Saved!
          </span>
        )}
      </div>
    </>
  );
}
