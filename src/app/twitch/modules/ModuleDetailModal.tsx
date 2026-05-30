"use client";

/**
 * Detail modal for a single module on /twitch/modules. Opens when
 * the streamer clicks the help icon on a module row. Shows:
 *
 *   - Long-form explanation
 *   - Every chat command the module ships
 *   - Other UI surfaces (hub, /live, dashboard, etc.)
 *   - Tunable parameters (platform-controlled flagged)
 *   - Compliance / age-gating notes
 *
 * Copy lives in `moduleDetails.ts`. The modal is presentation-only;
 * no mutations happen here.
 */

import { Modal } from "@empac/cascadeds";
import type { ModuleCatalogRow } from "@/lib/economy/modules/registry";
import {
  MODULE_DETAILS,
  type CommandActor,
  type ModuleDetail,
} from "./moduleDetails";

interface Props {
  isOpen: boolean;
  module: ModuleCatalogRow | null;
  onClose: () => void;
}

const ACTOR_LABEL: Record<CommandActor, string> = {
  everyone: "Everyone",
  player: "Players",
  crew: "Mods",
  host: "Host",
};

const COMPLIANCE_LABEL: Record<string, string> = {
  none: "",
  prediction_pool: "Prediction pool — region-gated",
  casino_style: "Casino-style — dormant",
};

export function ModuleDetailModal({ isOpen, module, onClose }: Props) {
  // The CDS Modal needs the dialog to render even when closed (for
  // animation), but our content depends on `module` being non-null.
  // Render a stub when null.
  if (!module) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Module details">
        <p>Loading…</p>
      </Modal>
    );
  }

  const detail: ModuleDetail | undefined = MODULE_DETAILS[module.module_key];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={module.display_name}
      size="large"
      primaryAction={{ label: "Close", onClick: onClose }}
    >
      <div className="module-detail">
        {/* Compliance / age-gate badges */}
        {(module.compliance_class !== "none" || module.age_gated) && (
          <div className="module-detail__badges">
            {module.compliance_class !== "none" && (
              <span className="module-detail__badge module-detail__badge--compliance">
                {COMPLIANCE_LABEL[module.compliance_class] ?? module.compliance_class}
              </span>
            )}
            {module.age_gated && (
              <span className="module-detail__badge module-detail__badge--age">
                18+
              </span>
            )}
          </div>
        )}

        {/* Long description */}
        <p className="module-detail__long">{detail?.long ?? module.description}</p>

        {/* Commands */}
        {detail?.commands && detail.commands.length > 0 && (
          <section className="module-detail__section">
            <h3>Chat commands</h3>
            <ul className="module-detail__commands">
              {detail.commands.map((cmd) => (
                <li key={cmd.trigger} className="module-detail__command">
                  <div className="module-detail__command-head">
                    <code className="module-detail__command-trigger">
                      {cmd.trigger}
                    </code>
                    <span className="module-detail__command-actor">
                      {ACTOR_LABEL[cmd.actor]}
                    </span>
                  </div>
                  <p className="module-detail__command-desc">{cmd.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Surfaces */}
        {detail?.surfaces && detail.surfaces.length > 0 && (
          <section className="module-detail__section">
            <h3>Where it shows up</h3>
            <ul className="module-detail__list">
              {detail.surfaces.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Config */}
        {detail?.config && detail.config.length > 0 && (
          <section className="module-detail__section">
            <h3>Configuration</h3>
            <ul className="module-detail__config">
              {detail.config.map((c, i) => (
                <li key={i} className="module-detail__config-row">
                  <div className="module-detail__config-name">
                    {c.name}
                    {c.platformOnly && (
                      <span className="module-detail__badge module-detail__badge--platform">
                        Platform-controlled
                      </span>
                    )}
                  </div>
                  <div className="module-detail__config-value">
                    <strong>Default:</strong> {c.default}
                    {c.range && (
                      <span>
                        {" "}
                        · <strong>Range:</strong> {c.range}
                      </span>
                    )}
                  </div>
                  {c.note && (
                    <p className="module-detail__config-note">{c.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notes */}
        {detail?.notes && detail.notes.length > 0 && (
          <section className="module-detail__section">
            <h3>Notes</h3>
            <ul className="module-detail__list">
              {detail.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        {detail?.specRef && (
          <p className="module-detail__spec-ref">
            Spec: <code>{detail.specRef}</code>
          </p>
        )}
      </div>
    </Modal>
  );
}
