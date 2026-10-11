// Checks www/content/reviews.json against www/content/attributes.json.
// Run: node scripts/check-content.mjs
import { readFileSync, existsSync } from "node:fs";
import { DAYS, isValidDay } from "./hours.mjs";

const read = (p) => JSON.parse(readFileSync(new URL("../www/content/" + p, import.meta.url), "utf8"));
const { reviews } = read("reviews.json");
const schema = read("attributes.json");
const errors = [];

const pubListUrl = new URL("../www/content/norwich-pubs.json", import.meta.url);
const osmIds = existsSync(pubListUrl) ? new Set(JSON.parse(readFileSync(pubListUrl, "utf8")).pubs.map((p) => p.osm)) : null;
const warnings = [];

for (const r of reviews) {
  const place = r.place;
  if (place) {
    if (place.osm && !/^(node|way|relation)\/\d+$/.test(place.osm)) errors.push(`${r.slug}: place.osm should look like "node/12345"`);
    if (place.osm && osmIds && !osmIds.has(place.osm)) warnings.push(`${r.slug}: ${place.osm} isn't in the Norwich pub list`);
    for (const k of ["lat", "lng"]) if (k in place && typeof place[k] !== "number") errors.push(`${r.slug}: place.${k} should be a number`);
    if (place.hours) {
      for (const [d, v] of Object.entries(place.hours)) {
        if (!DAYS.includes(d)) errors.push(`${r.slug}: unknown day "${d}" in hours (use ${DAYS.join(", ")})`);
        else if (!isValidDay(v)) errors.push(`${r.slug}: hours for ${d} should be like "12:00-23:00" or "closed", not "${v}"`);
      }
    }
    if (place.hoursChecked && !/^\d{4}-\d{2}-\d{2}$/.test(place.hoursChecked)) errors.push(`${r.slug}: hoursChecked should be a date like 2026-10-11`);
  }
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

if (warnings.length) console.warn("Warnings:\n" + warnings.join("\n"));
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`OK: ${reviews.length} reviews checked`);
