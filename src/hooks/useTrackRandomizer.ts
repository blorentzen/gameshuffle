"use client";

import { useReducer, useCallback } from "react";
import type { SelectedTrack, Cup } from "@/data/types";
import { randomizeTrackList } from "@/lib/randomizer";

interface TrackState {
  tracks: SelectedTrack[];
  count: number;
  noDups: boolean;
  tourOnly: boolean;
}

interface HydratedTrack {
  name: string;
  img: string;
  cupImg: string;
}

type TrackAction =
  | { type: "RANDOMIZE"; cups: Cup[] }
  | { type: "SET_COUNT"; count: number }
  | { type: "TOGGLE_NO_DUPS" }
  | { type: "TOGGLE_TOUR_ONLY" }
  | { type: "HYDRATE"; tracks: HydratedTrack[]; count: number; noDups: boolean; tourOnly: boolean };

function trackReducer(state: TrackState, action: TrackAction): TrackState {
  switch (action.type) {
    case "RANDOMIZE": {
      return {
        ...state,
        tracks: randomizeTrackList(
          action.cups,
          state.count,
          state.noDups,
          state.tourOnly
        ),
      };
    }
    case "SET_COUNT": {
      return { ...state, count: Math.max(1, Math.min(48, action.count)) };
    }
    case "TOGGLE_NO_DUPS": {
      return { ...state, noDups: !state.noDups };
    }
    case "TOGGLE_TOUR_ONLY": {
      return { ...state, tourOnly: !state.tourOnly };
    }
    case "HYDRATE": {
      return {
        tracks: action.tracks.map((t, i) => ({
          raceNumber: i + 1,
          course: { name: t.name, img: t.img },
          cupImg: t.cupImg,
        })),
        count: action.count,
        noDups: action.noDups,
        tourOnly: action.tourOnly,
      };
    }
    default:
      return state;
  }
}

export function useTrackRandomizer(initialCount: number = 4) {
  const [state, dispatch] = useReducer(trackReducer, {
    tracks: [],
    count: initialCount,
    noDups: false,
    tourOnly: false,
  });

  const randomize = useCallback(
    (cups: Cup[]) => dispatch({ type: "RANDOMIZE", cups }),
    []
  );
  const setCount = useCallback(
    (count: number) => dispatch({ type: "SET_COUNT", count }),
    []
  );
  const toggleNoDups = useCallback(
    () => dispatch({ type: "TOGGLE_NO_DUPS" }),
    []
  );
  const toggleTourOnly = useCallback(
    () => dispatch({ type: "TOGGLE_TOUR_ONLY" }),
    []
  );
  const hydrate = useCallback(
    (tracks: HydratedTrack[], count: number, noDups: boolean, tourOnly: boolean) =>
      dispatch({ type: "HYDRATE", tracks, count, noDups, tourOnly }),
    []
  );

  return {
    tracks: state.tracks,
    count: state.count,
    noDups: state.noDups,
    tourOnly: state.tourOnly,
    randomize,
    setCount,
    toggleNoDups,
    toggleTourOnly,
    hydrate,
  };
}
