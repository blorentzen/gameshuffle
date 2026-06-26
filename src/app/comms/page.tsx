import { Suspense } from "react";
import type { Metadata } from "next";
import { CommsCenter } from "@/components/social/CommsCenter";

export const metadata: Metadata = {
  title: "Comms Center",
  robots: { index: false, follow: false },
};

export default function CommsPage() {
  return (
    <main className="comms-page">
      <Suspense fallback={null}>
        <CommsCenter />
      </Suspense>
    </main>
  );
}
