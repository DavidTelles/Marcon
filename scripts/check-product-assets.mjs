import fs from "node:fs/promises";
import sharp from "sharp";

const assets = JSON.parse(
  await fs.readFile("public/parts/manifest.json", "utf8"),
);
for (const asset of assets) {
  if (!/^\/parts\/[a-z0-9-]+\.webp$/.test(asset.path))
    throw new Error(`Caminho inválido: ${asset.code}`);
  const photo = await sharp(
    await fs.readFile(`public${asset.path}`),
  ).metadata();
  if (!photo.width || !photo.height || photo.format !== "webp")
    throw new Error(`Imagem inválida: ${asset.code}`);
}
console.log(
  `${assets.length} fotos de produtos verificadas em public/parts (incluídas no deploy).`,
);
