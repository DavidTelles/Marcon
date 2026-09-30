import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { roleLanding } from "@/lib/workspace-routes";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect(roleLanding[user.role]);
  return children;
}
