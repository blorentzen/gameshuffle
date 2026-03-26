"use client";

import { Container, Button } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { PlayerCard } from "@/components/randomizer/PlayerCard";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { TrackList } from "@/components/randomizer/TrackList";
import { RaceSelector } from "@/components/randomizer/RaceSelector";
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

export default function MK8DXRandomizerPage() {
  const { trackEvent } = useAnalytics();
  const kart = useKartRandomizer(12);
  const track = useTrackRandomizer(4);

  const handleRandomizeKarts = () => {
    kart.randomizeAll(gameData);
    trackEvent("Randomize Karts");
  };

  const handleAddPlayer = () => {
    kart.addPlayer();
    trackEvent("Add Racer");
  };

  const handleRefreshOne = (id: string) => {
    kart.refreshOne(id, gameData);
    trackEvent("Refresh One Kart");
  };

  const handleRemovePlayer = (id: string) => {
    kart.removePlayer(id);
    trackEvent("Remove Racer");
  };

  const handleRandomizeRaces = () => {
    if (gameData.cups) {
      track.randomize(gameData.cups);
      trackEvent("Randomize Races", { amount: track.count });
    }
  };

  return (
    <>
      <VideoHero
        videoSrc="/video/mk8dx-randomizer-vid.mp4"
        videoWebm="/video/mk8dx-randomizer-vid.webm"
        videoPoster="/video/mk8dx-randomizer-vid-thumb.jpg"
        backgroundImage="/images/bg/MK8DX_Background_Music.jpg"
        overlayOpacity={0.65}
        height="medium"
      >
        <Container>
          <div style={{ maxWidth: "600px" }}>
            <h1
              style={{
                fontSize: "clamp(3.2rem, 5vw, 6.4rem)",
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: "1rem",
              }}
            >
              Mario Kart 8 Deluxe Kart and Track Randomizer
            </h1>
            <p>
              Add and remove players joining the game, randomize all or one of
              your karts, and randomize your track selections all in one place.
            </p>
          </div>
        </Container>
      </VideoHero>

      <main style={{ paddingTop: "3rem" }}>
        <Container>
          {/* Kart Randomizer Section */}
          <section>
            <div className="kart-intro">
              <div className="kart-intro__content">
                <h2>Randomize your kart combo(s).</h2>
                <p>
                  You can add as many players or combos you like up to 12 total.
                </p>
                <div className="kart-intro__actions">
                  <Button variant="primary" onClick={handleAddPlayer}>
                    Add Player
                  </Button>
                  <Button variant="primary" onClick={handleRandomizeKarts}>
                    Randomize Karts
                  </Button>
                </div>
              </div>

              <div>
                <h2 style={{ marginBottom: "2rem" }}>
                  Any special modifiers you want to add?
                </h2>
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
              </div>
            </div>

            <div className="randomizer-grid">
              {kart.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onRefresh={() => handleRefreshOne(player.id)}
                  onRemove={() => handleRemovePlayer(player.id)}
                  onNameChange={(name) => kart.setPlayerName(player.id, name)}
                  canRemove={kart.players.length > 1}
                />
              ))}
            </div>
          </section>

          {/* Track Randomizer Section */}
          <section>
            <div className="kart-intro">
              <div className="kart-intro__content">
                <h2>Randomize your track selections.</h2>
                <p>
                  Set up the amount of races you&apos;d like to run and
                  randomize your track choices.
                </p>
                <div className="kart-intro__actions">
                  <RaceSelector
                    value={track.count}
                    onChange={track.setCount}
                  />
                  <Button variant="primary" onClick={handleRandomizeRaces}>
                    Randomize Races
                  </Button>
                </div>
              </div>

              <div>
                <h2 style={{ marginBottom: "2rem" }}>
                  Any special modifiers you want to add?
                </h2>
                <div className="filter-section">
                  <FilterGroup
                    label="Track Type and Frequency"
                    options={[
                      { value: "no-dups", label: "No Duplicates" },
                      { value: "all-tour", label: "All Tour Tracks" },
                    ]}
                    activeValues={[
                      ...(track.noDups ? ["no-dups"] : []),
                      ...(track.tourOnly ? ["all-tour"] : []),
                    ]}
                    onToggle={(v) => {
                      if (v === "no-dups") {
                        track.toggleNoDups();
                        trackEvent("Filter Races", { type: "No Duplicates" });
                      }
                      if (v === "all-tour") {
                        track.toggleTourOnly();
                        trackEvent("Filter Races", {
                          type: "All Tour Tracks",
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <TrackList tracks={track.tracks} />
          </section>
        </Container>
      </main>
    </>
  );
}
