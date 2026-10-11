// Pub map: every Norwich pub on an OpenFreeMap street map, recoloured in the
// Ropebreak palette. Loaded only when the Map page is first opened.
import * as maplibregl from "../vendor/maplibre/maplibre-gl.js";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const NORWICH_CENTRE = [1.2974, 52.6309];
const NORWICH_BOUNDS = [[1.17, 52.575], [1.40, 52.685]];

const PALETTES = {
  light: {
    bg: "#FAFAF6", park: "#E2ECDF", water: "#CBD9E6", residential: "#F3F2EC", building: "#ECEAE3", buildingLine: "#E0DDD4",
    path: "#ECE9E1", minor: "#E4E1D8", major: "#FFFFFF", casing: "#D8D4CA", rail: "#DAD7CF",
    label: "#5B5C63", waterLabel: "#1E3A5F", halo: "#FAFAF6"
  },
  dark: {
    bg: "#14151A", park: "#18221E", water: "#17243A", residential: "#17181D", building: "#1D1E24", buildingLine: "#25262D",
    path: "#202128", minor: "#24252C", major: "#30313A", casing: "#3A3B44", rail: "#2A2B33",
    label: "#A8A9B2", waterLabel: "#7FA8D9", halo: "#14151A"
  }
};

// Which colour each of Positron's layers gets
function layerColours(id, type, p) {
  if (type === "symbol") return { "text-color": /^water/.test(id) ? p.waterLabel : p.label, "text-halo-color": p.halo };
  if (id === "background") return { "background-color": p.bg };
  if (id === "water") return { "fill-color": p.water };
  if (id === "waterway") return { "line-color": p.water };
  if (/^(park|landcover_wood|landuse_park)$/.test(id)) return { "fill-color": p.park };
  if (/^landcover_(ice|glacier)/.test(id)) return { "fill-color": p.bg };
  if (id === "landuse_residential") return { "fill-color": p.residential };
  if (id === "building") return { "fill-color": p.building, "fill-outline-color": p.buildingLine };
  if (/^road_(area_)?pier/.test(id)) return type === "fill" ? { "fill-color": p.bg } : { "line-color": p.bg };
  if (/_dashline$/.test(id)) return { "line-color": p.bg };
  if (/^railway/.test(id)) return { "line-color": p.rail };
  if (id === "highway_path") return { "line-color": p.path };
  if (/casing$/.test(id) || /^boundary/.test(id)) return { "line-color": p.casing };
  if (/inner$/.test(id)) return { "line-color": p.major };
  if (/^highway|^aeroway/.test(id)) return type === "fill" ? { "fill-color": p.minor } : { "line-color": p.minor };
  return null;
}

function themed(baseStyle, theme) {
  const style = JSON.parse(JSON.stringify(baseStyle));
  const p = PALETTES[theme];
  for (const layer of style.layers) {
    const colours = layerColours(layer.id, layer.type, p);
    if (colours) layer.paint = Object.assign({}, layer.paint, colours);
  }
  return style;
}

