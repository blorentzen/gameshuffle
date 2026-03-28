"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Container, Button, Tabs } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { PlayerCard } from "@/components/randomizer/PlayerCard";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { TrackList } from "@/components/randomizer/TrackList";
import { RaceSelector } from "@/components/randomizer/RaceSelector";
import { ItemRandomizer } from "@/components/randomizer/ItemRandomizer";
import { OnboardingPrompt } from "@/components/randomizer/OnboardingPrompt";
import { getRandomNumber } from "@/lib/randomizer";
import { saveConfig, getSharedConfig } from "@/lib/configs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useKartRandomizer } from "@/hooks/useKartRandomizer";
import { useTrackRandomizer } from "@/hooks/useTrackRandomizer";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { GameConfig, GameData, KartCombo } from "@/data/types";
import type { GameNightSetupConfig } from "@/data/config-types";

const CHAR_WEIGHT_OPTIONS = [
  { value: "Light", label: "Light" },
  { value: "Medium", label: "Medium" },
  { value: "Heavy", label: "Heavy" },
];

const DRIFT_OPTIONS = [
  { value: "Inward", label: "Inward Drift" },
  { value: "Outward", label: "Outward Drift" },
];

interface RandomizerClientProps {
  gameConfig: GameConfig;
  gameData: GameData;
  heroProps: {
    videoSrc?: string;
    videoWebm?: string;
    videoPoster?: string;
    backgroundImage?: string;
  };
}

