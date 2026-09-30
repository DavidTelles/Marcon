import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <ProfileForm name={user.name} email={user.email} role={user.role} persistent={databaseEnabled()} />;
}
