// Opening hours helpers shared by the pub-list updater and the content checker.
// Stored format: { mon: "12:00-23:00", tue: "closed", wed: "12:00-14:00,17:00-23:00", ... }
// A close time earlier than the open time means after midnight ("18:00-01:00").

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const OSM_DAYS = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
const RANGE = /^([01]\d|2[0-4]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d$/;

export function isValidDay(value) {
  return value === "closed" || (typeof value === "string" && value.split(",").every((r) => RANGE.test(r)));
}

// Converts the common forms of OpenStreetMap's opening_hours tag, e.g.
// "Mo-Th 12:00-23:00; Fr,Sa 12:00-01:00; Su 12:00-22:30". Anything more
// exotic (months, week numbers, sunrise...) returns null so it's never guessed.
export function parseOsmHours(text) {
  if (!text) return null;
  text = text.trim();
  if (text === "24/7") return Object.fromEntries(DAYS.map((d) => [d, "00:00-24:00"]));
  const result = {};
  let any = false;
  for (let rule of text.split(";")) {
    rule = rule.trim();
    if (!rule || /^PH\b/.test(rule)) continue; // bank holidays: not tracked
    let dayPart = "Mo-Su", timePart = rule;
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*)(?:\s*,\s*PH)?\s+(.+)$/);
    if (m) { dayPart = m[1]; timePart = m[2]; }
    else if (/^[A-Za-z]/.test(rule)) return null;
    const days = [];
    for (const token of dayPart.replace(/\s/g, "").split(",")) {
      const [a, b] = token.split("-");
      if (!(a in OSM_DAYS) || (b && !(b in OSM_DAYS))) return null;
      let i = OSM_DAYS[a];
      const end = b ? OSM_DAYS[b] : i;
      for (;;) { days.push(i); if (i === end) break; i = (i + 1) % 7; }
    }
    timePart = timePart.trim();
    let value;
    if (/^(off|closed)$/i.test(timePart)) value = "closed";
    else {
      value = timePart.replace(/\s/g, "").replace(/-24:00\+?$/, "-24:00").replace(/\+$/, "");
      if (!isValidDay(value)) return null;
    }
    for (const d of days) result[DAYS[d]] = value;
    any = true;
  }
  if (!any) return null;
  // in opening_hours, days that aren't mentioned are closed
  return Object.fromEntries(DAYS.map((d) => [d, result[d] || "closed"]));
}
