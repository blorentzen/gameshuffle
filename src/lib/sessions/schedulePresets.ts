/**
 * Spec 02 §170 layered-control schedule presets. A preset bundles a schedule +
 * fan-out behavior into one choice; the raw per-transition controls live behind
 * "Custom". Presets and the advanced UI both write the SAME engine fields
 * (`scheduled_at` / notify → `announce_at` / `open_mode` / `recurrence`), so the
 * save path is unchanged. Client-safe (pure).
 */

export type SchedulePreset =
  | "manual"
  | "announce_only"
  | "auto_open"
  | "weekly"
  | "custom";

export type NotifyPreset = "none" | "30m" | "1h" | "2h" | "24h" | "custom";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export const SCHEDULE_PRESETS: { value: SchedulePreset; label: string; help: string }[] = [
  {
    value: "manual",
    label: "When I go live",
    help: "No set time. The lobby opens when you press Start, or when you go live on Twitch. Best for spur-of-the-moment streams.",
  },
  {
    value: "auto_open",
    label: "Scheduled, starts on its own",
    help: "Pick a start time. GameShuffle posts a heads-up an hour before, then opens the lobby the moment it arrives.",
  },
  {
    value: "announce_only",
    label: "Scheduled, I start it",
    help: "Pick a start time. GameShuffle posts a heads-up an hour before; you press Start when you're ready.",
  },
  {
    value: "weekly",
    label: "Weekly game night",
    help: "Every week: a heads-up an hour before, then it starts on its own. Set the first start time below.",
  },
  {
    value: "custom",
    label: "Custom",
    help: "Set each part yourself: the start time, how early the heads-up goes out, whether it starts on its own, the lobby and repeats.",
  },
];

/** Whether a preset REQUIRES a start time. The bundled scheduled presets do;
 *  manual has none, and custom allows either (empty = manual-like). */
export function presetNeedsSchedule(p: SchedulePreset): boolean {
  return p === "auto_open" || p === "announce_only" || p === "weekly";
}

/** The engine fields a bundled preset sets. `null` = leave fields as-is
 *  (Custom), so the raw controls stay in charge. */
export function bundledScheduleFields(
  p: SchedulePreset,
): { notify: NotifyPreset; autoActivate: boolean; recurrence: Recurrence } | null {
  switch (p) {
    case "manual":
      return { notify: "none", autoActivate: false, recurrence: "none" };
    case "auto_open":
      return { notify: "1h", autoActivate: true, recurrence: "none" };
    case "announce_only":
      return { notify: "1h", autoActivate: false, recurrence: "none" };
    case "weekly":
      return { notify: "1h", autoActivate: true, recurrence: "weekly" };
    default:
      return null; // custom
  }
}

/** Reverse-detect the preset that matches a session's stored schedule fields,
 *  so the editor opens on the right choice. Anything that doesn't line up with
 *  a bundle resolves to "custom". */
export function detectSchedulePreset(args: {
  hasSchedule: boolean;
  autoOpen: boolean;
  recurrence: Recurrence;
  notify: NotifyPreset;
}): SchedulePreset {
  if (!args.hasSchedule) return "manual";
  if (args.recurrence === "weekly" && args.autoOpen && args.notify === "1h") return "weekly";
  if (args.recurrence === "none" && args.notify === "1h") {
    if (args.autoOpen) return "auto_open";
    return "announce_only";
  }
  return "custom";
}
