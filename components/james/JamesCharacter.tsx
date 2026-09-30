import { BrandLogo } from "@/app/components/brand-logo";
import styles from "./JamesCharacter.module.css";

export type JamesCharacterState =
  | "idle"
  | "waking"
  | "listening"
  | "processing"
  | "speaking"
  | "pointing"
  | "confirming"
  | "success"
  | "error";

// A multipart CSS 3D character: only the original, unmodified head mark is an
// image. Torso, shoulder joints, articulated arms and propulsion are geometry.
export function JamesCharacter({
  state = "idle",
  compact = false,
  options = false,
}: {
  state?: JamesCharacterState;
  compact?: boolean;
  options?: boolean;
}) {
  return (
    <div
      className={styles.scene}
      data-character-state={state}
      data-compact={compact || undefined}
      data-options={options || undefined}
      aria-hidden="true"
    >
      <div className={styles.shadow} />
      <div className={styles.robot}>
        <div className={styles.head}>
          <BrandLogo decorative />
        </div>
        <div className={styles.neck} />
        <div className={styles.torso}>
          <span className={styles.side} />
          <span className={styles.plate} />
          <span className={styles.core} data-james-core />
          <span className={styles.seam} />
        </div>
        <div className={`${styles.arm} ${styles.left}`}>
          <span className={styles.joint} />
          <span className={styles.forearm}>
            <i />
          </span>
        </div>
        <div className={`${styles.arm} ${styles.right}`}>
          <span className={styles.joint} />
          <span className={styles.forearm}>
            <i />
          </span>
        </div>
        <div className={styles.thruster}>
          <span />
          <i />
        </div>
      </div>
    </div>
  );
}
