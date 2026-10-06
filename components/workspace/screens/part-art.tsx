import {
  Boxes,
  Cog,
  Disc3,
  Package,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Part } from "@/lib/demo-data";
import styles from "@/app/catalogo/catalog.module.css";
import { ProductPhoto } from "./product-photo";

const icons: Record<string, LucideIcon> = {
  "ROL-6205-ZZ": Disc3,
  "PAR-M12-040": Wrench,
  "COR-A42": Cog,
  "RET-35527": Boxes,
};

export function PartArt({
  part,
  large = false,
}: {
  part: Part;
  large?: boolean;
}) {
  const Icon = icons[part.code] ?? Package;
  const artTone =
    part.quantity < part.minimum ? styles.artElectric : styles.artTools;
  return (
    <div
      className={`${styles.itemArt} ${large ? styles.largeArt : ""} ${artTone}`}
    >
      {part.image ? (
        <ProductPhoto src={part.image} name={part.name} />
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
      <span className={styles.artCode}>{part.code}</span>
    </div>
  );
}
