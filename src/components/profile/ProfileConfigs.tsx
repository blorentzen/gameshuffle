"use client";

/**
 * Public-profile "Shared configs" — a read-only list whose "View" opens a
 * modal previewing the config's visuals (kart combos, tracks, items, etc.).
 * Distinct from the owner-only SetupCard (which carries delete/copy actions).
 */

import { useState } from "react";
import { Button, Modal } from "@empac/cascadeds";
import { ConfigVisual } from "@/components/configs/ConfigVisual";

export interface ProfileConfig {
  id: string;
  config_name: string;
  randomizer_slug: string;
  share_token: string | null;
  created_at: string;
  config_data: Record<string, unknown> | null;
}

export function ProfileConfigs({ configs }: { configs: ProfileConfig[] }) {
  const [active, setActive] = useState<ProfileConfig | null>(null);

  return (
    <>
      <h2 className="profile-section-heading">Shared configs</h2>
      <div className="config-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {configs.map((c) => (
          <div key={c.id} className="config-list-item">
            <div>
              <span className="account-card__value">{c.config_name}</span>
              <br />
              <span className="account-card__label">
                {((c.config_data?.type as string | undefined) || c.randomizer_slug || "").replace(/-/g, " ")}
              </span>
            </div>
            <Button variant="secondary" size="small" onClick={() => setActive(c)}>
              View
            </Button>
          </div>
        ))}
      </div>

      {active && (
        <Modal
          isOpen
          onClose={() => setActive(null)}
          title={active.config_name}
          size="large"
          secondaryAction={{ label: "Close", onClick: () => setActive(null) }}
          primaryAction={
            active.share_token
              ? {
                  label: "Open full config",
                  onClick: () => {
                    window.location.href = `/s/${active.share_token}`;
                  },
                }
              : undefined
          }
        >
          <ConfigVisual cfg={active.config_data ?? {}} />
        </Modal>
      )}
    </>
  );
}
