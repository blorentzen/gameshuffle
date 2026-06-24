import { Suspense } from "react";
import type { Metadata } from "next";
import { MessagesClient } from "@/components/social/MessagesClient";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return (
    <main className="messages-page">
      <Suspense fallback={null}>
        <MessagesClient />
      </Suspense>
    </main>
  );
}
