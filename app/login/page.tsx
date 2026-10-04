import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { BrandPanel } from "./components/brand-panel";
import LoginForm from "./login-form";
import styles from "./login.module.css";
import { roleLanding } from "@/lib/workspace-routes";
import { ThemeToggle } from "@/components/workspace/theme-toggle";

export default async function LoginPage() {
  const user = await currentUser();

  if (user) {
    redirect(roleLanding[user.role]);
  }

  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#login-title">
        Ir para o login
      </a>
      <BrandPanel />
      <section className={styles.accessPanel} aria-labelledby="login-title">
        <header className={styles.accessHeader}>
          <span>Portal do colaborador</span>
          <div className={styles.accessControls}>
            <span className={styles.demoBadge}>Acesso seguro</span>
            <ThemeToggle />
          </div>
        </header>
        <div className={styles.formContainer}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>BEM-VINDO À MARCON</span>
            <h1 id="login-title" tabIndex={-1}>
              Bom ter você aqui.
            </h1>
            <p>Acesse sua conta e continue de onde parou.</p>
          </div>
          <LoginForm demoMode={false} />
        </div>
        <footer className={styles.accessFooter}>
          <span>Marcon · Smartway</span>
          <span>Pessoas e processos conectados.</span>
        </footer>
      </section>
    </main>
  );
}
