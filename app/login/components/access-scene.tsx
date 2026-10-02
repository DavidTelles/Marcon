import type { ReactNode } from "react";
import styles from "../login.module.css";

export function AccessScene({ children }: { children: ReactNode }) {
  return (
    <div className={styles.scene} aria-hidden="true">
      {children}
    </div>
  );
}
