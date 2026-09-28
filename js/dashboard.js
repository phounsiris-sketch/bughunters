/* ============================================================
   dashboard.js — Dashboard with Balance, Spending, Activity tabs
   Depends on: firebase-config.js (fsdb),
               db.js (dbGetSessions),
               polls.js (getUserName),
               i18n.js (t),
               app.js (showToast, COLORS)
   Chart.js loaded from CDN (global `Chart`)
   ============================================================ */

var dashSessions = [];
var dashPeriod = "monthly";
var dashTab = "balance";
var _dashChart = null;     // Chart.js instance (destroy before recreating)
var _dashUnsub = null;     // Firestore snapshot unsubscribe

/* ──────────────────────────────────────────────────────────
   Load
   ────────────────────────────────────────────────────────── */

function loadDashboard() {
  if (_dashUnsub) {
    _dashUnsub();
    _dashUnsub = null;
  }

  _dashUnsub = dbGetSessions(function (sessions) {
    dashSessions = sessions;
    _renderDashboard();
  });
}

/* ──────────────────────────────────────────────────────────
   Tab / Period switching
   ────────────────────────────────────────────────────────── */

function switchDashTab(tab) {
  dashTab = tab;

  // Update active buttons
  var btns = document.querySelectorAll(".dash-tab-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove("active");
    if (btns[i].getAttribute("data-tab") === tab) btns[i].classList.add("active");
  }

  // Period toggle: hide for balance, show for spending/activity
  var periodRow = document.getElementById("dashPeriodRow");
  if (periodRow) {
    periodRow.style.display = (tab === "balance") ? "none" : "";
  }

  _renderDashboard();
}

function setPeriod(period) {
  dashPeriod = period;

  var btns = document.querySelectorAll(".dash-period-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove("active");
    if (btns[i].getAttribute("data-period") === period) btns[i].classList.add("active");
  }

  _renderDashboard();
}

/* ──────────────────────────────────────────────────────────
   Period filter
   ────────────────────────────────────────────────────────── */

function filterSessionsByPeriod(sessions, period) {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-indexed

  return sessions.filter(function (s) {
    if (!s.date) return false;
    var d = new Date(s.date + "T00:00:00");
    var sy = d.getFullYear();
    var sm = d.getMonth();

    if (period === "monthly") {
      return sy === year && sm === month;
    } else if (period === "quarterly") {
      var curQ = Math.floor(month / 3);
      var sesQ = Math.floor(sm / 3);
      return sy === year && sesQ === curQ;
    } else if (period === "yearly") {
      return sy === year;
    }
    return true;
  });
}

/* ──────────────────────────────────────────────────────────
   Main render dispatcher
   ────────────────────────────────────────────────────────── */

function _renderDashboard() {
  var container = document.getElementById("dashboardContent");
  if (!container) return;

  // Destroy previous chart
  if (_dashChart) {
    _dashChart.destroy();
    _dashChart = null;
  }

  // Tab bar
  var html = '';
  html += '<div style="display:flex;gap:4px;margin-bottom:12px;background:var(--surface);border-radius:10px;padding:3px">';
  var tabs = [
    { key: "balance", label: t("balance") },
    { key: "spending", label: t("spending") },
    { key: "activity", label: t("activity") }
  ];
  for (var ti = 0; ti < tabs.length; ti++) {
    var act = tabs[ti].key === dashTab ? " active" : "";
    html += '<button class="dash-tab-btn' + act + '" data-tab="' + tabs[ti].key + '" ' +
      'onclick="switchDashTab(\'' + tabs[ti].key + '\')" ' +
      'style="flex:1;border:none;border-radius:8px;padding:8px;font-size:13px;font-weight:600;cursor:pointer;' +
      'background:' + (act ? 'var(--primary)' : 'transparent') + ';color:' + (act ? '#fff' : 'var(--text-muted)') + '">' +
      tabs[ti].label + '</button>';
  }
  html += '</div>';

  // Period toggle
  var periodDisplay = dashTab === "balance" ? "none" : "";
  html += '<div id="dashPeriodRow" style="display:' + periodDisplay + ';margin-bottom:12px">';
  html += '<div style="display:flex;gap:4px;background:var(--surface);border-radius:8px;padding:3px">';
  var periods = [
    { key: "monthly", label: t("monthly") },
    { key: "quarterly", label: t("quarterly") },
    { key: "yearly", label: t("yearly") }
  ];
  for (var pi = 0; pi < periods.length; pi++) {
    var pAct = periods[pi].key === dashPeriod ? " active" : "";
    html += '<button class="dash-period-btn' + pAct + '" data-period="' + periods[pi].key + '" ' +
      'onclick="setPeriod(\'' + periods[pi].key + '\')" ' +
      'style="flex:1;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;' +
      'background:' + (pAct ? 'var(--card)' : 'transparent') + ';color:' + (pAct ? 'var(--accent)' : 'var(--text-dim)') + '">' +
      periods[pi].label + '</button>';
  }
  html += '</div></div>';

  // Tab content placeholder
  html += '<div id="dashTabContent"></div>';

  container.innerHTML = html;

  // Render tab content
  var tabEl = document.getElementById("dashTabContent");
  if (dashTab === "balance") {
    tabEl.innerHTML = _renderBalanceTab(dashSessions);
  } else if (dashTab === "spending") {
    var filtered = filterSessionsByPeriod(dashSessions, dashPeriod);
    tabEl.innerHTML = _renderSpendingTab(filtered);
    // Create chart after DOM is ready
    setTimeout(function () { _createSpendingChart(filtered); }, 0);
  } else if (dashTab === "activity") {
    var aFiltered = filterSessionsByPeriod(dashSessions, dashPeriod);
    tabEl.innerHTML = _renderActivityTab(aFiltered);
  }
}

