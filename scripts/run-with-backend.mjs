import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Uso: node scripts/run-with-backend.mjs dev|start");
  process.exit(1);
}

const frontend = resolve(import.meta.dirname, "..");
const backend = resolve(frontend, "backend");
const next = resolve(frontend, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(resolve(backend, "node_modules", "dotenv", "package.json"))) {
  console.error("Dependências do backend ausentes. Execute npm ci --prefix backend antes de iniciar.");
  process.exit(1);
}

const api = spawn(process.execPath, ["server.js"], {
  cwd: backend,
  stdio: "inherit",
});
const web = spawn(process.execPath, [next, mode, ...process.argv.slice(3)], {
  cwd: frontend,
  stdio: "inherit",
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (!api.killed) api.kill();
  if (!web.killed) web.kill();
}

for (const [child, name] of [[api, "backend"], [web, "frontend"]]) {
  child.on("error", (error) => {
    console.error(`Falha ao iniciar ${name}:`, error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
