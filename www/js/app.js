(function () {
  "use strict";

  var CONFIG = window.ROPEBREAK_CONFIG || {};
  var CACHE_KEY = "ropebreak.content.v1";
  var BUNDLED_BASE = "content/";

  // ---- radar chart axes: each category gets its own set ----
  var CATEGORY_AXES = {
    coffeeshop: ["Atmosphere", "Human interaction", "Would go back?", "Value for money"],
    coffee: ["Taste", "Caffeine hit", "Value for money", "Would order again?"],
    pub: ["Pint quality", "Atmosphere", "Would bring a mate?", "Toilet cleanliness"],
    beer: ["Taste", "Drinkability", "Value for money", "Would order again?"],
    wildcard: ["Would recommend?", "Felt illicit?", "Mental health boost?", "Felt attractive?"]
  };

  // controlled vocabulary of selectable characteristics, per category —
  // keeps them consistent and filterable, unlike the freeform chip tags
  var CHARACTERISTIC_OPTIONS = {
    coffeeshop: ["Cosy", "Good for laptops", "Quick in-and-out", "Great atmosphere", "Quiet", "Dog-friendly", "Good value"],
    coffee: ["Light", "Bold", "Sweet", "Bitter", "Fruity", "Smooth", "Budget-friendly", "Splurge-worthy"],
    pub: ["Cosy", "Lively", "Dog-friendly", "Good for groups", "Quiet pint", "Beer garden", "Good food"],
    beer: ["Light", "Strong", "Hoppy", "Malty", "Sessionable", "Fruity", "Budget-friendly", "Splurge-worthy"],
    wildcard: ["Memorable", "Chaotic", "Worth the trip", "One-time thing", "Would repeat"]
  };

  var CATEGORY_ORDER = ["coffeeshop", "coffee", "pub", "beer", "wildcard"];
  var CATEGORY_LABELS = { coffeeshop: "Coffee Shop", coffee: "Coffee", pub: "Pub", beer: "Beer", wildcard: "Wildcard" };
  var CATEGORY_ICONS = { coffeeshop: "shop-icon", coffee: "cup-icon", pub: "glass-icon", beer: "bottle-icon", wildcard: "bell-icon" };
  var LADDER_ORDER = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, "00"];

  var REVIEWS = {};      // slug -> review
  var REVIEW_LIST = [];  // in file order
  var contentBase = BUNDLED_BASE;
  var currentCategory = null;
  var selectedCharacteristics = new Set();
  var homeScrollY = 0;
  var lastView = null;

  // ---- platform helpers ----
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function plugin(name) {
    return isNative() && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null;
  }
  function siteUrl() {
    var s = (CONFIG.siteUrl || "").trim();
    if (!s) return "";
    return /\/$/.test(s) ? s : s + "/";
  }
  function reviewLink(slug) {
    if (siteUrl()) return siteUrl() + "#review-" + slug;
    if (!isNative() && /^https?:/.test(location.protocol)) return location.origin + location.pathname + "#review-" + slug;
    return "";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function scoreNum(overall) { return overall === "00" ? 0 : Number(overall) || 0; }
  function scoreText(overall) { return overall === "00" ? "00" : overall + "/10"; }
  function shortTitle(r) { return r.shortTitle || r.title; }
  function resolveMedia(src, base) {
    if (/^(https?:|data:)/.test(src)) return src;
    return (base || contentBase) + src;
  }

  // ---- content loading: bundled copy -> cached copy -> live site ----
  function loadBundled() {
    return fetch(BUNDLED_BASE + "reviews.json", { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error("bundled content missing");
      return res.json();
    });
  }
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeCache(entry) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch (e) { /* storage unavailable: fine */ }
  }
  function isValidContent(data) {
    return data && Array.isArray(data.reviews) && data.reviews.every(function (r) {
      return r && r.slug && CATEGORY_AXES[r.category];
    });
  }
  function remoteContentUrl() {
    return siteUrl() ? siteUrl() + (CONFIG.contentPath || "content/reviews.json") : "";
  }
  function remoteBase() {
    var path = CONFIG.contentPath || "content/reviews.json";
    return siteUrl() + path.replace(/[^/]*$/, "");
  }
  function fetchRemote() {
    var url = remoteContentUrl();
    if (!url) return Promise.resolve(null);
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 8000);
    return fetch(url + "?t=" + Date.now(), { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .finally(function () { clearTimeout(timer); });
  }

  var currentStamp = "";
  function applyContent(data, base) {
    var stamp = JSON.stringify(data);
    if (stamp === currentStamp) return false;
    currentStamp = stamp;
    contentBase = base;
    REVIEWS = {};
    REVIEW_LIST = data.reviews.slice();
    REVIEW_LIST.forEach(function (r) { REVIEWS[r.slug] = r; });
    renderGrid();
    renderRankings();
    showView(true);
    if (pubMap) pubMap.update(mergedPubs());
    return true;
  }

  function setStatus(text) {
    var el = document.getElementById("content-status");
    el.textContent = text || "";
    el.hidden = !text;
  }

  function refreshFromSite() {
    if (!isNative() || !remoteContentUrl()) return Promise.resolve();
    return fetchRemote().then(function (data) {
      if (!isValidContent(data)) return;
      var base = remoteBase();
      writeCache({ base: base, data: data, savedAt: new Date().toISOString() });
      applyContent(data, base);
      setStatus("");
    }).catch(function () {
      if (readCache()) setStatus("Offline — showing the reviews saved on this phone.");
    });
  }

  function start() {
    loadBundled().then(function (bundled) {
      var cached = isNative() ? readCache() : null;
      // prefer whichever copy is newer; a fresh app build beats an old cache
      if (cached && isValidContent(cached.data) && (cached.data.updated || "") >= (bundled.updated || "")) {
        applyContent(cached.data, cached.base);
      } else {
        applyContent(bundled, BUNDLED_BASE);
      }
      refreshFromSite();
    }).catch(function () {
      var cached = readCache();
      if (cached && isValidContent(cached.data)) applyContent(cached.data, cached.base);
      else document.getElementById("review-grid").innerHTML = '<p class="loading">Couldn\'t load the reviews. Try again in a moment.</p>';
    });
  }

  // ---- radar chart ----
  function wrapLabel(text, maxChars) {
    var words = text.split(" ");
    var lines = [], current = "";
    words.forEach(function (w) {
      var test = current ? current + " " + w : w;
      if (test.length > maxChars && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function radarSVG(axesLabels, scores) {
    var size = 380, cx = size / 2, cy = size / 2, radius = 82;
    var n = axesLabels.length;
    var step = (2 * Math.PI) / n;
    var start = -Math.PI / 2;
    var lineHeight = 12;
    function pt(i, r) {
      var a = start + i * step;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }
    var grid = "";
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var pts = [];
      for (var i = 0; i < n; i++) pts.push(pt(i, radius * f).join(","));
      grid += '<polygon points="' + pts.join(" ") + '" class="radar-grid"/>';
    });
    var axes = "";
    for (var i = 0; i < n; i++) {
      var p = pt(i, radius);
      axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" class="radar-axis"/>';
    }
    var dataPts = [];
    for (var j = 0; j < n; j++) dataPts.push(pt(j, radius * ((Number(scores[j]) || 0) / 10)).join(","));
    var labels = "";
    for (var k = 0; k < n; k++) {
      var lp = pt(k, radius + 26);
      var lines = wrapLabel(axesLabels[k], 12);
      var anchor = k === 1 ? "start" : k === 3 ? "end" : "middle";
      var startDy;
      if (k === 0) startDy = -(lines.length - 1) * lineHeight;
      else if (k === 2) startDy = 0;
      else startDy = -((lines.length - 1) * lineHeight) / 2;
      lines.forEach(function (line, li) {
        var y = lp[1] + startDy + li * lineHeight;
        labels += '<text x="' + lp[0] + '" y="' + y + '" class="radar-label" text-anchor="' + anchor + '">' + esc(line) + "</text>";
      });
    }
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" class="radar-svg" role="img" aria-label="Score radar">' +
      grid + axes + '<polygon points="' + dataPts.join(" ") + '" class="radar-data"/>' + labels + "</svg>";
  }

  function formatReviewDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  function confettiHTML() {
    var colors = ["var(--orange-bright)", "var(--navy)", "var(--pop-beer)", "var(--pop-coffeeshop)", "var(--orange-bright)", "var(--navy)"];
    var spans = "";
    for (var i = 0; i < 6; i++) {
      var angle = (i / 6) * Math.PI * 2;
      var dx = Math.round(Math.cos(angle) * 46) + "px";
      var dy = Math.round(Math.sin(angle) * 46) + "px";
      spans += '<span style="--dx:' + dx + ';--dy:' + dy + ';background:' + colors[i] + ';animation-delay:' + (i * 0.03) + 's"></span>';
    }
    return '<div class="score-fx" aria-hidden="true">' + spans + "</div>";
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function tagHTML(category) {
    return '<p class="tag tag-' + category + '"><svg class="tag-icon" aria-hidden="true"><use href="#' + CATEGORY_ICONS[category] + '"/></svg>' + CATEGORY_LABELS[category] + "</p>";
  }

  // ---- home grid ----
  function renderGrid() {
    var grid = document.getElementById("review-grid");
    grid.innerHTML = REVIEW_LIST.map(function (r) {
      return '<article class="ticket" data-category="' + r.category + '" data-review="' + esc(r.slug) + '">' +
        '<div class="badge-stamp' + (r.overall === 10 ? " badge-glow" : "") + '" aria-label="' + esc(r.overall) + ' out of 10">' + scoreText(r.overall) + "</div>" +
        tagHTML(r.category) +
        "<h3>" + esc(r.title) + "</h3>" +
        "<p>" + esc(r.teaser) + "</p>" +
        '<p><a class="read-link" href="#review-' + esc(r.slug) + '">Read the review &rarr;</a></p>' +
        "</article>";
    }).join("");
    updateGridDisplay();
  }

  function renderCharFilter(categoryKey) {
    var container = document.getElementById("char-filter");
    var options = categoryKey ? CHARACTERISTIC_OPTIONS[categoryKey] : null;
    if (!options) {
      container.hidden = true;
      container.innerHTML = "";
      container.removeAttribute("data-category");
      return;
    }
    container.hidden = false;
    container.setAttribute("data-category", categoryKey);
    container.innerHTML = options.map(function (opt) {
      var active = selectedCharacteristics.has(opt) ? " active" : "";
      return '<button type="button" class="char-chip' + active + '" data-char="' + esc(opt) + '" aria-pressed="' + (active ? "true" : "false") + '">' + esc(opt) + "</button>";
    }).join("");
  }

  function filterGrid(categoryKey) {
    if (categoryKey !== currentCategory) selectedCharacteristics.clear();
    currentCategory = categoryKey;
    renderCharFilter(categoryKey);
    updateGridDisplay();
  }

  function updateGridDisplay() {
    var grid = document.getElementById("review-grid");
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".ticket"));
    var sortMode = document.getElementById("sort-select").value;
    var minRating = parseInt(document.getElementById("min-rating-select").value, 10) || 0;

    cards.sort(function (a, b) {
      var ra = REVIEWS[a.getAttribute("data-review")] || {};
      var rb = REVIEWS[b.getAttribute("data-review")] || {};
      if (sortMode === "high") return scoreNum(rb.overall) - scoreNum(ra.overall);
      if (sortMode === "low") return scoreNum(ra.overall) - scoreNum(rb.overall);
      // "latest" — sorted by each review's date, newest first
      var da = ra.date || "", db = rb.date || "";
      return da < db ? 1 : da > db ? -1 : 0;
    });
    cards.forEach(function (card) { grid.appendChild(card); });

    var visibleCount = 0;
    cards.forEach(function (card) {
      var rev = REVIEWS[card.getAttribute("data-review")];
      var matchesCategory = !currentCategory || card.getAttribute("data-category") === currentCategory;
      var matchesRating = !rev || scoreNum(rev.overall) >= minRating;
      var matchesChar = selectedCharacteristics.size === 0 || Array.from(selectedCharacteristics).every(function (c) {
        return rev && rev.characteristics && rev.characteristics.indexOf(c) !== -1;
      });
      var show = matchesCategory && matchesRating && matchesChar;
      card.hidden = !show;
      if (show) visibleCount++;
    });

    var heading = document.getElementById("reviews-heading");
    if (currentCategory) {
      heading.textContent = CATEGORY_LABELS[currentCategory] + " reviews";
    } else {
      heading.textContent = "Latest entries";
    }
    document.getElementById("reviews-note").hidden = !!currentCategory;
    document.getElementById("filter-back").hidden = !currentCategory;
    document.getElementById("ladder-teaser").hidden = !!currentCategory;
    document.getElementById("no-reviews-msg").hidden = visibleCount !== 0 || cards.length === 0;
  }

  // ---- single review page ----
  function bodyHTML(blocks) {
    return (blocks || []).map(function (b) {
      if (typeof b === "string") return "<p>" + esc(b) + "</p>";
      if (b.quote) return '<blockquote class="pull-quote">' + esc(b.quote) + "</blockquote>";
      if (b.list) return "<ul>" + b.list.map(function (li) { return "<li>" + esc(li) + "</li>"; }).join("") + "</ul>";
      return "<p>" + esc(b.p) + "</p>";
    }).join("");
  }

  function renderDetail(r) {
    var el = document.getElementById("review-detail");
    el.setAttribute("data-category", r.category);
    var circleClass = "score-circle", fx = "";
    if (r.overall === 10 && !reduceMotion()) { circleClass += " celebrate"; fx = confettiHTML(); }
    else if ((r.overall === 0 || r.overall === "00") && !reduceMotion()) circleClass += " commiserate";
    var maxSpan = r.overall === "00" ? "" : '<span class="circle-max">/10</span>';
    var photo = r.photo && r.photo.src
      ? '<img class="media-photo" src="' + esc(resolveMedia(r.photo.src)) + '" data-fallback="' + esc(resolveMedia(r.photo.src, BUNDLED_BASE)) + '" alt="' + esc(r.photo.alt || "") + '" loading="lazy">'
      : "";
    var receipt = (r.receipt || []).map(function (line) {
      return '<div class="receipt-line"><span>' + esc(line[0]) + '</span><span class="val">' + esc(line[1]) + "</span></div>";
    }).join("");
    var mapBtn = r.map
      ? '<a class="share-btn" data-external href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(r.map) + '" target="_blank" rel="noopener">View on map</a>'
      : "";

    el.innerHTML =
      '<a class="back-link" href="#reviews">&larr; All reviews</a>' +
      '<div class="detail-head">' + tagHTML(r.category) +
        "<h2>" + esc(r.title) + "</h2>" +
        '<div class="chip-row">' + (r.chips || []).map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</div>" +
        (r.date ? '<p class="review-date">Reviewed ' + formatReviewDate(r.date) + "</p>" : "") +
        '<p class="jump-to-score"><a href="#review-' + esc(r.slug) + '" data-jump="score-' + esc(r.slug) + '">Just here for the number? Jump to the score &rarr;</a></p>' +
      "</div>" +
      '<div class="detail-body">' +
        '<div class="detail-text">' + photo + bodyHTML(r.body) + "</div>" +
        '<div class="detail-side">' +
          '<div class="radar-box"><div class="score-hero" id="score-' + esc(r.slug) + '">' +
            '<h4 class="box-heading verdict-heading">The verdict</h4>' +
            '<div class="' + circleClass + '">' + fx + '<span class="score-value">' + esc(r.overall) + maxSpan + "</span></div>" +
            '<p class="score-verdict">' + esc(r.verdict) + "</p>" +
          "</div></div>" +
          '<div class="radar-box"><h4 class="box-heading box-heading-sub">How it breaks down</h4>' +
            '<div class="radar-svg-holder">' + radarSVG(CATEGORY_AXES[r.category], r.radar || []) + "</div></div>" +
          '<div class="receipt-wrap"><div class="receipt">' +
            '<div class="receipt-header"><div class="brand">ROPEBREAK</div><div class="sub">' + esc(shortTitle(r)) + '</div><div class="date">' + formatReviewDate(r.date) + "</div></div>" +
            '<div class="receipt-ropes" aria-hidden="true"><span></span><span></span><span></span></div>' +
            receipt +
            '<div class="receipt-total"><span>Verdict</span><span>' + (r.overall === "00" ? "00" : esc(r.overall) + " / 10") + "</span></div>" +
            '<div class="receipt-footer">NO REFUNDS</div>' +
            '<svg class="receipt-mark" aria-hidden="true"><use href="#bell-icon"/></svg>' +
          "</div></div>" +
          '<div class="share"><span class="share-label">Share this</span><div class="share-row">' +
            '<button type="button" class="share-btn primary" data-share="' + esc(r.slug) + '">Share review</button>' +
            mapBtn +
          "</div></div>" +
        "</div>" +
      "</div>";

    var img = el.querySelector(".media-photo");
    if (img) {
      img.addEventListener("error", function onErr() {
        var fb = img.getAttribute("data-fallback");
        if (fb && img.getAttribute("src") !== fb) img.setAttribute("src", fb);
        else { img.removeEventListener("error", onErr); img.remove(); }
      });
    }
  }

  // ---- rankings ladder: one fixed 10-to-00 scale per category ----
  function scoreLabel(s) { return s === 10 ? "Perfect 10" : String(s); }

  function renderRankings() {
    var board = document.getElementById("rank-board");
    board.innerHTML = CATEGORY_ORDER.map(function (cat) {
      var byScore = {};
      REVIEW_LIST.filter(function (r) { return r.category === cat; }).forEach(function (r) {
        var key = r.overall === "00" ? "00" : Number(r.overall);
        (byScore[key] = byScore[key] || []).push(r);
      });
      var rows = LADDER_ORDER.map(function (s) {
        var items = byScore[s];
        var cls = "rank-row" + (items ? " filled" : "") + (s === "00" ? " zero-zero" : "");
        var names = items
          ? items.map(function (r) { return '<a href="#review-' + esc(r.slug) + '">' + esc(shortTitle(r)) + "</a>"; }).join(", ")
          : '<span class="rank-empty">—</span>';
        return '<li class="' + cls + '"><span class="rank-score">' + scoreLabel(s) + '</span><span class="rank-names">' + names + "</span></li>";
      }).join("");
      return '<div class="rank-category"><h3 class="rank-cat-title"><svg aria-hidden="true"><use href="#' + CATEGORY_ICONS[cat] + '"/></svg>' +
        CATEGORY_LABELS[cat] + '</h3><ol class="rank-ladder">' + rows + "</ol></div>";
    }).join("");
  }

  // ---- routing (hash based, so links shared from the website still work) ----
  function showView(contentChanged) {
    var hash = location.hash.replace("#", "");
    if (hash === "main") return;
    var slug = hash.indexOf("review-") === 0 ? hash.slice(7) : null;
    var review = slug && REVIEWS[slug];
    var categoryKey = hash.indexOf("cat-") === 0 ? hash.slice(4) : null;
    var isCategory = !!(categoryKey && CATEGORY_LABELS[categoryKey]);
    var isMap = hash === "map";
    var isCrawl = hash === "crawl";
    var isFullPage = !!review || hash === "rankings" || hash === "about" || isMap || isCrawl;
    var isSubPage = isFullPage || isCategory;
    var view = review ? "review:" + slug : (isFullPage || isCategory) ? hash : "home";

    if (lastView === "home" && view !== "home") homeScrollY = window.scrollY;

    var detail = document.getElementById("review-detail");
    if (review && (view !== lastView || contentChanged === true)) renderDetail(review);
    detail.hidden = !review;
    document.getElementById("rankings").hidden = hash !== "rankings";
    document.getElementById("about").hidden = hash !== "about";
    document.getElementById("map-page").hidden = !isMap;
    document.documentElement.classList.toggle("on-map", isMap);
    if (isMap && view !== lastView) openMapPage();
    document.getElementById("crawl-page").hidden = !isCrawl;
    if (isCrawl && view !== lastView) openCrawlPage();
    document.getElementById("home-intro").hidden = isSubPage;
    document.getElementById("reviews").hidden = isFullPage;
    filterGrid(isCategory ? categoryKey : null);

    if (view !== lastView) {
      if (isSubPage) window.scrollTo(0, 0);
      else if (lastView && lastView !== "home") window.scrollTo(0, homeScrollY);
    }
    lastView = view;
  }

  // ---- sharing & links ----
  function shareReview(slug, btn) {
    var r = REVIEWS[slug];
    if (!r) return;
    var url = reviewLink(slug);
    var title = r.title + " — Ropebreak";
    var text = r.title + " — " + scoreText(r.overall) + " on Ropebreak. “" + r.verdict + "”";
    var Share = plugin("Share");
    if (Share) {
      var opts = { title: title, text: text, dialogTitle: "Share this review" };
      if (url) opts.url = url;
      Share.share(opts).catch(function () { /* user closed the sheet */ });
      return;
    }
    if (navigator.share) {
      navigator.share(url ? { title: title, text: text, url: url } : { title: title, text: text }).catch(function () {});
      return;
    }
    var original = btn.textContent;
    function flash(msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = original; }, 1500); }
    try {
      navigator.clipboard.writeText(url ? text + " " + url : text).then(function () { flash("Link copied!"); }, function () { flash("Couldn't copy"); });
    } catch (e) { flash("Couldn't copy"); }
  }

  function openExternal(url) {
    var Browser = plugin("Browser");
    if (Browser) Browser.open({ url: url });
    else window.open(url, "_blank", "noopener");
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var chip = t.closest(".char-chip");
    if (chip) {
      var val = chip.getAttribute("data-char");
      if (selectedCharacteristics.has(val)) selectedCharacteristics.delete(val);
      else selectedCharacteristics.add(val);
      renderCharFilter(currentCategory);
      updateGridDisplay();
      return;
    }
    var jump = t.closest("[data-jump]");
    if (jump) {
      e.preventDefault();
      var target = document.getElementById(jump.getAttribute("data-jump"));
      if (target) target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      return;
    }
    var share = t.closest("[data-share]");
    if (share) { shareReview(share.getAttribute("data-share"), share); return; }
    var ext = t.closest("a[data-external]");
    if (ext && isNative()) { e.preventDefault(); openExternal(ext.href); return; }
    // close the Reviews dropdown when tapping anywhere else
    var dropdown = document.querySelector(".nav-dropdown");
    if (dropdown && dropdown.open && (!t.closest(".nav-dropdown") || t.closest(".nav-dropdown-menu a"))) dropdown.open = false;
  });

  var navigatedInApp = false;
  window.addEventListener("hashchange", function () { navigatedInApp = true; showView(); });
  document.getElementById("sort-select").addEventListener("change", updateGridDisplay);
  document.getElementById("min-rating-select").addEventListener("change", updateGridDisplay);

  // ---- standout tags: a review's most notable attributes ----
  var ATTRIBUTES = {};
  var YES_WEIGHTS = { beerGarden: 3, sport: 2, dogFriendly: 2, heaters: 1, darts: 1, pool: 1, stepFree: 1, accessibleToilet: 1 };
  var PLAIN_CHOICES = { ideal: true, normal: true }; // unremarkable temp/lighting

  // Picks the n most notable attributes. A review can choose its own with
  // "highlights": ["toilets", "beerGarden", "vibe"].
  function highlights(review, n) {
    var groups = ATTRIBUTES[review.category];
    var values = review.attributes || {};
    if (!groups) return [];
    var picks = [];
    groups.forEach(function (g) {
      g.fields.forEach(function (f) {
        var v = values[f.id];
        if (v == null || (Array.isArray(v) && !v.length)) return;
        var label = function (id) { var o = (f.options || []).filter(function (x) { return x.id === id; })[0]; return o ? o.label : id; };
        var weight = 0, text;
        if (f.type === "yesno") { weight = v === "yes" ? (YES_WEIGHTS[f.id] || 1) : 0; text = f.label; }
        else if (f.type === "scale") {
          var i = f.options.map(function (o) { return o.id; }).indexOf(v);
          weight = i === 0 || i === f.options.length - 1 ? 3 : 0;
          text = f.label + ": " + label(v);
        } else if (f.type === "choice") { weight = PLAIN_CHOICES[v] ? 0 : 1.5; text = f.label + ": " + label(v); }
        else {
          var labels = [].concat(v).map(label).join(", ");
          weight = f.id === "vibe" ? 2 : 1;
          text = f.id === "vibe" ? labels : f.label + ": " + labels;
        }
        picks.push({ id: f.id, weight: weight, text: text, order: picks.length });
      });
    });
    if (Array.isArray(review.highlights) && review.highlights.length) {
      return review.highlights.map(function (id) { return picks.filter(function (p) { return p.id === id; })[0]; })
        .filter(Boolean).slice(0, n).map(function (p) { return p.text; });
    }
    return picks.filter(function (p) { return p.weight > 0; })
      .sort(function (a, b) { return b.weight - a.weight || a.order - b.order; })
      .slice(0, n).map(function (p) { return p.text; });
  }

  // ---- opening times ----
  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  function todayHours(hours, hoursText) {
    if (hours) {
      var v = hours[DAY_KEYS[new Date().getDay()]];
      if (!v) return "";
      return v === "closed" ? "Closed today" : "Open today " + v.replace(/-/g, "–").replace(/,/g, ", ").replace(/24:00/g, "midnight");
    }
    return hoursText ? "Hours: " + hoursText : "";
  }

  // ---- other content files (pub list, attributes): bundled copy, cached copy, live site ----
  function cacheKey(file) { return "ropebreak." + file; }
  function loadContentFile(file) {
    return fetch(BUNDLED_BASE + file, { cache: "no-cache" })
      .then(function (res) { if (!res.ok) throw new Error(file + " missing"); return res.json(); })
      .then(function (bundled) {
        var cached = null;
        if (isNative()) { try { cached = JSON.parse(localStorage.getItem(cacheKey(file))); } catch (e) { /* none */ } }
        return cached && (cached.updated || "") >= (bundled.updated || "") ? cached : bundled;
      }, function (err) {
        try { var c = JSON.parse(localStorage.getItem(cacheKey(file))); if (c) return c; } catch (e) { /* none */ }
        throw err;
      });
  }
  function refreshContentFile(file) {
    if (!isNative() || !siteUrl()) return Promise.resolve(null);
    return fetch(siteUrl() + "content/" + file + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (data) {
        try { localStorage.setItem(cacheKey(file), JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
        return data;
      }, function () { return null; });
  }
  var attributesReady = loadContentFile("attributes.json").then(function (a) { ATTRIBUTES = a; }, function () {});
  refreshContentFile("attributes.json").then(function (a) { if (a && a.pub) ATTRIBUTES = a; });

  // ---- pub map page ----
  var pubMap = null, pubListData = null;

  function mergedPubs() {
    var byOsm = {};
    var list = (pubListData && pubListData.pubs || []).map(function (p) {
      var copy = Object.assign({}, p, { hoursConfirmed: false });
      byOsm[p.osm] = copy;
      return copy;
    });
    REVIEW_LIST.forEach(function (r) {
      if (r.category !== "pub" || !r.place) return;
      var base = r.place.osm && byOsm[r.place.osm];
      var merged = Object.assign({}, base || {}, r.place, { name: r.title, review: r, hoursConfirmed: !!r.place.hours });
      if (!r.place.hours && base) { merged.hours = base.hours; merged.hoursText = base.hoursText; }
      if (typeof merged.lat !== "number" || typeof merged.lng !== "number") return;
      if (base) list[list.indexOf(base)] = merged;
      else list.push(merged);
    });
    list.forEach(function (p) { p.id = p.osm || (p.review && p.review.slug ? "review/" + p.review.slug : p.name); });
    return list;
  }

  function setHeaderHeight() {
    document.documentElement.style.setProperty("--header-h", document.querySelector("header").offsetHeight + "px");
  }

  function openMapPage() {
    setHeaderHeight();
    var page = document.getElementById("map-page");
    Promise.all([
      pubListData ? null : loadContentFile("norwich-pubs.json").then(function (d) { pubListData = d; }),
      attributesReady,
      pubMap ? null : import("./map.js").then(function (m) { pubMap = m.createPubMap(page, mapHelpers); })
    ]).then(function () {
      return pubMap.show(mergedPubs());
    }).catch(function (err) {
      if (window.console) console.error("map:", err);
      var msg = page.querySelector(".map-message");
      msg.textContent = "Couldn't load the map just now.";
      msg.hidden = false;
    });
    refreshContentFile("norwich-pubs.json").then(function (d) {
      if (d && d.pubs && pubMap) { pubListData = d; pubMap.update(mergedPubs()); }
    });
  }
  window.addEventListener("resize", function () { if (lastView === "map") setHeaderHeight(); });

  function getPosition() {
    var Geo = plugin("Geolocation");
    if (Geo) {
      return Geo.requestPermissions({ permissions: ["location"] }).then(function (p) {
        if (p && p.location === "denied") { var err = new Error("denied"); err.denied = true; throw err; }
        return Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      });
    }
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error("unsupported")); return; }
      navigator.geolocation.getCurrentPosition(resolve, function (e) {
        var err = new Error(e.message); err.denied = e.code === 1; reject(err);
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  var toastTimer = null;
  function toast(text) {
    var el = document.getElementById("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // ---- Create-a-Crawl page ----
  var crawlPage = null, demoPubs = null;
  function openCrawlPage() {
    var section = document.getElementById("crawl-page");
    Promise.all([
      pubListData ? null : loadContentFile("norwich-pubs.json").then(function (d) { pubListData = d; }),
      demoPubs ? null : loadContentFile("demo-pubs.json").then(function (d) {
        demoPubs = d.pubs.map(function (p) { return Object.assign({}, p, { hoursConfirmed: true }); });
      }),
      attributesReady,
      crawlPage ? null : import("./crawl.js").then(function (m) { crawlPage = m.createCrawlPage(section, mapHelpers); })
    ]).then(function () {
      crawlPage.show({ pubs: mergedPubs(), demoPubs: demoPubs, attributes: ATTRIBUTES.pub || [] });
    }).catch(function (err) {
      if (window.console) console.error("crawl:", err);
      toast("Couldn't load Create a Crawl just now.");
    });
  }

  // ---- "your crawl": pubs picked on the map or the crawl page (kept on this device) ----
  var SELECTION_KEY = "ropebreak.crawlSelection";
  var crawlSelection = [];
  try { crawlSelection = JSON.parse(localStorage.getItem(SELECTION_KEY)) || []; } catch (e) { crawlSelection = []; }
  function saveSelection() {
    try { localStorage.setItem(SELECTION_KEY, JSON.stringify(crawlSelection)); } catch (e) { /* storage unavailable */ }
    var btn = document.querySelector(".map-crawl-btn");
    if (btn) btn.innerHTML = crawlSelection.length ? "Your crawl (" + crawlSelection.length + ") &rarr;" : "Create a Crawl &rarr;";
  }
  var selection = {
    max: 10,
    ids: function () { return crawlSelection.slice(); },
    has: function (id) { return crawlSelection.indexOf(id) !== -1; },
    add: function (id) { if (!selection.has(id) && crawlSelection.length < selection.max) { crawlSelection.push(id); saveSelection(); } return selection.has(id); },
    remove: function (id) { crawlSelection = crawlSelection.filter(function (x) { return x !== id; }); saveSelection(); }
  };
  saveSelection();

  var mapHelpers = {
    esc: esc, scoreText: scoreText, reduceMotion: reduceMotion,
    highlights: highlights, todayHours: todayHours, getPosition: getPosition, toast: toast,
    selection: selection
  };

  // ---- native app wiring ----
  if (isNative()) {
    document.documentElement.classList.add("native-app");
    var App = plugin("App");
    if (App) {
      App.addListener("backButton", function () {
        var dropdown = document.querySelector(".nav-dropdown");
        if (dropdown && dropdown.open) { dropdown.open = false; return; }
        var hash = location.hash.replace("#", "");
        if (!hash || hash === "reviews") App.exitApp();
        else if (navigatedInApp) history.back();
        else location.hash = "reviews";
      });
      // check for new reviews whenever the app comes back to the foreground
      App.addListener("resume", function () { refreshFromSite(); });
    }
    var Splash = plugin("SplashScreen");
    if (Splash) setTimeout(function () { Splash.hide(); }, 150);
  }

  start();
})();
