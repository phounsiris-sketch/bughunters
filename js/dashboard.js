/* ============================================================
   dashboard.js — Balance (who owes whom), Spending (per month /
                  year), Activity (played + poll participation)
   Depends on: sessions.js (lastSessions, computeLedger, openTransfers,
               loadSessions), polls.js (lastPolls, loadPolls, getUserName),
               i18n.js (t), app.js (COLORS, fmtLAK, fmtShort, fmtDate)
   ============================================================ */

var dashPeriod = "monthly";
var dashTab = "leaders";


function loadDashboard() {
  // Reuse the app-wide listeners (they re-render the dashboard on change)
  loadSessions();
  loadPolls();
  _renderDashboard();
}

function switchDashTab(tab) {
  dashTab = tab;
  _renderDashboard();
}

function setPeriod(period) {
  dashPeriod = period;
  _renderDashboard();
}

/* ---------- Period helpers ---------- */

function _inPeriod(dateObj, period) {
  if (!dateObj || isNaN(dateObj.getTime())) return period === "all";
  var now = new Date();
  if (period === "all") return true;
  if (dateObj.getFullYear() !== now.getFullYear()) return false;
  if (period === "yearly") return true;
  if (period === "quarterly") return Math.floor(dateObj.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  return dateObj.getMonth() === now.getMonth();
}

function _sessionDate(s) {
  return s.date ? new Date(s.date + "T00:00:00") : null;
}

function _pollDate(p) {
  if (p.createdAt && typeof p.createdAt.toDate === "function") return p.createdAt.toDate();
  return null;
}

function _periodLabel() {
  var now = new Date();
  if (dashPeriod === "monthly") return monthShort(now.getMonth()) + " " + now.getFullYear();
  if (dashPeriod === "quarterly") return "Q" + (Math.floor(now.getMonth() / 3) + 1) + " " + now.getFullYear();
  if (dashPeriod === "yearly") return String(now.getFullYear());
  return t("allTime");
}

/* ---------- Main render ---------- */

function _renderDashboard() {
  var container = document.getElementById("dashboardContent");
  if (!container) return;

  if (dashTab !== "activity" || !dashActivityUser) setBreadcrumb([{ label: t("navHome"), action: "showPage('home')" }, { label: t("navDashboard") }]);

  // My rating card lives on Rankings and Home; gear for sale lives only on the Market.
  var html = (typeof payBoxHtml === "function" ? payBoxHtml() : '') + (typeof momentsHtml === "function" ? momentsHtml() : '');
  if (typeof _homePulseStart === "function") _homePulseStart();
  html += '<div class="dashboard-tabs">';
  var tabs = [["leaders", t("leaderboard")], ["activity", t("activity")], ["spending", t("spending")]];
  for (var ti = 0; ti < tabs.length; ti++) {
    html += '<button class="dash-tab' + (tabs[ti][0] === dashTab ? ' active' : '') + '" onclick="switchDashTab(\'' + tabs[ti][0] + '\')">' + tabs[ti][1] + '</button>';
  }
  html += '</div>';

  {
    html += '<div class="period-toggle">';
    var periods = [["monthly", t("monthly")], ["quarterly", t("quarterly")], ["yearly", t("yearly")], ["all", t("allTime")]];
    for (var pi = 0; pi < periods.length; pi++) {
      html += '<button class="period-btn' + (periods[pi][0] === dashPeriod ? ' active' : '') + '" onclick="setPeriod(\'' + periods[pi][0] + '\')">' + periods[pi][1] + '</button>';
    }
    html += '</div>';
  }

  var calculated = lastSessions.filter(function (s) { return s.calculated; });

  if (dashTab === "leaders") {
    html += _renderLeaderboard();
    container.innerHTML = html;
  } else if (dashTab === "spending") {
    var filtered = calculated.filter(function (s) { return _inPeriod(_sessionDate(s), dashPeriod); });
    html += _renderSpendingTab(filtered, calculated);
    container.innerHTML = html;
    setTimeout(function () { var vs = document.getElementById("vbarScroll"); if (vs) vs.scrollLeft = vs.scrollWidth; }, 0);
  } else {
    html += _renderActivityTab();
    container.innerHTML = html;
  }
}

/* ──────────────────────────────────────────────────────────
   Leaderboard — top 3 lists for the selected period
   ────────────────────────────────────────────────────────── */

function _renderLeaderboard() {
  var sessions = lastSessions.filter(function (s) { return _inPeriod(_sessionDate(s), dashPeriod); });
  var polls = lastPolls.filter(function (p) { return p.status !== "cancelled" && _inPeriod(_pollDate(p), dashPeriod); });
  var pollById = {};
  lastPolls.forEach(function (p) { pollById[p.id] = p; });

  var played = {}, paid = {}, answered = {}, dined = {}, noVote = {}, noShow = {};
  function inc(map, uid, n) { if (uid) map[uid] = (map[uid] || 0) + (n === undefined ? 1 : n); }

  sessions.forEach(function (s) {
    var players = s.players || [];
    players.forEach(function (u) { inc(played, u); });
    if (s.dinner) (s.dinner.diners || []).forEach(function (u) { inc(dined, u); });
    if (s.calculated) {
      var L = computeLedger(s);
      Object.keys(L.paid).forEach(function (u) { if (L.paid[u] > 0) inc(paid, u, L.paid[u]); });
    }
    // Compare who played with how they answered the poll behind the session
    var poll = s.pollId ? pollById[s.pollId] : null;
    if (poll) {
      var r = _pollResponses(poll);
      players.forEach(function (u) { if (r[u] !== 0) inc(noVote, u); });                 // played without voting Join
      Object.keys(r).forEach(function (u) { if (r[u] === 0 && players.indexOf(u) < 0) inc(noShow, u); }); // voted Join, didn't play
    }
  });
  polls.forEach(function (p) {
    Object.keys(_pollResponses(p)).forEach(function (u) { inc(answered, u); });
  });
  // Activity score = poll answers + games played + dinners joined
  var active = {};
  [answered, played, dined].forEach(function (m) { Object.keys(m).forEach(function (u) { inc(active, u, m[u]); }); });
  var activeBreakdown = function (u) {
    return '<span class="leader-sub">' +
      '<span>' + icon("polls", 12) + ' ' + (answered[u] || 0) + '</span>' +
      '<span>' + icon("shuttle", 12) + ' ' + (played[u] || 0) + '</span>' +
      '<span>' + icon("dinner", 12) + ' ' + (dined[u] || 0) + '</span></span>';
  };

  var html = '<div class="leader-grid">';
  html += _topCard(icon("chart", 14), t("lbMostActive"), active, function (v) { return v + ' ' + t("activitiesWord"); }, false, activeBreakdown,
    function (a, b) { return (played[b] || 0) - (played[a] || 0) || (dined[b] || 0) - (dined[a] || 0); });
  html += _topCard(icon("shuttle", 14), t("lbPlayedMost"), played, function (v) { return v + ' ' + t("sessionsWord").toLowerCase(); });
  html += _topCard(icon("card", 14), t("lbPaidMost"), paid, function (v) { return fmtShort(v); });
  html += _topCard(icon("noshow", 14), t("lbNoShow"), noShow, function (v) { return v + '×'; }, true);
  html += _topCard(icon("question", 14), t("lbNoVote"), noVote, function (v) { return v + '×'; }, true);
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + t("lbHint") + '</div>';
  return html;
}

/** Leaderboard card for a { uid: value } map: a podium for the top 3
    (2nd · 1st · 3rd) with everyone else listed below. `warn` cards
    (no-shows etc.) are a plain list — nobody wants a podium for that. */
function _topCard(emoji, title, map, fmt, warn, sub, tieBreak) {
  var uids = Object.keys(map).filter(function (u) { return map[u] > 0; });
  uids.sort(function (a, b) { return map[b] - map[a] || (tieBreak ? tieBreak(a, b) : 0); });
  // Equal values share a rank (1, 1, 3 …)
  var rank = {};
  uids.forEach(function (u, i) { rank[u] = i > 0 && map[u] === map[uids[i - 1]] ? rank[uids[i - 1]] : i + 1; });
  var open = function (u) { return 'onclick="dashTab=\'activity\';dashActivityUser=\'' + u + '\';_renderDashboard()"'; };

  var html = '<div class="card leader-card' + (warn ? ' warn' : '') + '"><div class="card-title">' + emoji + ' ' + title + '</div>';
  if (!uids.length) {
    return html + '<div style="font-size:13px;color:var(--text-muted)">' + (warn ? t("lbNobody") : t("noData")) + '</div></div>';
  }

  var start = 0;
  if (!warn) {
    var medals = { 1: icon("medal", 20, "medal-1"), 2: icon("medal", 20, "medal-2"), 3: icon("medal", 20, "medal-3") };
    html += '<div class="podium">';
    [1, 0, 2].forEach(function (pos) {            // 2nd · 1st · 3rd
      var u = uids[pos];
      if (!u) { html += '<div class="pod empty"></div>'; return; }
      var r = Math.min(rank[u], 3);
      html += '<div class="pod r' + r + '" ' + open(u) + '>' +
        '<div class="pod-avatar">' + avatarHtml(u, pos === 0 ? 64 : 52) + '<span class="pod-medal">' + medals[r] + '</span></div>' +
        '<div class="pod-name">' + getUserName(u) + '</div>' +
        '<div class="pod-value">' + fmt(map[u]) + '</div>' +
        (sub ? sub(u) : '') +
        '<div class="pod-block">' + rank[u] + '</div></div>';
    });
    html += '</div>';
    start = 3;
  }

  var rest = uids.slice(start, start + 10);
  if (rest.length) {
    html += '<div class="leader-list">';
    rest.forEach(function (u) {
      html += '<div class="leader-row" ' + open(u) + '>' +
        '<span class="leader-rank">' + rank[u] + '</span>' + avatarHtml(u, 30) +
        '<span class="leader-name">' + getUserName(u) + (sub ? sub(u) : '') + '</span>' +
        '<span class="leader-value">' + fmt(map[u]) + '</span></div>';
    });
    html += '</div>';
  }
  if (uids.length > start + 10) html += '<div class="leader-more">+' + (uids.length - start - 10) + '</div>';
  return html + '</div>';
}

/* ──────────────────────────────────────────────────────────
   Spending — totals for the period, per month / year, per player
   ────────────────────────────────────────────────────────── */

function _sumSessions(sessions) {
  var sum = { sessions: sessions.length, court: 0, shuttle: 0, other: 0, dinner: 0, grand: 0, mine: 0 };
  var me = currentUser ? currentUser.uid : null;
  for (var i = 0; i < sessions.length; i++) {
    var L = computeLedger(sessions[i]);
    sum.court += L.totals.court;
    sum.shuttle += L.totals.shuttle;
    sum.other += L.totals.other;
    sum.dinner += L.totals.dinner;
    sum.grand += L.totals.grand;
    if (me && L.shares[me]) sum.mine += L.shares[me].total;
  }
  return sum;
}

function _renderSpendingTab(sessions, allSessions) {
  var sum = _sumSessions(sessions);
  var html = '';

  html += '<div class="card"><div class="card-title">' + _periodLabel() + '</div>';
  html += '<div class="split-amount" style="font-size:32px" title="' + fmtLAK(sum.grand) + '">' + fmtShort(sum.grand) + '</div>';
  html += '<div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:10px">' +
    sum.sessions + ' ' + t("sessionsWord") + ' • ' + t("yourShare") + ' ' + fmtShort(sum.mine) + '</div>';
  html += '<div class="item-row"><div class="item-name">' + icon("court", 16) + ' ' + t("courtCost") + '</div><div class="item-price">' + fmtShort(sum.court) + '</div></div>';
  html += '<div class="item-row"><div class="item-name">' + icon("shuttle", 16) + ' ' + t("shuttleCost") + '</div><div class="item-price">' + fmtShort(sum.shuttle) + '</div></div>';
  html += '<div class="item-row"><div class="item-name">' + icon("other", 16) + ' ' + t("otherCosts") + '</div><div class="item-price">' + fmtShort(sum.other) + '</div></div>';
  html += '<div class="item-row" style="border-bottom:none"><div class="item-name">' + icon("dinner", 16) + ' ' + t("dinnerCost") + '</div><div class="item-price">' + fmtShort(sum.dinner) + '</div></div>';
  html += '</div>';

  // Top 3 spenders of the period
  html += _podiumHtml(_playerSpend(sessions));

  // By month (this year) or by year (all time)
  html += _renderPeriodTable(allSessions);

  if (!sessions.length) {
    return html + '<div class="empty-state"><div class="empty-icon">' + icon("chart", 44) + '</div><div>' + t("noData") + '</div></div>';
  }

  // Who paid for what: one stacked bar per person (court · shuttles · other · dinner),
  // all on the same scale; amounts written under each bar
  var ps = _playerSpend(sessions);
  var cats = [["court", "courtCost", "court"], ["shuttle", "shuttleCost", "shuttle"], ["other", "otherCosts", "other"], ["dinner", "dinnerCost", "dinner"]];
  var max = 0, catTot = { court: 0, shuttle: 0, other: 0, dinner: 0 };
  ps.uids.forEach(function (u) { var r = ps.data[u]; max = Math.max(max, r.total); cats.forEach(function (c) { catTot[c[0]] += r[c[0]] || 0; }); });
  html += '<div class="card pp-card"><div class="card-title">' + icon("chart", 14) + ' ' + t("perPerson") + '</div>';
  html += '<div class="pp-legend">' + cats.map(function (c) {
    return '<span class="pp-key"><i class="sw sw-' + c[0] + '"></i>' + t(c[1]) + ' <b>' + fmtShort(catTot[c[0]]) + '</b></span>';
  }).join('') + '</div>';
  ps.uids.forEach(function (u) {
    var row = ps.data[u];
    html += '<div class="pp-row"><div class="pp-head">' + avatarHtml(u, 28) + '<span class="pp-name">' + escapeHtml(getUserName(u)) + '</span>' +
      '<span class="pp-total">' + fmtLAK(row.total) + '</span></div>';
    html += '<div class="pp-track" style="width:' + (max ? Math.max(4, row.total / max * 100) : 0) + '%">' + cats.filter(function (c) { return (row[c[0]] || 0) > 0; }).map(function (c) {
      return '<span class="pp-seg sw-' + c[0] + '" style="flex:' + row[c[0]] + '" title="' + escapeHtml(t(c[1]) + ' ' + fmtLAK(row[c[0]])) + '"></span>';
    }).join('') + '</div>';
    html += '<div class="pp-amounts">' + cats.filter(function (c) { return (row[c[0]] || 0) > 0; }).map(function (c) {
      return '<span><i class="sw sw-' + c[0] + '"></i>' + fmtShort(row[c[0]]) + '</span>';
    }).join('') + '</div></div>';
  });
  html += '</div>';
  return html;
}

function _renderPeriodTable(allSessions) {
  var now = new Date();
  var byYear = dashPeriod === "all";
  var buckets = {};
  var order = [];

  if (!byYear) {
    for (var m = 0; m < 12; m++) {
      var k = now.getFullYear() + "-" + m;
      buckets[k] = { label: monthShort(m) + " " + now.getFullYear(), list: [] };
      order.push(k);
    }
  }
  for (var i = 0; i < allSessions.length; i++) {
    var d = _sessionDate(allSessions[i]);
    if (!d || isNaN(d.getTime())) continue;
    var key = byYear ? String(d.getFullYear()) : d.getFullYear() + "-" + d.getMonth();
    if (!buckets[key]) {
      if (!byYear) continue; // other years are not shown in the month view
      buckets[key] = { label: key, list: [] };
      order.push(key);
    }
    buckets[key].list.push(allSessions[i]);
  }
  if (byYear) order.sort().reverse();

  var cols = [], max = 0;
  for (var o = 0; o < order.length; o++) {
    var b = buckets[order[o]];
    // only show empty months up to the current one
    if (!b.list.length && !byYear && parseInt(order[o].split("-")[1], 10) > now.getMonth()) continue;
    var sum = _sumSessions(b.list);
    max = Math.max(max, sum.grand);
    cols.push({ label: byYear ? b.label : monthShort(parseInt(order[o].split("-")[1], 10)), full: b.label, sum: sum });
  }
  if (byYear) cols.reverse(); // oldest on the left
  var html = '<div class="card"><div class="card-title">' + (byYear ? t("byYear") : t("byMonth") + ' ' + now.getFullYear()) + '</div>';
  if (!cols.length) return html + '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div></div>';
  // Stacked by cost type, bottom to top (same order as the totals card)
  var types = _spendTypes();
  html += '<div class="vbar-legend">' + types.map(function (ty) {
    return '<span><i class="vbar-dot ' + ty.cls + '"></i>' + ty.label + '</span>';
  }).join('') + '</div>';
  html += '<div class="vbar-scroll" id="vbarScroll"><div class="vbar-chart">';
  cols.forEach(function (c, i) {
    var h = max ? Math.round(c.sum.grand / max * 100) : 0;
    var segs = types.map(function (ty) {
      var v = c.sum[ty.key] || 0;
      return v > 0 ? '<i class="' + ty.cls + '" style="height:' + (v / c.sum.grand * 100) + '%"></i>' : '';
    }).join('');
    html += '<button type="button" class="vbar-col' + (c.sum.grand ? '' : ' empty') + '" onclick="showVbarDetail(' + i + ')" aria-label="' + escapeHtml(c.full) + '" title="' + escapeHtml(c.full + ' · ' + fmtLAK(c.sum.grand)) + '">' +
      '<span class="vbar-val">' + (c.sum.grand ? fmtShort(c.sum.grand) : '') + '</span>' +
      '<span class="vbar-plot"><span class="vbar-stack" style="height:' + (c.sum.grand ? Math.max(3, h) : 0) + '%">' + segs + '</span></span>' +
      '<span class="vbar-lbl">' + escapeHtml(c.label) + '</span></button>';
  });
  html += '</div></div><div class="vbar-detail" id="vbarDetail"></div></div>';
  window._vbarCols = cols;
  return html;
}

/** The cost types stacked in the month chart, bottom to top */
function _spendTypes() {
  return [
    { key: "court", cls: "t-court", label: t("courtCost") },
    { key: "shuttle", cls: "t-shuttle", label: t("shuttleCost") },
    { key: "other", cls: "t-other", label: t("otherCosts") },
    { key: "dinner", cls: "t-dinner", label: t("dinnerCost") }
  ];
}

/** Tap a column: show that month's sessions and your share */
function showVbarDetail(i) {
  var c = (window._vbarCols || [])[i], el = document.getElementById("vbarDetail");
  if (!c || !el) return;
  el.innerHTML = '<b>' + escapeHtml(c.full) + '</b> · ' + fmtShort(c.sum.grand) + '<br>' +
    _spendTypes().filter(function (ty) { return c.sum[ty.key] > 0; }).map(function (ty) {
      return '<span class="vbar-part"><i class="vbar-dot ' + ty.cls + '"></i>' + ty.label + ' ' + fmtShort(c.sum[ty.key]) + '</span>';
    }).join('') + '<br>' +
    c.sum.sessions + ' ' + t("sessionsWord") + ' • ' + t("yourShare") + ' ' + fmtShort(c.sum.mine);
  var cols = document.querySelectorAll("#vbarScroll .vbar-col");
  for (var k = 0; k < cols.length; k++) cols[k].classList.toggle("sel", k === i);
}

/** Top 3 spenders: the same podium card as the Activity leaderboards (_topCard) */
function _podiumHtml(ps) {
  if (!ps.uids.length) return '';
  var map = {};
  ps.uids.slice(0, 3).forEach(function (u) { map[u] = ps.data[u].total; });
  return _topCard(icon("ranking", 14), t("topSpenders"), map, fmtShort, false, null, null);
}

function _playerSpend(sessions) {
  var data = {};
  for (var si = 0; si < sessions.length; si++) {
    var L = computeLedger(sessions[si]);
    var uids = Object.keys(L.shares);
    for (var k = 0; k < uids.length; k++) {
      var sh = L.shares[uids[k]];
      if (!data[uids[k]]) data[uids[k]] = { court: 0, shuttle: 0, other: 0, dinner: 0, total: 0 };
      var row = data[uids[k]];
      row.court += sh.court; row.shuttle += sh.shuttle; row.other += sh.other; row.dinner += sh.dinner; row.total += sh.total;
    }
  }
  var list = Object.keys(data).filter(function (u) { return data[u].total > 0; });
  list.sort(function (a, b) { return data[b].total - data[a].total; });
  return { uids: list, data: data };
}

/* ──────────────────────────────────────────────────────────
   Activity — sessions played and polls joined, per player
   ────────────────────────────────────────────────────────── */

var dashActivityUser = ""; // "" = everyone

function setActivityUser(uid) {
  dashActivityUser = uid;
  _renderDashboard();
}

/** Who answered a poll, and how: { uid: answerIndex } (0 = joining) */
function _pollResponses(p) {
  return typeof normalizePoll === "function" ? normalizePoll(p).responses : {};
}

function _renderActivityTab() {
  var sessions = lastSessions.filter(function (s) { return _inPeriod(_sessionDate(s), dashPeriod); });
  var polls = lastPolls.filter(function (p) { return p.status !== "cancelled" && _inPeriod(_pollDate(p), dashPeriod); });

  // Player filter
  var html = '<div class="form-group"><select class="form-select" onchange="setActivityUser(this.value)">';
  html += '<option value="">' + t("allPlayers") + '</option>';
  DB_CACHE.users.forEach(function (u) {
    html += '<option value="' + u.id + '"' + (u.id === dashActivityUser ? ' selected' : '') + '>' + escapeHtml(plainUserName(u)) + '</option>';
  });
  html += '</select></div>';

  if (dashActivityUser) {
    setBreadcrumb([
      { label: t("navHome"), action: "showPage('home')" },
      { label: t("navDashboard"), action: "dashTab='leaders';dashActivityUser='';_renderDashboard()" },
      { label: t("activity"), action: "setActivityUser('')" },
      { label: getUserName(dashActivityUser) }
    ]);
    return html + _renderPlayerActivity(dashActivityUser, sessions, polls);
  }
  setBreadcrumb([{ label: t("navHome"), action: "showPage('home')" }, { label: t("navDashboard") }]);

  // Per player: polls created, Join votes, games played, dinners — compared
  // with the totals of the period
  var played = {}, voted = {}, dined = {}, created = {}, dinners = 0;
  var inc = function (m, u) { m[u] = (m[u] || 0) + 1; };
  sessions.forEach(function (s) {
    (s.players || []).forEach(function (u) { inc(played, u); });
    if (s.dinner && (s.dinner.diners || []).length) { dinners++; s.dinner.diners.forEach(function (u) { inc(dined, u); }); }
  });
  polls.forEach(function (p) {
    if (p.createdBy) inc(created, p.createdBy);
    var r = _pollResponses(p);
    Object.keys(r).forEach(function (u) { if (r[u] === 0) inc(voted, u); });
  });

  var uidSet = {};
  DB_CACHE.users.forEach(function (u) { uidSet[u.id] = true; });
  Object.keys(played).forEach(function (u) { uidSet[u] = true; });
  var uids = Object.keys(uidSet);
  var score = function (u) { return (played[u] || 0) + (voted[u] || 0) + (dined[u] || 0) + (created[u] || 0); };
  uids.sort(function (a, b) { return score(b) - score(a) || (played[b] || 0) - (played[a] || 0); });

  html += '<div class="act-totals">' +
    '<div class="act-total">' + icon("polls", 18) + '<b>' + polls.length + '</b><span>' + t("pollsWord") + '</span></div>' +
    '<div class="act-total">' + icon("shuttle", 18) + '<b>' + sessions.length + '</b><span>' + t("sessionsWord") + '</span></div>' +
    '<div class="act-total">' + icon("dinner", 18) + '<b>' + dinners + '</b><span>' + t("dinnersWord") + '</span></div></div>';

  if (!uids.length) return html + '<div class="empty-state"><div class="empty-icon">' + icon("users", 44) + '</div><div>' + t("noData") + '</div></div>';

  var bar = function (cls, iconName, label, n, total) {
    var pct = total ? Math.round(n / total * 100) : 0;
    return '<div class="act-bar-row ' + cls + '"><span class="act-bar-label">' + icon(iconName, 12) + ' ' + label + '</span>' +
      '<span class="act-bar"><span style="width:' + pct + '%"></span></span>' +
      '<span class="act-bar-num">' + n + '/' + total + '</span></div>';
  };

  html += '<div class="card"><div class="card-title">' + t("activity") + ' — ' + _periodLabel() + '</div>';
  uids.forEach(function (u, ui) {
    var p = played[u] || 0, v = voted[u] || 0;
    // Show-up: games played compared with Join votes
    var rate = v ? Math.round(Math.min(p, v) / v * 100) : null;
    var rcls = rate === null ? 'none' : rate >= 80 ? 'good' : rate >= 50 ? 'mid' : 'low';
    html += '<div class="act-row" onclick="setActivityUser(\'' + u + '\')">';
    html += '<div class="act-head"><span class="act-rank">' + (ui + 1) + '</span>' + avatarHtml(u, 30) +
      '<span class="act-name">' + getUserName(u) + '</span>' +
      '<span class="act-rate ' + rcls + '" title="' + t("showUpHint") + '">' + (rate === null ? '—' : rate + '%') + '<small>' + t("showUp") + '</small></span></div>';
    html += bar('vote', 'polls', t("votedJoin"), v, polls.length);
    html += bar('play', 'shuttle', t("playedWord"), p, sessions.length);
    html += '<div class="act-extra">' + icon("dinner", 12) + ' ' + t("dinnersWord") + ' ' + (dined[u] || 0) + '/' + dinners +
      ' · ' + icon("manual", 12) + ' ' + t("pollsCreated") + ' ' + (created[u] || 0) + '</div>';
    html += '</div>';
  });
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + t("showUpHint") + ' • ' + t("tapForDetails") + '</div>';
  html += '</div>';
  return html;
}

/** One player's activity: played, poll answers, spending and their sessions */
function _renderPlayerActivity(uid, sessions, polls) {
  var mine = sessions.filter(function (s) { return (s.players || []).indexOf(uid) >= 0; });
  var joined = 0, skipped = 0, noAnswer = 0;
  polls.forEach(function (p) {
    var r = _pollResponses(p);
    if (!r.hasOwnProperty(uid)) noAnswer++;
    else if (r[uid] === 0) joined++;
    else skipped++;
  });
  var spent = 0, paidOut = 0, dinners = 0;
  var byType = { court: 0, shuttle: 0, other: 0, dinner: 0 };
  sessions.forEach(function (s) {
    if (s.dinner && (s.dinner.diners || []).indexOf(uid) >= 0) dinners++;
    if (!s.calculated) return;
    var L = computeLedger(s);
    var sh = L.shares[uid];
    if (sh) {
      spent += sh.total;
      byType.court += sh.court; byType.shuttle += sh.shuttle; byType.other += sh.other; byType.dinner += sh.dinner;
    }
    if (L.paid[uid]) paidOut += L.paid[uid];
  });
  var isMe = currentUser && uid === currentUser.uid;
  var pct = sessions.length ? Math.round(mine.length / sessions.length * 100) : 0;

  // Who + period
  var html = '<div class="card profile-hero">' + avatarHtml(uid, 56) +
    '<div style="min-width:0"><div class="profile-hero-name">' + getUserName(uid) + (isMe ? ' <span class="perm-badge on">' + t("you") + '</span>' : '') + '</div>' +
    '<div class="profile-hero-sub">' + icon("calendar", 13) + ' ' + _periodLabel() + '</div></div>' +
    '<button class="edit-btn" style="margin-left:auto;flex-shrink:0" onclick="showUserProfile(\'' + uid + '\',event)">' + icon("user", 14) + ' ' + t("viewProfile") + '</button></div>';

  // Four balanced stat tiles
  html += '<div class="stat-grid">';
  html += _statTile("sessions", t("statPlayed"), mine.length + '<small>/' + sessions.length + '</small>', '<div class="stat-bar"><span style="width:' + pct + '%"></span></div>');
  html += _statTile("dinner", t("dinnersJoined"), String(dinners), '<div class="stat-note">' + fmtLAK(byType.dinner) + '</div>');
  html += _statTile("wallet", t("statShare"), fmtShort(spent), '<div class="stat-note">' + fmtLAK(spent) + '</div>');
  html += _statTile("check", t("statPaidOut"), fmtShort(paidOut), '<div class="stat-note">' + t("forTheGroup") + '</div>');
  html += '</div>';

  // Poll answers as one bar
  var totalPolls = joined + skipped + noAnswer;
  html += '<div class="card"><div class="card-title">' + icon("polls", 14) + ' ' + t("pollAnswers") + ' (' + totalPolls + ')</div>';
  if (!totalPolls) {
    html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  } else {
    var seg = function (n, cls) { return n ? '<span class="' + cls + '" style="flex:' + n + '"></span>' : ''; };
    html += '<div class="seg-bar">' + seg(joined, "seg-join") + seg(skipped, "seg-skip") + seg(noAnswer, "seg-none") + '</div>';
    html += '<div class="seg-legend">' +
      '<span><i class="seg-join"></i>' + t("answerJoin") + ' <b>' + joined + '</b></span>' +
      '<span><i class="seg-skip"></i>' + t("answerSkip") + ' <b>' + skipped + '</b></span>' +
      '<span><i class="seg-none"></i>' + t("noAnswer") + ' <b>' + noAnswer + '</b></span></div>';
  }
  html += '</div>';

  // Spending by type
  html += '<div class="card"><div class="card-title">' + icon("wallet", 14) + ' ' + t("spendingByType") + '</div>';
  [["court", t("courtCost")], ["shuttle", t("shuttleCost")], ["other", t("otherCosts")], ["dinner", t("dinnerCost")]].forEach(function (r) {
    var share = spent ? Math.round(byType[r[0]] / spent * 100) : 0;
    html += '<div class="spend-row"><div class="spend-label">' + icon(COST_ICON[r[0]], 16) + ' ' + r[1] + '</div>' +
      '<div class="spend-amount">' + fmtLAK(byType[r[0]]) + '</div>' +
      '<div class="stat-bar"><span style="width:' + share + '%"></span></div></div>';
  });
  html += '<div class="subtotal-row"><span>' + t("total") + '</span><span style="color:var(--accent)">' + fmtLAK(spent) + '</span></div>';
  html += '</div>';

  // Their sessions
  html += '<div class="card"><div class="card-title">' + icon("sessions", 14) + ' ' + t("sessionsWord") + ' (' + mine.length + ')</div>';
  if (!mine.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  mine.slice().sort(byLatest(function (s) { return (s.date || "") + " " + (s.time || ""); })).forEach(function (s) {
    var share = s.calculated ? (computeLedger(s).shares[uid] || { total: 0 }).total : null;
    var owing = openTransfers(s).filter(function (tr) { return tr.from === uid; }).length;
    var st = sessionStatus(s);
    html += '<div class="settings-item" style="cursor:pointer" onclick="showSessionDetail(\'' + s.id + '\')">' +
      '<div style="min-width:0"><div class="settings-label">' + fmtDate(s.date) + '</div><div style="font-size:11px;color:var(--text-muted)">' + escapeHtml(s.courtName || "") +
      (s.dinner && (s.dinner.diners || []).indexOf(uid) >= 0 ? ' • ' + icon("dinner", 12) : '') + '</div></div>' +
      '<div style="text-align:right"><div class="settings-value">' + (share === null ? '—' : fmtLAK(share)) + '</div>' +
      '<span class="status-pill ' + (owing ? 'st-unpaid' : st.cls) + '">' + (owing ? t("unpaid") : st.label) + '</span></div></div>';
  });
  html += '</div>';
  return html;
}

function _statTile(iconName, label, value, extra) {
  return '<div class="stat-tile"><div class="stat-label">' + icon(iconName, 15) + ' ' + label + '</div>' +
    '<div class="stat-value">' + value + '</div>' + (extra || '') + '</div>';
}
