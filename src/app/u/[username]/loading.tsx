import { PageOutline } from "@/components/loading/PageOutline";

/** Shown the moment the page is tapped, while it loads: a header band, then the shape of a profile. */
export default function Loading() {
  return <PageOutline band="short" body="profile" />;
}
