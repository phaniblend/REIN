const fs = require("fs");
const path = require("path");

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (/\.(ts|tsx)$/.test(e.name)) a.push(p);
  }
  return a;
}

const schema = fs.readFileSync("src/db/schema.ts", "utf8");
const schemaExports = [...schema.matchAll(/export const (\w+)/g)].map((m) => m[1]);
const files = walk("src").filter((f) => !f.includes("schema.ts"));
const problems = [];
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  const imp = t.match(/import \{([^}]+)\} from ["']@\/db\/schema["']/);
  if (!imp) continue;
  const names = imp[1]
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
  for (const n of names) {
    if (!schemaExports.includes(n)) problems.push({ f, n });
  }
}
console.log("schema exports:", schemaExports.join(", "));
console.log("schema import problems:", problems);

const gem = fs.readFileSync("src/lib/gemini.ts", "utf8");
const ge = [...gem.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
console.log("gemini exports:", ge);
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  const imp = t.match(/import \{([^}]+)\} from ["']@\/lib\/gemini["']/);
  if (!imp) continue;
  for (const n of imp[1].split(",").map((s) => s.trim())) {
    if (!ge.includes(n)) console.log("gemini miss", f, n);
  }
}

const avt = fs.readFileSync("src/lib/avt.ts", "utf8");
console.log(
  "avt exports:",
  [...avt.matchAll(/export async function (\w+)/g)].map((m) => m[1]),
);
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  const imp = t.match(/import \{([^}]+)\} from ["']@\/lib\/avt["']/);
  if (!imp) continue;
  for (const n of imp[1].split(",").map((s) => s.trim())) {
    console.log("avt import", f, n);
  }
}

const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
const mw = fs.readFileSync("src/middleware.ts", "utf8");
console.log("auth cookie", auth.match(/COOKIE = "([^"]+)"/)?.[1]);
console.log("mw cookie", mw.match(/cookies\.get\("([^"]+)"\)/)?.[1]);
