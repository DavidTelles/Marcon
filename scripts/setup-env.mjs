import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
for (const [example, target] of [
  [".env.example", ".env.local"],
  ["api/.env.example", "api/.env"],
]) {
  const destination = resolve(root, target);
  if (!existsSync(destination) && !(target === ".env.local" && existsSync(resolve(root, ".env")))) {
    copyFileSync(resolve(root, example), destination);
    console.log(`Criado ${target}; revise as credenciais.`);
  }
}
