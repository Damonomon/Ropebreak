// Rebuilds www/content/norwich-pubs.json from OpenStreetMap: every pub inside
// Norwich's city boundary, with location, address, website and opening hours.
// Runs on GitHub (Actions → "Update Norwich pub list"); needs internet access.
// Map data © OpenStreetMap contributors, available under the ODbL.
import { writeFileSync } from "node:fs";
import { parseOsmHours } from "./hours.mjs";

const OUT = new URL("../www/content/norwich-pubs.json", import.meta.url);
// Tried in order until one finds pubs. The bounding box is a last resort that
// roughly covers the city and is labelled as such in the output.
const AREAS = [
  { label: "Norwich (city boundary)", filter: 'area["boundary"="administrative"]["admin_level"="8"]["name"="Norwich"]->.city;', scope: "(area.city)" },
  { label: "Norwich (city boundary)", filter: 'area["boundary"="administrative"]["name"~"^(City of )?Norwich$"]->.city;', scope: "(area.city)" },
  { label: "Norwich (approximate box)", filter: "", scope: "(52.595,1.205,52.665,1.355)" }
];
const queryFor = (a) => `[out:json][timeout:90];${a.filter}nwr["amenity"="pub"]${a.scope};out center tags;`;
// GitHub shows these lines as notes on the run, which keeps failures readable
const note = (level, msg) => console.log(process.env.GITHUB_ACTIONS ? `::${level}::${msg}` : msg);
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function fetchOverpass(query) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Ropebreak pub list updater (github.com/Damonomon/Ropebreak)" },
        body: "data=" + encodeURIComponent(query)
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${(await res.text()).slice(0, 200).replace(/\s+/g, " ")}`);
      return await res.json();
    } catch (e) { lastError = e; note("warning", `${url}: ${e.message}${e.cause ? " (" + (e.cause.code || e.cause.message) + ")" : ""}`); }
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
  let pubs = [], area;
  try {
    for (area of AREAS) {
      pubs = toPubs(await fetchOverpass(queryFor(area)));
      note("notice", `${area.label}: ${pubs.length} pubs found`);
      if (pubs.length >= 30) break;
    }
  } catch (e) {
    note("error", `Couldn't reach OpenStreetMap: ${e.message}`);
    process.exit(1);
  }
  if (pubs.length < 30) {
    note("error", `Only ${pubs.length} pubs found; the list was left unchanged.`);
    process.exit(1);
  }
  writeFileSync(OUT, JSON.stringify({
    source: "© OpenStreetMap contributors (ODbL), openstreetmap.org/copyright",
    area: area.label,
    updated: new Date().toISOString().slice(0, 10),
    pubs
  }, null, 2) + "\n");
  note("notice", `Saved ${pubs.length} pubs (${area.label})`);
}
