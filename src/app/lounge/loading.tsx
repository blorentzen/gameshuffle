import { Skeleton } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { PageOutline } from "@/components/loading/PageOutline";
import { LOUNGE_HERO } from "./hero";

/** Shown the moment the page is tapped, while it loads: its own header with the search box's place held, then boards. */
export default function Loading() {
  return <PageOutline hero={<BrowseHero {...LOUNGE_HERO} actions={<Skeleton variant="rectangular" className="outline__search" />} />} body="lounge" />;
}
