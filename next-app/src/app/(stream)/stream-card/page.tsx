"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { PlayerCard } from "@/components/randomizer/PlayerCard";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { useKartRandomizer } from "@/hooks/useKartRandomizer";
import { useAnalytics } from "@/hooks/useAnalytics";
import mk8dxData from "@/data/mk8dx-data.json";
import type { GameData } from "@/data/types";

const gameData = mk8dxData as GameData;

const CHAR_WEIGHT_OPTIONS = [
  { value: "Light", label: "Light" },
  { value: "Medium", label: "Medium" },
  { value: "Heavy", label: "Heavy" },
];

const DRIFT_OPTIONS = [
  { value: "Inward", label: "Inward Drift" },
  { value: "Outward", label: "Outward Drift" },
];

export default function StreamCardPage() {
  const [showParams, setShowParams] = useState(false);
  const { trackEvent } = useAnalytics();
  const kart = useKartRandomizer(1);

  const player = kart.players[0];

  return (
    <main className="card-stream-layout">
      <div className="randomizer-grid">
        <div style={{ position: "relative" }}>
          <div className="player-card">
            <div className="player-card__header">
              <div className="player-card__actions">
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => {
                    kart.refreshOne(player.id, gameData);
                    trackEvent("Refresh One Kart");
                  }}
                >
                  Refresh Kart
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setShowParams(!showParams)}
                >
                  Set Params
                </Button>
              </div>
            </div>
            <ul className="player-card__slots">
              <li className="kart-slot">
                <img
                  src={
                    player.combo?.character.img
                      ? player.combo.character.img.replace(
                          /^\/files\/images\//,
                          "/images/"
                        )
                      : ""
                  }
                  alt={player.combo?.character.name || "Character"}
                />
                <span>{player.combo?.character.name || "???"}</span>
              </li>
              <li className="kart-slot">
                <img
                  src={
                    player.combo?.vehicle.img
                      ? player.combo.vehicle.img.replace(
                          /^\/files\/images\//,
                          "/images/"
                        )
                      : ""
                  }
                  alt={player.combo?.vehicle.name || "Vehicle"}
                />
                <span>{player.combo?.vehicle.name || "???"}</span>
              </li>
              <li className="kart-slot">
                <img
                  src={
                    player.combo?.wheels.img
                      ? player.combo.wheels.img.replace(
                          /^\/files\/images\//,
                          "/images/"
                        )
                      : ""
                  }
                  alt={player.combo?.wheels.name || "Wheels"}
                />
                <span>{player.combo?.wheels.name || "???"}</span>
              </li>
              <li className="kart-slot">
                <img
                  src={
                    player.combo?.glider.img
                      ? player.combo.glider.img.replace(
                          /^\/files\/images\//,
                          "/images/"
                        )
                      : ""
                  }
                  alt={player.combo?.glider.name || "Glider"}
                />
                <span>{player.combo?.glider.name || "???"}</span>
              </li>
            </ul>
          </div>

          {/* Param Overlay */}
          <div
            className={`param-overlay ${showParams ? "param-overlay--active" : ""}`}
          >
            <button
              className="param-overlay__close"
              onClick={() => setShowParams(false)}
            >
              &times;
            </button>
            <div>
              <span>Any special modifiers you want to add?</span>
              <FilterGroup
                label="Character Weights"
                options={CHAR_WEIGHT_OPTIONS}
                activeValues={kart.charFilters}
                onToggle={(w) => kart.toggleCharFilter(w)}
              />
              <FilterGroup
                label="Drift Type"
                options={DRIFT_OPTIONS}
                activeValues={kart.vehiFilters}
                onToggle={(d) => kart.toggleVehiFilter(d)}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
