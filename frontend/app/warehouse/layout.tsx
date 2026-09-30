import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "almoxarifado") redirect(`/inicio/${user.role}`);
  return children;
}
