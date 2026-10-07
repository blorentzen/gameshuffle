import type { Metadata } from "next";
import { WaitlistOfferClient } from "./WaitlistOfferClient";

export const metadata: Metadata = {
  title: "Your waitlist spot",
  robots: { index: false, follow: false },
};

/** Where a waitlist offer email lands: claim or pass, signed in or not. */
export default async function WaitlistOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <WaitlistOfferClient token={token} />;
}
