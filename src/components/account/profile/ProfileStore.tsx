"use client";

/**
 * The Account section's profile data: loaded once, shared by every screen
 * that edits a column on `users` (About you, Games, Gamertags & socials,
 * Theming ▸ Profile page, Settings ▸ General and Privacy), and autosaved.
 *
 * Saves write only the columns that changed since the last save (useAutosave
 * waits for a pause and sends one request at a time). A handle that's taken or
 * invalid shows on the Username field and the rest still saves.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { validateUsername } from "@/lib/username";
import { isReservedName, RESERVED_DISPLAY_NAME_MESSAGE } from "@/lib/reservedName";
import { useAutosave, type AutosaveStatus } from "@/lib/hooks/useAutosave";
import type { Gamertags } from "@/data/gamertag-types";
import type { Socials } from "@/data/socials-types";
import type { AvatarSource } from "@/components/UserAvatar";
import type { AvatarOptions } from "@/lib/avatar/dicebear";

export interface ProfileFields {
  displayName: string;
  username: string;
  isPublic: boolean;
  showRecapOnLivePage: boolean;
  gamertagVisibility: string;
  gamertags: Gamertags;
  socials: Socials;
  bio: string;
  pronouns: string;
  location: string;
  timezone: string;
  favoriteGames: string[];
  playsBoardGames: boolean;
  boardGameGenres: string[];
  boardGameLevel: string;
  boardGameLengths: string[];
  pinnedPostId: string;
  featuredCardId: string;
  accent: string;
}

interface ProfileExtras {
  avatarSource: AvatarSource;
  avatarSeed: string | null;
  avatarOptions: AvatarOptions | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;
  hasTwitchConnection: boolean;
  trialEligible: boolean;
  /** The personalization columns exist on this database. */
  persoAvailable: boolean;
  myPosts: { id: string; label: string }[];
  myCards: { id: string; label: string }[];
}

interface ProfileStoreValue {
  loading: boolean;
  fields: ProfileFields;
  set: (patch: Partial<ProfileFields>) => void;
  extras: ProfileExtras;
  setExtras: (patch: Partial<ProfileExtras>) => void;
  status: AutosaveStatus;
  usernameError: string | null;
  setUsernameError: (e: string | null) => void;
  /** Set when the display name uses the GameShuffle name (kept for the team); the old name stays saved. */
  displayNameError: string | null;
}

const EMPTY: ProfileFields = {
  displayName: "", username: "", isPublic: false, showRecapOnLivePage: true, gamertagVisibility: "session_participants",
  gamertags: {}, socials: {}, bio: "", pronouns: "", location: "", timezone: "", favoriteGames: [],
  playsBoardGames: false, boardGameGenres: [], boardGameLevel: "", boardGameLengths: [],
  pinnedPostId: "", featuredCardId: "", accent: "",
};

/** Fields → the `users` columns they're stored in, cleaned the way the column expects. */
function toRow(f: ProfileFields, perso: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    display_name: f.displayName,
    is_public: f.isPublic,
    show_recap_on_live_page: f.showRecapOnLivePage,
    gamertag_visibility: f.gamertagVisibility,
    gamertags: f.gamertags,
    socials: f.socials,
    bio: f.bio.trim().slice(0, 280) || null,
    pronouns: f.pronouns.trim().slice(0, 40) || null,
    location: f.location.trim().slice(0, 60) || null,
    timezone: f.timezone || null,
    favorite_games: f.favoriteGames.length ? f.favoriteGames.slice(0, 12) : null,
    plays_board_games: f.playsBoardGames,
    board_game_genres: f.playsBoardGames && f.boardGameGenres.length ? f.boardGameGenres.slice(0, 20) : null,
    board_game_level: f.playsBoardGames ? (f.boardGameLevel || null) : null,
    board_game_lengths: f.playsBoardGames && f.boardGameLengths.length ? f.boardGameLengths : null,
  };
  if (perso) {
    row.profile_pinned_post_id = f.pinnedPostId || null;
    row.profile_featured_card_id = f.featuredCardId || null;
    row.profile_accent = f.accent || null;
  }
  return row;
}

