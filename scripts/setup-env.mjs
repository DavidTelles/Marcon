import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const example = resolve(root, ".env.example");
const destination = resolve(root, ".env");
if (!existsSync(destination)) {
  copyFileSync(example, destination);
  console.log("Criado .env compartilhado; revise as credenciais.");
}
