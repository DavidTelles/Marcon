import {
  Cable,
  Drill,
  Glasses,
  HardHat,
  NotebookPen,
  PlugZap,
  Ruler,
  Shield,
  type LucideIcon,
} from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import styles from "./catalog.module.css";
import { ProductPhoto } from "@/components/workspace/screens/product-photo";

const icons: Record<string, LucideIcon> = {
  "EPI-001": HardHat,
  "EPI-002": Shield,
  "FER-014": Drill,
  "FER-021": Ruler,
  "ELE-008": Cable,
  "ELE-011": PlugZap,
  "ESC-003": NotebookPen,
  "EPI-009": Glasses,
};

export function ItemArt({
  item,
  large = false,
}: {
  item: CatalogItem;
  large?: boolean;
}) {
  const Icon = icons[item.id] ?? Shield;
  return (
    <div
      className={`${styles.itemArt} ${large ? styles.largeArt : ""} ${styles[`art${item.category === "Proteção" ? "Protection" : item.category === "Ferramentas" ? "Tools" : item.category === "Elétrica" ? "Electric" : "Office"}`]}`}
    >
      {item.image ? (
        <ProductPhoto src={item.image} name={item.name} />
      ) : (
        <>
          <div className={styles.artGrid} />
          <div className={styles.artBack} />
          <div className={styles.artMid} />
          <div className={styles.artFront}>
            <Icon size={large ? 110 : 70} strokeWidth={1.35} />
          </div>
        </>
      )}
      <span className={styles.artCode}>{item.id}</span>
    </div>
  );
}
