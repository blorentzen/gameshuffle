"use client";

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { saveConfig } from "@/lib/configs";
import type { SavedConfigData } from "@/data/config-types";

interface SaveConfigModalProps {
  randomizerSlug: string;
  configData: SavedConfigData;
  onClose: () => void;
  onSaved: () => void;
}

export function SaveConfigModal({
  randomizerSlug,
  configData,
  onClose,
  onSaved,
}: SaveConfigModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    setError(null);

    const result = await saveConfig(user.id, randomizerSlug, name.trim(), configData);

    if (result.error) {
      setError(result.error);
      setSaving(false);
    } else {
      onSaved();
    }
  };

  if (!user) {
    return (
      <div className="save-config-modal">
        <div className="save-config-modal__overlay" onClick={onClose} />
        <div className="save-config-modal__content">
          <h3>Save this config?</h3>
          <p>Create a free account to save your randomizer setups.</p>
          <div className="save-config-modal__actions">
            <a href="/signup">
              <Button variant="primary">Sign Up</Button>
            </a>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="save-config-modal">
      <div className="save-config-modal__overlay" onClick={onClose} />
      <div className="save-config-modal__content">
        <h3>Save Configuration</h3>
        {error && <div className="auth-page__error">{error}</div>}
        <Input
          type="text"
          placeholder="Config name (e.g. Family Game Night)"
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
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
