"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  CompetitiveConfig,
  CompTrack,
  CompCharacter,
  RulesetPreset,
} from "@/data/competitive-types";

interface CompetitiveState {
  config: CompetitiveConfig | null;
  tracks: CompTrack[];
  characters: CompCharacter[];
  ruleset: RulesetPreset;
  tierFilters: string[];
  bannedTrackIds: string[];
  maxBans: number;
  loading: boolean;
}

export function useCompetitiveMode(gameSlug: string) {
  const [state, setState] = useState<CompetitiveState>({
    config: null,
    tracks: [],
    characters: [],
    ruleset: "150cc-no-items",
    tierFilters: [],
    bannedTrackIds: [],
    maxBans: 3,
    loading: true,
  });

  useEffect(() => {
    async function loadCompetitiveData() {
      const supabase = createClient();

      const [configRes, tracksRes, charsRes] = await Promise.all([
        supabase
          .from("game_competitive_configs")
          .select("*")
          .eq("game_slug", gameSlug)
          .single(),
        supabase
          .from("game_tracks")
          .select("*")
          .eq("game_slug", gameSlug)
          .order("sort_order"),
        supabase
          .from("game_characters")
          .select("*")
          .eq("game_slug", gameSlug)
          .order("sort_order"),
      ]);

      setState((prev) => ({
        ...prev,
        config: configRes.data as CompetitiveConfig | null,
        tracks: (tracksRes.data as CompTrack[]) || [],
        characters: (charsRes.data as CompCharacter[]) || [],
        loading: false,
      }));
    }

    loadCompetitiveData();
  }, [gameSlug]);

  const setRuleset = useCallback((ruleset: RulesetPreset) => {
    setState((prev) => ({ ...prev, ruleset }));
  }, []);

  const toggleTierFilter = useCallback((tier: string) => {
    setState((prev) => ({
      ...prev,
      tierFilters: prev.tierFilters.includes(tier)
        ? prev.tierFilters.filter((t) => t !== tier)
        : [...prev.tierFilters, tier],
    }));
  }, []);

  const toggleTrackBan = useCallback((trackId: string) => {
    setState((prev) => ({
      ...prev,
      bannedTrackIds: prev.bannedTrackIds.includes(trackId)
        ? prev.bannedTrackIds.filter((id) => id !== trackId)
        : [...prev.bannedTrackIds, trackId],
    }));
  }, []);

  const setMaxBans = useCallback((maxBans: number) => {
    setState((prev) => ({ ...prev, maxBans }));
  }, []);

  const getLegalTracks = useCallback(() => {
    return state.tracks.filter(
      (t) => t.status === "legal" && !state.bannedTrackIds.includes(t.id)
    );
  }, [state.tracks, state.bannedTrackIds]);

  const getFilteredCharacters = useCallback(() => {
    let chars = state.characters.filter((c) => !c.is_banned);
    if (state.tierFilters.length > 0) {
      chars = chars.filter((c) => c.tier && state.tierFilters.includes(c.tier));
    }
    return chars;
  }, [state.characters, state.tierFilters]);

  return {
    ...state,
    setRuleset,
    toggleTierFilter,
    toggleTrackBan,
    setMaxBans,
    getLegalTracks,
    getFilteredCharacters,
  };
}
