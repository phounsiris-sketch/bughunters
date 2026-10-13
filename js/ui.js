/* ============================================================
   ui.js — small shared components. Rules every screen follows:
   1. A picture before words: a bar, ring, dot or icon says it first.
   2. A person is always a photo AND a name (personHtml / peopleHtml).
   3. One status colour language (pillHtml).
   Depends on: app.js (avatarHtml, escapeHtml), polls.js (getUserName),
               icons.js (icon), i18n.js (t)
   ============================================================ */

/** One person: round photo + name (+ small second line). */
function personHtml(uid, size, sub) {
  return '<span class="person-chip">' + avatarHtml(uid, size || 24) +
    '<span class="person-n">' + getUserName(uid) + (sub ? '<small>' + sub + '</small>' : '') + '</span></span>';
}

/** A few people, each photo + name, then "+N". `limit` defaults to 3. */
function peopleHtml(uids, size, limit) {
  uids = uids || [];
  limit = limit || 3;
  var html = '<span class="people-row">';
  uids.slice(0, limit).forEach(function (u) { html += personHtml(u, size || 22); });
  if (uids.length > limit) html += '<span class="people-more">+' + (uids.length - limit) + '</span>';
  return html + '</span>';
}

/** A team of players, one under the other, A→Z (photo + name each). */
function teamHtml(team, size) {
  var list = typeof byNameAZ === "function" ? byNameAZ(team || []) : (team || []);
  return '<span class="team-col">' + list.map(function (u) { return personHtml(u, size || 24); }).join("") + '</span>';
}

/** Status pill. kind: blue | teal | orange | green | red | gray */
function pillHtml(kind, text) {
  return '<span class="pill pill-' + kind + '">' + text + '</span>';
}

/** One bar, three colours: in / maybe / out, with icon counts and how many are needed. */
function voteBarHtml(inN, maybeN, outN, need) {
  var total = Math.max(1, inN + maybeN + outN);
  var seg = function (n, cls) { return n ? '<i class="' + cls + '" style="flex:' + n + '"></i>' : ''; };
  return '<div class="vote-bar">' + seg(inN, "in") + seg(maybeN, "maybe") + seg(outN, "out") + (total === 1 && !inN && !maybeN && !outN ? '<i class="none" style="flex:1"></i>' : '') + '</div>' +
    '<div class="vote-bar-nums"><span class="in">' + icon("check", 14) + ' ' + inN + '</span>' +
    (maybeN ? '<span class="maybe">' + icon("clock", 14) + ' ' + maybeN + '</span>' : '') +
    (outN ? '<span class="out">' + icon("close", 14) + ' ' + outN + '</span>' : '') +
    (need ? '<span class="need">' + t("pollNeed").replace("{n}", need) + '</span>' : '') + '</div>';
}

/** Plan · Play · Pay · Done. step is 0..3. */
function trackerHtml(step) {
  var labels = [t("trkPlan"), t("trkPlay"), t("trkPay"), t("trkDone")];
  var html = '<div class="trk">';
  labels.forEach(function (l, i) {
    var cls = i < step ? " done" : i === step ? " cur" : "";
    html += '<div class="trk-step' + cls + '"><span class="trk-dot">' + (i < step ? icon("check", 12) : (i + 1)) + '</span><small>' + l + '</small></div>';
    if (i < labels.length - 1) html += '<span class="trk-line' + (i < step ? " done" : "") + '"></span>';
  });
  return html + '</div>';
}

/** SAT / 17 date block. */
function dateBlockHtml(iso) {
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return '<span class="date-block"><span>' + weekdayShort(d.getDay()) + '</span><b>' + d.getDate() + '</b></span>';
}

/** Icon + value, e.g. people 6/8. */
function iconStatHtml(iconName, value, cls) {
  return '<span class="icon-stat' + (cls ? ' ' + cls : '') + '">' + icon(iconName, 16) + ' ' + value + '</span>';
}

/** Step bar for the create flows: steps 0-based, labels as an array */
function wizBarHtml(step, labels) {
  return '<div class="wiz"><div class="wiz-bars">' + labels.map(function (l, i) { return '<i' + (i <= step ? ' class="on"' : '') + '></i>'; }).join("") + '</div>' +
    '<div class="wiz-labels">' + labels.map(function (l, i) { return '<span' + (i === step ? ' class="on"' : '') + '>' + (i + 1) + ' ' + l + '</span>'; }).join("") + '</div></div>';
}

