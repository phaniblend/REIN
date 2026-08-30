#!/usr/bin/env node
/**
 * Railway release: push Drizzle schema, then start Next standalone server.
 * Falls back to `next start` if standalone output is missing.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

console.log("→ drizzle-kit push");
run("npx", ["drizzle-kit", "push", "--force"]);

const standalone = path.join(process.cwd(), ".next", "standalone", "server.js");
if (fs.existsSync(standalone)) {
  console.log("→ next standalone");
  // standalone server expects assets relative to its folder
  process.chdir(path.dirname(standalone));
  require(standalone);
} else {
  console.log("→ next start");
  run("npx", ["next", "start", "-p", process.env.PORT || "3000"]);
}
