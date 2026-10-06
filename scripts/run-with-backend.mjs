import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { backendTarget } from "../lib/backend-config.mjs";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Uso: node scripts/run-with-backend.mjs dev|start");
  process.exit(1);
}

const frontend = resolve(import.meta.dirname, "..");
// PORT in the shared .env belongs to Express. A platform-provided PORT still
// controls Next, and explicit Next CLI -p/--port flags take precedence.
const frontendPort = process.env.PORT;
nextEnv.loadEnvConfig(frontend, mode === "dev");
const target = backendTarget();
const startApi = target !== null && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname);
const backend = resolve(frontend, "backend");
const next = resolve(frontend, "node_modules", "next", "dist", "bin", "next");
const nodemon = resolve(
  backend,
  "node_modules",
  "nodemon",
  "bin",
  "nodemon.js",
);
if (startApi && !existsSync(resolve(backend, "node_modules", "dotenv", "package.json"))) {
  console.error(
    "Dependências do backend ausentes. Execute npm ci --prefix backend antes de iniciar.",
  );
  process.exit(1);
}
if (startApi && mode === "dev" && !existsSync(nodemon)) {
  console.error(
    "Instale as dependências de desenvolvimento: npm ci --prefix backend.",
  );
  process.exit(1);
}

const api = startApi ? spawn(
  process.execPath,
  mode === "dev"
    ? [
        nodemon,
        "--delay",
        "750ms",
        "--watch",
        "server.js",
        "--watch",
        "src",
        "--watch",
        "../lib/neon-db.mjs",
        "server.js",
      ]
    : ["server.js"],
  {
    cwd: backend,
    stdio: "inherit",
  },
) : null;
const web = spawn(process.execPath, [next, mode, ...process.argv.slice(3)], {
  cwd: frontend,
  stdio: "inherit",
  env: { ...process.env, PORT: frontendPort || "3000" },
});

let stopping = false;
function terminate(child) {
  if (!child) return;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform === "win32") {
    // Watchers and Next spawn server children: release their ports as well.
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );
    killer.on("error", () => child.kill());
    killer.on("exit", (code) => {
      if (code) child.kill();
    });
  } else child.kill();
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  terminate(api);
  terminate(web);
}

for (const [child, name] of [
  [api, "backend"],
  [web, "frontend"],
]) {
  if (!child) continue;
  child.on("error", (error) => {
    console.error(`Falha ao iniciar ${name}:`, error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
