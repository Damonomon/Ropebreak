// Rebuilds www/content/norwich-pubs.json from OpenStreetMap: every pub inside
// Norwich's city boundary, with location, address, website and opening hours.
// Runs on GitHub (Actions → "Update Norwich pub list"); needs internet access.
// Map data © OpenStreetMap contributors, available under the ODbL.
import { writeFileSync } from "node:fs";
import { parseOsmHours } from "./hours.mjs";

const OUT = new URL("../www/content/norwich-pubs.json", import.meta.url);
const QUERY = `
[out:json][timeout:90];
area["boundary"="administrative"]["admin_level"="8"]["name"="Norwich"]->.city;
nwr["amenity"="pub"](area.city);
out center tags;`;
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function fetchOverpass() {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Ropebreak pub list updater (github.com/Damonomon/Ropebreak)" },
        body: "data=" + encodeURIComponent(QUERY)
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return await res.json();
    } catch (e) { lastError = e; console.warn(String(e)); }
  }
  throw lastError;
}

export function toPubs(osm) {
  return osm.elements
    .map((el) => {
      const t = el.tags || {};
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
      if (!t.name || lat == null || lng == null) return null;
      const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
      const address = [t["addr:housename"], street, t["addr:postcode"]].filter(Boolean).join(", ");
      const pub = {
        osm: `${el.type}/${el.id}`,
        name: t.name,
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6
      };
      if (address) pub.address = address;
      const website = t.website || t["contact:website"];
      if (website) pub.website = website;
      if (t.opening_hours) {
        const hours = parseOsmHours(t.opening_hours);
        if (hours) pub.hours = hours;
        else pub.hoursText = t.opening_hours; // kept as-is when too unusual to convert
      }
      return pub;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name) || a.osm.localeCompare(b.osm));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pubs = toPubs(await fetchOverpass());
  if (pubs.length < 30) throw new Error(`Only ${pubs.length} pubs found; refusing to overwrite the list (is the boundary query still right?)`);
  writeFileSync(OUT, JSON.stringify({
    source: "© OpenStreetMap contributors (ODbL), openstreetmap.org/copyright",
    area: "Norwich (city boundary)",
    updated: new Date().toISOString().slice(0, 10),
    pubs
  }, null, 2) + "\n");
  console.log(`Saved ${pubs.length} pubs`);
}
