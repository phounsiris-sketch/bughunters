/* ============================================================
   sessions.js — Session list, cost entry, split calculation,
                  "who pays whom", payment tracking, Messenger text
   Session document (Firestore "sessions/{id}"):
     date, time, duration, courtId, courtName, courtLocation, pricePerHour,
     players[uid], courtCost, courtPayer,
     shuttlecocks[{brand, qty, price, cocksPerTube, total}], shuttleTotal, shuttlePayer,
     otherCosts[{desc, amount, paidBy, forUid|null}], otherTotal,
     dinner {totalBill, paidBy, diners[uid], receiptUrl} | null,
     grandTotal, calculated, settled {"from__to": true}, status
   Depends on: db.js, polls.js (getUserName), storage.js (readReceiptImage),
               i18n.js (t), router.js, app.js (helpers, modal)
   ============================================================ */

var sessionsUnsubscribe = null;
var lastSessions = [];
var currentSessionId = null;
var currentSession = null;
var _sessionDocUnsub = null;
var sessionEditing = false;
var edit = null; // form state while entering costs

/* ──────────────────────────────────────────────────────────
   Ledger: shares, payments and the minimal set of transfers
   ────────────────────────────────────────────────────────── */

/** Payments are rounded to the nearest 1,000 ₭ (smallest note in common use) */
var ROUND_TO = 1000;

function computeLedger(s) {
  var players = (s.players || []).slice();
  var n = players.length;
  var shares = {};
  var paid = {};
  var owes = {}; // owes[debtor][creditor] = [{ kind, label, amount }]

  function ensure(uid) {
    if (!uid) return;
    if (!shares[uid]) shares[uid] = { court: 0, shuttle: 0, other: 0, dinner: 0, total: 0 };
    if (!paid[uid]) paid[uid] = 0;
  }
  for (var i = 0; i < n; i++) ensure(players[i]);

  var totals = { court: 0, shuttle: 0, other: 0, dinner: 0, grand: 0 };

  // Split `amount` equally among `uids`; each of them owes their part to `payer`
  function charge(uids, amount, field, payer, label) {
    if (!uids.length || !amount) return;
    var each = amount / uids.length;
    ensure(payer);
    if (payer) paid[payer] += amount;
    for (var k = 0; k < uids.length; k++) {
      var u = uids[k];
      ensure(u);
      shares[u][field] += each;
      if (payer && u !== payer) {
        if (!owes[u]) owes[u] = {};
        if (!owes[u][payer]) owes[u][payer] = [];
        owes[u][payer].push({ kind: field, label: label, amount: each });
      }
    }
  }

  // Court
  var courtCost = s.courtCost || 0;
  if (courtCost > 0 && n > 0) {
    charge(players, courtCost, "court", s.courtPayer, "");
    totals.court = courtCost;
  }

  // Shuttlecocks
  var shuttleTotal = s.shuttleTotal || 0;
  if (shuttleTotal > 0 && n > 0) {
    charge(players, shuttleTotal, "shuttle", s.shuttlePayer, "");
    totals.shuttle = shuttleTotal;
  }

  // Other costs (water, drinks …): shared by everyone or for one person
  var others = s.otherCosts || [];
  for (var o = 0; o < others.length; o++) {
    var oc = others[o];
    var amt = oc.amount || 0;
    if (amt <= 0) continue;
    charge(oc.forUid ? [oc.forUid] : players, amt, "other", oc.paidBy, oc.desc || "");
    totals.other += amt;
  }

  // Dinner
  var dinner = s.dinner;
  if (dinner && dinner.totalBill > 0 && dinner.diners && dinner.diners.length) {
    charge(dinner.diners, dinner.totalBill, "dinner", dinner.paidBy, "");
    totals.dinner = dinner.totalBill;
  }

  totals.grand = totals.court + totals.shuttle + totals.other + totals.dinner;
  var uids = Object.keys(shares);
  for (var u = 0; u < uids.length; u++) {
    var sh = shares[uids[u]];
    sh.total = sh.court + sh.shuttle + sh.other + sh.dinner;
  }

  // Each person pays each payer directly for what they used. When two people
  // owe each other, the smaller side is deducted from the larger one.
  function sum(list) { var t = 0; for (var q = 0; q < (list || []).length; q++) t += list[q].amount; return t; }
  var transfers = [];
  var seen = {};
  var debtors = Object.keys(owes);
  for (var d = 0; d < debtors.length; d++) {
    var creditors = Object.keys(owes[debtors[d]]);
    for (var c = 0; c < creditors.length; c++) {
      var x = debtors[d], y = creditors[c];
      var pairKey = x < y ? x + "|" + y : y + "|" + x;
      if (seen[pairKey]) continue;
      seen[pairKey] = true;

      var xy = (owes[x] && owes[x][y]) || [];
      var yx = (owes[y] && owes[y][x]) || [];
      var net = sum(xy) - sum(yx);
      if (Math.abs(net) < ROUND_TO / 2) continue;
      var from = net > 0 ? x : y;
      var to = net > 0 ? y : x;
      transfers.push({
        from: from,
        to: to,
        amount: Math.round(Math.abs(net) / ROUND_TO) * ROUND_TO,
        exact: Math.abs(net),
        items: net > 0 ? xy : yx,      // what `from` owes `to`
        minus: net > 0 ? yx : xy,      // what `to` owes `from`, deducted
        key: from + "__" + to
      });
    }
  }

  // Group by receiver (largest first), then by payer name order
  var received = {};
  transfers.forEach(function (tr) { received[tr.to] = (received[tr.to] || 0) + tr.amount; });
  transfers.sort(function (a, b) {
    return (received[b.to] - received[a.to]) || a.to.localeCompare(b.to) || b.amount - a.amount;
  });

  return { shares: shares, paid: paid, transfers: transfers, totals: totals, received: received };
}

/** Same as transferBreakdown, with Solar icons, for showing inside the app */
function transferBreakdownHtml(tr) {
  var text = escapeHtml(transferBreakdown(tr));
  Object.keys(LEDGER_ICONS).forEach(function (k) {
    text = text.split(LEDGER_ICONS[k]).join(icon(COST_ICON[k], 12));
  });
  return text;
}

/** "🪶 49,286 + 🍽️ 125,000 − 🏟️ 42,857" — what a transfer is made of (plain text) */
var LEDGER_ICONS = { court: "\uD83C\uDFDF\uFE0F", shuttle: "\uD83E\uDEB6", other: "\uD83E\uDD64", dinner: "\uD83C\uDF7D\uFE0F" };
function transferBreakdown(tr) {
  function fmt(list) {
    // merge items of the same kind/label
    var merged = [], idx = {};
    for (var i = 0; i < list.length; i++) {
      var k = list[i].kind + "|" + list[i].label;
      if (idx[k] === undefined) { idx[k] = merged.length; merged.push({ kind: list[i].kind, label: list[i].label, amount: 0 }); }
      merged[idx[k]].amount += list[i].amount;
    }
    return merged.map(function (m) {
      return LEDGER_ICONS[m.kind] + (m.label ? " " + m.label : "") + " " + Math.round(m.amount).toLocaleString("en-US");
    });
  }
  var plus = fmt(tr.items || []).join(" + ");
  var minus = fmt(tr.minus || []);
  return plus + (minus.length ? " \u2212 " + minus.join(" \u2212 ") : "");
}

/** Transfers in this session that have not been marked as paid */
function openTransfers(s) {
  if (!s.calculated) return [];
  var settled = s.settled || {};
  return computeLedger(s).transfers.filter(function (tr) { return !settled[tr.key]; });
}

/* ──────────────────────────────────────────────────────────
   Sessions List
   ────────────────────────────────────────────────────────── */

function loadSessions() {
  if (!sessionsUnsubscribe) {
    sessionsUnsubscribe = dbGetSessions(function (sessions) {
      lastSessions = sessions;
      if (currentPage === "sessions") renderSessionsList(sessions);
      if (currentPage === "dashboard" && typeof _renderDashboard === "function") _renderDashboard();
      if (currentPage === "payments" && typeof renderPayments === "function") renderPayments();
      if (typeof updateNotifications === "function") updateNotifications();
    });
  }
  renderSessionsList(lastSessions);
}

function stopSessions() {
  if (sessionsUnsubscribe) sessionsUnsubscribe();
  sessionsUnsubscribe = null;
  lastSessions = [];
  if (_sessionDocUnsub) _sessionDocUnsub();
  _sessionDocUnsub = null;
}

var sessionView = "recent";   // "recent" (last 30 days + upcoming) | "history"
var sessionHistoryMonth = "";  // "YYYY-MM" date filter, "" = all
var sessionStatusFilter = "";  // "", upcoming, costs, unpaid, settled
function setSessionStatusFilter(v) { sessionStatusFilter = v; renderSessionsList(lastSessions); }
function setSessionMonthFilter(v) { sessionHistoryMonth = v; renderSessionsList(lastSessions); }

