"use client";

/**
 * Account ▸ Profile: About you · Games (My gaming collection + board game
 * preferences) · Gamertags & socials · Friends.
 * Every field here autosaves through ProfileStore (one row update with only
 * the changed columns). The pieces that keep their own data (avatar, banner,
 * what you own, board game list, top friends) save themselves.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, Chip, Input, Select, Switch, Textarea } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminField, AdminScreen, AdminSection, SaveStatus } from "@/components/account/admin/AdminKit";
import { useProfileStore } from "@/components/account/profile/ProfileStore";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AvatarSection } from "@/components/account/AvatarSection";
import { BannerUploader } from "@/components/account/BannerUploader";
import { GamingCollection } from "@/components/account/profile/GamingCollection";
import { TopFriendsEditor } from "@/components/account/TopFriendsEditor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { GAMERTAG_PLATFORMS, type Gamertags } from "@/data/gamertag-types";
import { SOCIAL_PLATFORMS, type Socials } from "@/data/socials-types";
import { BOARD_GAME_GENRE_SUGGESTIONS, BOARD_GAME_LEVELS, BOARD_GAME_LENGTHS } from "@/data/board-games";

/** CDS Select hides its label for "", so "none" stands in for an empty choice. */
const NONE = "none";

function Loading({ title }: { title: string }) {
  return <AdminScreen title={title}><LoadingLines label="Loading" /></AdminScreen>;
}

