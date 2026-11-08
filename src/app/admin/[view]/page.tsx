import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPane } from "@/components/admin/AdminPane";
import { adminItem } from "@/lib/admin/items";

type Props = { params: Promise<{ view: string }>; searchParams: Promise<{ tab?: string }> };

/** The browser tab names the open screen ("Orders · Admin | GameShuffle"). */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const item = adminItem((await params).view);
  const tab = (await searchParams).tab;
  const screen = item?.tabs?.find((t) => t.id === tab) ?? item?.tabs?.[0];
  return { title: screen?.label ?? item?.label ?? "Admin" };
}

/** One admin view. */
export default async function AdminViewPage({ params }: Props) {
  const view = (await params).view;
  if (!adminItem(view)) notFound();
  return <AdminPane item={view} />;
}
