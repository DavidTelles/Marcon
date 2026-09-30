import Image from "next/image";
import logo from "@/public/image.png";
import styles from "./brand-logo.module.css";

type BrandLogoProps = {
  compact?: boolean;
  decorative?: boolean;
};

export function BrandLogo({ compact = false, decorative = false }: BrandLogoProps) {
  return (
    <span className={compact ? styles.compact : styles.logo}>
      <Image
        src={logo}
        alt={decorative ? "" : "Marcon"}
        sizes={compact ? "44px" : "(max-width: 640px) 72px, 96px"}
        loading={compact ? "lazy" : "eager"}
        className={styles.image}
      />
    </span>
  );
}