export function ProfileAboutScreen() {
  const { user } = useAuth();
  const { loading, fields, set, extras, setExtras, status, usernameError } = useProfileStore();
  if (loading || !user) return <Loading title="About you" />;
  const handle = fields.username;
  return (
    <AdminScreen
      title="About you"
      intro={handle ? <>What people see on your profile at <Link href={`/u/${handle}`}>gameshuffle.co/u/{handle}</Link>.</> : "What people see on your profile."}
      actions={<SaveStatus status={status} />}
    >
      <AdminSection title="Name and picture">
        <AvatarSection
          userId={user.id}
          initialSource={extras.avatarSource}
          initialSeed={extras.avatarSeed}
          initialOptions={extras.avatarOptions}
          twitchAvatar={extras.twitchAvatar}
          discordAvatar={extras.discordAvatar}
          onSaved={({ source, seed, options }) => setExtras({ avatarSource: source, avatarSeed: seed, avatarOptions: options })}
        />
        <div className="admin-form">
          <AdminField label="Display name" helper="Shown on your profile, live pages and tournaments.">
            {(id, d) => <Input id={id} aria-describedby={d} fullWidth value={fields.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder="Your display name" />}
          </AdminField>
          <AdminField label="Username" helper={handle ? `Your profile address: gameshuffle.co/u/${handle}` : "Your profile address. Needed for a public profile."} error={usernameError}>
            {(id, d) => <Input id={id} aria-describedby={d} fullWidth value={fields.username} error={!!usernameError} onChange={(e) => set({ username: e.target.value.toLowerCase() })} placeholder="your-username" />}
          </AdminField>
        </div>
      </AdminSection>

      <AdminSection title="Your page" intro="The banner and words at the top of your public profile.">
        <BannerUploader />
        <div className="admin-form">
          <AdminField label="Bio" helper={`${fields.bio.length}/280`}>
            {(id, d) => <Textarea id={id} aria-describedby={d} fullWidth rows={3} maxLength={280} value={fields.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Tell people a little about you" />}
          </AdminField>
          <div className="admin-form-grid">
            <AdminField label="Pronouns">
              {(id) => <Input id={id} fullWidth value={fields.pronouns} onChange={(e) => set({ pronouns: e.target.value })} placeholder="they/them" />}
            </AdminField>
            <AdminField label="Region or location">
              {(id) => <Input id={id} fullWidth value={fields.location} onChange={(e) => set({ location: e.target.value })} placeholder="Pacific NW, UK" />}
            </AdminField>
          </div>
        </div>
      </AdminSection>
    </AdminScreen>
  );
}

export function ProfileGamesScreen() {
  const { loading, fields, set, status } = useProfileStore();
  const [otherGenre, setOtherGenre] = useState<string | null>(null);
  if (loading) return <Loading title="Games" />;
  const toggleLength = (v: string) =>
    set({ boardGameLengths: fields.boardGameLengths.includes(v) ? fields.boardGameLengths.filter((x) => x !== v) : [...fields.boardGameLengths, v] });
  const toggleGenre = (g: string) =>
    set({ boardGameGenres: fields.boardGameGenres.includes(g) ? fields.boardGameGenres.filter((x) => x !== g) : [...fields.boardGameGenres, g] });
  const addOtherGenre = () => {
    const g = (otherGenre ?? "").trim().slice(0, 40);
    if (g && !fields.boardGameGenres.some((x) => x.toLowerCase() === g.toLowerCase())) set({ boardGameGenres: [...fields.boardGameGenres, g] });
    setOtherGenre(null);
  };
  const customGenres = fields.boardGameGenres.filter((g) => !BOARD_GAME_GENRE_SUGGESTIONS.includes(g));
  return (
    <AdminScreen
      title="Games"
      intro="The games you own, video and board. Randomizers only roll what you have, and starred games show on your profile."
      actions={<SaveStatus status={status} />}
    >
      <AdminSection title="My gaming collection">
        <GamingCollection favorites={fields.favoriteGames} onFavoritesChange={(favoriteGames) => set({ favoriteGames })} />
      </AdminSection>

      <AdminSection title="Board game preferences" intro="So the right people find your game nights. Shows on your public profile.">
        <Switch checked={fields.playsBoardGames} onChange={(e) => set({ playsBoardGames: e.target.checked })} label="I play board games" />
        {fields.playsBoardGames && (
          <div className="admin-form">
            <div className="admin-field">
              <span className="admin-field__label" id="bg-genre-label">Genres you enjoy</span>
              <div className="profile-chips" role="group" aria-labelledby="bg-genre-label">
                {BOARD_GAME_GENRE_SUGGESTIONS.map((g) => {
                  const on = fields.boardGameGenres.includes(g);
                  return <Chip key={g} label={g} clickable selected={on} variant={on ? "primary" : "default"} onClick={() => toggleGenre(g)} />;
                })}
                {customGenres.map((g) => <Chip key={g} label={g} variant="primary" selected removable onRemove={() => toggleGenre(g)} />)}
                {otherGenre === null && <Chip label="+ Other" clickable onClick={() => setOtherGenre("")} />}
              </div>
              {otherGenre !== null && (
                <div className="profile-other-genre">
                  <Input
                    autoFocus
                    aria-label="Another genre"
                    placeholder="Type a genre"
                    value={otherGenre}
                    onChange={(e) => setOtherGenre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOtherGenre(); } if (e.key === "Escape") setOtherGenre(null); }}
                  />
                  <Button size="small" variant="secondary" onClick={addOtherGenre} disabled={!otherGenre.trim()}>Add</Button>
                  <Button size="small" variant="ghost" onClick={() => setOtherGenre(null)}>Cancel</Button>
                </div>
              )}
            </div>
            <AdminField label="Your comfort level">
              {(id) => (
                <Select
                  id={id}
                  value={fields.boardGameLevel || NONE}
                  onChange={(v) => { const s = String(v); set({ boardGameLevel: s === NONE ? "" : s }); }}
                  options={[{ value: NONE, label: "Prefer not to say" }, ...BOARD_GAME_LEVELS.map((l) => ({ value: l.value, label: l.label }))]}
                />
              )}
            </AdminField>
            <div className="admin-field">
              <span className="admin-field__label" id="bg-length-label">Game length you like</span>
              <div className="profile-chips" role="group" aria-labelledby="bg-length-label">
                {BOARD_GAME_LENGTHS.map((l) => {
                  const on = fields.boardGameLengths.includes(l.value);
                  return <Chip key={l.value} label={l.label} clickable selected={on} variant={on ? "primary" : "default"} onClick={() => toggleLength(l.value)} />;
                })}
              </div>
              <p className="admin-field__help">Pick any that fit: a quick filler, a long epic, or both.</p>
            </div>
          </div>
        )}
      </AdminSection>
    </AdminScreen>
  );
}

export function ProfileHandlesScreen() {
  const { loading, fields, set, status } = useProfileStore();
  if (loading) return <Loading title="Gamertags & socials" />;
  return (
    <AdminScreen
      title="Gamertags & socials"
      intro={<>Handles friends can find you by, and your channels. Discord and Twitch come from <Link href="/account?tab=security">Sign-in &amp; security</Link>.</>}
      actions={<SaveStatus status={status} />}
    >
      <AdminSection title="Gamertags">
        <div className="admin-form">
          <AdminField label="Who can see your gamertags?" helper="Covers your profile, sessions you join and shared lobbies.">
            {(id, d) => (
              <Select
                id={id}
                aria-describedby={d}
                fullWidth
                value={fields.gamertagVisibility}
                onChange={(v) => set({ gamertagVisibility: String(v) })}
                options={[
                  { value: "public", label: "Everyone: on my profile and in shared sessions" },
                  { value: "session_participants", label: "People in the same session" },
                  { value: "streamer_only", label: "Only the host of a session I join" },
                  { value: "private", label: "No one" },
                ]}
              />
            )}
          </AdminField>
        </div>
        <div className="admin-form-grid">
          {GAMERTAG_PLATFORMS.map((p) => (
            <AdminField key={p.key} label={<><PlatformIcon platform={p.key} />{p.label}</>}>
              {(id) => (
                <Input id={id} fullWidth value={fields.gamertags[p.key as keyof Gamertags] || ""} placeholder={p.placeholder}
                  onChange={(e) => set({ gamertags: { ...fields.gamertags, [p.key]: e.target.value || undefined } })} />
              )}
            </AdminField>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Socials" intro={<>Your channels. They also fill <code>$youtube</code>, <code>$twitter</code> and the rest in your <Link href="/account/streaming?tab=chat-commands">chat commands</Link>.</>}>
        <div className="admin-form-grid">
          {SOCIAL_PLATFORMS.map((p) => (
            <AdminField key={p.key} label={<><PlatformIcon platform={p.key} />{p.label}</>}>
              {(id) => (
                <Input id={id} fullWidth value={fields.socials[p.key as keyof Socials] || ""} placeholder={p.placeholder}
                  onChange={(e) => set({ socials: { ...fields.socials, [p.key]: e.target.value || undefined } })} />
              )}
            </AdminField>
          ))}
        </div>
      </AdminSection>
    </AdminScreen>
  );
}

export function ProfileFriendsScreen() {
  return (
    <AdminScreen title="Friends" intro="The people you feature on your profile.">
      <TopFriendsEditor />
    </AdminScreen>
  );
}
