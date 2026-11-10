import { BrowseHero } from "@/components/events/BrowseHero";
import { PageOutline } from "@/components/loading/PageOutline";
import { DAILIES_HERO } from "./hero";

/** Shown the moment the page is tapped, while it loads: its own header, then the shape of the list. */
export default function Loading() {
  return <PageOutline hero={<BrowseHero {...DAILIES_HERO} />} body="list" />;
}