/* ──────────────────────────────────────────────────────────
   Balance Tab
   ────────────────────────────────────────────────────────── */

function _renderBalanceTab(sessions) {
  // Calculate net debts across ALL sessions (not period-filtered)
  var netDebts = {}; // netDebts[fromUid][toUid] = amount owed

  for (var si = 0; si < sessions.length; si++) {
    var s = sessions[si];
    if (!s.splits) continue;

    var splitKeys = Object.keys(s.splits);
    var n = splitKeys.length;
    if (n === 0) continue;

    // Court debts
    if (s.courtPayer && s.courtCost > 0) {
      var courtPP = Math.round(s.courtCost / n);
      for (var ci = 0; ci < splitKeys.length; ci++) {
        var uid = splitKeys[ci];
        if (uid !== s.courtPayer && !s.splits[uid].paid) {
          _addDebt(netDebts, uid, s.courtPayer, courtPP);
        }
      }
    }

    // Shuttle debts
    if (s.shuttlePayer && s.shuttleTotal > 0) {
      var shuttlePP = Math.round(s.shuttleTotal / n);
      for (var si2 = 0; si2 < splitKeys.length; si2++) {
        var sUid = splitKeys[si2];
        if (sUid !== s.shuttlePayer && !s.splits[sUid].paid) {
          _addDebt(netDebts, sUid, s.shuttlePayer, shuttlePP);
        }
      }
    }

    // Dinner debts (from dinner sub-data in splits)
    // Use the split dinner field to determine dinner debts
    // The payer info is in the session-level data
  }

  // Net between all pairs
  var balanceRows = [];
  var processed = {};

  var fromUids = Object.keys(netDebts);
  for (var fi = 0; fi < fromUids.length; fi++) {
    var from = fromUids[fi];
    var toUids = Object.keys(netDebts[from]);
    for (var toi = 0; toi < toUids.length; toi++) {
      var to = toUids[toi];
      var pairKey = from < to ? from + "|" + to : to + "|" + from;
      if (processed[pairKey]) continue;
      processed[pairKey] = true;

      var aOwesB = (netDebts[from] && netDebts[from][to]) || 0;
      var bOwesA = (netDebts[to] && netDebts[to][from]) || 0;
      var netAmt = aOwesB - bOwesA;

      if (netAmt > 0) {
        balanceRows.push({ from: from, to: to, amount: netAmt });
      } else if (netAmt < 0) {
        balanceRows.push({ from: to, to: from, amount: -netAmt });
      }
    }
  }

  if (balanceRows.length === 0) {
    return '<div class="empty-state">' +
      '<div class="empty-icon">\u2705</div>' +
      '<div style="font-size:16px;font-weight:600">' + t("settleUp") + '</div>' +
      '<div style="margin-top:4px;font-size:13px;color:var(--text-muted)">All debts settled!</div>' +
    '</div>';
  }

  var html = '<div class="card"><div class="card-title">' + t("balance") + '</div>';
  for (var bi = 0; bi < balanceRows.length; bi++) {
    var row = balanceRows[bi];
    var fromName = getUserName(row.from);
    var toName = getUserName(row.to);
    var fromColor = COLORS[bi % COLORS.length];
    var toColor = COLORS[(bi + 3) % COLORS.length];

    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">';

    // From avatar + name
    html += '<div style="display:flex;align-items:center;gap:8px;flex:1">';
    html += '<div class="person-avatar" style="background:' + fromColor + ';width:28px;height:28px;font-size:12px">' + fromName.charAt(0).toUpperCase() + '</div>';
    html += '<div style="font-size:13px">' + fromName + '</div>';
    html += '</div>';

    // Arrow + amount
    html += '<div style="text-align:center;flex:0 0 auto;padding:0 8px">';
    html += '<div style="font-size:15px;font-weight:700;color:var(--orange)">' + Math.round(row.amount) + 'K</div>';
    html += '<div style="font-size:10px;color:var(--text-dim)">\u2192</div>';
    html += '</div>';

    // To avatar + name
    html += '<div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end">';
    html += '<div style="font-size:13px">' + toName + '</div>';
    html += '<div class="person-avatar" style="background:' + toColor + ';width:28px;height:28px;font-size:12px">' + toName.charAt(0).toUpperCase() + '</div>';
    html += '</div>';

    html += '</div>';
  }
  html += '</div>';

  return html;
}

