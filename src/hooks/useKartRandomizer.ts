"use client";

import { useReducer, useCallback } from "react";
import type { Player, GameData, KartCombo } from "@/data/types";
import { randomizeKartCombo } from "@/lib/randomizer";

interface KartState {
  players: Player[];
  charFilters: string[];
  vehiFilters: string[];
}

interface HydratedPlayer {
  name: string;
  combo: KartCombo | null;
}

type KartAction =
  | { type: "ADD_PLAYER"; maxPlayers: number }
  | { type: "REMOVE_PLAYER"; id: string }
  | { type: "SET_PLAYER_NAME"; id: string; name: string }
  | { type: "RANDOMIZE_ALL"; data: GameData }
  | { type: "REFRESH_ONE"; id: string; data: GameData }
  | { type: "TOGGLE_CHAR_FILTER"; weight: string }
  | { type: "TOGGLE_VEHI_FILTER"; drift: string }
  | { type: "HYDRATE"; players: HydratedPlayer[]; charFilters: string[]; vehiFilters: string[] };

let nextId = 1;

function createPlayer(): Player {
  return {
    id: String(nextId++),
    name: "",
    combo: null,
  };
}

function randomizePlayer(
  player: Player,
  data: GameData,
  charFilters: string[],
  vehiFilters: string[]
): Player {
  return {
    ...player,
    combo: randomizeKartCombo(data, charFilters, vehiFilters),
  };
}

function kartReducer(state: KartState, action: KartAction): KartState {
  switch (action.type) {
    case "ADD_PLAYER": {
      if (state.players.length >= action.maxPlayers) return state;
      return {
        ...state,
        players: [...state.players, createPlayer()],
      };
    }
    case "REMOVE_PLAYER": {
      if (state.players.length <= 1) return state;
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.id),
      };
    }
    case "SET_PLAYER_NAME": {
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.id ? { ...p, name: action.name } : p
        ),
      };
    }
    case "RANDOMIZE_ALL": {
      return {
        ...state,
        players: state.players.map((p) =>
          randomizePlayer(p, action.data, state.charFilters, state.vehiFilters)
        ),
      };
    }
    case "REFRESH_ONE": {
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.id
            ? randomizePlayer(
                p,
                action.data,
                state.charFilters,
                state.vehiFilters
              )
            : p
        ),
      };
    }
    case "TOGGLE_CHAR_FILTER": {
      const filters = state.charFilters.includes(action.weight)
        ? state.charFilters.filter((f) => f !== action.weight)
        : [...state.charFilters, action.weight];
      return { ...state, charFilters: filters };
    }
    case "TOGGLE_VEHI_FILTER": {
      const filters = state.vehiFilters.includes(action.drift)
        ? state.vehiFilters.filter((f) => f !== action.drift)
        : [...state.vehiFilters, action.drift];
      return { ...state, vehiFilters: filters };
    }
    case "HYDRATE": {
      return {
        players: action.players.map((p) => ({
          id: String(nextId++),
          name: p.name,
          combo: p.combo,
        })),
        charFilters: action.charFilters,
        vehiFilters: action.vehiFilters,
      };
    }
    default:
      return state;
  }
}

export function useKartRandomizer(maxPlayers: number) {
  const [state, dispatch] = useReducer(kartReducer, {
    players: [createPlayer()],
    charFilters: [],
    vehiFilters: [],
  });

  const addPlayer = useCallback(
    () => dispatch({ type: "ADD_PLAYER", maxPlayers }),
    [maxPlayers]
  );
  const removePlayer = useCallback(
    (id: string) => dispatch({ type: "REMOVE_PLAYER", id }),
    []
  );
  const setPlayerName = useCallback(
    (id: string, name: string) =>
      dispatch({ type: "SET_PLAYER_NAME", id, name }),
    []
  );
  const randomizeAll = useCallback(
    (data: GameData) => dispatch({ type: "RANDOMIZE_ALL", data }),
    []
  );
  const refreshOne = useCallback(
    (id: string, data: GameData) =>
      dispatch({ type: "REFRESH_ONE", id, data }),
    []
  );
  const toggleCharFilter = useCallback(
    (weight: string) => dispatch({ type: "TOGGLE_CHAR_FILTER", weight }),
    []
  );
  const toggleVehiFilter = useCallback(
    (drift: string) => dispatch({ type: "TOGGLE_VEHI_FILTER", drift }),
    []
  );
  const hydrate = useCallback(
    (players: HydratedPlayer[], charFilters: string[], vehiFilters: string[]) =>
      dispatch({ type: "HYDRATE", players, charFilters, vehiFilters }),
    []
  );

  return {
    players: state.players,
    charFilters: state.charFilters,
    vehiFilters: state.vehiFilters,
    addPlayer,
    removePlayer,
    setPlayerName,
    randomizeAll,
    refreshOne,
    toggleCharFilter,
    toggleVehiFilter,
    hydrate,
  };
}
