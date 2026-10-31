/**
 * The MMR card's icon for each piece (src/lib/mmr/pieces.ts holds the pieces themselves:
 * labels, groups and short values). Tabler icons, keyed by the same ids, so any layout
 * that maps over the pieces draws the same icon for each.
 */

import {
  IconChartLine, IconChevronsUp, IconDeviceGamepad2, IconFlag, IconFlag2, IconFlame, IconHistory, IconMapPin, IconMathAvg,
  IconPercentage, IconQuote, IconShield, IconStar, IconTargetArrow, IconTrendingUp, IconTrophy, IconUser, IconWorld, type Icon,
} from "@tabler/icons-react";
import type { Shown } from "@/lib/mmr/pieces";

export const PIECE_ICONS: Record<Shown, Icon> = {
  name: IconUser,
  cc: IconFlag2,
  game: IconDeviceGamepad2,
  division: IconShield,
  line: IconQuote,
  world: IconWorld,
  mmr: IconChartLine,
  country: IconMapPin,
  top: IconPercentage,
  peak: IconStar,
  progress: IconChevronsUp,
  delta: IconTrendingUp,
  tonight: IconChartLine,
  streak: IconFlame,
  goal: IconTargetArrow,
  last10: IconFlag,
  recent: IconHistory,
  events: IconTrophy,
  avg: IconMathAvg,
};
