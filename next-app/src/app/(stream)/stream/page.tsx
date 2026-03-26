"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import Image from "next/image";
import { PlayerCard } from "@/components/randomizer/PlayerCard";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { TrackList } from "@/components/randomizer/TrackList";
import { RaceCounter } from "@/components/randomizer/RaceCounter";
import { StreamToggle } from "@/components/randomizer/StreamToggle";
import { TourneyMode } from "@/components/randomizer/TourneyMode";
import { useKartRandomizer } from "@/hooks/useKartRandomizer";
import { useTrackRandomizer } from "@/hooks/useTrackRandomizer";
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

export default function StreamPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("kart-randomizer");
  const [tourneyCount, setTourneyCount] = useState(4);

  const { trackEvent } = useAnalytics();
  const kart = useKartRandomizer(12);
  const track = useTrackRandomizer(4);

  return (
    <>
      {/* Stream Navigation */}
      <div className="stream-nav">
        <button
          className="stream-nav__logo"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Image
            src="/images/fg/logos/gs-color-mono.png"
            alt="GameShuffle"
            width={50}
            height={50}
          />
        </button>

        {isOpen && (
          <StreamToggle activeTab={activeTab} onTabChange={setActiveTab} />
        )}
      </div>

      <main style={{ opacity: isOpen ? 1 : 0, transition: "opacity 0.3s" }}>
        {/* Kart Randomizer */}
        <section
          className={`stream-section ${activeTab !== "kart-randomizer" ? "stream-section--hidden" : ""}`}
        >
          <div className="stream-subnav">
            <div className="filter-section">
              <FilterGroup
                label="Character Weights"
                options={CHAR_WEIGHT_OPTIONS}
                activeValues={kart.charFilters}
                onToggle={(w) => {
                  kart.toggleCharFilter(w);
                  trackEvent("Filter Characters", { type: w });
                }}
              />
              <FilterGroup
                label="Drift Type"
                options={DRIFT_OPTIONS}
                activeValues={kart.vehiFilters}
                onToggle={(d) => {
                  kart.toggleVehiFilter(d);
                  trackEvent("Filter Vehicles", { type: d });
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                variant="primary"
                onClick={() => {
                  kart.addPlayer();
                  trackEvent("Add Racer");
                }}
              >
                Add Player
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  kart.randomizeAll(gameData);
                  trackEvent("Randomize Karts");
                }}
              >
                Randomize Karts
              </Button>
            </div>
          </div>

          <div className="randomizer-grid">
            {kart.players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                onRefresh={() => {
                  kart.refreshOne(player.id, gameData);
                  trackEvent("Refresh One Kart");
                }}
                onRemove={() => {
                  kart.removePlayer(player.id);
                  trackEvent("Remove Racer");
                }}
                onNameChange={(name) => kart.setPlayerName(player.id, name)}
                canRemove={kart.players.length > 1}
              />
            ))}
          </div>
        </section>

        {/* Race Randomizer */}
        <section
          className={`stream-section ${activeTab !== "race-randomizer" ? "stream-section--hidden" : ""}`}
        >
          <div className="stream-subnav">
            <div className="filter-section">
              <FilterGroup
                label="Race Modifiers"
                options={[
                  { value: "no-dups", label: "No Duplicates" },
                  { value: "all-tour", label: "All Tour Tracks" },
                ]}
                activeValues={[
                  ...(track.noDups ? ["no-dups"] : []),
                  ...(track.tourOnly ? ["all-tour"] : []),
                ]}
                onToggle={(v) => {
                  if (v === "no-dups") track.toggleNoDups();
                  if (v === "all-tour") track.toggleTourOnly();
                }}
              />
              <div>
                <span>
                  <b>Amount of Races</b>
                </span>
                <RaceCounter
                  value={track.count}
                  onChange={track.setCount}
                />
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                if (gameData.cups) track.randomize(gameData.cups);
                trackEvent("Randomize Races", { amount: track.count });
              }}
            >
              Randomize Races
            </Button>
          </div>

          <TrackList tracks={track.tracks} />
        </section>

        {/* Tourney Mode */}
        <section
          className={`stream-section ${activeTab !== "tourney-mode" ? "stream-section--hidden" : ""}`}
        >
          <TourneyMode
            raceCount={tourneyCount}
            onCountChange={setTourneyCount}
          />
        </section>
      </main>
    </>
  );
}
