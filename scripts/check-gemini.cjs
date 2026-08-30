const fs = require("fs");
const g = fs.readFileSync("src/lib/gemini.ts", "utf8");
console.log(
  "exports",
  [...g.matchAll(/export async function (\w+)/g)].map((m) => m[1]),
);
console.log("first line", g.split("\n")[0]);
for (const f of [
  "src/app/api/insights/location/route.ts",
  "src/app/api/menu/ai-generate/route.ts",
]) {
  const t = fs.readFileSync(f, "utf8");
  const m = t.match(/import \{([^}]+)\} from ["']@\/lib\/gemini["']/);
  console.log(f, m?.[1]?.trim());
}
