// Create-a-Crawl page: three ways to build a crawl, the result and the
// assumptions box.
//   picks    – Ropebreak picks from reviewed pubs, with must-haves
//   surprise – any Norwich pub, just how many and when
//   own      – pubs the user chose (search or map), put in the best order
import { ASSUMPTIONS, generateCrawl, makeMatcher, planRoute } from "./crawl-engine.js";

const QUANTITIES = [["all", "All"], ["half", "At least half"], ["one", "At least one"], ["none", "None"]];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEMO_THRESHOLD = 8;  // below this many mapped reviews, offer demo pubs
const MAX_PICKED = 10;     // Google Maps routes take 10 stops at most
const MODES = {
  picks: { intro: "We pick from the pubs we've reviewed, using your must-haves.", button: "Create my crawl" },
  surprise: { intro: "Any pub in Norwich, reviewed or not. Just tell us how many and when.", button: "Surprise me" },
  own: { intro: "Choose your pubs and we'll work out the best order to walk them in.", button: "Plan my route" }
};

function clock(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return `${h % 12 || 12}:${mm}${h < 12 ? "am" : "pm"}`;
}
function normalise(name) { return name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9 ]/g, ""); }

export function createCrawlPage(section, rb) {
  const esc = rb.esc;
  const form = section.querySelector(".crawl-form");
  const rulesBox = section.querySelector(".crawl-rules");
  const result = section.querySelector(".crawl-result");
  const banner = section.querySelector(".crawl-demo-banner");
  const countOut = section.querySelector("[data-count]");
  const pickedList = section.querySelector(".crawl-picked");
  const search = section.querySelector(".crawl-search");
  const searchResults = section.querySelector(".crawl-search-results");
  let mode = null, count = 4, variety = 0, demo = false, data = { pubs: [], demoPubs: [], attributes: [] };

  // ---- modes ----
  function setMode(next) {
    mode = next;
    section.querySelectorAll("[data-mode]").forEach((b) => {
      const on = b.getAttribute("data-mode") === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    section.querySelectorAll("[data-for]").forEach((el) => { el.hidden = !el.getAttribute("data-for").split(" ").includes(mode); });
    section.querySelector(".crawl-mode-intro").textContent = MODES[mode].intro;
    section.querySelector(".crawl-go").textContent = MODES[mode].button;
    result.hidden = true;
    variety = 0;
    updateBanner();
    renderAssumptions();
    if (mode === "own") renderPicked();
  }
  section.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.getAttribute("data-mode"))));

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
      const label = row.querySelector("[data-what]").selectedOptions[0].textContent;
      return { quantity: row.querySelector("[data-quantity]").value, field, value, label };
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

  // ---- plan my own: chosen pubs, search ----
  function pickedPubs() {
    const byId = new Map(data.pubs.map((p) => [p.id, p]));
    return rb.selection.ids().map((id) => byId.get(id)).filter(Boolean);
  }
  function pubLine(p) {
    return p.review ? `<span class="crawl-pick-score">${esc(rb.scoreText(p.review.overall))}</span>` : '<span class="crawl-pick-note">Not yet reviewed</span>';
  }
  function renderPicked() {
    const picked = pickedPubs();
    pickedList.innerHTML = picked.map((p, i) =>
      `<li><span class="crawl-pick-num">${i + 1}</span><span class="crawl-pick-name">${esc(p.name)}</span>${pubLine(p)}` +
      `<button type="button" class="crawl-rule-remove" data-unpick="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">&times;</button></li>`).join("");
    pickedList.hidden = !picked.length;
    section.querySelector(".crawl-picked-empty").hidden = !!picked.length;
    search.disabled = picked.length >= MAX_PICKED;
    search.placeholder = picked.length >= MAX_PICKED ? `That's the maximum of ${MAX_PICKED} pubs` : "Search Norwich pubs";
  }
  pickedList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-unpick]");
    if (btn) { rb.selection.remove(btn.getAttribute("data-unpick")); renderPicked(); }
  });
  function renderSearch() {
    const q = normalise(search.value.trim());
    if (!q) { searchResults.innerHTML = ""; searchResults.hidden = true; return; }
    const chosen = new Set(rb.selection.ids());
    const hits = data.pubs
      .filter((p) => !chosen.has(p.id) && normalise(p.name).includes(q))
      .sort((a, b) => normalise(a.name).indexOf(q) - normalise(b.name).indexOf(q) || a.name.localeCompare(b.name))
      .slice(0, 8);
    searchResults.innerHTML = hits.length
      ? hits.map((p) => `<li><button type="button" data-pick="${esc(p.id)}"><span class="crawl-pick-name">${esc(p.name)}</span>${pubLine(p)}` +
          (p.address ? `<span class="crawl-pick-address">${esc(p.address)}</span>` : "") + "</button></li>").join("")
      : '<li class="crawl-search-none">No pubs by that name</li>';
    searchResults.hidden = false;
  }
  search.addEventListener("input", renderSearch);
  searchResults.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (!btn) return;
    rb.selection.add(btn.getAttribute("data-pick"));
    search.value = "";
    renderSearch();
    renderPicked();
    search.focus();
  });

  // ---- result ----
  function describeRule(r) { return `${QUANTITIES.find(([v]) => v === r.quantity)[1]}: ${r.label}`; }
  function render(crawl, warnings) {
    const s = crawl.stops;
    const unknownHours = s.filter((st) => st.open === null).length;
    const stops = s.map((st, i) => {
      const p = st.pub, r = p.review;
      const tags = r ? rb.highlights(Object.assign({ category: "pub" }, r), 3).map((t) => `<span class="chip">${esc(t)}</span>`).join("") : "";
      const hoursNote = st.open === false ? '<span class="crawl-flag crawl-flag-closed">Might be closed then</span>'
        : st.open === null ? '<span class="crawl-flag">Opening times unknown</span>'
        : !p.hoursConfirmed ? '<span class="crawl-flag">Times unconfirmed</span>' : "";
      return `<li class="crawl-stop">
        <span class="crawl-num" aria-hidden="true">${i + 1}</span>
        <div class="crawl-stop-body">
          ${i ? `<p class="crawl-walk">${st.walkFromPrevious} min walk</p>` : ""}
          <div class="crawl-stop-head"><h4>${esc(p.name)}</h4>${r ? `<span class="crawl-score">${esc(rb.scoreText(r.overall))}</span>` : '<span class="crawl-unreviewed">Not yet Ropebreak\'d</span>'}</div>
          <p class="crawl-time">${clock(st.arrive)} – ${clock(st.leave)} ${hoursNote}</p>
          ${tags ? `<div class="chip-row">${tags}</div>` : ""}
          ${r && r.slug ? `<p><a class="read-link" href="#review-${esc(r.slug)}">Read the review &rarr;</a></p>` : ""}
        </div></li>`;
    }).join("");
    const pts = s.map((st) => `${st.pub.lat},${st.pub.lng}`);
    const maps = "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + encodeURIComponent(pts[0]) +
      "&destination=" + encodeURIComponent(pts[pts.length - 1]) +
      (pts.length > 2 ? "&waypoints=" + encodeURIComponent(pts.slice(1, -1).join("|")) : "");
    const canShuffle = mode === "surprise" || (mode === "picks" && crawl.options > 1);
    result.innerHTML =
      `<div class="section-head crawl-result-head"><h3>Your crawl ${demo && mode === "picks" ? '<span class="crawl-demo-tag">DEMO</span>' : ""}</h3>` +
      `<p class="crawl-summary">${s.length} pubs · ${clock(s[0].arrive)} – ${clock(s[s.length - 1].leave)} · <strong>${crawl.totalWalk} min</strong> walking in total</p></div>` +
      (warnings.length ? `<div class="crawl-warning">${warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</div>` : "") +
      `<p class="crawl-flag-note">Based on ${ASSUMPTIONS.minutesPerPub} minutes per pub. See "Our assumptions" below.</p>` +
      (unknownHours ? `<p class="crawl-flag-note">${unknownHours} of these pubs ${unknownHours === 1 ? "has" : "have"} no opening times on record.</p>` : "") +
      `<ol class="crawl-stops">${stops}</ol>` +
      '<div class="share-row crawl-actions">' +
      `<a class="share-btn primary" data-external href="${esc(maps)}" target="_blank" rel="noopener">Open route in Google Maps</a>` +
      (canShuffle ? '<button type="button" class="share-btn" data-shuffle>Shuffle</button>' : "") +
      "</div>";
    result.hidden = false;
    const shuffle = result.querySelector("[data-shuffle]");
    if (shuffle) shuffle.addEventListener("click", () => { variety = mode === "surprise" ? Math.floor(Math.random() * 1000) : variety + 1; run(false); });
  }
  function renderProblem(text) {
    result.innerHTML = `<div class="crawl-warning"><strong>No crawl possible.</strong> ${esc(text)}</div>`;
    result.hidden = false;
  }

  function run(scroll = true) {
    const [h, m] = form.elements.time.value.split(":").map(Number);
    const when = { dayIndex: Number(form.elements.day.value), startMinutes: (h || 0) * 60 + (m || 0) };
    if (mode === "own") {
      const picked = pickedPubs();
      if (picked.length < 2) { renderProblem("Add at least two pubs."); return finish(scroll); }
      const route = planRoute(picked, Object.assign({ keepOrder: form.elements.keepOrder.checked }, when));
      const warnings = route.closed
        ? [`${route.closed === 1 ? "One pub" : route.closed + " pubs"} might be closed when you get there. Try a different start time, or check their opening times.`] : [];
      render(route, warnings);
      return finish(scroll);
    }
    const rules = mode === "picks" ? readRules() : [];
    const pool = mode === "picks" ? (demo ? data.demoPubs : data.pubs) : data.pubs;
    const crawl = generateCrawl(pool, Object.assign({
      count, rules, attributes: data.attributes, variety,
      minRating: mode === "picks" ? Number(form.elements.minRating.value) : 0,
      includeUnreviewed: mode === "surprise"
    }, when));
    if (!crawl.stops.length) {
      renderProblem(crawl.notes.length && mode === "picks"
        ? "No reviewed pubs match your rating and must-haves. Try fewer must-haves, a lower rating or a different time."
        : "None of the pubs are open then. Try a different time.");
      return finish(scroll);
    }
    const warnings = [];
    if (crawl.shortBy > 0) {
      const asked = crawl.stops.length + crawl.shortBy;
      warnings.push(crawl.notes.length
        ? `You asked for ${asked} pubs, but only ${crawl.stops.length} reviewed pubs match your rating and must-haves.`
        : `You asked for ${asked} pubs, but only ${crawl.stops.length} fit before closing time.`);
    }
    const matches = makeMatcher(data.attributes);
    for (const r of crawl.unmetRules) warnings.push(`Couldn't meet "${describeRule(r)}". This crawl has ${crawl.stops.filter((st) => matches(st.pub, r)).length}.`);
    render(crawl, warnings);
    finish(scroll);
  }
  function finish(scroll) {
    if (scroll) result.scrollIntoView({ behavior: rb.reduceMotion() ? "auto" : "smooth", block: "start" });
  }

  function updateBanner() {
    const mapped = data.pubs.filter((p) => p.review).length;
    if (mode !== "picks") { banner.hidden = true; return; }
    if (demo) {
      banner.innerHTML = 'Demo mode: these pubs and ratings are <strong>made up</strong>, so you can try it out. <button type="button" class="link-btn" data-demo="off">Use real reviews</button>';
      banner.hidden = false;
    } else if (mapped < DEMO_THRESHOLD) {
      const sofar = mapped === 0 ? "No reviewed pubs are on the map yet, so there's nothing to pick from."
        : `Only ${mapped} reviewed pub${mapped === 1 ? " is" : "s are"} on the map so far, so crawls will be short.`;
      banner.innerHTML = `${sofar} <button type="button" class="link-btn" data-demo="on">Try it with demo pubs</button> or <button type="button" class="link-btn" data-goto="surprise">use any pub</button>.`;
      banner.hidden = false;
    } else banner.hidden = true;
    const demoBtn = banner.querySelector("[data-demo]");
    if (demoBtn) demoBtn.addEventListener("click", () => { demo = demoBtn.getAttribute("data-demo") === "on"; variety = 0; result.hidden = true; updateBanner(); });
    const goto = banner.querySelector("[data-goto]");
    if (goto) goto.addEventListener("click", () => setMode(goto.getAttribute("data-goto")));
  }

  // ---- assumptions box ----
  function renderAssumptions() {
    const shared = [
      `You spend ${ASSUMPTIONS.minutesPerPub} minutes in each pub.`,
      "Walking times are estimates. Real routes can be a little longer.",
      "Opening times come from our reviews where we've checked them, otherwise from OpenStreetMap, which can be out of date. Pubs with no times on record are flagged."
    ];
    const byMode = {
      picks: [
        "Only pubs Ropebreak has reviewed and put on the map are used.",
        "The route starts at whichever pub gives the shortest total walk.",
        '"At least half" rounds up, so half of 5 pubs is 3.',
        'Levels like "Toilets: at least What you\'d expect" also include anything better.',
        "If we haven't recorded a tag for a pub, it doesn't count towards a must-have."
      ],
      surprise: [
        "Pubs come from every pub in Norwich listed on OpenStreetMap, reviewed or not. Some may have closed or changed.",
        "The route starts at whichever pub gives the shortest total walk."
      ],
      own: [
        "We put your pubs in the order with the shortest walk, unless you choose to keep your order.",
        "Pubs we haven't reviewed come from OpenStreetMap. Some may have closed or changed."
      ]
    };
    section.querySelector(".crawl-assumptions ul").innerHTML = byMode[mode].concat(shared).map((t) => `<li>${esc(t)}</li>`).join("");
  }

  // ---- controls ----
  section.querySelector("[data-count-down]").addEventListener("click", () => { count = Math.max(3, count - 1); countOut.textContent = count; });
  section.querySelector("[data-count-up]").addEventListener("click", () => { count = Math.min(8, count + 1); countOut.textContent = count; });
  section.querySelector("[data-add-rule]").addEventListener("click", () => addRule());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    variety = mode === "surprise" ? Math.floor(Math.random() * 1000) : 0;
    run();
  });

  let initialised = false;
  return {
    show(newData) {
      data = newData;
      if (!initialised) { setUpWhen(); initialised = true; }
      // arriving with pubs chosen on the map opens "Plan my own"
      const mapped = data.pubs.filter((p) => p.review).length;
      if (rb.selection.ids().length) setMode("own");
      else setMode(mode || (mapped >= DEMO_THRESHOLD ? "picks" : "surprise"));
    }
  };
}
