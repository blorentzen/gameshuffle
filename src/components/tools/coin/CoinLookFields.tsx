"use client";

/**
 * The coin look editor (finish, a letter for each side, and the GS Pro
 * picture face and brand colors), shared by the free coin page and
 * Streaming ▸ Overlay ▸ Tool looks (item 12).
 */

import { Input, Switch } from "@empac/cascadeds";
import { ToolSetting } from "@/components/tools/ToolLayout";
import { ChoiceChips, ProLookNote } from "@/components/tools/looks/LookControls";
import { LookColorPicker } from "@/components/tools/looks/LookColorPicker";
import { COIN_COLORS, COIN_FINISHES, type CoinLook } from "@/lib/tools/looks";

export function CoinLookFields({ look, onChange, pro, hasPicture, from = "coin-looks" }: {
  look: CoinLook;
  onChange: (next: CoinLook) => void;
  pro: boolean;
  /** The account has a profile picture to put on the coin. */
  hasPicture: boolean;
  from?: string;
}) {
  const set = <K extends keyof CoinLook>(k: K, v: CoinLook[K]) => onChange({ ...look, [k]: v });
  const branded = pro && look.matchBrand;
  // Two characters at most; an emoji counts as one.
  const letter = (v: string) => Array.from(v).slice(0, 2).join("");
  return (
    <>
      <ToolSetting label="Finish" note={branded ? "Using your brand colors." : undefined}>
        <ChoiceChips choices={COIN_FINISHES.map((f) => ({ value: f.id, label: f.label }))} value={look.finish} onChange={(v) => set("finish", v)} />
      </ToolSetting>
      {look.finish === "color" && !branded && (
        <ToolSetting label="Coin color">
          <LookColorPicker presets={COIN_COLORS} value={look.color} onChange={(c) => set("color", c)} label="Coin color" />
        </ToolSetting>
      )}
      <div className="look-letters">
        <Input floatingLabel="Heads letter" value={look.heads} maxLength={4} onChange={(e) => set("heads", letter(e.target.value))} fullWidth />
        <Input floatingLabel="Tails letter" value={look.tails} maxLength={4} onChange={(e) => set("tails", letter(e.target.value))} fullWidth />
      </div>
      <Switch
        label={pro ? "Your picture on heads" : "Your picture on heads (GS Pro)"}
        checked={pro && look.picture}
        disabled={!pro}
        onChange={(e) => set("picture", e.target.checked)}
        helperText={pro && look.picture && !hasPicture ? "Add a profile picture in Account ▸ Profile." : undefined}
      />
      <Switch
        label={pro ? "Match my brand" : "Match my brand (GS Pro)"}
        checked={branded}
        disabled={!pro}
        onChange={(e) => set("matchBrand", e.target.checked)}
      />
      {!pro && <ProLookNote from={from} what="A picture on your coin and your brand colors" />}
    </>
  );
}
