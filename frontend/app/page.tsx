import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { roleLanding } from "@/lib/workspace-routes";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? roleLanding[user.role] : "/login");
}
