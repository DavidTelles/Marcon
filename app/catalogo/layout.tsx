import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid, LogOut, UserRound } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import { roleLanding } from "@/lib/workspace-routes";
import { BrandLogo } from "@/app/components/brand-logo";
import styles from "./catalog.module.css";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { MobileBrandMenu } from "@/components/workspace/mobile-brand-menu";

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (databaseEnabled()) redirect(user.role === "funcionario" ? "/employee/request" : roleLanding[user.role]);

  return (
    <div className={styles.appShell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <MobileBrandMenu role={user.role} />
          <Link
            href={roleLanding[user.role]}
            className={styles.brandLink}
            aria-label="Marcon — página inicial"
          >
            <BrandLogo />
            <span>SMARTWAY</span>
          </Link>
          <nav className={styles.topnav} aria-label="Navegação principal">
            <Link className={styles.activeNav} href="/catalogo">
              <LayoutGrid size={17} /> Catálogo
            </Link>
            <span className={styles.navNote}>
              Materiais para o seu dia a dia
            </span>
          </nav>
          <div className={styles.account}>
            <ThemeToggle />
            <span className={styles.accountName}>
              <UserRound size={16} /> {user.name.split(" ")[0]}
            </span>
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className={styles.logout}
                aria-label="Sair da conta"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
