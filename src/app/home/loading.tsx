import { PageOutline } from "@/components/loading/PageOutline";

/** Shown the moment the page is tapped, while it loads: a welcome band, then the shape of Home. */
export default function Loading() {
  return <PageOutline band="tall" body="home" />;
}
