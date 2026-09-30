import Workspace from "@/components/workspace/workspace";
export default async function Page({
  params,
}: PageProps<"/employee/request/[part]/[id]">) {
  const { id } = await params;
  return <Workspace key={id} role="funcionario" page="nova" routePart={id} />;
}
