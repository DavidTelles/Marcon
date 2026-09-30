import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { EmployeeIdentityProvider } from "@/components/workspace/employee-identity";

export default async function DepartmentHeadLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "lider") redirect(`/inicio/${user.role}`);
  return <EmployeeIdentityProvider name={user.name} block={user.block}>{children}</EmployeeIdentityProvider>;
}
