"use client";

/**
 * /twitch/modules — interactive surface.
 *
 * Grouped by category for legibility. Each row carries a toggle and
 * the module's description; toggles flip optimistically and roll
 * back on server-action error.
 */

import { useState, useTransition } from "react";
import type {
  ModuleCatalogRow,
  CommunityModuleRow,
  ModuleKey,
} from "@/lib/economy/modules/registry";
import { toggleModuleAction } from "./actions";
import { ModuleDetailModal } from "./ModuleDetailModal";

interface Props {
  communityId: string;
  communitySlug: string;
  communityDisplayName: string | null;
  catalog: ModuleCatalogRow[];
  enablement: CommunityModuleRow[];
}

interface RowState extends ModuleCatalogRow {
  enabled: boolean;
}

const COMPLIANCE_LABEL: Record<string, string> = {
  prediction_pool: "Prediction Pool",
  casino_style: "Casino-style (dormant)",
  none: "",
};

export function ModulesManager({
  communityId,
  communitySlug,
  communityDisplayName,
  catalog,
  enablement,
}: Props) {
  const initialRows: RowState[] = catalog.map((m) => {
    const existing = enablement.find((e) => e.module_key === m.module_key);
    return { ...m, enabled: existing ? existing.enabled : m.default_enabled };
  });
  const [rows, setRows] = useState<RowState[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detailRow, setDetailRow] = useState<ModuleCatalogRow | null>(null);

  const grouped = groupByCategory(rows);

  const handleToggle = (moduleKey: string, nextEnabled: boolean) => {
    setError(null);
    // Optimistic flip.
    setRows((prev) =>
      prev.map((r) =>
        r.module_key === moduleKey ? { ...r, enabled: nextEnabled } : r,
      ),
    );
    startTransition(async () => {
      const result = await toggleModuleAction({
        communityId,
        moduleKey: moduleKey as ModuleKey,
        enabled: nextEnabled,
      });
      if (!result.ok) {
        // Roll back.
        setRows((prev) =>
          prev.map((r) =>
            r.module_key === moduleKey ? { ...r, enabled: !nextEnabled } : r,
          ),
        );
        setError(result.reason ?? "Couldn't save change.");
      }
    });
  };

  return (
    <div className="modules-manager">
      <header className="modules-manager__header">
        <h1>Modules</h1>
        <p className="modules-manager__subtitle">
          Community:{" "}
          <strong>{communityDisplayName ?? communitySlug}</strong>{" "}
          (<code>{communitySlug}</code>)
        </p>
        <p className="modules-manager__hint">
          Disable a module to hide its commands from chat, help, and the
          live page. Compliance restrictions (e.g. region gating on
          prediction markets) still apply when enabled.
        </p>
      </header>

      {error && (
        <p className="modules-manager__error" role="alert">
          {error}
        </p>
      )}

      {grouped.map(([category, items]) => (
        <section key={category} className="modules-manager__group">
          <h2>{capitalize(category)}</h2>
          <ul className="modules-manager__list">
            {items.map((m) => (
              <li key={m.module_key} className="modules-manager__row">
                <div className="modules-manager__meta">
                  <p className="modules-manager__name">
                    {m.display_name}
                    <button
                      type="button"
                      className="modules-manager__info-btn"
                      aria-label={`More about ${m.display_name}`}
                      title={`More about ${m.display_name}`}
                      onClick={() => setDetailRow(m)}
                    >
                      ?
                    </button>
                    {m.age_gated && (
                      <span className="modules-manager__badge"> 18+</span>
                    )}
                    {m.compliance_class !== "none" && (
                      <span className="modules-manager__badge modules-manager__badge--compliance">
                        {" "}{COMPLIANCE_LABEL[m.compliance_class] ?? m.compliance_class}
                      </span>
                    )}
                  </p>
                  <p className="modules-manager__desc">{m.description}</p>
                </div>
                <label className="modules-manager__toggle">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => handleToggle(m.module_key, e.target.checked)}
                    disabled={pending}
                  />
                  <span>{m.enabled ? "On" : "Off"}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ModuleDetailModal
        isOpen={!!detailRow}
        module={detailRow}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}

function groupByCategory(rows: RowState[]): Array<[string, RowState[]]> {
  const map = new Map<string, RowState[]>();
  for (const r of rows.sort((a, b) => a.sort_order - b.sort_order)) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return Array.from(map.entries());
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