function _addDebt(netDebts, from, to, amount) {
  if (!netDebts[from]) netDebts[from] = {};
  netDebts[from][to] = (netDebts[from][to] || 0) + amount;
}

/* ──────────────────────────────────────────────────────────
   Spending Tab
   ────────────────────────────────────────────────────────── */

function _renderSpendingTab(sessions) {
  if (!sessions || sessions.length === 0) {
    return '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCA</div><div>' + t("noData") + '</div></div>';
  }

  // Calculate per-player spending
  var playerSpend = {}; // { uid: { court, shuttle, dinner } }
  for (var si = 0; si < sessions.length; si++) {
    var s = sessions[si];
    if (!s.splits) continue;
    var keys = Object.keys(s.splits);
    for (var ki = 0; ki < keys.length; ki++) {
      var uid = keys[ki];
      var sp = s.splits[uid];
      if (!playerSpend[uid]) playerSpend[uid] = { court: 0, shuttle: 0, dinner: 0 };
      playerSpend[uid].court += (sp.court || 0);
      playerSpend[uid].shuttle += (sp.shuttle || 0);
      playerSpend[uid].dinner += (sp.dinner || 0);
    }
  }

  var html = '';
  // Canvas for chart
  html += '<div class="card"><div class="card-title">' + t("spending") + '</div>';
  html += '<canvas id="spendingChart" height="200"></canvas>';
  html += '</div>';

  // Table
  html += '<div class="card"><div class="card-title">' + t("perPerson") + '</div>';
  var uids = Object.keys(playerSpend);
  // Sort by total descending
  uids.sort(function (a, b) {
    var ta = playerSpend[a].court + playerSpend[a].shuttle + playerSpend[a].dinner;
    var tb = playerSpend[b].court + playerSpend[b].shuttle + playerSpend[b].dinner;
    return tb - ta;
  });

  for (var ui = 0; ui < uids.length; ui++) {
    var u = uids[ui];
    var ps = playerSpend[u];
    var total = ps.court + ps.shuttle + ps.dinner;
    var pName = getUserName(u);
    var color = COLORS[ui % COLORS.length];

    html += '<div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid rgba(128,128,128,0.1)">';
    html += '<div class="person-avatar" style="background:' + color + ';width:28px;height:28px;font-size:11px;margin-right:10px">' + pName.charAt(0).toUpperCase() + '</div>';
    html += '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + pName + '</div>';
    html += '<div style="font-size:10px;color:var(--text-muted)">';
    html += '\uD83C\uDFDF\uFE0F' + Math.round(ps.court) + 'K ';
    html += '\uD83E\uDEB6' + Math.round(ps.shuttle) + 'K ';
    html += '\uD83C\uDF7D\uFE0F' + Math.round(ps.dinner) + 'K';
    html += '</div></div>';
    html += '<div style="font-size:15px;font-weight:700;color:var(--accent)">' + Math.round(total) + 'K</div>';
    html += '</div>';
  }
  html += '</div>';

  return html;
}

