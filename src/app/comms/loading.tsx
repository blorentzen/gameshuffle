import { PageOutline } from "@/components/loading/PageOutline";

/** Shown the moment the page is tapped, while it loads: the shape of the inbox. */
export default function Loading() {
  return <PageOutline body="list" />;
}
