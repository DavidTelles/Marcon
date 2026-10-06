import { spawn } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const args of [["ci"], ["ci", "--prefix", "backend"]]) {
  const child = spawn(npm, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  if (code !== 0) process.exit(code || 1);
}
