import Workspace from "@/components/workspace/workspace";
import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: PageProps<"/warehouse/dashboard">) {
  const { view } = await searchParams;
  if (view === "compra" || view === "recomendacoes") {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams))
      if (key !== "view" && typeof value === "string") q.set(key, value);
    redirect(
      `/warehouse/${view === "compra" ? "purchases" : "recommendations"}${q.size ? "?" + q : ""}`,
    );
  }
  return <Workspace role="almoxarifado" page="dashboard" />;
}
