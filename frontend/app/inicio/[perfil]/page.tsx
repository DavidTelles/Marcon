import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { roleLanding } from "@/lib/workspace-routes";
import { BrandLogo } from "@/app/components/brand-logo";
import { databaseEnabled } from "@/lib/db";

const introductions: Record<string, string> = {
  funcionario:
    "Este é seu espaço para acompanhar suas requisições de materiais.",
  lider:
    "Este é seu espaço para acompanhar as solicitações e o histórico do seu bloco.",
  almoxarifado:
    "Este é seu espaço para acompanhar o estoque e as requisições de materiais.",
  admin:
    "Este é seu espaço para acompanhar a operação e a gestão de colaboradores.",
};

export default async function ProfileHome({
  params,
}: {
  params: Promise<{ perfil: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { perfil } = await params;
  if (perfil !== user.role) redirect(`/inicio/${user.role}`);

  return (
    <main className="home-shell">
      <header className="home-header">
        <span className="brand-label">
          <BrandLogo /> SMARTWAY
        </span>
        <div className="home-account-actions">
          <Link href="/profile" className="secondary-button">Editar perfil</Link>
          <form action="/api/logout" method="post">
            <button className="secondary-button">Sair da conta</button>
          </form>
        </div>
      </header>
      <section className="home-content">
        <span className="section-number">PORTAL DO COLABORADOR</span>
        <div>
          <span className="demo-badge">{user.label}</span>
        </div>
        <h1>Olá, {user.name.split(" ")[0]}.</h1>
        <p>{introductions[user.role]}</p>
        <div className="welcome-card">
          <span className="success-label">Acesso confirmado</span>
          <h2>Encontre o material que precisa.</h2>
          <p>
            Consulte o catálogo, veja o saldo e abra os detalhes de cada item.
          </p>
          <Link href={roleLanding[user.role]} className="catalog-cta">
            Acessar painel <ArrowRight size={18} />
          </Link>
          <Link
            href={
              user.role === "funcionario" ? "/employee/request" : user.role === "almoxarifado" ? "/warehouse/stock/all/all" : roleLanding[user.role]
            }
            className="catalog-cta"
          >
            Explorar catálogo <ArrowRight size={18} />
          </Link>
          <p className="subtle">
            {databaseEnabled() ? "Conta ativa" : "Ambiente de demonstração"} · {user.name} · Matrícula {user.id}
          </p>
        </div>
      </section>
    </main>
  );
}
