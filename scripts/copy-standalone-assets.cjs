const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(standalone)) {
  console.warn("No .next/standalone — skip asset copy");
  process.exit(0);
}

copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
);
console.log("Copied public + .next/static into standalone");