function setSessionView(view) {
  sessionView = view;
  renderSessionsList(lastSessions);
  window.scrollTo(0, 0);
}

function _daysAgoIso(days) {
  var d = new Date();
  d.setDate(d.getDate() - days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
}

/** { key, label, cls } — where a session stands */
function sessionStatus(s) {
  if (!s.calculated) {
    if (s.date && s.date > _todayIso()) return { key: "upcoming", label: t("statusUpcoming"), cls: "st-upcoming" };
    return { key: "costs", label: t("needsCosts"), cls: "st-costs" };
  }
  var open = openTransfers(s).length;
  if (open > 0) return { key: "unpaid", label: t("statusWaiting").replace("{n}", open), cls: "st-unpaid" };
  return { key: "settled", label: t("settled"), cls: "st-settled" };
}

function renderSessionsList(sessions) {
  var container = document.getElementById("sessionsList");
  if (!container) return;
  sessions = sessions || [];

  // Sessions older than 30 days move to History automatically
  var cutoff = _daysAgoIso(30);
  var recent = sessions.filter(function (s) { return !s.date || s.date >= cutoff; });
  var older = sessions.filter(function (s) { return s.date && s.date < cutoff; });

  var html = '<div class="view-switch">';
  html += '<button class="view-btn' + (sessionView === "recent" ? ' active' : '') + '" onclick="setSessionView(\'recent\')">' + icon("sessions", 16) + ' ' + t("last30Days") + ' (' + recent.length + ')</button>';
  html += '<button class="view-btn' + (sessionView === "history" ? ' active' : '') + '" onclick="setSessionView(\'history\')">' + icon("history", 16) + ' ' + t("history") + ' (' + older.length + ')</button>';
  html += '</div>';

  setBreadcrumb(sessionView === "history"
    ? [{ label: t("navSessions"), action: "setSessionView('recent')" }, { label: t("history") }]
    : null);

  var inView = sessionView === "history" ? older : recent;
  var months = monthsOf(inView, function (s) { return s.date; });
  if (sessionHistoryMonth && months.indexOf(sessionHistoryMonth) < 0) sessionHistoryMonth = "";
  html += filterBarHtml(
    [["", t("allStatuses")], ["upcoming", t("statusUpcoming")], ["costs", t("needsCosts")], ["unpaid", t("unpaid")], ["settled", t("settled")]],
    sessionStatusFilter, months, sessionHistoryMonth, "setSessionStatusFilter", "setSessionMonthFilter");

  var pay = typeof myPaymentSummary === "function" ? myPaymentSummary() : null;
  if (pay && (pay.oweTotal || pay.owedTotal)) {
    html += '<button class="pay-banner" onclick="showMyPayments()">' + icon("wallet", 22) +
      '<span style="flex:1;text-align:left"><b>' + (pay.oweTotal ? t("youOwe") + ' ' + fmtLAK(pay.oweTotal) : t("allPaidUp")) + '</b>' +
      (pay.owedTotal ? '<br><small>' + t("owedToYou") + ' ' + fmtLAK(pay.owedTotal) + '</small>' : '') + '</span>' +
      '<span class="pay-banner-cta">' + (pay.oweTotal ? t("payNow") : t("view")) + ' ' + icon("chevron", 14) + '</span></button>';
  }

  // Filters, then latest first
  var list = inView.filter(function (s) {
    if (sessionStatusFilter && sessionStatus(s).key !== sessionStatusFilter) return false;
    if (sessionHistoryMonth && (s.date || "").slice(0, 7) !== sessionHistoryMonth) return false;
    return true;
  }).sort(byLatest(function (s) { return (s.date || "") + " " + (s.time || ""); }));

  if (list.length === 0) {
    container.innerHTML = html +
      '<div class="empty-state"><div class="empty-icon">' + icon("sessions", 44) + '</div>' +
      '<div>' + (inView.length ? t("noMatch") : sessionView === "history" ? t("noHistory") : t("noSessions")) + '</div>' +
      (sessionView === "recent" && !inView.length ? '<div style="margin-top:8px;font-size:13px">' + t("createFirst") + '</div>' +
        '<button class="btn-primary" style="margin-top:16px" onclick="createAdHocSession()">+ ' + t("newSession") + '</button>' : '') +
      '</div>';
    return;
  }

  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var canDetails = canEditSessionDetails(s), canBill = canEditBill(s), canDel = canDeleteSession(s);
    var players = s.players || [];
    var st = sessionStatus(s);

    html += '<div class="session-card">';
    html += '<div class="session-card-main" onclick="showSessionDetail(\'' + s.id + '\')">';
    html += '<div style="min-width:0;flex:1">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="session-date">' + fmtDate(s.date) + '</span>' +
      '<span class="status-pill ' + st.cls + '">' + st.label + '</span></div>';
    var cocks = sessionCocks(s);
    html += '<div class="session-court">' + icon("pin", 12) + ' ' + escapeHtml(s.courtName || "") + ' • ' + escapeHtml(s.time || "") + (s.duration ? ' (' + fmtHours(s.duration) + ')' : '') +
      (cocks ? ' • ' + icon("shuttle", 12) + ' ' + cocks + ' ' + t("cocks") : '') + '</div>';
    html += '<div class="avatar-stack">';
    players.slice(0, 7).forEach(function (u) { html += avatarHtml(u, 24); });
    if (players.length > 7) html += '<span class="avatar-more">+' + (players.length - 7) + '</span>';
    html += '<span class="session-players" style="margin-left:6px">' + players.length + ' ' + t("joinedPlayers").toLowerCase() + '</span></div>';
    if (s.createdBy) {
      html += '<div class="session-by" role="button" onclick="showUserProfile(\'' + s.createdBy + '\',event)">' + avatarHtml(s.createdBy, 18) + '<span class="poll-author-by">' + t("createdBy") + '</span> <b>' + getUserName(s.createdBy) + '</b></div>';
    }
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0">' +
      '<div class="session-total">' + (s.calculated ? fmtShort(s.grandTotal) : '—') + '</div>' +
      (s.calculated && players.length ? '<div class="session-each">~' + fmtShort((s.grandTotal || 0) / players.length) + ' ' + t("each") + '</div>' : '') +
      '</div>';
    html += '</div>';

    if (canDetails || canBill) {
      html += '<div class="session-actions">';
      if (canDetails) html += '<button class="edit-btn" onclick="showSessionDetailsModal(\'' + s.id + '\')">' + icon("pen", 14) + ' ' + t("editDetails") + '</button>';
      if (canBill) html += '<button class="edit-btn" onclick="openSessionBill(\'' + s.id + '\')">' + icon("bill", 14) + ' ' + t("editBillShort") + '</button>';
      if (canDel) html += '<button class="delete-btn" onclick="deleteSessionById(\'' + s.id + '\')">' + icon("trash", 16) + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

function _monthLabel(ym) {
  var p = ym.split("-");
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1);
  return monthYear(d.getFullYear(), d.getMonth());
}

/** Edit date / time / court / duration from the session card */
function showSessionDetailsModal(sessionId) {
  var s = null;
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === sessionId) s = lastSessions[i];
  if (!s) return;
  var courts = DB_CACHE.courts;
  var opts = '';
  courts.forEach(function (c) {
    opts += '<option value="' + c.id + '"' + (c.id === s.courtId ? ' selected' : '') + '>' + escapeHtml(c.name) + ' (' + fmtLAK(courtPrice(c)) + '/h)</option>';
  });

  document.getElementById("modalTitle").textContent = t("editDetails");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">' + t("date") + '</label><input type="date" class="form-input" id="mSesDate" value="' + (s.date || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">' + t("startTime") + '</label><input type="time" class="form-input" id="mSesTime" value="' + (s.time || '') + '"></div>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group" style="flex:2"><label class="form-label">' + t("court") + '</label><select class="form-select" id="mSesCourt" data-cs-type="court">' + opts + '</select></div>' +
      '<div class="form-group" style="flex:1"><label class="form-label">' + t("duration") + ' (h)</label><input type="number" class="form-input" id="mSesDur" min="0.5" step="0.5" value="' + (s.duration || 2) + '"></div>' +
    '</div>';

  modalCallback = function () {
    var court = dbFindById(courts, document.getElementById("mSesCourt").value);
    var duration = parseFloat(document.getElementById("mSesDur").value) || 0;
    var date = document.getElementById("mSesDate").value;
    if (!date || duration <= 0 || !court) { showToast(t("fillAllFields")); return; }
    var data = {
      date: date,
      time: document.getElementById("mSesTime").value,
      duration: duration,
      courtId: court.id,
      courtName: court.name,
      courtLocation: court.location || null,
      pricePerHour: courtPrice(court)
    };
    // Court cost follows the new court / duration if the bill was already entered
    if (s.calculated && canEditBill(s)) {
      data.courtCost = Math.round(data.pricePerHour * duration);
      data.grandTotal = (s.grandTotal || 0) - (s.courtCost || 0) + data.courtCost;
    }
    dbUpdateSession(sessionId, data)
      .then(function () { closeModal(); showToast(t("save") + " ✔"); })
      .catch(function (error) { showToast(_permError(error)); });
  };
  openModal();
}

/** Open the session straight in the bill editor */
function openSessionBill(sessionId) {
  showSessionDetail(sessionId);
  var tries = 0;
  (function wait() {
    if (currentSession && currentSession.id === sessionId) { if (!sessionEditing) startEditSession(); return; }
    if (tries++ < 40) setTimeout(wait, 50);
  })();
}

/** Turn Firestore "permission-denied" into a readable message */
function _permError(error) {
  return error && error.code === "permission-denied" ? t("noPermission") : (error && error.message) || String(error);
}

/** Start a session directly (without a poll), with me as the first player */
var newSes = null;

/** "+ New session": opens the form page — nothing is saved until "Create session" */
function createAdHocSession() {
  var court = DB_CACHE.courts[0];
  newSes = { date: _todayIso(), time: "18:00", duration: 2, courtId: court ? court.id : null, players: [] };
  showPage("session-create");
  renderSessionCreateForm();
}

function renderSessionCreateForm() {
  var container = document.getElementById("sessionCreateContent");
  if (!container || !newSes) return;
  setBreadcrumb([{ label: t("navSessions"), action: "showPage('sessions')" }, { label: t("newSession") }]);

  var courts = DB_CACHE.courts;
  if (!courts.length) {
    container.innerHTML = '<div class="card"><div class="card-title">' + t("newSession") + '</div>' +
      '<div class="empty-state" style="padding:20px"><div>' + t("noCourtsYet") + '</div>' +
      '<button class="btn-secondary" style="margin-top:12px" onclick="settingsTab=\'courts\';showPage(\'config\')">' + t("configuration") + ' → ' + t("tabCourts") + '</button></div></div>';
    return;
  }
  if (!newSes.courtId || !dbFindById(courts, newSes.courtId)) newSes.courtId = courts[0].id;

  // Plan
  var html = '<div class="card"><div class="card-title">' + icon("calendar", 14) + ' ' + t("plan") + '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group"><label class="form-label">' + t("date") + '</label>';
  html += '<input type="date" class="form-input" value="' + newSes.date + '" onchange="newSes.date=this.value"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("startTime") + '</label>';
  html += '<input type="time" class="form-input" value="' + newSes.time + '" onchange="newSes.time=this.value"></div>';
  html += '</div><div class="form-row">';
  html += '<div class="form-group" style="flex:2;margin-bottom:0"><label class="form-label">' + t("court") + '</label>';
  html += '<select class="form-select" data-cs-type="court" data-cs-onpick="sesPickCourt" onchange="newSes.courtId=this.value">';
  courts.forEach(function (c) {
    html += '<option value="' + c.id + '"' + (c.id === newSes.courtId ? ' selected' : '') + '>' +
      escapeHtml(c.name) + (c.location ? ' — ' + escapeHtml(c.location) : '') + '</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group" style="flex:1;margin-bottom:0"><label class="form-label">' + t("duration") + ' (h)</label>';
  html += '<input type="number" class="form-input" min="0.5" step="0.5" value="' + newSes.duration + '" onchange="newSes.duration=parseFloat(this.value)||2"></div>';
  html += '</div></div>';

  // Players
  html += '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (<span id="newSesCount">' + newSes.players.length + '</span>)</div>';
  html += '<div class="chips" id="newSesPlayers">' + _newSesChips() + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted)">' + t("newSessionHint") + '</div></div>';

  html += '<button class="btn-primary" id="newSesSubmit" onclick="submitNewSession()">' + t("createSession") + '</button>';
  container.innerHTML = html;
}

function sesPickCourt(id) {
  if (newSes) newSes.courtId = id;
  setTimeout(renderSessionCreateForm, 300); // let the court list refresh first
}

function _newSesChips() {
  return DB_CACHE.users.map(function (u) {
    var on = newSes.players.indexOf(u.id) >= 0;
    return '<div class="chip avatar-chip' + (on ? ' active' : '') + '" onclick="newSesToggle(\'' + u.id + '\')">' + avatarHtml(u.id, 22) + (on ? icon("check", 12) + ' ' : '') + getUserName(u.id) + '</div>';
  }).join('');
}

function newSesToggle(uid) {
  var i = newSes.players.indexOf(uid);
  if (i >= 0) newSes.players.splice(i, 1); else newSes.players.push(uid);
  document.getElementById("newSesPlayers").innerHTML = _newSesChips();
  document.getElementById("newSesCount").textContent = newSes.players.length;
}

function submitNewSession() {
  var court = findCourt(newSes.courtId);
  if (!newSes.date || !newSes.time || !(newSes.duration > 0) || !court) { showToast(t("fillAllFields")); return; }
  if (!newSes.players.length) { showToast(t("pickPlayersFirst")); return; }
  var btn = document.getElementById("newSesSubmit");
  if (btn) btn.disabled = true;
  dbCreateSession({
    pollId: null,
    date: newSes.date,
    time: newSes.time,
    duration: newSes.duration,
    courtId: court.id,
    courtName: court.name,
    courtLocation: court.location || null,
    pricePerHour: courtPrice(court),
    status: "active",
    players: newSes.players.slice(),
    calculated: false,
    createdBy: currentUser ? currentUser.uid : null
  }).then(function (ref) {
    newSes = null;
    showToast(t("sessionCreated") + " ✔");
    showSessionDetail(ref.id);
  }).catch(function (error) {
    if (btn) btn.disabled = false;
    showToast(_permError(error));
  });
}

/* ──────────────────────────────────────────────────────────
   Session Detail
   ────────────────────────────────────────────────────────── */

function showSessionDetail(sessionId) {
  if (_sessionDocUnsub) { _sessionDocUnsub(); _sessionDocUnsub = null; }
  currentSessionId = sessionId;
  currentSession = null;
  sessionEditing = false;
  edit = null;
  showPage("session-detail");

  var detailEl = document.getElementById("sessionDetailContent");
  if (detailEl) detailEl.innerHTML = '<div class="loading">' + t("loading") + '</div>';

  _sessionDocUnsub = fsdb.collection("sessions").doc(sessionId).onSnapshot(function (doc) {
    if (currentSessionId !== sessionId) return;
    if (!doc.exists) {
      showToast(t("sessionNotFound"));
      if (_sessionDocUnsub) { _sessionDocUnsub(); _sessionDocUnsub = null; }
      goBack();
      return;
    }
    currentSession = doc.data();
    currentSession.id = doc.id;
    // Don't wipe a form the user is typing in
    if (!sessionEditing) renderSessionDetail();
  }, dbOnError);
}

function refreshSessionDetail() {
  if (currentSession && !sessionEditing) renderSessionDetail();
}

function renderSessionDetail() {
  var container = document.getElementById("sessionDetailContent");
  if (!container || !currentSession) return;
  var s = currentSession;
  // The session can arrive after the user has moved on — leave other pages alone
  if (currentPage === "session-detail") setBreadcrumb([{ label: t("navSessions"), action: "showPage('sessions')" }, { label: fmtDate(s.date) }]);

  if (!s.calculated && !sessionEditing) {
    if (canEditBill(s) || canEditSessionDetails(s)) { startEditSession(); return; }
    container.innerHTML = _renderSessionHeader(s) + _renderWaitingForBill(s);
    return;
  }

  var html = _renderSessionHeader(s);
  html += _renderSplitResult(s);
  container.innerHTML = html;
  _fillQrSlots(container);
}

/** Read-only view for players while the organiser hasn't entered the bill */
function _renderWaitingForBill(s) {
  var html = '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (' + (s.players || []).length + ')</div><div class="chips">';
  (s.players || []).forEach(function (u) { html += '<div class="chip avatar-chip" role="button" onclick="showUserProfile(\'' + u + '\',event)">' + avatarHtml(u, 22) + getUserName(u) + '</div>'; });
  html += '</div></div>';
  html += '<div class="empty-state"><div class="empty-icon">' + icon("bill", 44) + '</div><div>' + t("waitingForBill") + '</div></div>';
  return html;
}

function _renderSessionHeader(s) {
  var html = '<div style="text-align:center;margin-bottom:16px">';
  html += '<div style="font-size:16px;font-weight:700">' + fmtDate(s.date) + '</div>';
  html += '<div style="font-size:13px;color:var(--text-secondary)">' + escapeHtml(s.time || "") + (s.duration ? ' • ' + fmtHours(s.duration) : '') +
    ' • ' + escapeHtml(s.courtName || "") + (s.courtLocation ? ' (' + escapeHtml(s.courtLocation) + ')' : '') + '</div>';
  var court = s.courtId ? findCourt(s.courtId) : null;
  if (court && hasPin(court)) html += '<div style="margin-top:6px">' + courtMapLink(court, t("directions")) + '</div>';
  html += '</div>';
  return html;
}

/* ---------- Result view (after costs are saved) ---------- */
function _renderSplitResult(s) {
  var L = computeLedger(s);
  var settled = s.settled || {};
  var players = s.players || [];
  var html = "";

  html += '<div class="split-header">';
  html += '<div class="split-label">' + t("totalSession") + '</div>';
  html += '<div class="split-amount" title="' + fmtLAK(L.totals.grand) + '">' + fmtShort(L.totals.grand) + '</div>';
  html += '</div>';

  // Cost breakdown
  html += '<div class="cost-breakdown">';
  var nCocks = sessionCocks(s);
  html += _costCard(icon("court", 22), t("court"), L.totals.court, s.courtPayer, s.duration ? fmtHours(s.duration) : '');
  html += _costCard(icon("shuttle", 22), t("shuttlecocks"), L.totals.shuttle, s.shuttlePayer, nCocks ? nCocks + ' ' + t("cocks") : '');
  html += _costCard(icon("other", 22), t("otherCosts"), L.totals.other, null);
  html += _costCard(icon("dinner", 22), t("dinnerBill"), L.totals.dinner, s.dinner ? s.dinner.paidBy : null);
  html += '</div>';

  // 1) Pay by type: one card per cost, with the payer's QR and each player's part
  html += '<div class="section-title">' + icon("card", 14) + ' ' + t("payByType") + '</div>';
  var n = players.length;
  if (L.totals.court > 0) {
    html += _payTypeCard(s, icon("court", 18), t("court"),
      escapeHtml(s.courtName || "") + ' — ' + fmtHours(s.duration || 0) + ' × ' + fmtLAK(s.pricePerHour),
      L.totals.court, s.courtPayer, "court", _even(players, L.totals.court));
  }
  if (L.totals.shuttle > 0) {
    var cocksDesc = (s.shuttlecocks || []).map(function (c) {
      return c.qty + ' ' + escapeHtml(c.brand) + ' (' + fmtLAK(c.price) + '/' + c.cocksPerTube + ')';
    }).join(', ');
    html += _payTypeCard(s, icon("shuttle", 18), t("shuttlecocks"), cocksDesc, L.totals.shuttle, s.shuttlePayer, "shuttle", _even(players, L.totals.shuttle));
  }
  (s.otherCosts || []).forEach(function (oc) {
    if (!(oc.amount > 0)) return;
    var parts = oc.forUid ? (function () { var o = {}; o[oc.forUid] = oc.amount; return o; })() : _even(players, oc.amount);
    html += _payTypeCard(s, icon("other", 18), escapeHtml(oc.desc),
      oc.forUid ? t("for") + ' ' + getUserName(oc.forUid) : t("everyone") + ' (÷' + n + ')',
      oc.amount, oc.paidBy, "dinner", parts);
  });
  if (L.totals.dinner > 0) {
    var receipt = s.dinner.receiptUrl
      ? '<img ' + imgSrcAttrs(s.dinner.receiptUrl) + ' alt="' + t("receipt") + '" class="receipt-thumb" onclick="openImage(this.src)">' +
        '<div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:4px">' + t("tapToEnlarge") + '</div>'
      : '';
    html += _payTypeCard(s, icon("dinner", 18), t("dinnerBill"), '÷' + s.dinner.diners.length + ' ' + t("diners"),
      L.totals.dinner, s.dinner.paidBy, "dinner", _even(s.dinner.diners, L.totals.dinner), receipt);
  }

  // 2) Settlement after deduction: one row per pair of people
  html += '<div class="card"><div class="card-title">' + icon("calc", 14) + ' ' + t("settlement") + '</div>';
  if (L.transfers.length === 0) {
    html += '<div style="font-size:13px;color:var(--text-muted)">' + t("nothingToPay") + '</div>';
  } else {
    html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">' + t("settlementHint") + '</div>';
    for (var ti = 0; ti < L.transfers.length; ti++) {
      var tr = L.transfers[ti];
      var gross = (tr.items || []).reduce(function (a, x) { return a + x.amount; }, 0);
      var minus = (tr.minus || []).reduce(function (a, x) { return a + x.amount; }, 0);
      var isDone = !!settled[tr.key];
      var canMark = _canMarkTransfer(s, tr);
      html += '<div class="settle-block' + (isDone ? ' done' : '') + '">';
      html += '<div class="settle-head"><div style="font-size:14px"><b>' + getUserName(tr.from) + '</b> → <b>' + getUserName(tr.to) + '</b></div><div>';
      if (isDone) {
        html += canMark ? '<button class="edit-btn paid-btn" onclick="setTransferSettled(\'' + s.id + '\',\'' + tr.key + '\',false)">' + icon("check", 14) + ' ' + t("paid") + '</button>'
                        : '<span class="person-status status-payer">' + t("paid") + '</span>';
      } else if (canMark) {
        html += '<button class="edit-btn" onclick="setTransferSettled(\'' + s.id + '\',\'' + tr.key + '\',true)">' + t("markPaid") + '</button>';
      } else {
        html += '<span class="person-status status-owes">' + t("unpaid") + '</span>';
      }
      html += '</div></div>';
      html += '<table class="settle-table"><thead><tr><th class="num">' + t("owes") + '</th><th class="num">− ' + t("deduct") + '</th><th class="num">= ' + t("toPay") + '</th></tr></thead><tbody><tr>' +
        '<td class="num">' + Math.round(gross).toLocaleString("en-US") + '</td>' +
        '<td class="num">' + (minus ? Math.round(minus).toLocaleString("en-US") : '—') + '</td>' +
        '<td class="num pay">' + fmtLAK(tr.amount) + '</td></tr></tbody></table>';
      html += '<div class="person-breakdown">' + transferBreakdownHtml(tr) + '</div>';
      html += '</div>';
    }
  }
  html += '</div>';

  // Per person
  html += '<div class="card"><div class="card-title">' + t("perPerson") + '</div>';
  var shareUids = Object.keys(L.shares).filter(function (u) { return L.shares[u].total > 0 || L.paid[u] > 0; });
  for (var pi = 0; pi < shareUids.length; pi++) {
    var uid = shareUids[pi];
    var ps = L.shares[uid];
    var parts = [];
    if (ps.court) parts.push(icon('court', 12) + fmtLAK(ps.court));
    if (ps.shuttle) parts.push(icon('shuttle', 12) + fmtLAK(ps.shuttle));
    if (ps.other) parts.push(icon('other', 12) + fmtLAK(ps.other));
    if (ps.dinner) parts.push(icon('dinner', 12) + fmtLAK(ps.dinner));
    var paidStr = L.paid[uid] > 0 ? '<div style="font-size:11px;color:var(--accent)">' + t("paidOut") + ' ' + fmtLAK(L.paid[uid]) + '</div>' : '';
    var notPlaying = players.indexOf(uid) < 0 ? ' <span style="font-size:10px;color:var(--text-muted)">(' + t("notPlaying") + ')</span>' : '';

    html += '<div class="person-row"><div class="person-left">';
    html += avatarHtml(uid, 36);
    html += '<div style="min-width:0"><div style="font-size:14px">' + getUserName(uid) + notPlaying + '</div>' + paidStr +
      '<div class="person-breakdown">' + parts.join(' + ') + '</div></div></div>';
    html += '<div class="person-right"><div class="person-amount">' + fmtLAK(ps.total) + '</div></div></div>';
  }
  html += '</div>';

  // Messenger copy & preview
  html += '<button class="btn-share" onclick="copyMessengerFromPreview()">' + t("copyMessenger") + '</button>';
  html += '<div class="messenger-preview" id="messengerPreview">' + escapeHtml(buildMessengerText(s)) + '</div>';

  if (canEditBill(s) || canEditSessionDetails(s)) {
    html += '<button class="btn-secondary" style="margin-bottom:8px" onclick="startEditSession()">' + icon("pen", 14) + ' ' + t("editCosts") + '</button>';
  }
  if (canDeleteSession(s)) {
    html += '<button class="btn-danger" onclick="deleteSessionById(\'' + s.id + '\')">' + t("deleteSession") + '</button>';
  }
  return html;
}

/** The payer, the receiver, the session creator, or anyone when a manual
 *  player (who cannot sign in) is involved, may mark a transfer as paid */
function _canMarkTransfer(s, tr) {
  if (!currentUser) return false;
  var me = currentUser.uid;
  if (me === tr.from || me === tr.to || canEditBill(s)) return true;
  var from = findUser(tr.from);
  var to = findUser(tr.to);
  return !!((from && from.manual) || (to && to.manual));
}

function _detailLine(label, amount, payerUid) {
  return '<div class="item-row"><div class="item-name" style="font-size:13px">' + label +
    (payerUid ? '<div style="font-size:11px;color:var(--text-muted)">' + icon("card", 12) + ' ' + t("paidBy") + ' ' + getUserName(payerUid) + '</div>' : '') +
    '</div><div class="item-price">' + fmtLAK(amount) + '</div></div>';
}

/** Number of cocks used in a session */
function sessionCocks(s) {
  return (s.shuttlecocks || []).reduce(function (a, c) { return a + (Number(c.qty) || 0); }, 0);
}

function _costCard(iconHtml, label, amount, payerUid, meta) {
  return '<div class="cost-card"><div class="cost-icon">' + iconHtml + '</div>' +
    '<div class="cost-card-label">' + label + '</div>' +
    '<div class="cost-card-value">' + (meta ? '<span class="cost-card-meta">' + meta + '</span>' : '') + fmtShort(amount) + '</div>' +
    '<div class="cost-card-sub">' + (payerUid && amount ? getUserName(payerUid) : '&nbsp;') + '</div></div>';
}

/** Split `amount` equally: { uid: part } */
function _even(uids, amount) {
  var o = {};
  uids.forEach(function (u) { o[u] = amount / uids.length; });
  return o;
}

/** One cost (court, cocks, a drink, dinner): who paid, their QR, each player's part */
function _payTypeCard(s, iconHtml, title, desc, total, payer, qrType, parts, extra) {
  var html = '<div class="card pay-card">';
  html += '<div class="pay-card-head"><div style="min-width:0"><div class="pay-card-title">' + iconHtml + ' ' + title + '</div>' +
    (desc ? '<div class="pay-card-desc">' + desc + '</div>' : '') + '</div>' +
    '<div class="pay-card-total">' + fmtLAK(total) + '</div></div>';

  // 1) Who paid — receives the money; their QR for this type
  if (payer) {
    html += '<div class="receiver-box">';
    html += '<div class="receiver-info">' + avatarHtml(payer, 40) +
      '<div style="min-width:0"><div class="receiver-label">' + icon("card", 12) + ' ' + t("paidFirst") + '</div>' +
      '<div class="receiver-name">' + getUserName(payer) + '</div>' +
      '<div class="receiver-hint">' + t("scanToPay") + '</div></div></div>';
    html += '<div class="qr-slot qr-big" data-uid="' + payer + '" data-type="' + qrType + '"></div>';
    html += '</div>';
  }

  // 2) One box per person who owes them for this cost
  var payers = Object.keys(parts).filter(function (uid) { return uid !== payer; });
  if (payers.length) {
    html += '<div class="pay-box-list">';
    payers.forEach(function (uid) {
      html += '<div class="pay-box">' +
        '<div class="pay-box-who">' + avatarHtml(uid, 26) + '<span>' + getUserName(uid) + '</span></div>' +
        '<div class="pay-box-arrow">→ ' + (payer ? getUserName(payer) : '') + '</div>' +
        '<div class="pay-box-amount">' + fmtLAK(parts[uid]) + '</div></div>';
    });
    html += '</div>';
  }
  if (payer && parts[payer]) {
    html += '<div class="pay-own-share">' + getUserName(payer) + ' — ' + t("ownShare") + ' ' + fmtLAK(parts[payer]) + '</div>';
  }
  if (extra) html += '<div style="margin-top:10px">' + extra + '</div>';
  html += '</div>';
  return html;
}

/** Fill the QR placeholders with each payer's own code for that type */
function _fillQrSlots(root) {
  var slots = (root || document).querySelectorAll(".qr-slot[data-uid]");
  Array.prototype.forEach.call(slots, function (slot) {
    var uid = slot.getAttribute("data-uid");
    var type = slot.getAttribute("data-type");
    dbGetUserQr(uid).then(function (qr) {
      var url = qrFor(qr, type);
      slot.innerHTML = url
        ? '<img src="' + url + '" alt="QR" onclick="openImage(this.src)">'
        : '<div class="qr-missing">' + t("noQr") + '</div>';
    });
  });
}

/** Full-screen image (receipt, QR). Pinch to zoom works natively; tap to close. */
function openImage(src) {
  var viewer = document.createElement("div");
  viewer.className = "image-viewer";
  viewer.innerHTML = '<img src="' + src + '" alt=""><button class="image-viewer-close" aria-label="Close">' + icon("close", 26) + '</button>';
  viewer.addEventListener("click", function () { viewer.remove(); });
  document.body.appendChild(viewer);
}

/* ──────────────────────────────────────────────────────────
   Cost entry form
   ────────────────────────────────────────────────────────── */

function startEditSession() {
  var s = currentSession;
  if (!s) return;
  sessionEditing = true;

  var court = findCourt(s.courtId);
  edit = {
    date: s.date || _todayIso(),
    time: s.time || "18:00",
    duration: s.duration || 2,
    courtId: s.courtId || (DB_CACHE.courts[0] ? DB_CACHE.courts[0].id : ""),
    pricePerHour: court ? courtPrice(court) : (s.pricePerHour || 0),
    players: (s.players || []).slice(),
    courtPayer: s.courtPayer || _defaultPayer("defaultCourtPayer", s.players),
    shuttlecocks: (s.shuttlecocks || []).map(function (x) {
      return { brand: x.brand, qty: x.qty || 0, price: x.price || 0, cocksPerTube: x.cocksPerTube || 12 };
    }),
    shuttlePayer: s.shuttlePayer || _defaultPayer("defaultShuttlePayer", s.players),
    otherCosts: (s.otherCosts || []).map(function (x) {
      return { desc: x.desc, amount: x.amount, paidBy: x.paidBy, forUid: x.forUid || null };
    }),
    dinner: s.dinner ? {
      totalBill: s.dinner.totalBill || 0,
      paidBy: s.dinner.paidBy || "",
      diners: (s.dinner.diners || []).slice(),
      receiptUrl: s.dinner.receiptUrl || null
    } : null
  };
  renderEditForm();
}

/** Default payer from Settings, but only if that person is playing */
function _defaultPayer(key, players) {
  var uid = appSetting(key, "");
  return uid && (players || []).indexOf(uid) >= 0 ? uid : "";
}

function cancelEditSession() {
  if (currentSession && !currentSession.calculated) { goBack(); return; }
  sessionEditing = false;
  edit = null;
  renderSessionDetail();
}

/** All users that can be picked: roster + anyone already on the session */
function _pickableUids() {
  var uids = DB_CACHE.users.map(function (u) { return u.id; });
  for (var i = 0; i < edit.players.length; i++) {
    if (uids.indexOf(edit.players[i]) < 0) uids.push(edit.players[i]);
  }
  return uids;
}

function _payerOptions(selected, list) {
  var html = '<option value="">' + t("selectPayer") + '</option>';
  for (var i = 0; i < list.length; i++) {
    html += '<option value="' + list[i] + '"' + (list[i] === selected ? ' selected' : '') + '>' + getUserName(list[i]) + '</option>';
  }
  return html;
}

function renderEditForm() {
  var container = document.getElementById("sessionDetailContent");
  if (!container || !edit) return;
  var courts = DB_CACHE.courts;
  var html = "";
  var canDetails = canEditSessionDetails(currentSession), canBill = canEditBill(currentSession);
  if (currentPage === "session-detail") setBreadcrumb([
    { label: t("navSessions"), action: "showPage('sessions')" },
    { label: fmtDate(edit.date), action: currentSession && currentSession.calculated ? "cancelEditSession()" : "showPage('sessions')" },
    { label: t("editCosts") }
  ]);
  var lockDetails = canDetails ? '<fieldset class="perm-fs">' : '<fieldset class="perm-fs perm-lock" disabled>';
  var lockBill = canBill ? '<fieldset class="perm-fs">' : '<fieldset class="perm-fs perm-lock" disabled>';
  if (!canDetails || !canBill) {
    html += '<div class="perm-note">' + icon("lock", 14) + ' ' + t(canBill ? "onlyBillEditable" : "onlyDetailsEditable") + '</div>';
  }

  // When & where
  html += lockDetails + '<div class="card"><div class="card-title">' + icon("calendar", 14) + ' ' + t("courtDetails") + '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group"><label class="form-label">' + t("date") + '</label><input type="date" class="form-input" value="' + edit.date + '" onchange="edit.date=this.value"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("startTime") + '</label><input type="time" class="form-input" value="' + edit.time + '" onchange="edit.time=this.value"></div>';
  html += '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group" style="flex:2"><label class="form-label">' + t("court") + '</label><select class="form-select" data-cs-type="court" data-cs-onpick="editSetCourt" onchange="editSetCourt(this.value)">';
  if (!courts.length) html += '<option value="">' + t("noCourtsYet") + '</option>';
  for (var ci = 0; ci < courts.length; ci++) {
    html += '<option value="' + courts[ci].id + '"' + (courts[ci].id === edit.courtId ? ' selected' : '') + '>' + escapeHtml(courts[ci].name) + ' (' + fmtLAK(courtPrice(courts[ci])) + '/h)</option>';
  }
  html += '</select></div>';
  html += '<div class="form-group" style="flex:1"><label class="form-label">' + t("duration") + ' (h)</label><input type="number" class="form-input" min="0.5" max="12" step="0.5" value="' + edit.duration + '" oninput="edit.duration=parseFloat(this.value)||0;_updateEditTotals()"></div>';
  html += '</div>';
  html += '<div class="cost-display" id="courtCostDisplay"></div>';
  html += '</fieldset>' + lockBill;
  html += '<div class="form-group" style="margin-top:8px"><label class="form-label">' + icon("card", 12) + ' ' + t("courtPayer") + '</label>';
  html += '<select class="form-select" data-cs-type="player" data-cs-onpick="editPickCourtPayer" onchange="edit.courtPayer=this.value">' + _payerOptions(edit.courtPayer, edit.players) + '</select></div>';
  html += '</fieldset>' + lockDetails;
  html += '</div>';

  // Players
  var pickable = _pickableUids();
  html += '</fieldset>' + lockDetails;
  html += '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (' + edit.players.length + ')</div>';
  html += '<div class="chips">';
  for (var ui = 0; ui < pickable.length; ui++) {
    var on = edit.players.indexOf(pickable[ui]) >= 0;
    html += '<div class="chip avatar-chip' + (on ? ' active' : '') + '" onclick="editTogglePlayer(\'' + pickable[ui] + '\')">' + avatarHtml(pickable[ui], 22) + (on ? icon("check", 12) + ' ' : '') + getUserName(pickable[ui]) + '</div>';
  }
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted)">' + t("payerHint") + '</div>';
  html += '</div>';

  html += '</fieldset>' + lockBill;

  // Shuttlecocks
  html += '<div class="card"><div class="card-title">' + icon("shuttle", 14) + ' ' + t("shuttlecocks") + ' <span style="font-size:10px;color:var(--text-muted);text-transform:none;letter-spacing:0">' + t("splitEqually") + '</span></div>';
  for (var si = 0; si < edit.shuttlecocks.length; si++) {
    var sc = edit.shuttlecocks[si];
    html += '<div class="item-row">';
    html += '<div class="item-name">' + escapeHtml(sc.brand) + '<div style="font-size:10px;color:var(--text-muted)">' + fmtLAK(sc.price) + ' / ' + sc.cocksPerTube + ' ' + t("cocks") + '</div></div>';
    html += '<div class="qty-controls"><button onclick="editShuttleQty(' + si + ',-1)">−</button>';
    html += '<input type="number" class="qty-num" min="0" value="' + sc.qty + '" style="width:44px;background:transparent;border:none;color:var(--text);text-align:center" oninput="edit.shuttlecocks[' + si + '].qty=Math.max(0,parseInt(this.value)||0);_updateEditTotals()">';
    html += '<button onclick="editShuttleQty(' + si + ',1)">+</button></div>';
    html += '<div class="item-price" id="scRowTotal' + si + '"></div>';
    html += '<button class="remove-btn" onclick="edit.shuttlecocks.splice(' + si + ',1);renderEditForm()">' + icon("close", 16) + '</button>';
    html += '</div>';
  }
  html += '<button class="add-btn-dashed" onclick="showAddShuttlecock()">+ ' + t("addBrand") + '</button>';
  html += '<div class="form-group" style="margin-top:10px"><label class="form-label">' + icon("card", 12) + ' ' + t("shuttlePayer") + '</label>';
  html += '<select class="form-select" data-cs-type="player" data-cs-onpick="editPickShuttlePayer" onchange="edit.shuttlePayer=this.value">' + _payerOptions(edit.shuttlePayer, edit.players) + '</select></div>';
  html += '<div class="subtotal-row"><span>' + t("shuttleTotal") + '</span><span id="shuttleTotal"></span></div>';
  html += '</div>';

  // Other costs
  html += '<div class="card"><div class="card-title">' + icon("other", 14) + ' ' + t("otherCosts") + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">' + t("otherCostHint") + '</div>';
  for (var oi = 0; oi < edit.otherCosts.length; oi++) {
    var oc = edit.otherCosts[oi];
    html += '<div class="item-row"><div class="item-name">' + escapeHtml(oc.desc) +
      '<div style="font-size:11px;color:var(--text-muted)">' + icon("card", 12) + ' ' + getUserName(oc.paidBy) + ' • ' + (oc.forUid ? t("for") + ' ' + getUserName(oc.forUid) : t("everyone")) + '</div></div>' +
      '<div class="item-price">' + fmtLAK(oc.amount) + '</div>' +
      '<button class="remove-btn" onclick="edit.otherCosts.splice(' + oi + ',1);renderEditForm()">' + icon("close", 16) + '</button></div>';
  }
  html += '<button class="add-btn-dashed" onclick="showAddOtherCost()">+ ' + t("addOtherCost") + '</button>';
  html += '</div>';

  // Dinner
  html += '<div class="card"><div class="card-title">' + icon("dinner", 14) + ' ' + t("dinnerBill") + '</div>';
  if (!edit.dinner) {
    html += '<button class="add-btn-dashed" onclick="editAddDinner()">+ ' + t("addDinner") + '</button>';
  } else {
    var d = edit.dinner;
    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">' + t("totalBill") + ' (' + curSymbol() + ')</label>' + moneyInput('', d.totalBill, 'edit.dinner.totalBill=parseMoney(this.value);_updateEditTotals()') + '</div>';
    html += '<div class="form-group"><label class="form-label">' + icon("card", 12) + ' ' + t("dinnerPayer") + '</label><select class="form-select" data-cs-type="player" data-cs-onpick="editPickDinnerPayer" onchange="edit.dinner.paidBy=this.value">' + _payerOptions(d.paidBy, pickable) + '</select></div>';
    html += '</div>';
    html += '<label class="form-label">' + t("selectDiners") + '</label><div class="chips">';
    for (var di = 0; di < pickable.length; di++) {
      var dOn = d.diners.indexOf(pickable[di]) >= 0;
      html += '<div class="chip' + (dOn ? ' active' : '') + '" onclick="editToggleDiner(\'' + pickable[di] + '\')">' + (dOn ? icon("check", 12) + ' ' : '') + getUserName(pickable[di]) + '</div>';
    }
    html += '</div>';
    html += '<div class="form-group"><label class="form-label">' + t("uploadReceipt") + '</label>';
    if (d.receiptUrl) html += '<img ' + imgSrcAttrs(d.receiptUrl) + ' class="receipt-thumb" style="margin-bottom:6px" onclick="openImage(this.src)">';
    html += '<input type="file" class="form-input" accept="image/*" style="padding:8px;font-size:13px" onchange="editReceiptChosen(this)"></div>';
    html += '<button class="btn-danger" style="padding:8px;font-size:12px" onclick="edit.dinner=null;renderEditForm()">' + t("removeDinner") + '</button>';
  }
  html += '</div>';

  html += '</fieldset>';

  // Summary + save
  html += '<div class="card"><div class="card-title">' + t("total") + '</div><div id="editSummary"></div></div>';
  html += '<button class="btn-primary" onclick="saveSessionCosts()">' + t("calculateSplit") + '</button>';
  html += '<button class="btn-secondary" style="margin-top:8px" onclick="cancelEditSession()">' + t("cancel") + '</button>';
  if (currentSession && !currentSession.calculated && canDeleteSession(currentSession)) {
    html += '<button class="btn-danger" style="margin-top:8px" onclick="deleteSessionById(\'' + currentSession.id + '\')">' + t("deleteSession") + '</button>';
  }

  container.innerHTML = _renderSessionHeader({
    date: edit.date, time: edit.time, duration: edit.duration,
    courtName: (dbFindById(courts, edit.courtId) || {}).name || (currentSession && currentSession.courtName),
    courtLocation: (dbFindById(courts, edit.courtId) || {}).location
  }) + html;
  _updateEditTotals();
}

/** Build the session fields that the cost form produces */
function _editToSessionData() {
  var court = findCourt(edit.courtId);
  var pricePerHour = court ? courtPrice(court) : edit.pricePerHour;
  var courtCost = Math.round(pricePerHour * (edit.duration || 0));

  var shuttlecocks = [];
  var shuttleTotal = 0;
  for (var i = 0; i < edit.shuttlecocks.length; i++) {
    var sc = edit.shuttlecocks[i];
    if (!sc.qty) continue;
    var total = Math.round(sc.qty / (sc.cocksPerTube || 12) * sc.price);
    shuttlecocks.push({ brand: sc.brand, qty: sc.qty, price: sc.price, cocksPerTube: sc.cocksPerTube || 12, total: total });
    shuttleTotal += total;
  }

  var otherTotal = 0;
  for (var o = 0; o < edit.otherCosts.length; o++) otherTotal += edit.otherCosts[o].amount || 0;

  var dinner = null;
  if (edit.dinner && edit.dinner.totalBill > 0) {
    dinner = {
      totalBill: edit.dinner.totalBill,
      paidBy: edit.dinner.paidBy,
      diners: edit.dinner.diners.slice(),
      receiptUrl: edit.dinner.receiptUrl || null
    };
  }

  return {
    date: edit.date,
    time: edit.time,
    duration: edit.duration,
    courtId: edit.courtId || null,
    courtName: court ? court.name : (currentSession ? currentSession.courtName : null),
    courtLocation: court ? (court.location || null) : (currentSession ? currentSession.courtLocation || null : null),
    pricePerHour: pricePerHour,
    players: edit.players.slice(),
    courtCost: courtCost,
    courtPayer: edit.courtPayer || null,
    shuttlecocks: shuttlecocks,
    shuttleTotal: shuttleTotal,
    shuttlePayer: edit.shuttlePayer || null,
    otherCosts: edit.otherCosts.slice(),
    otherTotal: otherTotal,
    dinner: dinner,
    grandTotal: courtCost + shuttleTotal + otherTotal + (dinner ? dinner.totalBill : 0)
  };
}

function _updateEditTotals() {
  if (!edit) return;
  var data = _editToSessionData();

  var courtEl = document.getElementById("courtCostDisplay");
  if (courtEl) courtEl.innerHTML = fmtHours(edit.duration || 0) + ' × ' + fmtLAK(data.pricePerHour) + ' = <b style="color:var(--accent)">' + fmtLAK(data.courtCost) + '</b>';

  for (var i = 0; i < edit.shuttlecocks.length; i++) {
    var sc = edit.shuttlecocks[i];
    var el = document.getElementById("scRowTotal" + i);
    if (el) el.textContent = fmtLAK(sc.qty / (sc.cocksPerTube || 12) * sc.price);
  }
  var stEl = document.getElementById("shuttleTotal");
  if (stEl) stEl.textContent = fmtLAK(data.shuttleTotal);

  var sumEl = document.getElementById("editSummary");
  if (sumEl) {
    var n = edit.players.length;
    sumEl.innerHTML =
      '<div class="item-row"><div class="item-name">' + icon("court", 16) + ' ' + t("court") + '</div><div class="item-price">' + fmtLAK(data.courtCost) + '</div></div>' +
      '<div class="item-row"><div class="item-name">' + icon("shuttle", 16) + ' ' + t("shuttlecocks") + '</div><div class="item-price">' + fmtLAK(data.shuttleTotal) + '</div></div>' +
      '<div class="item-row"><div class="item-name">' + icon("other", 16) + ' ' + t("otherCosts") + '</div><div class="item-price">' + fmtLAK(data.otherTotal) + '</div></div>' +
      '<div class="item-row"><div class="item-name">' + icon("dinner", 16) + ' ' + t("dinnerBill") + '</div><div class="item-price">' + fmtLAK(data.dinner ? data.dinner.totalBill : 0) + '</div></div>' +
      '<div class="subtotal-row"><span>' + t("total") + '</span><span style="color:var(--accent)">' + fmtLAK(data.grandTotal) + '</span></div>' +
      (n ? '<div style="font-size:12px;color:var(--text-muted);text-align:right">' + t("courtAndCocksEach").replace("{n}", n) + ' ' + fmtLAK((data.courtCost + data.shuttleTotal) / n) + '</div>' : '');
  }
}

/** "+ Add new" player from a payer dropdown: add them to the game and pick them */
function _editAddAndPick(uid) {
  if (uid && edit.players.indexOf(uid) < 0) edit.players.push(uid);
}
function editPickCourtPayer(uid) { _editAddAndPick(uid); edit.courtPayer = uid; renderEditForm(); }
function editPickShuttlePayer(uid) { _editAddAndPick(uid); edit.shuttlePayer = uid; renderEditForm(); }
function editPickDinnerPayer(uid) { if (edit.dinner) edit.dinner.paidBy = uid; renderEditForm(); }

function editSetCourt(courtId) {
  if (!edit) return;
  edit.courtId = courtId;
  var court = findCourt(courtId);
  if (court) edit.pricePerHour = courtPrice(court);
  renderEditForm();
}

function editTogglePlayer(uid) {
  var idx = edit.players.indexOf(uid);
  if (idx >= 0) {
    edit.players.splice(idx, 1);
    if (edit.courtPayer === uid) edit.courtPayer = "";
    if (edit.shuttlePayer === uid) edit.shuttlePayer = "";
  } else {
    edit.players.push(uid);
    if (!edit.courtPayer) edit.courtPayer = _defaultPayer("defaultCourtPayer", edit.players);
    if (!edit.shuttlePayer) edit.shuttlePayer = _defaultPayer("defaultShuttlePayer", edit.players);
  }
  renderEditForm();
}

function editToggleDiner(uid) {
  var list = edit.dinner.diners;
  var idx = list.indexOf(uid);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(uid);
  renderEditForm();
}

function editAddDinner() {
  edit.dinner = { totalBill: 0, paidBy: "", diners: edit.players.slice(), receiptUrl: null };
  renderEditForm();
}

function editReceiptChosen(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  showToast(t("loading"));
  readReceiptImage(file, function (err, dataUrl) {
    if (err) { showToast(err.message); return; }
    edit.dinner.receiptUrl = dataUrl;
    renderEditForm();
  });
}

function editShuttleQty(idx, delta) {
  var sc = edit.shuttlecocks[idx];
  sc.qty = Math.max(0, (sc.qty || 0) + delta);
  renderEditForm();
}

function reopenAddShuttlecock(brandId) {
  setTimeout(function () { showAddShuttlecock(brandId); }, 300); // let the brand list refresh first
}

function showAddShuttlecock(preselectId) {
  var brands = DB_CACHE.shuttlecocks;
  if (brands.length === 0) {
    showToast(t("addBrandsFirst"));
    return;
  }

  var opts = "";
  for (var i = 0; i < brands.length; i++) {
    opts += '<option value="' + brands[i].id + '"' + (brands[i].id === preselectId ? ' selected' : '') + '>' + escapeHtml(brands[i].name) + ' (' + fmtLAK(brands[i].pricePerTube) + ' / ' + (brands[i].cocksPerTube || 12) + ')</option>';
  }

  document.getElementById("modalTitle").textContent = t("addBrand");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("selectBrand") + '</label>' +
    '<select class="form-select" id="modalBrand" data-cs-type="shuttle" data-cs-onpick="reopenAddShuttlecock">' + opts + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + t("cocksUsed") + '</label>' +
    '<input type="number" class="form-input" id="modalQty" value="1" min="1"></div>';

  modalCallback = function () {
    var brand = dbFindById(brands, document.getElementById("modalBrand").value);
    var qty = parseInt(document.getElementById("modalQty").value) || 0;
    if (!brand || qty <= 0) { showToast(t("cocksUsed")); return; }

    var existing = null;
    for (var e = 0; e < edit.shuttlecocks.length; e++) {
      if (edit.shuttlecocks[e].brand === brand.name) existing = edit.shuttlecocks[e];
    }
    if (existing) existing.qty += qty;
    else edit.shuttlecocks.push({ brand: brand.name, qty: qty, price: brand.pricePerTube || 0, cocksPerTube: brand.cocksPerTube || 12 });
    closeModal();
    renderEditForm();
  };
  openModal();
}

function showAddOtherCost() {
  if (edit.players.length === 0) {
    showToast(t("selectPlayersFirst"));
    return;
  }
  var pickable = _pickableUids();
  var forOpts = '<option value="">' + t("everyone") + ' (÷' + edit.players.length + ')</option>';
  for (var i = 0; i < edit.players.length; i++) {
    forOpts += '<option value="' + edit.players[i] + '">' + t("only") + ' ' + getUserName(edit.players[i]) + '</option>';
  }

  document.getElementById("modalTitle").textContent = t("addOtherCost");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("description") + '</label>' +
    '<input type="text" class="form-input" id="modalDesc" placeholder="' + t("otherCostPlaceholder") + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("amount") + ' (' + curSymbol() + ')</label>' +
    moneyInput('modalAmount', 0, '') + '</div>' +
    '<div class="form-group"><label class="form-label">' + icon("card", 12) + ' ' + t("paidBy") + '</label>' +
    '<select class="form-select" id="modalPaidBy">' + _payerOptions(currentUser ? currentUser.uid : "", pickable) + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + t("splitBetween") + '</label>' +
    '<select class="form-select" id="modalFor">' + forOpts + '</select></div>';

  modalCallback = function () {
    var desc = document.getElementById("modalDesc").value.trim();
    var amount = parseMoney(document.getElementById("modalAmount").value);
    var paidBy = document.getElementById("modalPaidBy").value;
    var forUid = document.getElementById("modalFor").value || null;

    if (!desc || amount <= 0 || !paidBy) { showToast(t("fillAllFields")); return; }
    edit.otherCosts.push({ desc: desc, amount: amount, paidBy: paidBy, forUid: forUid });
    closeModal();
    renderEditForm();
  };
  openModal();
}

/* ---------- Validate + save ---------- */
function saveSessionCosts() {
  if (!edit || !currentSessionId) return;
  var data = _editToSessionData();
  var canBill = canEditBill(currentSession);

  if (data.players.length < 2) { showToast(t("needTwoPlayers")); return; }
  if (!data.courtId) { showToast(t("selectCourt")); return; }

  if (!canBill) {
    // Details only (date, time, court, players): leave the bill untouched
    var details = {};
    ["date", "time", "duration", "courtId", "courtName", "courtLocation", "pricePerHour", "players"].forEach(function (k) { details[k] = data[k]; });
    dbUpdateSession(currentSessionId, details)
      .then(function () {
        if (currentSession) Object.assign(currentSession, details);
        sessionEditing = false;
        edit = null;
        showToast(t("save") + " \u2714");
        renderSessionDetail();
      })
      .catch(function (error) { showToast(_permError(error)); });
    return;
  }

  if (data.courtCost > 0 && !data.courtPayer) { showToast(t("selectPayer") + " \u2014 " + t("courtPayer")); return; }
  if (data.shuttleTotal > 0 && !data.shuttlePayer) { showToast(t("selectPayer") + " \u2014 " + t("shuttlePayer")); return; }
  if (data.dinner) {
    if (!data.dinner.paidBy) { showToast(t("selectPayer") + " \u2014 " + t("dinnerPayer")); return; }
    if (!data.dinner.diners.length) { showToast(t("selectDiners")); return; }
  }

  data.calculated = true;
  data.billAt = Date.now(); // for "bill ready" notifications
  data.settled = {}; // amounts changed, so earlier "paid" marks no longer apply
  data.settledAt = {};
  data.status = computeLedger(data).transfers.length ? "active" : "completed";

  // A new receipt photo is stored on its own (images/), the session keeps a reference
  var receipt = data.dinner && data.dinner.receiptUrl;
  var saveReceipt = receipt && receipt.indexOf("data:") === 0
    ? dbSaveImage(receipt, "receipt").then(function (ref) { data.dinner.receiptUrl = ref; if (edit && edit.dinner) edit.dinner.receiptUrl = ref; })
    : Promise.resolve();

  saveReceipt.then(function () { return dbUpdateSession(currentSessionId, data); })
    .then(function () {
      // Show the result straight away, even if the snapshot hasn't arrived yet
      if (currentSession) Object.assign(currentSession, data);
      sessionEditing = false;
      edit = null;
      showToast(t("calculateSplit") + " \u2714");
      renderSessionDetail();
    })
    .catch(function (error) { showToast(_permError(error)); });
}

/* ──────────────────────────────────────────────────────────
   Payment Tracking
   ────────────────────────────────────────────────────────── */

function setTransferSettled(sessionId, key, value) {
  var s = currentSession && currentSession.id === sessionId ? currentSession : _findSession(sessionId);
  if (!s) return Promise.resolve();
  return settleTransfers(s, [key], value)
    .then(function () { showToast(value ? t("paid") + " \u2714" : t("unpaid")); })
    .catch(function (error) { showToast(_permError(error)); });
}

function _findSession(id) {
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === id) return lastSessions[i];
  return null;
}

