import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopOrderPage } from "@/components/account/shop/ShopOrderPage";
import { parseOrderNumber } from "@/lib/store/access";

type Props = { params: Promise<{ view: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${decodeURIComponent(id).toUpperCase()}` };
}

/** /admin/shop/GS-1021: one shop order for staff (order tracking picks 2026-11-08). Only the shop has pages under a view. */
export default async function AdminItemPage({ params }: Props) {
  const { view, id } = await params;
  if (view !== "shop") notFound();
  const n = parseOrderNumber(decodeURIComponent(id));
  if (!n) notFound();
  return <ShopOrderPage code={`GS-${n}`} />;
}
