import {
  ArrowUpRight,
  BadgeCheck,
  Layers3,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { AccessScene } from "./access-scene";
import { BrandLogo } from "@/app/components/brand-logo";
import styles from "../login.module.css";

export function BrandPanel() {
  return (
    <section className={styles.brandPanel} aria-label="Marcon Smartway">
      <header className={styles.brandHeader}>
        <span className={styles.brandName}>
          <BrandLogo />
          <span className={styles.brandSubtitle}>Portal interno</span>
        </span>
        <span className={styles.productName}>
          SMARTWAY <ArrowUpRight size={14} aria-hidden="true" />
        </span>
      </header>

      <div className={styles.brandContent}>
        <span className={styles.brandEyebrow}>
          <span /> CONEXÕES QUE MOVEM
        </span>
        <h2>
          Menos etapas.
          <br />
          <span>Mais possibilidades.</span>
        </h2>
        <p>
          Seu dia a dia mais simples, com sua equipe
          <br className={styles.desktopBreak} /> e seus processos no mesmo
          lugar.
        </p>

        <AccessScene>
          <div className={styles.sceneGrid} />
          <div className={styles.sceneRing} />
          <div className={styles.cardStack}>
            <div className={styles.cardBack} />
            <div className={styles.cardMiddle} />
            <div className={styles.accessCard}>
              <div className={styles.cardHeader}>
                <Layers3 size={24} strokeWidth={1.5} />
                <span>SMARTWAY</span>
                <Radio size={24} strokeWidth={1.5} />
              </div>
              <div className={styles.cardChip}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.cardTitle}>
                Tudo começa
                <br />
                com uma conexão.
              </div>
              <div className={styles.cardFooter}>
                <BrandLogo compact decorative />
                <span>ACESSO DO COLABORADOR</span>
              </div>
            </div>
          </div>
          <div className={styles.floatingBadge}>
            <span>
              <BadgeCheck size={19} />
            </span>
            <div>
              Seu próximo passo<strong>Mais simples. Mais conectado.</strong>
            </div>
          </div>
        </AccessScene>
      </div>

      <footer className={styles.brandFooter}>
        <span>
          <ShieldCheck size={16} aria-hidden="true" /> Seu acesso. Seu espaço.
        </span>
        <span className={styles.footerDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </footer>
    </section>
  );
}
