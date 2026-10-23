"use client";

/**
 * Your stars on a region page's tiles: one lookup for the page (RoadStarsProvider), then each tile
 * shows the best stars among its teams this month. Nothing for guests or trainers you haven't beaten.
 */

import { createContext, useContext, type ReactNode } from "react";
import { RoadStars, useRoadStars } from "./RoadDuel";

const StarsContext = createContext<Record<string, number>>({});

export function RoadStarsProvider({ children }: { children: ReactNode }) {
  const stars = useRoadStars();
  return <StarsContext.Provider value={stars}>{children}</StarsContext.Provider>;
}

export function RoadTileStars({ teamIds }: { teamIds: string[] }) {
  const stars = useContext(StarsContext);
  const got = teamIds.map((id) => stars[id]).filter((n): n is number => n != null);
  if (!got.length) return null;
  return <RoadStars n={Math.max(...got)} size={14} />;
}
