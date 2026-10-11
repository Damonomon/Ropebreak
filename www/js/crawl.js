// Create-a-Crawl page: the form, the result and the assumptions box.
import { ASSUMPTIONS, generateCrawl, makeMatcher } from "./crawl-engine.js";

const QUANTITIES = [["all", "All"], ["half", "At least half"], ["one", "At least one"], ["none", "None"]];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEMO_THRESHOLD = 8; // below this many mapped reviews, offer demo pubs

function clock(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return `${h % 12 || 12}:${mm}${h < 12 ? "am" : "pm"}`;
}

export function createCrawlPage(section, rb) {
  const esc = rb.esc;
  const form = section.querySelector(".crawl-form");
  const rulesBox = section.querySelector(".crawl-rules");
  const result = section.querySelector(".crawl-result");
  const banner = section.querySelector(".crawl-demo-banner");
  const countOut = section.querySelector("[data-count]");
  let count = 4, variety = 0, demo = false, data = { pubs: [], demoPubs: [], attributes: [] };

  // ---- must-have options, built from the agreed tag list ----
  function ruleOptions() {
    return data.attributes.map((g) => {
      const opts = [];
      for (const f of g.fields) {
        if (f.type === "yesno") opts.push([`${f.id}|yes`, f.label]);
        else if (f.type === "scale") f.options.slice(0, -1).forEach((o) => opts.push([`${f.id}|${o.id}`, `${f.label}: at least ${o.label}`]));
        else f.options.forEach((o) => opts.push([`${f.id}|${o.id}`, f.id === "vibe" ? `Vibe: ${o.label}` : `${f.label}: ${o.label}`]));
      }
      return `<optgroup label="${esc(g.group)}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</optgroup>`;
    }).join("");
  }
  function addRule(quantity = "half", what = "beerGarden|yes") {
    const row = document.createElement("div");
    row.className = "crawl-rule";
    row.innerHTML =
      `<select class="control-select" data-quantity aria-label="How many">${QUANTITIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>` +
      `<select class="control-select" data-what aria-label="What">${ruleOptions()}</select>` +
      '<button type="button" class="crawl-rule-remove" aria-label="Remove this must-have">&times;</button>';
    row.querySelector("[data-quantity]").value = quantity;
    row.querySelector("[data-what]").value = what;
    row.querySelector(".crawl-rule-remove").addEventListener("click", () => row.remove());
    rulesBox.appendChild(row);
  }
  function readRules() {
    return [...rulesBox.querySelectorAll(".crawl-rule")].map((row) => {
      const [field, value] = row.querySelector("[data-what]").value.split("|");
      const what = row.querySelector("[data-what]").selectedOptions[0].textContent;
      return { quantity: row.querySelector("[data-quantity]").value, field, value, label: what };
    });
  }

  // ---- "when" defaults to now, rounded up to the next quarter hour ----
  function setUpWhen() {
    const daySel = form.elements.day;
    const today = new Date().getDay();
    daySel.innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = (today + i) % 7;
      return `<option value="${d}">${i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[d]}</option>`;
    }).join("");
    const now = new Date();
    const mins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15 % 1440;
    form.elements.time.value = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }

  // ---- result ----
  function describeRule(r) {
    const q = QUANTITIES.find(([v]) => v === r.quantity)[1];
    return `${q}: ${r.label}`;
  }
  function render(crawl, rules) {
    const s = crawl.stops;
    if (!s.length) {
      const why = crawl.notes.length ? "No reviewed pubs match your rating and must-haves." : "None of the matching pubs are open then.";
      result.innerHTML = `<div class="crawl-warning"><strong>No crawl possible.</strong> ${esc(why)} Try fewer must-haves, a lower rating or a different time.</div>`;
      result.hidden = false;
      return;
    }
    const total = crawl.totalWalk;
    const warnings = [];
    if (crawl.shortBy > 0) {
      const asked = s.length + crawl.shortBy;
      warnings.push(crawl.notes.length
        ? `You asked for ${asked} pubs, but only ${s.length} reviewed pubs match your rating and must-haves.`
        : `You asked for ${asked} pubs, but only ${s.length} fit before closing time.`);
    }
    const matches = makeMatcher(data.attributes);
    for (const r of crawl.unmetRules) {
      const have = s.filter((st) => matches(st.pub, r)).length;
      warnings.push(`Couldn't meet "${describeRule(r)}". This crawl has ${have}.`);
    }
    const unknownHours = s.filter((st) => st.open === null).length;
    const stops = s.map((st, i) => {
      const p = st.pub, r = p.review;
      const tags = rb.highlights(Object.assign({ category: "pub" }, r), 3).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
      const hoursNote = st.open === null ? '<span class="crawl-flag">Opening times unknown</span>' : !p.hoursConfirmed ? '<span class="crawl-flag">Times unconfirmed</span>' : "";
      return `<li class="crawl-stop">
        <span class="crawl-num" aria-hidden="true">${i + 1}</span>
        <div class="crawl-stop-body">
          ${i ? `<p class="crawl-walk">${st.walkFromPrevious} min walk</p>` : ""}
          <div class="crawl-stop-head"><h4>${esc(p.name)}</h4><span class="crawl-score">${esc(rb.scoreText(r.overall))}</span></div>
          <p class="crawl-time">${clock(st.arrive)} – ${clock(st.leave)} ${hoursNote}</p>
          ${tags ? `<div class="chip-row">${tags}</div>` : ""}
          ${r.slug ? `<p><a class="read-link" href="#review-${esc(r.slug)}">Read the review &rarr;</a></p>` : ""}
        </div></li>`;
    }).join("");
    const pts = s.map((st) => `${st.pub.lat},${st.pub.lng}`);
    const maps = "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + encodeURIComponent(pts[0]) +
      "&destination=" + encodeURIComponent(pts[pts.length - 1]) +
      (pts.length > 2 ? "&waypoints=" + encodeURIComponent(pts.slice(1, -1).join("|")) : "");
    result.innerHTML =
      `<div class="section-head crawl-result-head"><h3>Your crawl ${demo ? '<span class="crawl-demo-tag">DEMO</span>' : ""}</h3>` +
      `<p class="crawl-summary">${s.length} pubs · ${clock(s[0].arrive)} – ${clock(s[s.length - 1].leave)} · <strong>${total} min</strong> walking in total</p></div>` +
      (warnings.length ? `<div class="crawl-warning">${warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</div>` : "") +
      `<p class="crawl-flag-note">Based on ${ASSUMPTIONS.minutesPerPub} minutes per pub and a relaxed walking pace. See "Our assumptions" below.</p>` +
      (unknownHours ? `<p class="crawl-flag-note">${unknownHours} of these pubs ${unknownHours === 1 ? "has" : "have"} no opening times on record, so ${unknownHours === 1 ? "it's" : "they're"} assumed open.</p>` : "") +
      `<ol class="crawl-stops">${stops}</ol>` +
      '<div class="share-row crawl-actions">' +
      `<a class="share-btn primary" data-external href="${esc(maps)}" target="_blank" rel="noopener">Open route in Google Maps</a>` +
      (crawl.options > 1 ? '<button type="button" class="share-btn" data-shuffle>Shuffle</button>' : "") +
      "</div>";
    result.hidden = false;
    const shuffle = result.querySelector("[data-shuffle]");
    if (shuffle) shuffle.addEventListener("click", () => { variety++; run(false); });
  }

  function run(scroll = true) {
    const [h, m] = form.elements.time.value.split(":").map(Number);
    const rules = readRules();
    const crawl = generateCrawl(demo ? data.demoPubs : data.pubs, {
      count, minRating: Number(form.elements.minRating.value), dayIndex: Number(form.elements.day.value),
      startMinutes: (h || 0) * 60 + (m || 0), rules, attributes: data.attributes, variety
    });
    render(crawl, rules);
    if (scroll) result.scrollIntoView({ behavior: rb.reduceMotion() ? "auto" : "smooth", block: "start" });
  }

  function updateBanner() {
    const mapped = data.pubs.filter((p) => p.review).length;
    if (demo) {
      banner.innerHTML = 'Demo mode: these pubs and ratings are <strong>made up</strong>, so you can try it out. <button type="button" class="link-btn" data-demo="off">Use real reviews</button>';
      banner.hidden = false;
    } else if (mapped < DEMO_THRESHOLD) {
      const sofar = mapped === 0 ? "No reviewed pubs are on the map yet, so there's nothing to build a crawl from."
        : `Only ${mapped} reviewed pub${mapped === 1 ? " is" : "s are"} on the map so far, so crawls will be short.`;
      banner.innerHTML = `${sofar} <button type="button" class="link-btn" data-demo="on">Try it with demo pubs</button>`;
      banner.hidden = false;
    } else banner.hidden = true;
    const btn = banner.querySelector("[data-demo]");
    if (btn) btn.addEventListener("click", () => { demo = btn.getAttribute("data-demo") === "on"; variety = 0; result.hidden = true; updateBanner(); });
  }

  // ---- assumptions box ----
  section.querySelector(".crawl-assumptions ul").innerHTML = [
    "Only pubs Ropebreak has reviewed and put on the map are used.",
    `You spend ${ASSUMPTIONS.minutesPerPub} minutes in each pub.`,
    `Walking times assume a relaxed ${Math.round(ASSUMPTIONS.walkingMetresPerMinute * 60 / 100) / 10} km/h, using straight-line distance plus ${Math.round((ASSUMPTIONS.streetFactor - 1) * 100)}% for streets. Real routes can be longer.`,
    "Every pub must be open for your whole visit. Opening times come from our reviews where we've checked them, otherwise from OpenStreetMap, which can be out of date. Pubs with no times on record are assumed open and flagged.",
    "The route starts at whichever pub gives the shortest total walk.",
    '"At least half" rounds up, so half of 5 pubs is 3.',
    'Levels like "Toilets: at least What you\'d expect" also include anything better.',
    "If we haven't recorded a tag for a pub, it doesn't count towards a must-have."
  ].map((t) => `<li>${esc(t)}</li>`).join("");

  // ---- controls ----
  section.querySelector("[data-count-down]").addEventListener("click", () => { count = Math.max(3, count - 1); countOut.textContent = count; });
  section.querySelector("[data-count-up]").addEventListener("click", () => { count = Math.min(8, count + 1); countOut.textContent = count; });
  section.querySelector("[data-add-rule]").addEventListener("click", () => addRule());
  form.addEventListener("submit", (e) => { e.preventDefault(); variety = 0; run(); });

  let initialised = false;
  return {
    show(newData) {
      data = newData;
      if (!initialised) { setUpWhen(); initialised = true; }
      updateBanner();
    }
  };
}
