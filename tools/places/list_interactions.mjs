// Lists every Places animation by category:  node tools/places/list_interactions.mjs
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(fileURLToPath(new URL(".", import.meta.url)), "../../src/lib/places/interactions");
const known = JSON.parse(await readFile(join(dir, "categories.json"), "utf8"));
const defs = [];
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "categories.json" && !f.startsWith("test_")).sort()) {
  const def = JSON.parse(await readFile(join(dir, file), "utf8"));
  defs.push({ ...def, file });
}
const used = [...new Set(defs.map((d) => d.category?.trim() || "other"))];
const order = [...known.map((c) => c.id).filter((id) => used.includes(id)), ...used.filter((id) => !known.some((c) => c.id === id)).sort()];
for (const id of order) {
  const info = known.find((c) => c.id === id);
  const group = defs.filter((d) => (d.category?.trim() || "other") === id);
  console.log(`\n${info?.emoji ?? "✨"} ${info?.label ?? id} (${group.length})`);
  for (const d of group) console.log(`  ${d.emoji ?? " "} ${d.id.padEnd(24)} ${d.label.padEnd(34)} ${d.people.min === d.people.max ? d.people.min : `${d.people.min}-${d.people.max}`}p${d.target ? "  @" + d.target.kinds.join("/") : ""}`);
}
console.log(`\n${defs.length} animations in ${order.length} groups`);
