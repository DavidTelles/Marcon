import Workspace from "@/components/workspace/workspace";
export default async function Page({
  params,
}: PageProps<"/warehouse/stock/[part]/[id]">) {
  const { id } = await params;
  return <Workspace role="almoxarifado" page="estoque" routePart={id} />;
}