function currentTheme() {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark" || forced === "light") return forced;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function createPubMap(container, rb) {
  const esc = rb.esc;
  let map = null, baseStyle = null, markers = [], userMarker = null, reviewedOnly = false, pubs = [];
  const card = container.querySelector(".map-card");
  const message = container.querySelector(".map-message");
  const count = container.querySelector(".map-count");
  const toggle = container.querySelector("[data-map-toggle]");
  const locateBtn = container.querySelector("[data-map-locate]");

  function showMessage(text) { message.textContent = text || ""; message.hidden = !text; }

  async function start() {
    if (!document.querySelector('link[href$="maplibre-gl.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "vendor/maplibre/maplibre-gl.css";
      document.head.appendChild(link);
    }
    try {
      const res = await fetch(STYLE_URL);
      if (!res.ok) throw new Error("style " + res.status);
      baseStyle = await res.json();
    } catch (e) {
      showMessage("The map needs an internet connection. Try again when you're back online.");
      return false;
    }
    map = new maplibregl.Map({
      container: container.querySelector(".map-canvas"),
      style: themed(baseStyle, currentTheme()),
      center: NORWICH_CENTRE,
      zoom: 13.2,
      minZoom: 11,
      maxBounds: [[0.95, 52.45], [1.65, 52.80]],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false
    });
    map.touchZoomRotate.disableRotation();
    map.on("click", closeCard);
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => map.setStyle(themed(baseStyle, currentTheme())));
    }
    return true;
  }

  // ---- pins ----
  function pinFor(pub) {
    const el = document.createElement("button");
    el.type = "button";
    if (pub.review) {
      el.className = "map-pin map-pin-reviewed";
      el.textContent = pub.review.overall === "00" ? "00" : String(pub.review.overall);
      el.setAttribute("aria-label", `${pub.name}, ${rb.scoreText(pub.review.overall)}`);
    } else {
      el.className = "map-pin";
      el.setAttribute("aria-label", `${pub.name}, not yet reviewed`);
    }
    el.addEventListener("click", (e) => { e.stopPropagation(); openCard(pub); });
    return el;
  }

  function render() {
    markers.forEach((m) => m.remove());
    markers = [];
    const shown = pubs.filter((p) => !reviewedOnly || p.review);
    // grey pins first so reviewed pins sit on top
    shown.sort((a, b) => (a.review ? 1 : 0) - (b.review ? 1 : 0));
    for (const pub of shown) markers.push(new maplibregl.Marker({ element: pinFor(pub) }).setLngLat([pub.lng, pub.lat]).addTo(map));
    const reviewed = pubs.filter((p) => p.review).length;
    count.textContent = `${pubs.length} pubs · ${reviewed} reviewed`;
  }

  // ---- preview card ----
  function openCard(pub) {
    const r = pub.review;
    const today = rb.todayHours(pub.hours, pub.hoursText);
    const hoursLine = today
      ? `<p class="map-card-hours">${esc(today)}${pub.hoursConfirmed ? "" : ' <span class="map-card-note">(unconfirmed)</span>'}</p>`
      : '<p class="map-card-hours map-card-note">Opening times unknown</p>';
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${pub.lat},${pub.lng}&travelmode=walking`;
    let html = '<button type="button" class="map-card-close" aria-label="Close">&times;</button>';
    if (r) {
      const tags = rb.highlights(r, 3).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
      html +=
        `<div class="map-card-head"><span class="map-card-score">${esc(rb.scoreText(r.overall))}</span><h3>${esc(r.title)}</h3></div>` +
        `<p class="map-card-verdict">${esc(r.verdict)}</p>` +
        (tags ? `<div class="chip-row">${tags}</div>` : "") +
        hoursLine +
        `<div class="share-row"><a class="share-btn primary" href="#review-${esc(r.slug)}">Read review</a>` +
        `<a class="share-btn" data-external href="${esc(directions)}" target="_blank" rel="noopener">Directions</a></div>`;
    } else {
      html +=
        `<div class="map-card-head"><h3>${esc(pub.name)}</h3></div>` +
        `<p class="map-card-note map-card-unreviewed">Not yet Ropebreak'd</p>` +
        (pub.address ? `<p class="map-card-address">${esc(pub.address)}</p>` : "") +
        hoursLine +
        '<div class="share-row">' +
        `<a class="share-btn" data-external href="${esc(directions)}" target="_blank" rel="noopener">Directions</a>` +
        (pub.website && /^https?:\/\//.test(pub.website) ? `<a class="share-btn" data-external href="${esc(pub.website)}" target="_blank" rel="noopener">Website</a>` : "") +
        "</div>";
    }
    card.innerHTML = html;
    card.hidden = false;
    card.querySelector(".map-card-close").addEventListener("click", closeCard);
    map.easeTo({ center: [pub.lng, pub.lat], offset: [0, -card.offsetHeight / 2], duration: rb.reduceMotion() ? 0 : 400 });
  }
  function closeCard() { card.hidden = true; }

  // ---- your location ----
  async function locate() {
    locateBtn.disabled = true;
    try {
      const pos = await rb.getPosition();
      const here = [pos.coords.longitude, pos.coords.latitude];
      if (!userMarker) {
        const dot = document.createElement("div");
        dot.className = "map-you";
        dot.setAttribute("aria-label", "You are here");
        userMarker = new maplibregl.Marker({ element: dot });
      }
      userMarker.setLngLat(here).addTo(map);
      const [[w, s], [e, n]] = NORWICH_BOUNDS;
      if (here[0] < w || here[0] > e || here[1] < s || here[1] > n) {
        rb.toast("You're outside Norwich, so the map stays on the city.");
      } else {
        map.flyTo({ center: here, zoom: Math.max(map.getZoom(), 15), duration: rb.reduceMotion() ? 0 : 800 });
      }
    } catch (e) {
      rb.toast(e && e.denied ? "Location is turned off for Ropebreak. You can allow it in your phone's settings." : "Couldn't find your location just now.");
    } finally {
      locateBtn.disabled = false;
    }
  }

  toggle.addEventListener("click", () => {
    reviewedOnly = !reviewedOnly;
    toggle.classList.toggle("active", reviewedOnly);
    toggle.setAttribute("aria-pressed", String(reviewedOnly));
    closeCard();
    render();
  });
  locateBtn.addEventListener("click", locate);

  let ready = null;
  return {
    async show(pubList) {
      pubs = pubList;
      if (!ready) ready = start();
      if (!(await ready)) { ready = null; return; }
      showMessage("");
      map.resize();
      render();
    },
    update(pubList) { pubs = pubList; if (map) render(); }
  };
}
