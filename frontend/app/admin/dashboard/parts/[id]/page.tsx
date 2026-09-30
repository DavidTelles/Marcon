import Workspace from "@/components/workspace/workspace";
export default async function Page({
  params,
}: PageProps<"/admin/dashboard/parts/[id]">) {
  const { id } = await params;
  return (
    <Workspace
      role="admin"
      page="dashboard"
      routePart={id}
      dashboardView="parts"
    />
  );
}
