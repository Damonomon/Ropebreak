# Create-a-Crawl: plan and decisions

Pub crawl planner for Norwich (coffee crawls later, same engine). Topics are worked through one at a time.

| # | Topic | Status |
|---|---|---|
| 1 | Standardising tags | **Done:** `www/content/attributes.json` |
| 2 | Pub data: location, opening times, unreviewed pubs | **Done** (pub list fills in when the owner runs the GitHub workflow) |
| 3 | Pub map | **Done:** `#map`, `www/js/map.js` |
| 4 | Create-a-Crawl inputs (MVP = auto-generate) | Next |
| 5 | Route: start/end points, "Overall route travel time on foot" | |
| 6 | Sharing: what a shared crawl link shows | |
| 7 | Caveats: check it's open, drink responsibly, HYDRATE | |
| 8 | Crawl receipt | Later |

## Decisions so far
- MVP is auto-generate. The pub map exists alongside it.
- Real map: OpenStreetMap. No Google Maps embed (it needs a billing account). Google Maps links for walking directions are fine.
- Unreviewed pubs appear on the map.
- Target: ~50 reviewed Norwich pubs.
- Tags: fixed lists in `attributes.json`. Review "chips" stay freeform and are display only.
  - Food, Notable drinks and Vibe allow several answers. Notable drinks means what stands out, not "serves beer".
  - Beer garden "no" skips garden size, heaters and outside seating.
  - The Toilets tag and the radar's Toilet cleanliness score both stay.
  - Disabled access is split into Step-free entrance and Accessible toilet.
  - A missing field means unknown.
  - Temp and Lighting are display only, except a "Temp: Ideal" rule.
- Old per-category `characteristics` (and the filter chips using them) get replaced by attributes when the filters are rebuilt.
- Area: the whole of Norwich (city council boundary).
- `www/content/norwich-pubs.json` lists every pub, built from OpenStreetMap by `scripts/update-pubs.mjs` through the **Update Norwich pub list** workflow. OSM is blocked from cloud sessions; GitHub's runners can reach it. ODbL credit must be shown wherever the list or map appears.
- Reviewed pubs carry `"place": { "osm": "node/123", "lat", "lng", "address", "hours": { "mon": "12:00-23:00", ..., "sun": "closed" }, "hoursChecked": "YYYY-MM-DD" }`. Any field missing falls back to the OSM entry with the same `osm` id. OSM hours count as "unconfirmed" until the owner checks them.
- Unreviewed pubs: map only, never in generated crawls.
- Map: MapLibre GL (vendored in `www/vendor/maplibre`, renamed .mjs → .js for iOS) with OpenFreeMap's Positron style, recoloured per theme in `map.js`. If OpenFreeMap ever goes away, swap `STYLE_URL` (raster OSM tiles are the fallback, but their usage policy is unfriendly to apps).
- Pins: reviewed pubs are blue with their score; unreviewed pubs are small grey dots. A "Reviewed only" toggle hides the grey ones.
- Preview card: score, verdict, top 3 standout tags (`highlights()` in app.js; a review can pin its own with `"highlights": [fieldIds]`), today's hours (marked unconfirmed unless from the owner's review), Read review / Directions (Google Maps walking link) / Website.
- "Show my location" uses @capacitor/geolocation in the app and browser geolocation on the web. The privacy page covers it.
