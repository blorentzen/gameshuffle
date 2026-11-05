import { notFound } from "next/navigation";
import { MockMerch } from "./MockMerch";

// TEMPORARY mockup stage for the merch shop picks (2026-11-03). Dev only; delete after the screenshots.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MockMerch />;
}