export function RandomizerClient({
  gameConfig,
  gameData,
  heroProps,
}: RandomizerClientProps) {
  const [randomizerTab, setRandomizerTab] = useState("karts");
  const [initialItemSet, setInitialItemSet] = useState<Set<string> | null>(null);
  const [activeItems, setActiveItems] = useState<string[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [loadedConfigId, setLoadedConfigId] = useState<string | null>(null);
  const [loadedConfigName, setLoadedConfigName] = useState<string | null>(null);
  const { user } = useAuth();
  const { trackEvent } = useAnalytics();
  const searchParams = useSearchParams();
  const kart = useKartRandomizer(gameConfig.maxPlayers);
  const track = useTrackRandomizer(4);

  const hasCups = Boolean(gameData.cups && gameData.cups.length > 0);
  const hasItems = Boolean(gameData.items && gameData.items.length > 0);

  // Hydrate from Discord link if ?d= is present
  useEffect(() => {
    const discordData = searchParams.get("d");
    if (!discordData) return;

    try {
      const raw = JSON.parse(atob(discordData.replace(/-/g, "+").replace(/_/g, "/")));
      if (!Array.isArray(raw) || raw.length === 0) return;

      // Compact format from Discord: { n: playerName, c: charName, v: vehicleName, w: wheelName, g: gliderName }
      const findChar = (name: string) => gameData.characters.find((x) => x.name === name);
      const findVehicle = (name: string) => gameData.vehicles.find((x) => x.name === name);
      const findWheel = (name: string) => (gameData.wheels || []).find((x) => x.name === name);
      const findGlider = (name: string) => (gameData.gliders || []).find((x) => x.name === name);

      const players = raw.map((p: Record<string, string>) => {
        const character = findChar(p.c) || { name: p.c, img: "" };
        const vehicle = findVehicle(p.v) || { name: p.v, img: "" };
        const wheels = findWheel(p.w) || { name: p.w, img: "" };
        const glider = findGlider(p.g) || { name: p.g, img: "" };
        return {
          name: p.n,
          combo: { character, vehicle, wheels, glider } as KartCombo,
        };
      });

      kart.hydrate(players, [], []);
      trackEvent("Discord Link Loaded", { players: String(players.length) });
    } catch {
      // Invalid data — ignore
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate from saved config if ?config=ID is present
  useEffect(() => {
    const configId = searchParams.get("config");
    if (!configId || !user) return;

    const supabase = createClient();
    supabase
      .from("saved_configs")
      .select("id, config_name, config_data")
      .eq("id", configId)
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (!data || data.config_data?.type !== "game-night-setup") return;
        const cfg = data.config_data as GameNightSetupConfig;

        setLoadedConfigId(data.id);
        setLoadedConfigName(data.config_name);
        setSaveName(data.config_name);

        // Hydrate kart state in one dispatch
        kart.hydrate(
          (cfg.players || []).map((p) => ({
            name: p.name,
            combo: p.combo,
          })),
          cfg.charFilters || [],
          cfg.vehiFilters || []
        );

        // Hydrate track state in one dispatch
        if (cfg.tracks?.length > 0) {
          track.hydrate(
            cfg.tracks,
            cfg.trackCount || cfg.tracks.length,
            cfg.noDups || false,
            cfg.tourOnly || false
          );
        }

        // Hydrate items
        if (cfg.activeItems?.length > 0) {
          setInitialItemSet(new Set(cfg.activeItems));
          setActiveItems(cfg.activeItems);
        }

        trackEvent("Config Loaded", { configId });
      });
  }, [searchParams, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableTabs = [
    { id: "karts", label: "Karts" },
    ...(hasCups ? [{ id: "races", label: "Races" }] : []),
    ...(hasItems ? [{ id: "items", label: "Items" }] : []),
  ];

  const handleOnboardingComplete = useCallback(
    (result: {
      playerCount: number;
      raceCount: number;
      selectedTabs: string[];
    }) => {
      for (let i = 1; i < result.playerCount; i++) {
        kart.addPlayer();
      }
      if (result.selectedTabs.length > 0) {
        setRandomizerTab(result.selectedTabs[0]);
      }

      setTimeout(() => {
        if (result.selectedTabs.includes("karts")) {
          kart.randomizeAll(gameData);
        }
        if (result.selectedTabs.includes("races") && gameData.cups) {
          track.setCount(result.raceCount);
          track.randomize(gameData.cups);
        }
        if (result.selectedTabs.includes("items") && gameData.items) {
          const pool = gameData.items;
          const count = getRandomNumber(pool.length - 3) + 3;
          const picked = new Set<string>();
          while (picked.size < count) {
            picked.add(pool[getRandomNumber(pool.length)].name);
          }
          setInitialItemSet(picked);
        }
      }, 100);

      trackEvent("Onboarding Complete", {
        players: String(result.playerCount),
        tabs: result.selectedTabs.join(","),
      });
    },
    [kart, track, gameData, trackEvent]
  );

  const handleSaveSetup = async () => {
    if (!user) {
      window.location.href = "/signup";
      return;
    }
    if (!saveName.trim()) return;
    setSaving(true);
    setSaveResult(null);

    const configData: GameNightSetupConfig = {
      type: "game-night-setup",
      gameSlug: gameConfig.slug,
      players: kart.players.map((p) => ({
        name: p.name,
        combo: p.combo
          ? {
              character: { name: p.combo.character.name, img: p.combo.character.img },
              vehicle: { name: p.combo.vehicle.name, img: p.combo.vehicle.img },
              wheels: { name: p.combo.wheels.name, img: p.combo.wheels.img },
              glider: { name: p.combo.glider.name, img: p.combo.glider.img },
            }
          : null,
      })),
      charFilters: kart.charFilters,
      vehiFilters: kart.vehiFilters,
      tracks: track.tracks.map((t) => ({
        name: t.course.name,
        img: t.course.img,
        cupImg: t.cupImg,
      })),
      trackCount: track.count,
      noDups: track.noDups,
      tourOnly: track.tourOnly,
      activeItems,
    };

    if (loadedConfigId) {
      // Update existing config
      const supabase = createClient();
      const { error } = await supabase
        .from("saved_configs")
        .update({
          config_name: saveName.trim(),
          config_data: configData,
        })
        .eq("id", loadedConfigId)
        .eq("user_id", user.id);

      if (error) {
        setSaveResult(error.message);
      } else {
        setSaveResult("Updated!");
        setShowSaveModal(false);
        setLoadedConfigName(saveName.trim());
        trackEvent("Update Complete Setup");
        setTimeout(() => setSaveResult(null), 3000);
      }
    } else {
      // Save new config
      const result = await saveConfig(user.id, gameConfig.slug, saveName.trim(), configData);

      if (result.error) {
        setSaveResult(result.error);
      } else {
        setSaveResult("Saved!");
        setShowSaveModal(false);
        setLoadedConfigId(result.data?.id || null);
        setLoadedConfigName(saveName.trim());
        trackEvent("Save Complete Setup");
        setTimeout(() => setSaveResult(null), 3000);
      }
    }
    setSaving(false);
  };

  return (
    <>
      <OnboardingPrompt
        gameSlug={gameConfig.slug}
        maxPlayers={gameConfig.maxPlayers}
        availableTabs={availableTabs}
        onComplete={handleOnboardingComplete}
      />

      <VideoHero
        videoSrc={heroProps.videoSrc}
        videoWebm={heroProps.videoWebm}
        videoPoster={heroProps.videoPoster}
        backgroundImage={heroProps.backgroundImage}
        overlayOpacity={0.65}
        height="medium"
      >
        <Container>
          <div style={{ maxWidth: "600px" }}>
            <h1
              style={{
                fontSize: "clamp(2.4rem, 4vw, 4.8rem)",
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: "1rem",
              }}
            >
              {gameConfig.title}
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
          <div className="randomizer-controls">
            <Tabs
              variant="pills"
              size="medium"
              tabs={[
                { id: "karts", label: "Kart Randomizer", content: <></> },
                ...(hasCups
                  ? [
                      {
                        id: "races",
                        label: "Race Randomizer",
                        content: <></> as React.ReactNode,
                      },
                    ]
                  : []),
                ...(hasItems
                  ? [
                      {
                        id: "items",
                        label: "Item Randomizer",
                        content: <></> as React.ReactNode,
                      },
                    ]
                  : []),
              ]}
              activeTab={randomizerTab}
              onChange={(id) => setRandomizerTab(id)}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {saveResult && (
                <span style={{ fontSize: "13px", fontWeight: 600, color: saveResult === "Saved!" ? "#17A710" : "#C11A10" }}>
                  {saveResult}
                </span>
              )}
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  if (!user) { window.location.href = "/signup"; return; }
                  setShowSaveModal(true);
                }}
              >
                {loadedConfigName ? `Update: ${loadedConfigName}` : "Save Complete Setup"}
              </Button>
            </div>
          </div>

          {showSaveModal && (
            <div className="save-config-modal">
              <div className="save-config-modal__overlay" onClick={() => setShowSaveModal(false)} />
              <div className="save-config-modal__content">
                <h3>{loadedConfigId ? "Update Setup" : "Save Game Night Setup"}</h3>
                <p style={{ fontSize: "14px", color: "#606060" }}>
                  This saves your current players, kart builds, race selections, and item set as one complete setup.
                </p>

                <div className="save-setup-summary">
                  <div className="save-setup-summary__item">
                    <span className="account-card__label">Players</span>
                    <span className="account-card__value">{kart.players.length}</span>
                  </div>
                  <div className="save-setup-summary__item">
                    <span className="account-card__label">Karts Randomized</span>
                    <span className="account-card__value">{kart.players.filter(p => p.combo).length}</span>
                  </div>
                  <div className="save-setup-summary__item">
                    <span className="account-card__label">Tracks Selected</span>
                    <span className="account-card__value">{track.tracks.length}</span>
                  </div>
                  <div className="save-setup-summary__item">
                    <span className="account-card__label">Active Items</span>
                    <span className="account-card__value">{activeItems.length}</span>
                  </div>
                </div>

                {typeof saveResult === "string" && saveResult !== "Saved!" && (
                  <div className="auth-page__error">{saveResult}</div>
                )}

                <input
                  type="text"
                  placeholder="Name this setup (e.g. Friday Night Karts)"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="save-setup-input"
                  autoFocus
                />

                <div className="save-config-modal__actions">
                  <Button variant="primary" onClick={handleSaveSetup} disabled={saving || !saveName.trim()}>
                    {saving ? "Saving..." : loadedConfigId ? "Update Setup" : "Save Setup"}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowSaveModal(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Kart Randomizer */}
          {randomizerTab === "karts" && (
            <section>
              <div className="kart-intro">
                <div className="kart-intro__content">
                  <h2>Randomize your kart combo(s).</h2>
                  <p>
                    You can add as many players or combos you like up to{" "}
                    {gameConfig.maxPlayers} total.
                  </p>
                  <div className="kart-intro__actions">
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
                <div>
                  <h2 style={{ marginBottom: "2rem" }}>
                    Any special modifiers you want to add?
                  </h2>
                  <div className="filter-section">
                    {gameConfig.hasWeightFilter && (
                      <FilterGroup
                        label="Character Weights"
                        options={CHAR_WEIGHT_OPTIONS}
                        activeValues={kart.charFilters}
                        onToggle={(w) => {
                          kart.toggleCharFilter(w);
                          trackEvent("Filter Characters", { type: w });
                        }}
                      />
                    )}
                    {gameConfig.hasDriftFilter && (
                      <FilterGroup
                        label="Drift Type"
                        options={DRIFT_OPTIONS}
                        activeValues={kart.vehiFilters}
                        onToggle={(d) => {
                          kart.toggleVehiFilter(d);
                          trackEvent("Filter Vehicles", { type: d });
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="randomizer-grid">
                {kart.players.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    gameSlug={gameConfig.slug}
                    onRefresh={() => {
                      kart.refreshOne(player.id, gameData);
                      trackEvent("Refresh One Kart");
                    }}
                    onRemove={() => {
                      kart.removePlayer(player.id);
                      trackEvent("Remove Racer");
                    }}
                    onNameChange={(name) =>
                      kart.setPlayerName(player.id, name)
                    }
                    canRemove={kart.players.length > 1}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Race Randomizer */}
          {randomizerTab === "races" && hasCups && (
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
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (gameData.cups) {
                          track.randomize(gameData.cups);
                          trackEvent("Randomize Races", {
                            amount: track.count,
                          });
                        }
                      }}
                    >
                      Randomize Races
                    </Button>
                  </div>
                </div>
                <div>
                  <h2 style={{ marginBottom: "2rem" }}>
                    Any special modifiers you want to add?
                  </h2>
                  <div className="filter-section">
                    {gameConfig.hasTrackTypeFilter && (
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
                            trackEvent("Filter Races", {
                              type: "No Duplicates",
                            });
                          }
                          if (v === "all-tour") {
                            track.toggleTourOnly();
                            trackEvent("Filter Races", {
                              type: "All Tour Tracks",
                            });
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <TrackList tracks={track.tracks} />
            </section>
          )}

          {/* Item Randomizer */}
          {randomizerTab === "items" && hasItems && (
            <ItemRandomizer
              items={gameData.items!}
              gameSlug={gameConfig.slug}
              initialSelectedItems={initialItemSet}
              onSelectionChange={setActiveItems}
            />
          )}
        </Container>
      </main>
    </>
  );
}