/** Mark several transfers of one session paid / unpaid; records when */
function settleTransfers(s, keys, value) {
  var settled = Object.assign({}, s.settled || {});
  var settledAt = Object.assign({}, s.settledAt || {});
  keys.forEach(function (key) {
    if (value) { settled[key] = true; settledAt[key] = Date.now(); }
    else { delete settled[key]; delete settledAt[key]; }
  });
  var remaining = computeLedger(s).transfers.filter(function (tr) { return !settled[tr.key]; });
  return dbUpdateSession(s.id, { settled: settled, settledAt: settledAt, status: remaining.length ? "active" : "completed" });
}

/* ──────────────────────────────────────────────────────────
   Delete Session
   ────────────────────────────────────────────────────────── */

function deleteSessionById(sessionId) {
  if (!confirm(t("deleteConfirm"))) return;
  var s = (currentSession && currentSession.id === sessionId) ? currentSession : null;
  lastSessions.forEach(function (x) { if (x.id === sessionId) s = x; });
  if (_sessionDocUnsub) { _sessionDocUnsub(); _sessionDocUnsub = null; }
  sessionEditing = false;

  // To the trash (30 days) with Undo
  trashDoc("session", "sessions", sessionId, trashLabelSession(s))
    .then(function () {
      currentSessionId = null;
      showPage("sessions", false);
    })
    .catch(function (error) { showToast(_permError(error)); });
}

