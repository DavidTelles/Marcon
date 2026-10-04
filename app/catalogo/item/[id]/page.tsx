import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { roleLanding } from "@/lib/workspace-routes";

export const metadata: Metadata = { title: "Detalhe do item | Marcon" };

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  redirect(
    user.role === "funcionario"
      ? `/employee/request/material/${encodeURIComponent(id)}`
      : roleLanding[user.role],
  );
}
