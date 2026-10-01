/* ============================================================
   dashboard.js — Balance (who owes whom), Spending (per month /
                  year), Activity (played + poll participation)
   Depends on: sessions.js (lastSessions, computeLedger, openTransfers,
               loadSessions), polls.js (lastPolls, loadPolls, getUserName),
               i18n.js (t), app.js (COLORS, fmtLAK, fmtShort, fmtDate)
   Chart.js loaded from CDN (global `Chart`)
   ============================================================ */

var dashPeriod = "monthly";
var dashTab = "leaders";
var _dashChart = null;

var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
  if (dashPeriod === "monthly") return MONTHS[now.getMonth()] + " " + now.getFullYear();
  if (dashPeriod === "quarterly") return "Q" + (Math.floor(now.getMonth() / 3) + 1) + " " + now.getFullYear();
  if (dashPeriod === "yearly") return String(now.getFullYear());
  return t("allTime");
}

/* ---------- Main render ---------- */

function _renderDashboard() {
  var container = document.getElementById("dashboardContent");
  if (!container) return;

  if (_dashChart) { _dashChart.destroy(); _dashChart = null; }

  var html = '<div class="dashboard-tabs">';
  var tabs = [["leaders", t("leaderboard")], ["spending", t("spending")], ["activity", t("activity")]];
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
    setTimeout(function () { _createSpendingChart(filtered); }, 0);
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

  var played = {}, paid = {}, answered = {}, noVote = {}, noShow = {};
  function inc(map, uid, n) { if (uid) map[uid] = (map[uid] || 0) + (n === undefined ? 1 : n); }

  sessions.forEach(function (s) {
    var players = s.players || [];
    players.forEach(function (u) { inc(played, u); });
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
  var active = {};
  Object.keys(played).forEach(function (u) { inc(active, u, played[u]); });
  Object.keys(answered).forEach(function (u) { inc(active, u, answered[u]); });

  var html = '<div class="leader-grid">';
  html += _topCard("🏸", t("lbPlayedMost"), played, function (v) { return v + ' ' + t("sessionsWord").toLowerCase(); });
  html += _topCard("💳", t("lbPaidMost"), paid, function (v) { return fmtShort(v); });
  html += _topCard("📊", t("lbMostActive"), active, function (v) { return v + ' ' + t("activitiesWord"); });
  html += _topCard("🙅", t("lbNoShow"), noShow, function (v) { return v + '×'; }, true);
  html += _topCard("🤷", t("lbNoVote"), noVote, function (v) { return v + '×'; }, true);
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + t("lbHint") + '</div>';
  return html;
}

/** Card with the top 3 of a { uid: value } map */
function _topCard(icon, title, map, fmt, warn) {
  var uids = Object.keys(map).filter(function (u) { return map[u] > 0; });
  uids.sort(function (a, b) { return map[b] - map[a]; });
  var medals = ["🥇", "🥈", "🥉"];
  var html = '<div class="card leader-card' + (warn ? ' warn' : '') + '"><div class="card-title">' + icon + ' ' + title + '</div>';
  if (!uids.length) {
    html += '<div style="font-size:13px;color:var(--text-muted)">' + (warn ? t("lbNobody") : t("noData")) + '</div>';
  }
  uids.slice(0, 3).forEach(function (u, i) {
    html += '<div class="leader-row" onclick="dashTab=\'activity\';dashActivityUser=\'' + u + '\';_renderDashboard()">' +
      '<span class="leader-medal">' + (warn ? (i + 1) + '.' : medals[i]) + '</span>' + avatarHtml(u, 30) +
      '<span class="leader-name">' + getUserName(u) + '</span>' +
      '<span class="leader-value">' + fmt(map[u]) + '</span></div>';
  });
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
  html += '<div class="item-row"><div class="item-name">🏟️ ' + t("courtCost") + '</div><div class="item-price">' + fmtShort(sum.court) + '</div></div>';
  html += '<div class="item-row"><div class="item-name">🪶 ' + t("shuttleCost") + '</div><div class="item-price">' + fmtShort(sum.shuttle) + '</div></div>';
  html += '<div class="item-row"><div class="item-name">🥤 ' + t("otherCosts") + '</div><div class="item-price">' + fmtShort(sum.other) + '</div></div>';
  html += '<div class="item-row" style="border-bottom:none"><div class="item-name">🍽️ ' + t("dinnerCost") + '</div><div class="item-price">' + fmtShort(sum.dinner) + '</div></div>';
  html += '</div>';

  // By month (this year) or by year (all time)
  html += _renderPeriodTable(allSessions);

  if (!sessions.length) {
    return html + '<div class="empty-state"><div class="empty-icon">📊</div><div>' + t("noData") + '</div></div>';
  }

  html += '<div class="card"><div class="card-title">' + t("perPerson") + '</div>';
  html += '<div style="position:relative;height:' + Math.max(160, _playerSpend(sessions).uids.length * 34 + 60) + 'px"><canvas id="spendingChart"></canvas></div>';
  var ps = _playerSpend(sessions);
  for (var ui = 0; ui < ps.uids.length; ui++) {
    var u = ps.uids[ui];
    var row = ps.data[u];
    html += '<div class="person-row">';
    html += avatarHtml(u, 28);
    html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">' + getUserName(u) + '</div>';
    html += '<div style="font-size:10px;color:var(--text-muted)">🏟️' + fmtLAK(row.court) + ' 🪶' + fmtLAK(row.shuttle) + ' 🥤' + fmtLAK(row.other) + ' 🍽️' + fmtLAK(row.dinner) + '</div></div>';
    html += '<div class="person-amount">' + fmtLAK(row.total) + '</div>';
    html += '</div>';
  }
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
      buckets[k] = { label: MONTHS[m] + " " + now.getFullYear(), list: [] };
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

  var html = '<div class="card"><div class="card-title">' + (byYear ? t("byYear") : t("byMonth") + ' ' + now.getFullYear()) + '</div>';
  var any = false;
  for (var o = 0; o < order.length; o++) {
    var b = buckets[order[o]];
    if (!b.list.length && !byYear) {
      // only show empty months up to the current one
      if (parseInt(order[o].split("-")[1], 10) > now.getMonth()) continue;
    }
    any = true;
    var sum = _sumSessions(b.list);
    html += '<div class="item-row"><div class="item-name">' + b.label +
      '<div style="font-size:10px;color:var(--text-muted)">' + sum.sessions + ' ' + t("sessionsWord") + ' • ' + t("yourShare") + ' ' + fmtShort(sum.mine) + '</div></div>' +
      '<div class="item-price">' + fmtShort(sum.grand) + '</div></div>';
  }
  if (!any) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  return html + '</div>';
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

function _createSpendingChart(sessions) {
  var canvas = document.getElementById("spendingChart");
  if (!canvas || typeof Chart === "undefined") return;

  var ps = _playerSpend(sessions);
  var plain = function (uid) { var u = dbFindById(DB_CACHE.users, uid); return u ? u.displayName : "?"; };
  var css = getComputedStyle(document.body);
  var series = [
    ["court", t("courtCost"), "#0d9488"],
    ["shuttle", t("shuttleCost"), "#2563eb"],
    ["other", t("otherCosts"), "#a855f7"],
    ["dinner", t("dinnerCost"), "#f59e0b"]
  ];

  _dashChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ps.uids.map(plain),
      datasets: series.map(function (sr) {
        return { label: sr[1], data: ps.uids.map(function (u) { return Math.round(ps.data[u][sr[0]]); }), backgroundColor: sr[2] };
      })
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: css.getPropertyValue("--text-muted").trim() || "#94a3b8", boxWidth: 12, font: { size: 10 } } }
      },
      scales: {
        x: { stacked: true, ticks: { color: css.getPropertyValue("--text-dim").trim() || "#64748b", callback: function (v) { return fmtShort(v); } }, grid: { color: "rgba(128,128,128,0.1)" } },
        y: { stacked: true, ticks: { color: css.getPropertyValue("--text").trim() || "#e0e8f0", font: { size: 12 } }, grid: { display: false } }
      }
    }
  });
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
    html += '<option value="' + u.id + '"' + (u.id === dashActivityUser ? ' selected' : '') + '>' + escapeHtml(u.displayName || '?') + '</option>';
  });
  html += '</select></div>';

  if (dashActivityUser) return html + _renderPlayerActivity(dashActivityUser, sessions, polls);

  var played = {}, voted = {};
  sessions.forEach(function (s) { (s.players || []).forEach(function (u) { played[u] = (played[u] || 0) + 1; }); });
  polls.forEach(function (p) {
    var r = _pollResponses(p);
    Object.keys(r).forEach(function (u) { if (r[u] === 0) voted[u] = (voted[u] || 0) + 1; });
  });

  var uidSet = {};
  DB_CACHE.users.forEach(function (u) { uidSet[u.id] = true; });
  Object.keys(played).forEach(function (u) { uidSet[u] = true; });
  var uids = Object.keys(uidSet);
  uids.sort(function (a, b) { return (played[b] || 0) - (played[a] || 0) || (voted[b] || 0) - (voted[a] || 0); });

  html += '<div class="cost-breakdown">';
  html += '<div class="cost-card"><div class="cost-card-label">' + t("sessionsWord") + '</div><div class="cost-card-value">' + sessions.length + '</div></div>';
  html += '<div class="cost-card"><div class="cost-card-label">' + t("pollsWord") + '</div><div class="cost-card-value">' + polls.length + '</div></div>';
  html += '</div>';

  if (!uids.length) return html + '<div class="empty-state"><div class="empty-icon">👥</div><div>' + t("noData") + '</div></div>';

  var maxPlayed = 1;
  uids.forEach(function (u) { maxPlayed = Math.max(maxPlayed, played[u] || 0); });

  html += '<div class="card"><div class="card-title">' + t("activity") + ' — ' + _periodLabel() + '</div>';
  uids.forEach(function (u, ui) {
    var p = played[u] || 0, v = voted[u] || 0, color = COLORS[ui % COLORS.length];
    html += '<div class="activity-row" onclick="setActivityUser(\'' + u + '\')">';
    html += '<div style="font-size:14px;font-weight:700;color:var(--text-dim);min-width:20px;text-align:center">' + (ui + 1) + '</div>';
    html += avatarHtml(u, 28);
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="display:flex;justify-content:space-between;gap:6px;margin-bottom:3px"><div style="font-size:13px;font-weight:600">' + getUserName(u) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);white-space:nowrap">🏸 ' + p + '/' + sessions.length + ' • 🗳️ ' + v + '/' + polls.length + '</div></div>';
    html += '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + Math.round(p / maxPlayed * 100) + '%;background:' + color + '"></div></div>';
    html += '</div></div>';
  });
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">🏸 ' + t("sessionsAttended") + ' • 🗳️ ' + t("pollsJoined") + ' • ' + t("tapForDetails") + '</div>';
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
  var spent = 0, paidOut = 0;
  mine.concat(sessions.filter(function (s) { return mine.indexOf(s) < 0; })).forEach(function (s) {
    if (!s.calculated) return;
    var L = computeLedger(s);
    if (L.shares[uid]) spent += L.shares[uid].total;
    if (L.paid[uid]) paidOut += L.paid[uid];
  });

  var html = '<div class="card"><div class="card-title">' + getUserName(uid) + ' — ' + _periodLabel() + '</div>';
  html += '<div class="cost-breakdown" style="margin-bottom:0">';
  html += '<div class="cost-card"><div class="cost-card-label">🏸 ' + t("sessionsAttended") + '</div><div class="cost-card-value">' + mine.length + '/' + sessions.length + '</div></div>';
  html += '<div class="cost-card"><div class="cost-card-label">💸 ' + t("yourShare") + '</div><div class="cost-card-value">' + fmtShort(spent) + '</div></div>';
  html += '<div class="cost-card"><div class="cost-card-label">🗳️ ' + t("pollsWord") + '</div><div class="cost-card-value" style="font-size:14px">✔ ' + joined + ' • ✕ ' + skipped + ' • ? ' + noAnswer + '</div></div>';
  html += '<div class="cost-card"><div class="cost-card-label">💳 ' + t("paidOut") + '</div><div class="cost-card-value">' + fmtShort(paidOut) + '</div></div>';
  html += '</div></div>';

  html += '<div class="card"><div class="card-title">' + t("sessionsWord") + '</div>';
  if (!mine.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  mine.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).forEach(function (s) {
    var share = s.calculated ? (computeLedger(s).shares[uid] || { total: 0 }).total : null;
    var owing = openTransfers(s).filter(function (tr) { return tr.from === uid; }).length;
    html += '<div class="settings-item" style="cursor:pointer" onclick="showSessionDetail(\'' + s.id + '\')">' +
      '<div><div class="settings-label">' + fmtDate(s.date) + '</div><div style="font-size:11px;color:var(--text-muted)">' + escapeHtml(s.courtName || "") + '</div></div>' +
      '<div style="text-align:right"><div class="settings-value">' + (share === null ? '—' : fmtLAK(share)) + '</div>' +
      (owing ? '<span class="person-status status-owes">' + t("unpaid") + '</span>' : '') + '</div></div>';
  });
  html += '</div>';
  return html;
}
