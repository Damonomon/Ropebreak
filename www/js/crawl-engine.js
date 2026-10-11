// Create-a-Crawl generator: picks and orders pubs that meet the user's rules.
// Pure logic (no page code) so it can be tested on its own.

// ---- assumptions (shown to users in the "Our assumptions" box) ----
export const ASSUMPTIONS = {
  minutesPerPub: 45,
  walkingMetresPerMinute: 75, // about 4.5 km/h, a relaxed pace
  streetFactor: 1.3           // streets are ~30% longer than a straight line
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ---- distances ----
export function metresBetween(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function walkMinutes(a, b) {
  return Math.max(1, Math.round((metresBetween(a, b) * ASSUMPTIONS.streetFactor) / ASSUMPTIONS.walkingMetresPerMinute));
}

// ---- opening hours ----
function toMinutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }

// Ranges for a day as [open, close] minutes, where close can pass 1440 (after midnight)
function rangesFor(hours, dayIndex) {
  const v = hours[DAY_KEYS[((dayIndex % 7) + 7) % 7]];
  if (!v || v === "closed") return [];
  return v.split(",").map((r) => {
    const [o, c] = r.split("-").map(toMinutes);
    return [o, c <= o ? c + 1440 : c];
  });
}

// Is the pub open from `start` for `duration` minutes? start is minutes from
// midnight of dayIndex and may run past 1440. Returns true/false, or null
// when the pub's hours are unknown.
export function openFor(pub, dayIndex, start, duration) {
  if (!pub.hours) return null;
  const end = start + duration;
  for (const shift of [0, -1, 1]) { // today's hours, last night's late close, tomorrow's
    for (const [o, c] of rangesFor(pub.hours, dayIndex + shift)) {
      const oo = o + shift * 1440, cc = c + shift * 1440;
      if (start >= oo && end <= cc) return true;
    }
  }
  return false;
}

// ---- rules ----
// rule: { quantity: "all"|"half"|"one"|"none", field, value }
// yesno fields match value "yes"; scale fields match value-or-better; multi
// fields match when the list includes value; choice fields match exactly.
export function makeMatcher(attributeGroups) {
  const fields = {};
  for (const g of attributeGroups || []) for (const f of g.fields) fields[f.id] = f;
  return function matches(pub, rule) {
    const f = fields[rule.field];
    const v = pub.review && pub.review.attributes ? pub.review.attributes[rule.field] : undefined;
    if (!f || v == null) return false;
    if (f.type === "yesno") return v === "yes";
    if (f.type === "multi") return [].concat(v).includes(rule.value);
    if (f.type === "scale") {
      const ids = f.options.map((o) => o.id);
      const have = ids.indexOf(v), want = ids.indexOf(rule.value);
      return have !== -1 && want !== -1 && have <= want;
    }
    return v === rule.value;
  };
}

export function requiredCount(rule, n) {
  if (rule.quantity === "all") return n;
  if (rule.quantity === "half") return Math.ceil(n / 2);
  if (rule.quantity === "one") return 1;
  return 0;
}

function scoreValue(overall) { return overall === "00" ? 0 : Number(overall) || 0; }

// ---- the generator ----
// options: { count, minRating, dayIndex, startMinutes, rules, attributes, variety }
// Returns { stops, totalWalk, unmetRules, shortBy, notes }
export function generateCrawl(pubs, options) {
  const n = options.count;
  const matches = makeMatcher(options.attributes);
  const rules = options.rules || [];
  const hard = rules.filter((r) => r.quantity === "all" || r.quantity === "none");
  const counted = rules.filter((r) => r.quantity === "half" || r.quantity === "one");
  const stay = ASSUMPTIONS.minutesPerPub;

  // pool: reviewed pubs with a location, the minimum rating and every all/none rule
  const pool = pubs.filter((p) =>
    p.review && typeof p.lat === "number" &&
    scoreValue(p.review.overall) >= (options.minRating || 0) &&
    hard.every((r) => (r.quantity === "all") === matches(p, r))
  );

  const need = (chosen) => counted.map((r) => requiredCount(r, n) - chosen.filter((p) => matches(p, r)).length);

  // Builds one crawl from a starting pub by repeatedly walking to the nearest
  // pub that's open on arrival, without making a counted rule impossible.
  function build(first) {
    const chosen = [first];
    let clock = options.startMinutes, at = first;
    if (openFor(first, options.dayIndex, clock, stay) === false) return null;
    while (chosen.length < n) {
      clock += stay;
      const slotsAfter = n - chosen.length - 1;
      const options_ = pool
        .filter((p) => !chosen.includes(p))
        .map((p) => ({ p, walk: walkMinutes(at, p) }))
        .filter(({ p, walk }) => openFor(p, options.dayIndex, clock + walk, stay) !== false)
        .sort((a, b) => a.walk - b.walk);
      const stillNeeded = need(chosen);
      // a pick is safe if every counted rule can still be met with the slots left
      const safe = options_.find(({ p }) => counted.every((r, i) => stillNeeded[i] - (matches(p, r) ? 1 : 0) <= slotsAfter));
      const pick = safe || options_[0];
      if (!pick) break;
      chosen.push(pick.p);
      clock += pick.walk;
      at = pick.p;
    }
    return chosen;
  }

  function evaluate(order) {
    let clock = options.startMinutes, totalWalk = 0;
    const stops = order.map((p, i) => {
      const walk = i === 0 ? 0 : walkMinutes(order[i - 1], p);
      clock += i === 0 ? 0 : stay + walk;
      totalWalk += walk;
      return { pub: p, walkFromPrevious: walk, arrive: clock, leave: clock + stay, open: openFor(p, options.dayIndex, clock, stay) };
    });
    const unmet = counted.filter((r) => order.filter((p) => matches(p, r)).length < requiredCount(r, n));
    return { stops, totalWalk, unmetRules: unmet };
  }

  // Shorten the walk while keeping everyone open on arrival: every order for
  // small crawls, otherwise repeated swaps of two stops (2-opt).
  function valid(e) { return !e.stops.some((s) => s.open === false); }
  function bestOrder(chosen) {
    let best = null;
    if (chosen.length <= 6) {
      const permute = (rest, path) => {
        if (!rest.length) {
          const e = evaluate(path);
          if (valid(e) && (!best || e.totalWalk < best.totalWalk)) best = e;
          return;
        }
        for (let i = 0; i < rest.length; i++) permute(rest.slice(0, i).concat(rest.slice(i + 1)), path.concat(rest[i]));
      };
      permute(chosen, []);
      return best || evaluate(chosen);
    }
    let order = chosen.slice(), current = evaluate(order), improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const trial = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          const e = evaluate(trial);
          if (valid(e) && (e.totalWalk < current.totalWalk || !valid(current))) { order = trial; current = e; improved = true; }
        }
      }
    }
    return current;
  }

  const candidates = [], seen = new Set();
  for (const first of pool) {
    const chosen = build(first);
    if (!chosen) continue;
    const key = chosen.map((p) => p.osm || p.name).sort().join("|");
    if (seen.has(key)) continue; // different starts often find the same pubs
    seen.add(key);
    candidates.push(bestOrder(chosen));
  }
  if (!candidates.length) {
    return { stops: [], totalWalk: 0, unmetRules: rules.slice(), shortBy: n, notes: poolNotes(pool.length) };
  }
  // rank: most pubs, fewest unmet rules, then least walking
  candidates.sort((a, b) =>
    b.stops.length - a.stops.length || a.unmetRules.length - b.unmetRules.length || a.totalWalk - b.totalWalk);
  // "variety" lets Shuffle pick among the good options instead of always the best
  const top = candidates.filter((c) =>
    c.stops.length === candidates[0].stops.length && c.unmetRules.length === candidates[0].unmetRules.length &&
    c.totalWalk <= candidates[0].totalWalk * 1.6 + 5);
  const unique = [];
  for (const c of top) {
    const key = c.stops.map((s) => s.pub.osm || s.pub.name).sort().join("|");
    if (!unique.some((u) => u.key === key)) unique.push({ key, c });
  }
  const chosen = unique[(options.variety || 0) % unique.length].c;
  return Object.assign(chosen, { shortBy: n - chosen.stops.length, notes: poolNotes(pool.length), options: unique.length });

  function poolNotes(size) { return size < n ? [`Only ${size} reviewed pubs match your rating and must-haves.`] : []; }
}
