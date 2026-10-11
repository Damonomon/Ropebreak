// Checks www/content/reviews.json against www/content/attributes.json.
// Run: node scripts/check-content.mjs
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL("../www/content/" + p, import.meta.url), "utf8"));
const { reviews } = read("reviews.json");
const schema = read("attributes.json");
const errors = [];

for (const r of reviews) {
  const groups = schema[r.category];
  if (!r.attributes) continue;
  if (!groups) { errors.push(`${r.slug}: no attribute list for category "${r.category}"`); continue; }
  const fields = Object.fromEntries(groups.flatMap((g) => g.fields).map((f) => [f.id, f]));
  for (const [key, value] of Object.entries(r.attributes)) {
    const f = fields[key];
    if (!f) { errors.push(`${r.slug}: unknown attribute "${key}"`); continue; }
    const ids = f.type === "yesno" ? ["yes", "no"] : f.options.map((o) => o.id);
    const values = f.type === "multi" ? value : [value];
    if (f.type === "multi" && !Array.isArray(value)) errors.push(`${r.slug}: "${key}" should be a list`);
    for (const v of [].concat(values)) if (!ids.includes(v)) errors.push(`${r.slug}: "${key}" can't be "${v}" (allowed: ${ids.join(", ")})`);
    if (f.showIf) for (const [dep, need] of Object.entries(f.showIf))
      if (r.attributes[dep] !== need) errors.push(`${r.slug}: "${key}" only applies when ${dep} is "${need}"`);
  }
}

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`OK: ${reviews.length} reviews checked`);
