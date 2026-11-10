import { BrowseHero } from "@/components/events/BrowseHero";
import { PageOutline } from "@/components/loading/PageOutline";
import { DUEL_HERO } from "./hero";

/** Shown the moment the page is tapped, while it loads: its own header, then the shape of what's coming. */
export default function Loading() {
  return <PageOutline hero={<BrowseHero {...DUEL_HERO} />} body="daily" />;
}
