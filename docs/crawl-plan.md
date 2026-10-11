# Create-a-Crawl: plan and decisions

Pub crawl planner for Norwich (coffee crawls later, same engine). Topics are worked through one at a time.

| # | Topic | Status |
|---|---|---|
| 1 | Standardising tags | **Done:** `www/content/attributes.json` |
| 2 | Pub data: location, opening times, unreviewed pubs | **Done** (pub list fills in when the owner runs the GitHub workflow) |
| 3 | Pub map | **Done:** `#map`, `www/js/map.js` |
| 4 | Create-a-Crawl inputs (MVP = auto-generate) | **Done:** `#crawl`, `www/js/crawl.js` + `crawl-engine.js` |
| 5 | Route: start/end points, "Overall route travel time on foot" | Next (basic total walk time and a Google Maps link exist already) |
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
- Map page intro text: the owner wants a short explainer above the map later.
- Create-a-Crawl is reached from a big button on the Map page (not in the top menu, for now).
- Inputs: number of pubs (3–8, default 4), minimum rating, day and start time (default now), must-have rules: All / At least half / At least one / None × any tag. Scale tags mean "at least this level".
- **Assumptions must be stated clearly in the UI** ("Our assumptions" box, open by default). They live in `ASSUMPTIONS` in crawl-engine.js plus the list in crawl.js; keep both in sync. Currently: 45 min per pub; walking times are estimates (no speed shown); where opening times come from (phrased as information, not rules; the owner doesn't want rule-like wording); unknown hours flagged; route starts wherever gives the shortest walk; half rounds up; scale levels include better; unrecorded tags don't count.
- Generator: greedy nearest-open-pub from every start, protecting counted rules, then the best order (every order up to 6 stops, 2-opt above that). Ranked by stops, then unmet rules, then walk. Shuffle cycles through near-equal options. When rules can't be met, the best effort is shown with warnings.
- Demo mode: `content/demo-pubs.json` has 24 made-up pubs (invented names on purpose; never real pubs). It's offered while fewer than 8 reviewed pubs are mapped.
- Three modes on `#crawl` (tabs): **Ropebreak picks** (reviewed pubs + must-haves), **Surprise me** (any OSM pub; count + time only), **Plan my own** (user picks pubs via search or the map card's "Add to crawl"; `planRoute()` orders them: fewest closed on arrival, then shortest walk; "Keep the order I picked" option). Max 10 picked pubs (Google Maps route limit).
- "Your crawl" selection is stored per device in localStorage (`ropebreak.crawlSelection`, pub ids = OSM id or `review/<slug>`). The map button reads "Your crawl (n) →" when pubs are picked, and the map card shows a "View your crawl" link.
- Default mode: Plan my own if pubs are picked, else Ropebreak picks once 8+ reviewed pubs are mapped, else Surprise me.
- The generator prefers pubs with known opening times (unknown counts as +8 min walk when choosing).
- Assumptions wording: no walking speed; opening times are stated as information, not rules. Each mode has its own assumption list (`renderAssumptions()` in crawl.js).
- OSM tags for unreviewed pubs (beer garden etc.): owner said not needed.
- Plan my own has a permanent "+ Add pubs from the map" button; arriving on the map that way shows a how-to hint (`.map-pick-hint`), and the map's main button returns to the crawl.
