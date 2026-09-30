import type { Metadata } from "next";
import { ItemDetail } from "./item-detail";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Detalhe do item | Marcon" };

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  return <ItemDetail id={id} canRequest={user?.role === "funcionario"} />;
}
