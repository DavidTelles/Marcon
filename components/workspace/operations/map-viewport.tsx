"use client";
import { useId, useState, type ReactNode } from "react";

/** Presentation only: coordinates and routing stay in the existing editor. */
export function MapViewport({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState(100);
  const id = useId();
  return (
    <div className="map-viewport">
      <div className="map-viewport-tools">
        <label htmlFor={id}>Ampliação da planta: {zoom}%</label>
        <input
          id={id}
          type="range"
          min="100"
          max="300"
          step="25"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
        <button
          type="button"
          className="button secondary"
          disabled={zoom === 100}
          onClick={() => setZoom(100)}
        >
          Ajustar à tela
        </button>
      </div>
      <p className="map-viewport-hint">
        Amplie para ler os pontos. Use a barra de rolagem ou deslize nas margens
        da planta para navegar.
      </p>
      <div
        className="map-viewport-scroll"
        role="region"
        aria-label="Planta com rolagem e ampliação"
        tabIndex={0}
      >
        <div style={{ width: `${zoom}%`, padding: "8px" }}>{children}</div>
      </div>
    </div>
  );
}
