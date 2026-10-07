import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";

/** Decode the pixels, never OCR the number printed beside a QR. */
export async function decodeQrLabels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  yieldRow: () => Promise<void> = async () => {},
): Promise<string[]> {
  const found = new Set(await decodeQrPass(pixels, width, height, yieldRow));
  // A second axis avoids finder-pattern interference between neighboring labels.
  const rotated = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rotated[x * height + height - 1 - y] = pixels[y * width + x];
  for (const value of await decodeQrPass(rotated, height, width, yieldRow)) found.add(value);
  return [...found];
}

async function decodeQrPass(
  pixels: Uint8ClampedArray, width: number, height: number,
  yieldRow: () => Promise<void>,
): Promise<string[]> {
  const found = new Set<string>();
  const reader = new QRCodeReader();
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  // Overlapping windows allow several labels and codes crossing a window edge.
  for (const divisions of [1, 2, 4, 8]) {
    if (Math.min(width, height) / divisions < 110) break;
    for (let row = 0; row < divisions; row++) {
      await yieldRow();
      for (let col = 0; col < divisions; col++) {
        const left = Math.max(0, Math.floor(((col - 0.15) * width) / divisions));
        const top = Math.max(0, Math.floor(((row - 0.15) * height) / divisions));
        const right = Math.min(width, Math.ceil(((col + 1.15) * width) / divisions));
        const bottom = Math.min(height, Math.ceil(((row + 1.15) * height) / divisions));
        const w = right - left, h = bottom - top;
        const source = new Uint8ClampedArray(w * h);
        for (let y = 0; y < h; y++)
          source.set(pixels.subarray((top + y) * width + left, (top + y) * width + right), y * w);
        let min = 255, max = 0;
        for (const p of source) { min = Math.min(min, p); max = Math.max(max, p); }
        // The last variant recovers faded print, including the supplied 1795 label.
        for (const variant of [0, 1, 2]) {
          const data = Uint8ClampedArray.from(source, (p) =>
            variant === 0 ? p : variant === 1 ? 255 - p :
              (p - min) * 255 / Math.max(1, max - min) < 180 ? 0 : 255,
          );
          for (let attempt = 0; attempt < 32; attempt++) {
            try {
              const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(data, w, h))), hints);
              found.add(result.getText());
              const points = result.getResultPoints();
              if (points.length < 3) break;
              const xs = points.slice(0, 3).map((p) => p.getX());
              const ys = points.slice(0, 3).map((p) => p.getY());
              xs.push(xs[0] + xs[2] - xs[1]);
              ys.push(ys[0] + ys[2] - ys[1]);
              const margin = Math.max(12, (Math.max(...xs) - Math.min(...xs)) * 0.3);
              const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin));
              const x1 = Math.min(w, Math.ceil(Math.max(...xs) + margin));
              const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin));
              const y1 = Math.min(h, Math.ceil(Math.max(...ys) + margin));
              // Remove this detected QR so the next pass can discover another.
              for (let y = y0; y < y1; y++) data.fill(255, y * w + x0, y * w + x1);
            } catch { break; }
            finally { reader.reset(); }
          }
        }
      }
    }
  }
  return [...found];
}
