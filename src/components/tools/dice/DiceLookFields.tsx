"use client";

/**
 * The dice look editor (table, color, material, brand), shared by the free
 * dice page and Streaming ▸ Overlay ▸ Tool looks so a look means the same
 * thing in both places. `stream` adds the stream-only settings.
 */

import { Switch } from "@empac/cascadeds";
import { ToolSetting } from "@/components/tools/ToolLayout";
import { ChoiceChips, ProLookNote } from "@/components/tools/looks/LookControls";
import { LookColorPicker } from "@/components/tools/looks/LookColorPicker";
import { DICE_COLORS, DICE_MATERIALS, DICE_TABLES, type DiceLook, type LookBrand } from "@/lib/tools/looks";

const COUNTS = [1, 2, 3, 4, 5, 6];

export function DiceLookFields({ look, onChange, pro, brand, stream = false, from = "dice-looks" }: {
  look: DiceLook;
  onChange: (next: DiceLook) => void;
  pro: boolean;
  brand?: LookBrand | null;
  /** Tool looks: the default count and the stream table switch. */
  stream?: boolean;
  from?: string;
}) {
  const set = <K extends keyof DiceLook>(k: K, v: DiceLook[K]) => onChange({ ...look, [k]: v });
  const branded = pro && look.matchBrand;
  return (
    <>
      {stream && (
        <ToolSetting label="Dice to roll">
          <ChoiceChips choices={COUNTS.map((n) => ({ value: n, label: String(n) }))} value={look.defaultCount} onChange={(n) => set("defaultCount", n)} />
        </ToolSetting>
      )}
      <ToolSetting label="Table">
        <ChoiceChips choices={DICE_TABLES.map((t) => ({ value: t.id, label: t.label }))} value={look.table} onChange={(v) => set("table", v)} />
      </ToolSetting>
      {stream && (
        <Switch label="Show the table on stream" checked={look.showTable} onChange={(e) => set("showTable", e.target.checked)} />
      )}
      <ToolSetting label="Dice color" note={branded ? `Using ${brand?.name && !brand.isDefault ? `your ${brand.name} theme` : "your brand theme"}.` : undefined}>
        <LookColorPicker presets={DICE_COLORS} value={look.dieColor} onChange={(c) => set("dieColor", c)} disabled={branded} label="Dice color" />
      </ToolSetting>
      <ToolSetting label="Material" note={stream ? undefined : "The material shows when the dice roll with physics."}>
        <ChoiceChips choices={DICE_MATERIALS.map((m) => ({ value: m.id, label: m.label, pro: m.pro }))} value={pro ? look.material : "smooth"} onChange={(v) => set("material", v)} pro={pro} />
      </ToolSetting>
      <Switch
        label={pro ? "Match my brand" : "Match my brand (GS Pro)"}
        checked={branded}
        disabled={!pro}
        onChange={(e) => set("matchBrand", e.target.checked)}
      />
      {!pro && <ProLookNote from={from} what="Wooden and rust dice and your brand colors" />}
    </>
  );
}
