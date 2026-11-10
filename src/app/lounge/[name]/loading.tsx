import { PageOutline } from "@/components/loading/PageOutline";

/** Shown the moment the page is tapped, while it loads: a header band, then the shape of a player's season (the hub's own header belongs to the hub). */
export default function Loading() {
  return <PageOutline band="short" body="lounge" />;
}
