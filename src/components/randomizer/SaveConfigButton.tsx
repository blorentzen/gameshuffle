"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { SaveConfigModal } from "./SaveConfigModal";
import type { SavedConfigData } from "@/data/config-types";

interface SaveConfigButtonProps {
  randomizerSlug: string;
  getConfigData: () => SavedConfigData;
}

export function SaveConfigButton({
  randomizerSlug,
  getConfigData,
}: SaveConfigButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="small"
        onClick={() => {
          setSaved(false);
          setShowModal(true);
        }}
      >
        {saved ? "Saved!" : "Save Config"}
      </Button>

      {showModal && (
        <SaveConfigModal
          randomizerSlug={randomizerSlug}
          configData={getConfigData()}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />
      )}
    </>
  );
}