function trashLabelSession(s) {
  return s ? fmtDate(s.date) + (s.time ? " " + s.time : "") + (s.courtName ? " · " + s.courtName : "") : t("sessionsWord");
}

/* ──────────────────────────────────────────────────────────
   Messenger Text Builder
   ────────────────────────────────────────────────────────── */

function _plainName(uid) {
  var u = findUser(uid);
  return u && u.displayName ? u.displayName : "?";
}

/** Messenger summary, short lines so it reads well in a narrow chat bubble:
    costs by type (who paid), then each payer's total and whom to pay */
function buildMessengerText(s) {
  var L = computeLedger(s);
  var players = s.players || [];
  var settled = s.settled || {};
  var num = function (v) { return Math.round(v || 0).toLocaleString("en-US"); };
  var d = s.date ? new Date(s.date + "T00:00:00") : null;
  var weekday = d ? weekdayShort(d.getDay()) + " " : "";
  var who = function (uids) {
    var names = [];
    uids.forEach(function (u) { if (u && names.indexOf(_plainName(u)) < 0) names.push(_plainName(u)); });
    return names.length ? " (" + names.join(", ") + ")" : "";
  };
  var out = [];

  out.push("\uD83C\uDFF8 " + weekday + fmtDate(s.date));
  if (s.courtName) out.push("\uD83D\uDCCD " + s.courtName);

  // 1) Total of each type — (name) = who paid it
  out.push("");
  out.push("\uD83E\uDDFE " + t("msgCosts"));
  if (L.totals.court > 0) out.push(t("court") + (s.duration ? " " + fmtHours(s.duration) : "") + ": " + num(L.totals.court) + who([s.courtPayer]));
  if (L.totals.shuttle > 0) {
    var nCocks = sessionCocks(s);
    out.push(t("msgCocks") + (nCocks ? " \u00D7" + nCocks : "") + ": " + num(L.totals.shuttle) + who([s.shuttlePayer]));
  }
  if (L.totals.other > 0) out.push(t("msgOther") + ": " + num(L.totals.other) + who((s.otherCosts || []).map(function (oc) { return oc.paidBy; })));
  if (L.totals.dinner > 0) out.push(t("msgDinner") + ": " + num(L.totals.dinner) + who([s.dinner && s.dinner.paidBy]));
  out.push("\uD83D\uDCB0 " + t("total") + ": " + num(L.totals.grand) + " " + curSymbol());

  // 2) Each payer: total, then whom to pay (one per line)
  var byFrom = {}, order = [];
  L.transfers.forEach(function (tr) {
    if (!byFrom[tr.from]) { byFrom[tr.from] = []; order.push(tr.from); }
    byFrom[tr.from].push(tr);
  });
  if (order.length) {
    out.push("");
    out.push("\uD83D\uDCB8 " + t("msgWhoPays"));
  }
  order.forEach(function (from, i) {
    var trs = byFrom[from];
    var total = trs.reduce(function (a, tr) { return a + tr.amount; }, 0);
    if (i > 0) out.push(""); // blank line between payers
    var allPaid = trs.every(function (tr) { return settled[tr.key]; });
    var mark = allPaid ? "\u2705 " : "\u2B1C ";
    if (trs.length === 1) {
      out.push(mark + _plainName(from) + " " + num(total) + " \u2192 " + _plainName(trs[0].to));
      return;
    }
    out.push(mark + _plainName(from) + " " + num(total));
    trs.forEach(function (tr) {
      out.push("     \u2192 " + _plainName(tr.to) + " " + num(tr.amount) + (settled[tr.key] && !allPaid ? " \u2705" : ""));
    });
  });

  var payers = {};
  L.transfers.forEach(function (tr) { payers[tr.from] = true; });
  var nothing = players.filter(function (u) { return !payers[u]; });
  if (nothing.length) {
    out.push("");
    out.push("\uD83D\uDE4C " + t("msgNothingToPay") + ": " + nothing.map(_plainName).join(", "));
  }
  return out.join("\n");
}

function copyMessengerFromPreview() {
  var previewEl = document.getElementById("messengerPreview");
  if (!previewEl) return;
  var text = previewEl.textContent;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function () { showToast(t("copied")); });
  } else {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(t("copied"));
  }
}
