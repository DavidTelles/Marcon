import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Catálogo de materiais | Marcon",
  description:
    "Encontre materiais por nome ou código, confira o saldo e inicie uma requisição.",
};

export default function CatalogPage() {
  redirect("/employee/request");
}
