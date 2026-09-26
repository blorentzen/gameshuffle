/**
 * What the draw will actually produce, before the organizer commits to it.
 *
 * Pure, and built on the same two functions the real generators use
 * (`seedOrder` for brackets, the snake for heats), so the preview cannot
 * disagree with what happens on the night. A preview computed a second way is
 * worse than no preview: it teaches an organizer to trust something that is
 * not what will run.
 */

import { seedOrder } from "./bracket";

export interface PreviewGroup {
  label: string;
  /** Seed numbers, 1-based, in the order they sit in that match or heat. */
  seeds: (number | null)[];
}

export interface SeedingPreview {
  groups: PreviewGroup[];
  /** Set when the format makes seeding irrelevant, so the UI can say why
   *  instead of drawing a misleading diagram. */
  note?: string;
}

/** Mirrors splitHeats in heatMains.ts. Kept in step with it deliberately: if
 *  that changes, this must, and the test asserts they agree. */
function snake(count: number, heatCount: number): number[][] {
  const groups: number[][] = Array.from({ length: heatCount }, () => []);
  for (let i = 0; i < count; i++) {
    const pass = Math.floor(i / heatCount);
    const within = i % heatCount;
    groups[pass % 2 === 0 ? within : heatCount - 1 - within].push(i + 1);
  }
  return groups;
}

export function previewSeeding(args: {
  format: string;
  fieldSize: number;
  /** Heat to Mains only. */
  heatSize?: number;
}): SeedingPreview {
  const n = args.fieldSize;
  if (n < 2) return { groups: [], note: "Not enough entrants yet." };

  switch (args.format) {
    case "single_elim":
    case "double_elim": {
      const size = 2 ** Math.ceil(Math.log2(n));
      const order = seedOrder(size);
      const groups: PreviewGroup[] = [];
      for (let i = 0; i < order.length; i += 2) {
        const [a, b] = [order[i], order[i + 1]];
        groups.push({
          label: `Match ${i / 2 + 1}`,
          // A seed above the field size is a bye, shown as an empty slot rather
          // than a fake opponent.
          seeds: [a > n ? null : a, b > n ? null : b],
        });
      }
      return {
        groups,
        note: size > n ? `${size - n} ${size - n === 1 ? "bye goes" : "byes go"} to the top seeds.` : undefined,
      };
    }

    case "heat_mains": {
      const per = args.heatSize && args.heatSize > 0 ? args.heatSize : 4;
      const heatCount = Math.max(1, Math.round(n / per));
      return {
        groups: snake(n, heatCount).map((seeds, i) => ({
          label: `Heat ${String.fromCharCode(65 + i)}`,
          seeds,
        })),
      };
    }

    case "round_robin":
      return {
        groups: [],
        note: "Everyone plays everyone, so seeding does not change the fixtures. It is still stored, and breaks any tie at the end.",
      };

    default:
      // FFA points in a single lobby: everyone races together regardless.
      return {
        groups: [],
        note: "One lobby, so everyone plays together and the draw does not change who meets whom.",
      };
  }
}
