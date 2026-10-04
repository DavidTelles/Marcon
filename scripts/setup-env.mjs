import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function setupEnv(root) {
  const destination = resolve(root, ".env");
  if (!existsSync(destination)) {
    copyFileSync(resolve(root, ".env.example"), destination);
    console.log("Criado .env compartilhado; revise as credenciais.");
  }
  let content = readFileSync(destination, "utf8");
  let changed = false;
  for (const key of ["SESSION_SECRET", "JWT_SECRET"]) {
    const pattern = new RegExp(`^${key}=[^\\r\\n]*`, "m");
    const line = content.match(pattern)?.[0];
    const value = line?.slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value && value.length >= 32 && !/^(troque_|change-|gere-|banana)/i.test(value)) continue;
    const replacement = `${key}=${randomBytes(32).toString("hex")}`;
    content = line ? content.replace(pattern, replacement) : `${content.trimEnd()}\n${replacement}\n`;
    changed = true;
    console.log(`${key} configurado com um segredo aleatório.`);
  }
  if (changed) writeFileSync(destination, content);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  setupEnv(resolve(import.meta.dirname, ".."));
}
