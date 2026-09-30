import { copyFile, mkdir, readFile } from "node:fs/promises";
const source = new URL(
  "../node_modules/@vladmandic/human/models/",
  import.meta.url,
);
const target = new URL("../public/models/human/", import.meta.url);
await mkdir(target, { recursive: true });
for (const model of ["blazeface", "facemesh", "faceres"]) {
  const manifest = JSON.parse(
    await readFile(new URL(`${model}.json`, source), "utf8"),
  );
  for (const file of [
    `${model}.json`,
    ...manifest.weightsManifest.flatMap((group) => group.paths),
  ]) {
    if (!/^[\w.-]+$/.test(file)) throw new Error("Caminho de modelo inválido");
    await copyFile(new URL(file, source), new URL(file, target));
  }
}
console.log("Modelos faciais locais preparados (Human 3.3.6).");