/** Seven days from today as buttons; the picked day is highlighted. pick = name of a function taking "YYYY-MM-DD". */
function dayStripHtml(selected, pick) {
  var base = new Date(); base.setMinutes(base.getMinutes() - base.getTimezoneOffset());
  var html = '<div class="day-strip">', seen = false;
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime() + i * 86400000), iso = d.toISOString().split("T")[0], on = iso === selected;
    if (on) seen = true;
    html += '<button type="button" class="day-chip' + (on ? ' on' : '') + '" onclick="' + pick + '(\'' + iso + '\')"><small>' + weekdayShort(d.getUTCDay()) + '</small><b>' + d.getUTCDate() + '</b></button>';
  }
  return html + '</div>' + (selected && !seen ? '<div class="form-hint" style="margin-top:6px">' + icon("calendar", 12) + ' ' + fmtDate(selected) + '</div>' : '');
}

/** Calendar: this week by default, a full month when expanded.
 *  opts: { month: "YYYY-MM", anchor: "YYYY-MM-DD" (a day in the week to show), expanded: bool, counts: { date: n }, selected: "date"|"",
 *          pick: "fn" (called with the date; the same date again clears it), nav: "fn" (called with -1 / +1: a week or a month), toggle: "fn" } */
function calendarHtml(opts) {
  var today = _todayIso(), counts = opts.counts || {};
  var cell = function (iso, d) {
    var n = counts[iso] || 0;
    var cls = "cal-day" + (iso === today ? " today" : "") + (iso === opts.selected ? " sel" : "") + (n ? " has" : "");
    return '<button type="button" class="' + cls + '" onclick="' + opts.pick + '(\'' + iso + '\')"><b>' + d + '</b>' + (n ? '<span class="cal-dots">' + Array(Math.min(n, 3) + 1).join('<s></s>') + '</span>' : '') + '</button>';
  };
  var html, title;
  if (opts.expanded) {
    var p = opts.month.split("-").map(Number), y = p[0], m = p[1] - 1;
    var lead = new Date(Date.UTC(y, m, 1)).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    title = monthShort(m) + ' ' + y;
    html = '<div class="cal-grid">';
    for (var w = 0; w < 7; w++) html += '<span class="cal-dow">' + weekdayNarrow(w) + '</span>';
    for (var i = 0; i < lead; i++) html += '<span></span>';
    for (var d = 1; d <= days; d++) html += cell(opts.month + "-" + (d < 10 ? "0" : "") + d, d);
    html += '</div>';
  } else {
    var anchor = opts.anchor || today, a = anchor.split("-").map(Number);
    var dow = new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay(), start = _addDays(anchor, -dow);
    var s0 = start.split("-").map(Number);
    title = monthShort(s0[1] - 1) + ' ' + s0[0];
    html = '<div class="cal-grid">';
    for (var k = 0; k < 7; k++) html += '<span class="cal-dow">' + weekdayNarrow(k) + '</span>';
    for (var k2 = 0; k2 < 7; k2++) { var iso = _addDays(start, k2); html += cell(iso, Number(iso.slice(8))); }
    html += '</div>';
  }
  return '<div class="cal' + (opts.expanded ? ' open' : '') + '"><div class="cal-head"><button type="button" class="cal-nav" aria-label="' + t("prev") + '" onclick="' + opts.nav + '(-1)">' + icon("back", 18) + '</button>' +
    '<b>' + title + '</b><button type="button" class="cal-nav" aria-label="' + t("next") + '" onclick="' + opts.nav + '(1)">' + icon("chevron", 18) + '</button></div>' + html +
    '<button type="button" class="cal-toggle" onclick="' + opts.toggle + '()">' + t(opts.expanded ? "calWeek" : "calMonth") + ' ' + icon("chevron", 14, opts.expanded ? "cal-chev up" : "cal-chev") + '</button></div>';
}

/** "Repeat" control for create forms. obj = name of the state object (it has .repeat and .repeatN), rerender = name of its render function. */
function repeatFieldHtml(obj, st, rerender) {
  var on = st.repeat === "weekly", n = st.repeatN || 4;
  return '<div class="card repeat-field"><div class="card-title">' + icon("history", 14) + ' ' + t("repeatLabel") + '</div>' +
    '<div class="seg seg-wrap"><button type="button" class="seg-btn' + (!on ? ' active' : '') + '" onclick="' + obj + '.repeat=\'none\';' + rerender + '()">' + t("repeatNone") + '</button>' +
    '<button type="button" class="seg-btn' + (on ? ' active' : '') + '" onclick="' + obj + '.repeat=\'weekly\';' + obj + '.repeatN=' + obj + '.repeatN||4;' + rerender + '()">' + t("repeatWeekly") + '</button></div>' +
    (on ? '<div class="stepper" style="margin-top:8px"><button type="button" onclick="' + obj + '.repeatN=Math.max(2,' + n + '-1);' + rerender + '()">\u2212</button><b>' + t("repeatTimes").replace("{n}", n) + '</b>' +
      '<button type="button" onclick="' + obj + '.repeatN=Math.min(12,' + n + '+1);' + rerender + '()">+</button></div>' : '') + '</div>';
}
