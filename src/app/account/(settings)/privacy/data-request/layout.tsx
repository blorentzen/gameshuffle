import type { Metadata } from "next";

/** The signed-in privacy request form is a client page, so its browser title lives here. */
export const metadata: Metadata = { title: "Privacy request" };

export default function DataRequestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