function _createSpendingChart(sessions) {
  var canvas = document.getElementById("spendingChart");
  if (!canvas || typeof Chart === "undefined") return;

  // Calculate per-player spending
  var playerSpend = {};
  for (var si = 0; si < sessions.length; si++) {
    var s = sessions[si];
    if (!s.splits) continue;
    var keys = Object.keys(s.splits);
    for (var ki = 0; ki < keys.length; ki++) {
      var uid = keys[ki];
      var sp = s.splits[uid];
      if (!playerSpend[uid]) playerSpend[uid] = { court: 0, shuttle: 0, dinner: 0 };
      playerSpend[uid].court += (sp.court || 0);
      playerSpend[uid].shuttle += (sp.shuttle || 0);
      playerSpend[uid].dinner += (sp.dinner || 0);
    }
  }

  var uids = Object.keys(playerSpend);
  uids.sort(function (a, b) {
    var ta = playerSpend[a].court + playerSpend[a].shuttle + playerSpend[a].dinner;
    var tb = playerSpend[b].court + playerSpend[b].shuttle + playerSpend[b].dinner;
    return tb - ta;
  });

  var labels = [];
  var courtData = [];
  var shuttleData = [];
  var dinnerData = [];

  for (var i = 0; i < uids.length; i++) {
    labels.push(getUserName(uids[i]));
    courtData.push(playerSpend[uids[i]].court);
    shuttleData.push(playerSpend[uids[i]].shuttle);
    dinnerData.push(playerSpend[uids[i]].dinner);
  }

  var ctx = canvas.getContext("2d");
  _dashChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: t("courtCost"),
          data: courtData,
          backgroundColor: "#0d9488"
        },
        {
          label: t("shuttleCost"),
          data: shuttleData,
          backgroundColor: "#2563eb"
        },
        {
          label: t("dinnerCost"),
          data: dinnerData,
          backgroundColor: "#f59e0b"
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: getComputedStyle(document.body).getPropertyValue("--text-muted").trim() || "#94a3b8",
            boxWidth: 12,
            font: { size: 10 }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--text-dim").trim() || "#64748b",
            callback: function (val) { return val + "K"; }
          },
          grid: { color: "rgba(128,128,128,0.1)" }
        },
        y: {
          stacked: true,
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--text").trim() || "#e0e8f0",
            font: { size: 12 }
          },
          grid: { display: false }
        }
      }
    }
  });
}

/* ──────────────────────────────────────────────────────────
   Activity Tab
   ────────────────────────────────────────────────────────── */

function _renderActivityTab(sessions) {
  if (!sessions || sessions.length === 0) {
    return '<div class="empty-state"><div class="empty-icon">\uD83D\uDC65</div><div>' + t("noData") + '</div></div>';
  }

  var totalSessions = sessions.length;

  // Count sessions per player
  var playerCount = {}; // { uid: count }
  for (var si = 0; si < sessions.length; si++) {
    var s = sessions[si];
    var players = [];
    if (s.splits) {
      players = Object.keys(s.splits);
    } else if (s.players && Array.isArray(s.players)) {
      players = s.players;
    }
    for (var pi = 0; pi < players.length; pi++) {
      var uid = players[pi];
      playerCount[uid] = (playerCount[uid] || 0) + 1;
    }
  }

  // Sort by count descending
  var uids = Object.keys(playerCount);
  uids.sort(function (a, b) { return playerCount[b] - playerCount[a]; });

  var maxCount = uids.length > 0 ? playerCount[uids[0]] : 1;

  var html = '<div class="card"><div class="card-title">' + t("activity") + '</div>';

  for (var ui = 0; ui < uids.length; ui++) {
    var u = uids[ui];
    var count = playerCount[u];
    var rate = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
    var barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    var pName = getUserName(u);
    var color = COLORS[ui % COLORS.length];
    var rank = ui + 1;

    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(128,128,128,0.1)">';

    // Rank
    html += '<div style="font-size:14px;font-weight:700;color:var(--text-dim);min-width:20px;text-align:center">' + rank + '</div>';

    // Avatar + name
    html += '<div class="person-avatar" style="background:' + color + ';width:28px;height:28px;font-size:11px;flex-shrink:0">' + pName.charAt(0).toUpperCase() + '</div>';

    // Bar + info
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:3px">';
    html += '<div style="font-size:13px;font-weight:600">' + pName + '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted)">' + count + '/' + totalSessions + ' (' + rate + '%)</div>';
    html += '</div>';
    // Bar fill
    html += '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">';
    html += '<div style="height:100%;width:' + barWidth + '%;background:' + color + ';border-radius:3px;transition:width 0.3s"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
  }

  html += '</div>';
  return html;
}
