"use client";

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { saveConfig } from "@/lib/configs";
import { getImagePath } from "@/lib/images";
import type { KartCombo } from "@/data/types";
import type { KartBuildConfig } from "@/data/config-types";

interface SaveKartBuildProps {
  combo: KartCombo;
  gameSlug: string;
}

export function SaveKartBuild({ combo, gameSlug }: SaveKartBuildProps) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return;

    if (!user) {
      window.location.href = "/signup";
      return;
    }

    setSaving(true);
    setError(null);

    const configData: KartBuildConfig = {
      type: "kart-build",
      gameSlug,
      character: { name: combo.character.name, img: combo.character.img },
      vehicle: { name: combo.vehicle.name, img: combo.vehicle.img },
      wheels: { name: combo.wheels.name, img: combo.wheels.img },
      glider: { name: combo.glider.name, img: combo.glider.img },
    };

    const result = await saveConfig(user.id, gameSlug, name.trim(), configData);

    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      setShowModal(false);
      setName("");
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  if (saved) {
    return (
      <span style={{ color: "#17A710", fontWeight: 600, fontSize: "12px" }}>
        Build saved!
      </span>
    );
  }

  return (
    <>
      <button
        className="save-build-btn"
        onClick={() => {
          if (!user) {
            window.location.href = "/signup";
            return;
          }
          setShowModal(true);
        }}
        title={user ? "Save this build" : "Sign up to save builds"}
      >
        Save Build
      </button>

      {showModal && (
        <div className="save-config-modal">
          <div className="save-config-modal__overlay" onClick={() => setShowModal(false)} />
          <div className="save-config-modal__content">
            <h3>Save Kart Build</h3>

            <div className="save-build-preview">
              <div className="save-build-preview__slot">
                <img src={getImagePath(combo.character.img)} alt={combo.character.name} />
                <span>{combo.character.name}</span>
              </div>
              <div className="save-build-preview__slot">
                <img src={getImagePath(combo.vehicle.img)} alt={combo.vehicle.name} />
                <span>{combo.vehicle.name}</span>
              </div>
              <div className="save-build-preview__slot">
                <img src={getImagePath(combo.wheels.img)} alt={combo.wheels.name} />
                <span>{combo.wheels.name}</span>
              </div>
              <div className="save-build-preview__slot">
                <img src={getImagePath(combo.glider.img)} alt={combo.glider.name} />
                <span>{combo.glider.name}</span>
              </div>
            </div>

            {error && <div className="auth-page__error">{error}</div>}

            <Input
              type="text"
              placeholder="Name this build (e.g. My Main)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <div className="save-config-modal__actions">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving..." : "Save Build"}
              </Button>
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