const Ctx = createContext<ProfileStoreValue | null>(null);

export function useProfileStore(): ProfileStoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfileStore needs <ProfileStoreProvider>");
  return v;
}

export function ProfileStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<ProfileFields>(EMPTY);
  const [extras, setExtrasState] = useState<ProfileExtras>({
    avatarSource: "dicebear", avatarSeed: null, avatarOptions: null, discordAvatar: null, twitchAvatar: null,
    hasTwitchConnection: false, trialEligible: false, persoAvailable: false, myPosts: [], myCards: [],
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  // Staff and admins may use the GameShuffle name in a display name.
  const teamRole = useRef(false);
  // The row as last stored, so a save sends only the columns that changed.
  const savedRow = useRef<Record<string, unknown>>({});
  const savedUsername = useRef("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [profileRes, twitchRes, subRes, persoRes, postsRes, cardsRes] = await Promise.all([
        supabase.from("users").select("display_name, username, is_public, show_recap_on_live_page, gamertag_visibility, gamertags, socials, bio, pronouns, location, timezone, favorite_games, plays_board_games, board_game_genres, board_game_level, board_game_lengths, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, role, has_used_trial").eq("id", user.id).single(),
        supabase.from("twitch_connections").select("id").eq("user_id", user.id).maybeSingle(),
        // Pro rows only (Circuit shares the table), and a list so Pro + Circuit together can't error out and show the trial offer to someone who pays.
        supabase.from("subscriptions").select("status").eq("user_id", user.id).eq("product", "pro").in("status", ["trialing", "active", "past_due", "incomplete"]).limit(1),
        // Personalization columns, guarded: an unapplied migration just hides those fields.
        supabase.from("users").select("profile_pinned_post_id, profile_featured_card_id, profile_accent").eq("id", user.id).maybeSingle(),
        supabase.from("gs_posts").select("id, body, kind").eq("author_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(25),
        supabase.from("gs_user_cards").select("showcase_rank, card:tcg_cards(id, name)").eq("user_id", user.id).not("showcase_rank", "is", null).order("showcase_rank", { ascending: true }),
      ]);
      if (!active) return;
      const p = (profileRes.data ?? {}) as Record<string, unknown>;
      const perso = !persoRes.error && !!persoRes.data;
      const q = (persoRes.data ?? {}) as Record<string, unknown>;
      const role = (p.role as string | null) ?? null;
      teamRole.current = role === "staff" || role === "admin";
      const loaded: ProfileFields = {
        displayName: (p.display_name as string) || "",
        username: (p.username as string) || "",
        isPublic: !!p.is_public,
        showRecapOnLivePage: p.show_recap_on_live_page !== false,
        gamertagVisibility: (p.gamertag_visibility as string) || "session_participants",
        gamertags: (p.gamertags as Gamertags) || {},
        socials: (p.socials as Socials) || {},
        bio: (p.bio as string) || "",
        pronouns: (p.pronouns as string) || "",
        location: (p.location as string) || "",
        timezone: (p.timezone as string) || "",
        favoriteGames: (p.favorite_games as string[]) || [],
        playsBoardGames: !!p.plays_board_games,
        boardGameGenres: (p.board_game_genres as string[]) || [],
        boardGameLevel: (p.board_game_level as string) || "",
        boardGameLengths: (p.board_game_lengths as string[]) || [],
        pinnedPostId: (q.profile_pinned_post_id as string) || "",
        featuredCardId: (q.profile_featured_card_id as string) || "",
        accent: (q.profile_accent as string) || "",
      };
      savedRow.current = toRow(loaded, perso);
      savedUsername.current = loaded.username;
      setFields(loaded);
      setExtrasState({
        avatarSource: (p.avatar_source as AvatarSource) || "dicebear",
        avatarSeed: (p.avatar_seed as string | null) ?? null,
        avatarOptions: (p.avatar_options as AvatarOptions | null) ?? null,
        discordAvatar: (p.discord_avatar as string | null) ?? null,
        twitchAvatar: (p.twitch_avatar as string | null) ?? null,
        hasTwitchConnection: !!twitchRes.data,
        trialEligible: role !== "staff" && role !== "admin" && !p.has_used_trial && !subRes.error && !(subRes.data ?? []).length,
        persoAvailable: perso,
        myPosts: ((postsRes.data ?? []) as { id: string; body: string | null; kind: string }[]).map((x) => ({
          id: x.id,
          label: (x.body || "").trim().slice(0, 50) || (x.kind === "game_night" ? "Game night post" : x.kind === "share" ? "Shared post" : "Post"),
        })),
        myCards: ((cardsRes.data ?? []) as { card: { id: string; name: string } | { id: string; name: string }[] | null }[])
          .map((r) => (Array.isArray(r.card) ? r.card[0] : r.card))
          .filter((c): c is { id: string; name: string } => !!c)
          .map((c) => ({ id: c.id, label: c.name })),
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user, supabase]);

  const save = async (f: ProfileFields): Promise<boolean> => {
    if (!user) return false;
    // The handle: unchanged → leave it; changed → validate and check it's free.
    // A bad handle keeps the old one and shows the error; the rest still saves.
    const typed = f.username.trim().toLowerCase();
    let handle: string | null = savedUsername.current || null;
    if (typed !== savedUsername.current) {
      if (!typed) { handle = null; setUsernameError(null); }
      else {
        const check = validateUsername(typed);
        if (!check.ok) setUsernameError(check.error);
        else {
          let free = true;
          try {
            const j = await fetch(`/api/account/username?u=${encodeURIComponent(check.value)}`).then((r) => r.json());
            free = !!j.available;
            if (!free) setUsernameError(j.error || "This username is already taken.");
          } catch { /* network: the unique index is the backstop */ }
          if (free) { handle = check.value; setUsernameError(null); }
        }
      }
    }
    // A public profile is its /u/username address, so it needs a handle.
    if (f.isPublic && !handle) { setUsernameError("Choose a username before making your profile public."); return false; }

    const row: Record<string, unknown> = { ...toRow(f, extras.persoAvailable), username: handle };
    // The GameShuffle name is kept for the team: keep the saved display name and say why.
    if (!teamRole.current && isReservedName(f.displayName)) {
      setDisplayNameError(RESERVED_DISPLAY_NAME_MESSAGE);
      row.display_name = savedRow.current.display_name ?? null;
    } else {
      setDisplayNameError(null);
    }
    const prev: Record<string, unknown> = { ...savedRow.current, username: savedUsername.current || null };
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (JSON.stringify(v) !== JSON.stringify(prev[k])) changed[k] = v;
    if (Object.keys(changed).length === 0) return true;

    const { error } = await supabase.from("users").update(changed).eq("id", user.id);
    if (error) {
      if (error.message.includes("username")) setUsernameError("This username is already taken.");
      return false;
    }
    savedRow.current = { ...savedRow.current, ...changed };
    savedUsername.current = handle || "";
    if ("display_name" in changed || "username" in changed) window.dispatchEvent(new Event("profile-updated"));
    return true;
  };

  const { status } = useAutosave(fields, save, { ready: !loading, delay: 1200 });

  const value: ProfileStoreValue = {
    loading,
    fields,
    set: (patch) => setFields((f) => ({ ...f, ...patch })),
    extras,
    setExtras: (patch) => setExtrasState((x) => ({ ...x, ...patch })),
    status,
    usernameError,
    displayNameError,
    setUsernameError,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
