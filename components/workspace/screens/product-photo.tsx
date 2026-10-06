"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "@/app/catalogo/catalog.module.css";
import photos from "@/data/parts-catalog.json";

export function PhotoCredit({ image }: { image?: string }) {
  const photo = photos.find((photo) => photo.image === image);
  return photo ? (
    <a
      className={styles.photoCredit}
      href={photo.source}
      target="_blank"
      rel="noopener noreferrer"
    >
      Foto do modelo: {photo.credit}
    </a>
  ) : null;
}

export function ProductPhoto({ src, name }: { src: string; name: string }) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  return (
    <div className={styles.employeePartPhoto}>
      {failedFor === src ? (
        <span className={styles.photoUnavailable}>Foto indisponível</span>
      ) : (
        <Image
          src={src}
          alt={`Fotografia de ${name}`}
          fill
          sizes="(max-width: 640px) 90vw, (max-width: 1000px) 45vw, 400px"
          unoptimized
          className={styles.productPhoto}
          onError={() => setFailedFor(src)}
        />
      )}
    </div>
  );
}
