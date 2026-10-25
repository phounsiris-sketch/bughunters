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

/* ---------- Court price by time of day ---------- */
function _hm(v) { var p = String(v || "").split(":"); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
function _hmStr(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }

/** Court cost for a booking: each stretch of the booking is charged at the price of the period it falls in
    (court.priceBands = [{from, to, price}]), the court's normal price elsewhere.
    Returns { cost, parts: [{from, to, hours, rate}] | null } (parts only for courts that have periods). */
function courtCostFor(court, time, duration) {
  var base = courtPrice(court), hours = duration || 0;
  var bands = ((court && court.priceBands) || []).filter(function (b) { return b && b.from && b.to && b.price > 0; });
  if (!bands.length || !time || hours <= 0) return { cost: Math.round(base * hours), parts: null };
  var start = _hm(time), end = start + Math.round(hours * 60), spans = [], cuts = [start, end];
  bands.forEach(function (b) {
    var f = _hm(b.from), e = _hm(b.to);
    if (e <= f) e += 1440;
    [-1440, 0, 1440].forEach(function (o) {
      spans.push({ f: f + o, e: e + o, price: b.price });
      [f + o, e + o].forEach(function (x) { if (x > start && x < end) cuts.push(x); });
    });
  });
  cuts.sort(function (a, b) { return a - b; });
  var parts = [], cost = 0;
  for (var i = 0; i < cuts.length - 1; i++) {
    var a = cuts[i], b2 = cuts[i + 1];
    if (b2 <= a) continue;
    var rate = base;
    spans.forEach(function (sp) { if (sp.f <= a && a < sp.e) rate = sp.price; });
    cost += rate * (b2 - a) / 60;
    var last = parts[parts.length - 1];
    if (last && last.rate === rate) { last.to = _hmStr(b2); last.hours += (b2 - a) / 60; }
    else parts.push({ from: _hmStr(a), to: _hmStr(b2), hours: (b2 - a) / 60, rate: rate });
  }
  return { cost: Math.round(cost), parts: parts };
}
/** "17:00–18:00 × 100,000 + 18:00–19:00 × 120,000" (only when the price changes during the booking) */
function courtPartsText(parts) {
  return (parts || []).map(function (p) { return p.from + '\u2013' + p.to + ' \u00d7 ' + fmtLAK(p.rate); }).join(' + ');
}
function _partsUseful(parts, base) { return !!parts && (parts.length > 1 || (parts[0] && parts[0].rate !== base)); }

/** Discount on the whole bill: { type: "amount" | "percent", value } on a gross total */
function discountOf(d, gross) {
  if (!d || !(d.value > 0) || !(gross > 0)) return 0;
  var v = d.type === "percent" ? gross * Math.min(100, d.value) / 100 : d.value;
  return Math.min(gross, Math.round(v));
}

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

  // Discount on the whole bill: every cost is lowered by the same share, so everyone's part drops in proportion
  var gross = (s.courtCost || 0) + (s.shuttleTotal || 0) + (s.dinner && s.dinner.totalBill > 0 && s.dinner.diners && s.dinner.diners.length ? s.dinner.totalBill : 0);
  (s.otherCosts || []).forEach(function (oc) { if (oc.amount > 0) gross += oc.amount; });
  var discount = discountOf(s.discount, gross);
  var f = gross > 0 ? (gross - discount) / gross : 1;

  // Court
  var courtCost = (s.courtCost || 0) * f;
  if (courtCost > 0 && n > 0) {
    charge(players, courtCost, "court", s.courtPayer, "");
    totals.court = courtCost;
  }

  // Shuttlecocks
  var shuttleTotal = (s.shuttleTotal || 0) * f;
  if (shuttleTotal > 0 && n > 0) {
    charge(players, shuttleTotal, "shuttle", s.shuttlePayer, "");
    totals.shuttle = shuttleTotal;
  }

  // Other costs (water, drinks …): shared by everyone or for one person
  var others = s.otherCosts || [];
  for (var o = 0; o < others.length; o++) {
    var oc = others[o];
    var amt = (oc.amount || 0) * f;
    if (amt <= 0) continue;
    charge(oc.forUid ? [oc.forUid] : players, amt, "other", oc.paidBy, oc.desc || "");
    totals.other += amt;
  }

  // Dinner
  var dinner = s.dinner;
  if (dinner && dinner.totalBill > 0 && dinner.diners && dinner.diners.length) {
    charge(dinner.diners, dinner.totalBill * f, "dinner", dinner.paidBy, "");
    totals.dinner = dinner.totalBill * f;
  }

  totals.grand = totals.court + totals.shuttle + totals.other + totals.dinner;
  totals.gross = gross;
  totals.discount = discount;
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
      if (currentPage === "home" && typeof renderHome === "function") renderHome();   // a finished game takes its live board off Home
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
    ? [{ label: t("navGames"), action: "showPage('games')" }, { label: t("navSessions"), action: "setSessionView('recent')" }, { label: t("history") }]
    : [{ label: t("navGames"), action: "showPage('games')" }, { label: t("navSessions") }]);

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
    html += '<div class="session-card-main" onclick="showSessionDetail(\'' + jsq(s.id) + '\')">';
    html += '<div style="min-width:0;flex:1">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="session-date">' + fmtDate(s.date) + '</span>' +
      '<span class="status-pill ' + st.cls + '">' + st.label + '</span></div>';
    var cocks = sessionCocks(s);
    html += '<div class="session-court">' + icon("pin", 12) + ' ' + escapeHtml(s.courtName || "") + ' • ' + escapeHtml(s.time || "") + (s.duration ? ' (' + fmtHours(s.duration) + ')' : '') +
      (cocks ? ' • ' + icon("shuttle", 12) + ' ' + cocks + ' ' + t("cocks") : '') +
      (function () { var c = s.courtId ? findCourt(s.courtId) : null; return c && hasPin(c) ? ' ' + courtMapLink(c, t("mapShort")) : ''; })() + '</div>';
    html += '<div class="session-people">' + iconStatHtml("users", players.length) + peopleHtml(players, 22, 3) + '</div>';
    if (s.createdBy) {
      html += '<div class="session-by">' + avatarHtml(s.createdBy, 18) + '<span class="poll-author-by">' + t("createdBy") + '</span> <b>' + getUserName(s.createdBy) + '</b></div>';
    }
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0">' +
      '<div class="session-total">' + (s.calculated ? fmtShort(_grandOf(s)) : '—') + '</div>' +
      (s.calculated && players.length ? '<div class="session-each">~' + fmtShort(_grandOf(s) / players.length) + ' ' + t("each") + '</div>' : '') +
      '</div>';
    html += '</div>';

    if (canDetails || canBill) {
      html += '<div class="session-actions">';
      if (canDetails) html += '<button class="edit-btn" onclick="showSessionDetailsModal(\'' + jsq(s.id) + '\')">' + icon("pen", 14) + ' ' + t("editDetails") + '</button>';
      if (canBill) html += '<button class="edit-btn" onclick="openSessionBill(\'' + jsq(s.id) + '\')">' + icon("bill", 14) + ' ' + t("editBillShort") + '</button>';
      if (canDel) html += '<button class="delete-btn" onclick="deleteSessionById(\'' + jsq(s.id) + '\')">' + icon("trash", 16) + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

/** Players picked in the edit-session window */
var _sesEditPlayers = [];
function _sesEditChips() {
  return DB_CACHE.users.map(function (u) {
    var on = _sesEditPlayers.indexOf(u.id) >= 0;
    return '<div class="chip avatar-chip' + (on ? ' active' : '') + '" onclick="sesEditToggle(\'' + jsq(u.id) + '\')">' + avatarHtml(u.id, 22) + (on ? icon("check", 12) + ' ' : '') + getUserName(u.id) + '</div>';
  }).join('');
}
function sesEditToggle(uid) {
  var i = _sesEditPlayers.indexOf(uid);
  if (i >= 0) _sesEditPlayers.splice(i, 1); else _sesEditPlayers.push(uid);
  document.getElementById("mSesPlayers").innerHTML = _sesEditChips();
  document.getElementById("mSesCount").textContent = _sesEditPlayers.length;
}

/** Edit date / time / court / duration / players from the session card */
function showSessionDetailsModal(sessionId) {
  var s = null;
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === sessionId) s = lastSessions[i];
  if (!s) return;
  var courts = DB_CACHE.courts;
  var opts = '';
  courts.forEach(function (c) {
    opts += '<option value="' + c.id + '"' + (c.id === s.courtId ? ' selected' : '') + '>' + escapeHtml(c.name) + ' (' + fmtLAK(courtPrice(c)) + '/h)</option>';
  });

  _sesEditPlayers = (s.players || []).slice();
  document.getElementById("modalTitle").textContent = t("editSession");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">' + t("date") + '</label><input type="date" class="form-input" id="mSesDate" value="' + (s.date || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">' + t("startTime") + '</label><input type="time" class="form-input" id="mSesTime" value="' + (s.time || '') + '"></div>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group" style="flex:2"><label class="form-label">' + t("court") + '</label><select class="form-select" id="mSesCourt" data-cs-type="court">' + opts + '</select></div>' +
      '<div class="form-group" style="flex:1"><label class="form-label">' + t("duration") + ' (h)</label><input type="number" class="form-input" id="mSesDur" min="0.5" step="0.5" value="' + (s.duration || 2) + '"></div>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">' + t("players") + ' (<span id="mSesCount">' + _sesEditPlayers.length + '</span>)</label><div class="chips" id="mSesPlayers">' + _sesEditChips() + '</div></div>';

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
      pricePerHour: courtPrice(court),
      players: _sesEditPlayers.slice()
    };
    if (!data.players.length) { showToast(t("fillAllFields")); return; }
    // Court cost follows the new court / duration if the bill was already entered
    if (s.calculated && canEditBill(s)) {
      var cc = courtCostFor(court, data.time, duration);
      data.courtCost = cc.cost;
      data.courtParts = _partsUseful(cc.parts, data.pricePerHour) ? cc.parts : null;
      var gross = data.courtCost + (s.shuttleTotal || 0) + (s.otherTotal || 0) + (s.dinner ? s.dinner.totalBill || 0 : 0);
      var disc = discountOf(s.discount, gross);
      data.discountAmount = disc;
      if (!disc && s.discount) data.discount = null;
      data.grandTotal = computeLedger(Object.assign({}, s, data)).totals.grand;   // one number everywhere
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
  var c = error && error.code;
  if (c === "permission-denied") return t("noPermission");
  if (c === "unavailable" || c === "deadline-exceeded" || (typeof navigator !== "undefined" && navigator.onLine === false)) return t("errOffline");
  if (c === "resource-exhausted") return t("errQuota");
  if (c === "not-found") return t("errGone");
  if (c === "unauthenticated") return t("errSignIn");
  return t("errGeneric");
}

/** Start a session directly (without a poll), with me as the first player */
var newSes = null;

/** "+ New session": opens the form page — nothing is saved until "Create session" */
function createAdHocSession() {
  var court = DB_CACHE.courts[0];
  newSes = { date: _todayIso(), time: "18:00", duration: 2, courtId: court ? court.id : null, players: [], mode: "competition", gameType: "md", step: 1, repeat: "none", repeatN: 4 };
  showPage("session-create");
  renderSessionCreateForm();
}

function renderSessionCreateForm() {
  var container = document.getElementById("sessionCreateContent");
  if (!container || !newSes) return;
  setBreadcrumb([{ label: t("navGames"), action: "showPage('games')" }, { label: t("newSession") }]);

  var courts = DB_CACHE.courts;
  if (!courts.length) {
    container.innerHTML = '<div class="card"><div class="card-title">' + t("newSession") + '</div>' +
      '<div class="empty-state" style="padding:20px"><div>' + t("noCourtsYet") + '</div>' +
      '<button class="btn-secondary" style="margin-top:12px" onclick="settingsTab=\'courts\';showPage(\'config\')">' + t("configuration") + ' → ' + t("tabCourts") + '</button></div></div>';
    return;
  }
  if (!newSes.courtId || !dbFindById(courts, newSes.courtId)) newSes.courtId = courts[0].id;

  var step = newSes.step === 2 ? 2 : 1;
  var html = wizBarHtml(step - 1, [t("wzWhenWhere"), t("wzWhoPlays")]);
  if (step === 1) {
    html += '<div class="card"><div class="card-title">' + icon("calendar", 14) + ' ' + t("plan") + '</div>';
    html += dayStripHtml(newSes.date, "sesPickDay");
    html += '<div class="form-row" style="margin-top:12px">';
    html += '<div class="form-group"><label class="form-label">' + t("date") + '</label>';
    html += '<input type="date" class="form-input" value="' + newSes.date + '" onchange="newSes.date=this.value;renderSessionCreateForm()"></div>';
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
    if (typeof GROUPS_ON !== "undefined" && GROUPS_ON) html += playModeFieldsHtml(newSes, "newSes", "renderSessionCreateForm");
    html += '<button class="btn-primary" onclick="sesStep(2)">' + t("wzNext") + ' ' + icon("chevron", 16) + '</button>';
    container.innerHTML = html;
    return;
  }

  // Step 2: who plays (photo + name; tap to pick)
  var court = findCourt(newSes.courtId);
  html += '<div class="card wiz-summary">' + iconStatHtml("calendar", fmtDate(newSes.date)) + iconStatHtml("clock", escapeHtml(newSes.time)) + iconStatHtml("pin", escapeHtml(court ? court.name : "")) + '</div>';
  html += '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (<span id="newSesCount">' + newSes.players.length + '</span>)</div>';
  html += '<div class="chips" id="newSesPlayers">' + _newSesChips() + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted)">' + t("newSessionHint") + '</div></div>';
  html += repeatFieldHtml("newSes", newSes, "renderSessionCreateForm");
  html += '<div class="wiz-actions"><button class="btn-secondary" onclick="sesStep(1)">' + icon("back", 16) + ' ' + t("wzBack") + '</button>' +
    '<button class="btn-primary" id="newSesSubmit" onclick="submitNewSession()">' + t("createSession") + '</button></div>';
  container.innerHTML = html;
}

function sesStep(n) { if (newSes) { newSes.step = n; renderSessionCreateForm(); window.scrollTo(0, 0); } }
function sesPickDay(d) { if (newSes) { newSes.date = d; renderSessionCreateForm(); } }

function sesPickCourt(id) {
  if (newSes) newSes.courtId = id;
  setTimeout(renderSessionCreateForm, 300); // let the court list refresh first
}

function _newSesChips() {
  return DB_CACHE.users.map(function (u) {
    var on = newSes.players.indexOf(u.id) >= 0;
    return '<div class="chip avatar-chip' + (on ? ' active' : '') + '" onclick="newSesToggle(\'' + jsq(u.id) + '\')">' + avatarHtml(u.id, 22) + (on ? icon("check", 12) + ' ' : '') + getUserName(u.id) + '</div>';
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
  var weeks = newSes.repeat === "weekly" ? Math.max(2, Math.min(12, newSes.repeatN || 2)) : 1;
  var series = weeks > 1 ? "s" + Date.now().toString(36) : null;
  var jobs = [];
  for (var k = 0; k < weeks; k++) {
    var one = {
      pollId: null,
      date: _addDays(newSes.date, 7 * k),
      time: newSes.time,
      duration: newSes.duration,
      courtId: court.id,
      courtName: court.name,
      courtLocation: court.location || null,
      pricePerHour: courtPrice(court),
      status: "active",
      players: newSes.players.slice(),
      mode: newSes.mode || "competition",
      gameType: newSes.gameType || "md",
      calculated: false,
      createdBy: currentUser ? currentUser.uid : null
    };
    if (series) one.seriesId = series;
    jobs.push(dbCreateSession(one));
  }
  Promise.all(jobs).then(function (refs) {
    newSes = null;
    showToast(t("sessionCreated") + (weeks > 1 ? " \u00D7" + weeks : "") + " \u2714");
    if (weeks > 1) showPage("games"); else showSessionDetail(refs[0].id);
  }).catch(function (error) {
    if (btn) btn.disabled = false;
    showToast(_permError(error));
  });
}

/* ──────────────────────────────────────────────────────────
   Session Detail
   ────────────────────────────────────────────────────────── */

/** Tabs inside a session: "bill" (costs, who pays) or "games" (scores) */
var sessionTab = "bill";

function showSessionDetail(sessionId, tab) {
  if (_sessionDocUnsub) { _sessionDocUnsub(); _sessionDocUnsub = null; }
  sessionTab = tab === "games" ? "games" : "bill";
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
    if (sessionTab === "games" && _hasGamesTab()) { if (document.getElementById("sgList")) refreshSessionGames(); else renderSessionGamesTab(); }
    else if (!sessionEditing) renderSessionDetail();
  }, function (e) { dbOnError(e, "sessions"); });
}

function refreshSessionDetail() {
  if (currentSession && !sessionEditing) renderSessionDetail();
}

function renderSessionDetail() {
  var container = document.getElementById("sessionDetailContent");
  if (!container || !currentSession) return;
  var s = currentSession;
  // The session can arrive after the user has moved on — leave other pages alone
  if (currentPage === "session-detail") setBreadcrumb([{ label: t("navGames"), action: "showPage('games')" }, { label: fmtDate(s.date) }]);
  if (sessionTab === "games" && _hasGamesTab()) { renderSessionGamesTab(); return; }

  if (!s.calculated && !sessionEditing) {
    if (canEditBill(s) || canEditSessionDetails(s)) {
      // Edit the plan first; the bill editor opens only from its own button
      container.innerHTML = _renderSessionHeader(s) + _sessionTabsHtml(s) + (typeof dinnerPollHtml === "function" ? dinnerPollHtml(s) : "") + _renderPendingSession(s) + _sessionActionBar(s);
      return;
    }
    container.innerHTML = _renderSessionHeader(s) + _sessionTabsHtml(s) + (typeof dinnerPollHtml === "function" ? dinnerPollHtml(s) : "") + _renderWaitingForBill(s) + _sessionActionBar(s);
    return;
  }

  var html = _renderSessionHeader(s) + _sessionTabsHtml(s) + (typeof dinnerPollHtml === "function" ? dinnerPollHtml(s) : "");
  html += _renderSplitResult(s) + _sessionActionBar(s);
  container.innerHTML = html;
  _fillQrSlots(container);
}

/** Milliseconds from a Firestore Timestamp, {seconds}, or a number */
function _tsMs(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds) return v.seconds * 1000;
  if (v.__ts) return v.__ts;
  return 0;
}

/* ---------- Where the session is: open / share the pinned court ---------- */
function _sessionLocationHtml(court) {
  if (!court) return "";
  if (hasPin(court)) {
    return '<span class="loc-mini">' +
      '<a class="loc-ic" href="' + mapsDirUrl(court.lat, court.lng) + '" target="_blank" rel="noopener" title="' + t("openLocation") + '" aria-label="' + t("openLocation") + '">' + icon("route", 18) + '</a>' +
      '<button class="loc-ic" onclick="shareLocation(\'' + jsq(court.id) + '\')" title="' + t("shareLocation") + '" aria-label="' + t("shareLocation") + '">' + icon("share", 18) + '</button></span>';
  }
  if (typeof can === "function" && (can("editConfig") || (typeof isGroupAdminMe === "function" && isGroupAdminMe())))
    return '<span class="loc-mini"><button class="loc-ic" onclick="pinSessionCourt(\'' + jsq(court.id) + '\')" title="' + t("pinCourtLocation") + '" aria-label="' + t("pinCourtLocation") + '">' + icon("pin", 18) + '</button></span>';
  return '';
}

function shareLocation(courtId) {
  var c = findCourt(courtId);
  if (!c || !hasPin(c)) return;
  var url = mapsUrl(c.lat, c.lng), text = c.name + " \u2014 " + url;
  if (navigator.share) { navigator.share({ title: c.name, text: c.name, url: url }).catch(function () {}); return; }
  var done = function () { showToast(t("copied")); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { askCopy(t("shareLocation"), text); });
  else askCopy(t("shareLocation"), text);
}

/** No pin yet: open the court with its map ready, then come back here */
function pinSessionCourt(courtId) {
  showCourtModal(courtId, function () {
    if (sessionTab === "games" && typeof renderSessionGamesTab === "function") renderSessionGamesTab();
    else if (sessionEditing && edit) renderEditForm(); else renderSessionDetail();
  }, { openMap: true });
}

/* ---------- Session | Games tabs (groups only) ---------- */
function _hasGamesTab() { return typeof GROUPS_ON !== "undefined" && GROUPS_ON && typeof sessionGamesTabHtml === "function"; }

function _sessionTabsHtml(s) {
  if (!s) return "";
  // Where is this game? Plan · Play · Pay · Done (shown on every session)
  var trk = '<div class="card game-trk">' + trackerHtml(sessionStep(s)) + '</div>';
  if (!_hasGamesTab()) return trk;
  var n = sessionMatches(s.id).length;
  return trk + '<div class="session-tabs" role="tablist">' +
    '<button role="tab" class="session-tab' + (sessionTab !== "games" ? ' active' : '') + '" onclick="setSessionTab(\'bill\')">' + icon("bill", 15) + ' ' + t("sessionTabBill") + '</button>' +
    '<button role="tab" class="session-tab' + (sessionTab === "games" ? ' active' : '') + '" onclick="setSessionTab(\'games\')">' + icon("ranking", 15) + ' ' + t("sessionTabGames") +
      ' <span class="tab-count" id="sessionTabGamesN">' + n + '</span></button></div>';
}

/** One bar at the bottom with the next thing to do for this game */
function _sessionActionBar(s) {
  if (!s || typeof sessionStep !== "function" || sessionEditing) return "";
  var step = sessionStep(s), btns = "";
  if (step <= 1 && sessionTab !== "games" && _hasGamesTab() && typeof _canAddGames === "function" && _canAddGames(s)) {
    btns = '<button type="button" class="btn-secondary" onclick="showLiveScore(\'' + jsq(s.id) + '\')">' + icon("scoreboard", 16) + ' ' + t("lsTitle") + '</button>' +
      '<button type="button" class="btn-primary" onclick="quickAddGame()">' + icon("add", 16) + ' ' + t("addGameScore") + '</button>';
  } else if (step === 2 && typeof myOweOn === "function" && myOweOn(s) > 0) {
    btns = '<button type="button" class="btn-primary" onclick="showMyPayments()">' + icon("wallet", 16) + ' ' + t("homePay") + ' ' + fmtShort(myOweOn(s)) + '</button>';
  }
  return btns ? '<div class="action-spacer"></div><div class="session-actionbar"><div>' + btns + '</div></div>' : "";
}

function setSessionTab(tab) {
  if (sessionTab === tab) return;
  sessionTab = tab;
  if (tab === "games") { renderSessionGamesTab(); return; }
  // Back to the bill: keep what was being typed there
  if (sessionEditing && edit) renderEditForm(); else renderSessionDetail();
}

function renderSessionGamesTab() {
  var container = document.getElementById("sessionDetailContent");
  if (!container || !currentSession) return;
  if (currentPage === "session-detail") setBreadcrumb([{ label: t("navGames"), action: "showPage('games')" }, { label: fmtDate(currentSession.date) }, { label: t("sessionTabGames") }]);
  container.innerHTML = _renderSessionHeader(currentSession) + _sessionTabsHtml(currentSession) + sessionGamesTabHtml(currentSession);
}

/** Organiser view before the bill: the players, "Edit session" and "Enter bill" */
function _renderPendingSession(s) {
  var html = '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (' + (s.players || []).length + ')</div><div class="chips">';
  (s.players || []).forEach(function (u) { html += '<div class="chip avatar-chip" role="button" onclick="showUserProfile(\'' + jsq(u) + '\',event)">' + avatarHtml(u, 22) + getUserName(u) + '</div>'; });
  html += '</div></div><div class="session-actions" style="margin:12px 0">';
  if (canEditSessionDetails(s)) html += '<button class="btn-secondary" onclick="showSessionDetailsModal(\'' + jsq(s.id) + '\')">' + icon("pen", 16) + ' ' + t("editSession") + '</button>';
  if (canEditBill(s)) html += '<button class="btn-primary" onclick="startEditSession()">' + icon("bill", 16) + ' ' + t("enterBill") + '</button>';
  return html + '</div>';
}

/** Read-only view for players while the organiser hasn't entered the bill */
function _renderWaitingForBill(s) {
  var html = '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (' + (s.players || []).length + ')</div><div class="chips">';
  (s.players || []).forEach(function (u) { html += '<div class="chip avatar-chip" role="button" onclick="showUserProfile(\'' + jsq(u) + '\',event)">' + avatarHtml(u, 22) + getUserName(u) + '</div>'; });
  html += '</div></div>';
  html += '<div class="empty-state"><div class="empty-icon">' + icon("bill", 44) + '</div><div>' + t("waitingForBill") + '</div></div>';
  return html;
}

function _renderSessionHeader(s) {
  var html = '<div style="text-align:center;margin-bottom:16px">';
  html += '<div style="font-size:16px;font-weight:700">' + fmtDate(s.date) + '</div>';
  var court = s.courtId ? findCourt(s.courtId) : null;
  html += '<div class="sess-where"><div style="font-size:13px;color:var(--text-secondary)">' + escapeHtml(s.time || "") + (s.duration ? ' • ' + fmtHours(s.duration) : '') +
    ' • ' + escapeHtml(s.courtName || "") + (s.courtLocation ? ' (' + escapeHtml(s.courtLocation) + ')' : '') + '</div>' + _sessionLocationHtml(court) + '</div>';
  // Who made this session, and when
  var src = s.createdBy ? s : (currentSession || {});
  var made = _tsMs(src.createdAt);
  if (src.createdBy || made) html += '<div class="session-made">' + t("createdByAt").replace("{name}", escapeHtml(src.createdBy ? getUserName(src.createdBy) : "?"))
    .replace("{when}", made && typeof _whenShort === "function" ? _whenShort(made) : "") + '</div>';
  if (s.courtNos && s.courtNos.length) html += '<div class="court-nos-line">' + icon("court", 13) + ' ' + t(s.courtNos.length > 1 ? "courtsWord" : "courtWord") + ' ' + s.courtNos.map(escapeHtml).join(", ") + '</div>';
  html += '</div>';
  return html;
}

/* ---------- Result view (after costs are saved) ---------- */
/** Rounding left over: who ends up with less (negative) or more (positive) than paid - share, because every payment is rounded to ROUND_TO */
function ledgerRounding(s, L) {
  var implied = {}, out = [];
  L.transfers.forEach(function (tr) { implied[tr.from] = (implied[tr.from] || 0) - tr.amount; implied[tr.to] = (implied[tr.to] || 0) + tr.amount; });
  var uids = {}; Object.keys(L.paid).forEach(function (u) { uids[u] = 1; }); Object.keys(L.shares).forEach(function (u) { uids[u] = 1; });
  Object.keys(uids).forEach(function (u) {
    var ideal = (L.paid[u] || 0) - ((L.shares[u] || {}).total || 0), d = Math.round((implied[u] || 0) - ideal);
    if (Math.abs(d) >= 1) out.push({ uid: u, diff: d });
  });
  return out.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
}

/** The total of a settled bill, always from the ledger (the stored grandTotal can be stale) */
function _grandOf(s) { return computeLedger(s).totals.grand; }

function _renderSplitResult(s) {
  var L = computeLedger(s);
  var settled = s.settled || {};
  var players = s.players || [];
  var html = "";

  // What matters first: my part, who I pay, the button
  html += _yourPartHtml(s, L);
  html += '<div class="split-header compact">';
  html += '<div class="split-label">' + t("totalSession") + '</div>';
  html += '<div class="split-amount" title="' + fmtLAK(L.totals.grand) + '">' + fmtShort(L.totals.grand) + '</div>';
  html += '</div>';
  var editor = canEditBill(s) || canEditSessionDetails(s);
  var calc = "";
  var howCalc = '<details class="how-calc"' + (editor ? ' open' : '') + '><summary>' + icon("calc", 14) + ' ' + t("howCalc") + '</summary>';

  // Cost breakdown
  calc += '<div class="cost-breakdown">';
  var nCocks = sessionCocks(s);
  calc += _costCard(icon("court", 22), t("court"), L.totals.court, s.courtPayer, s.duration ? fmtHours(s.duration) : '');
  calc += _costCard(icon("shuttle", 22), t("shuttlecocks"), L.totals.shuttle, s.shuttlePayer, nCocks ? nCocks + ' ' + t("cocks") : '');
  calc += _costCard(icon("other", 22), t("otherCosts"), L.totals.other, null);
  calc += _costCard(icon("dinner", 22), t("dinnerBill"), L.totals.dinner, s.dinner ? s.dinner.paidBy : null);
  calc += '</div>';
  if (L.totals.discount > 0) {
    calc += '<div class="item-row" style="margin:4px 0 8px"><div class="item-name">' + icon("percent", 16) + ' ' + t("discount") + (s.discount && s.discount.type === "percent" ? ' ' + s.discount.value + '%' : '') +
      ' <span class="form-hint">(' + fmtLAK(L.totals.gross) + ' \u2192 ' + fmtLAK(L.totals.grand) + ')</span></div><div class="item-price" style="color:var(--green,#16a34a)">\u2212' + fmtLAK(L.totals.discount) + '</div></div>';
  }

  // 1) Pay by type: one card per cost, with the payer's QR and each player's part
  html += '<div class="section-title">' + icon("card", 14) + ' ' + t("payByType") + '</div>';
  var n = players.length;
  if (L.totals.court > 0) {
    html += _payTypeCard(s, icon("court", 18), t("court"),
      escapeHtml(s.courtName || "") + ' — ' + (s.courtParts && s.courtParts.length ? courtPartsText(s.courtParts) : fmtHours(s.duration || 0) + ' × ' + fmtLAK(s.pricePerHour)),
      L.totals.court, s.courtPayer, "court", _even(players, L.totals.court), _receiptThumbHtml(s.courtReceipt));
  }
  if (L.totals.shuttle > 0) {
    var cocksDesc = (s.shuttlecocks || []).map(function (c) {
      return escapeHtml(c.qty) + ' ' + escapeHtml(c.brand) + ' (' + fmtLAK(c.price) + '/' + escapeHtml(c.cocksPerTube) + ')';
    }).join(', ');
    html += _payTypeCard(s, icon("shuttle", 18), t("shuttlecocks"), cocksDesc, L.totals.shuttle, s.shuttlePayer, "shuttle", _even(players, L.totals.shuttle), _receiptThumbHtml(s.shuttleReceipt));
  }
  (s.otherCosts || []).forEach(function (oc) {
    if (!(oc.amount > 0)) return;
    var parts = oc.forUid ? (function () { var o = {}; o[oc.forUid] = oc.amount; return o; })() : _even(players, oc.amount);
    html += _payTypeCard(s, icon("other", 18), escapeHtml(oc.desc),
      oc.forUid ? t("for") + ' ' + getUserName(oc.forUid) : t("everyone") + ' (÷' + n + ')',
      oc.amount, oc.paidBy, "dinner", parts, _receiptThumbHtml(oc.receipt));
  });
  if (L.totals.dinner > 0) {
    var receipt = s.dinner.receiptUrl
      ? '<img ' + imgSrcAttrs(s.dinner.receiptUrl) + ' alt="' + t("receipt") + '" class="receipt-thumb" onclick="openImage(this.src)">' +
        '<div style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:4px">' + t("tapToEnlarge") + '</div>'
      : '';
    html += _payTypeCard(s, icon("dinner", 18), t("dinnerBill"), '÷' + s.dinner.diners.length + ' ' + t("diners"),
      L.totals.dinner, s.dinner.paidBy, "dinner", _even(s.dinner.diners, L.totals.dinner),
      (typeof dinnerRestaurantViewHtml === "function" ? dinnerRestaurantViewHtml(s) : '') + receipt);
  }

  // The maths, folded for players (open for organisers)
  // 2) Settlement after deduction: one row per pair of people
  calc += '<div class="card"><div class="card-title">' + icon("calc", 14) + ' ' + t("settlement") + '</div>';
  if (L.transfers.length === 0) {
    calc += '<div style="font-size:13px;color:var(--text-muted)">' + t("nothingToPay") + '</div>';
  } else {
    calc += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">' + t("settlementHint") + '</div>';
    for (var ti = 0; ti < L.transfers.length; ti++) {
      var tr = L.transfers[ti];
      var gross = (tr.items || []).reduce(function (a, x) { return a + x.amount; }, 0);
      var minus = (tr.minus || []).reduce(function (a, x) { return a + x.amount; }, 0);
      var isDone = !!settled[tr.key];
      var canMark = _canMarkTransfer(s, tr);
      calc += '<div class="settle-block' + (isDone ? ' done' : '') + '">';
      calc += '<div class="settle-head"><div class="settle-who">' + personHtml(tr.from, 28) + '<span class="settle-arrow">' + icon("chevron", 16) + '</span>' + personHtml(tr.to, 28) + '</div><div>';
      if (isDone) {
        calc += canMark ? '<button class="edit-btn paid-btn" onclick="setTransferSettled(\'' + jsq(s.id) + '\',\'' + tr.key + '\',false)">' + icon("check", 14) + ' ' + t("paid") + '</button>'
                        : '<span class="person-status status-payer">' + t("paid") + '</span>';
      } else if (canMark) {
        calc += '<button class="edit-btn" onclick="setTransferSettled(\'' + jsq(s.id) + '\',\'' + tr.key + '\',true)">' + t("markPaid") + '</button>';
      } else {
        calc += '<span class="person-status status-owes">' + t("unpaid") + '</span>';
      }
      calc += '</div></div>';
      calc += '<table class="settle-table"><thead><tr><th class="num">' + t("owes") + '</th><th class="num">− ' + t("deduct") + '</th><th class="num">= ' + t("toPay") + '</th></tr></thead><tbody><tr>' +
        '<td class="num">' + Math.round(gross).toLocaleString("en-US") + '</td>' +
        '<td class="num">' + (minus ? Math.round(minus).toLocaleString("en-US") : '—') + '</td>' +
        '<td class="num pay">' + fmtLAK(tr.amount) + '</td></tr></tbody></table>';
      calc += '<div class="person-breakdown">' + transferBreakdownHtml(tr) + '</div>';
      calc += '</div>';
    }
  }
  calc += '</div>';

  // Per person
  calc += '<div class="card"><div class="card-title">' + t("perPerson") + '</div>';
  var shareUids = Object.keys(L.shares).filter(function (u) { return L.shares[u].total > 0 || L.paid[u] > 0; });
  for (var pi = 0; pi < shareUids.length; pi++) {
    var uid = shareUids[pi];
    var ps = L.shares[uid];
    var parts = [];
    if (ps.court) parts.push(icon('court', 12) + fmtLAK(ps.court));
    if (ps.shuttle) parts.push(icon('shuttle', 12) + fmtLAK(ps.shuttle));
    if (ps.other) parts.push(icon('other', 12) + fmtLAK(ps.other));
    if (ps.dinner) parts.push(icon('dinner', 12) + fmtLAK(ps.dinner));
    var paidStr = L.paid[uid] > 0 ? '<div style="font-size:12px;color:var(--accent)">' + t("paidOut") + ' ' + fmtLAK(L.paid[uid]) + '</div>' : '';
    var notPlaying = players.indexOf(uid) < 0 ? ' <span style="font-size:12px;color:var(--text-muted)">(' + t("notPlaying") + ')</span>' : '';

    calc += '<div class="person-row"><div class="person-left">';
    calc += avatarHtml(uid, 36);
    calc += '<div style="min-width:0"><div style="font-size:14px">' + getUserName(uid) + notPlaying + '</div>' + paidStr +
      '<div class="person-breakdown">' + parts.join(' + ') + '</div></div></div>';
    calc += '<div class="person-right"><div class="person-amount">' + fmtLAK(ps.total) + '</div></div></div>';
  }
  calc += '</div>';

  // Rounding: say who gets a little less / more, so nobody is surprised
  var rnd = ledgerRounding(s, L).filter(function (x) { return Math.abs(x.diff) >= 1; });
  if (rnd.length) {
    calc += '<div class="form-hint rnd-note">' + icon("calc", 12) + ' ' + t("billRounded").replace("{n}", fmtLAK(ROUND_TO)) + ' ' +
      rnd.slice(0, 3).map(function (x) { return escapeHtml(plainUserName(findUser(x.uid))) + ' ' + (x.diff > 0 ? '+' : '\u2212') + fmtLAK(Math.abs(x.diff)); }).join(' \u00B7 ') + '</div>';
  }
  html += howCalc + calc + '</details>';

  // Messenger copy & preview
  html += '<button class="btn-share" onclick="copyMessengerFromPreview()">' + t("copyMessenger") + '</button>';
  html += '<details class="msg-prev"><summary>' + t("msgPreview") + '</summary><div class="messenger-preview" id="messengerPreview">' + escapeHtml(buildMessengerText(s)) + '</div></details>';

  if (canEditBill(s) || canEditSessionDetails(s)) {
    html += '<button class="btn-secondary" style="margin-bottom:8px" onclick="startEditSession()">' + icon("pen", 14) + ' ' + t("editCosts") + '</button>';
  }
  if (canDeleteSession(s)) {
    html += '<button class="btn-danger" onclick="deleteSessionById(\'' + jsq(s.id) + '\')">' + t("deleteSession") + '</button>';
  }
  return html;
}

/** The first thing a player sees on a settled bill: my part, who I pay, the button */
function _yourPartHtml(s, L) {
  if (!currentUser) return "";
  var me = currentUser.uid, my = L.shares[me], settled = s.settled || {};
  var out = L.transfers.filter(function (tr) { return tr.from === me; });
  var inn = L.transfers.filter(function (tr) { return tr.to === me; });
  if (!my && !out.length && !inn.length) return "";
  var h = '<div class="card yp"><div class="yp-label">' + t("yourPart") + '</div>';
  h += '<div class="yp-amount" title="' + fmtLAK(my ? my.total : 0) + '">' + fmtLAK(my ? my.total : 0) + '</div>';
  if (my) {
    var parts = [];
    if (my.court) parts.push(icon("court", 13) + ' ' + fmtShort(my.court));
    if (my.shuttle) parts.push(icon("shuttle", 13) + ' ' + fmtShort(my.shuttle));
    if (my.other) parts.push(icon("other", 13) + ' ' + fmtShort(my.other));
    if (my.dinner) parts.push(icon("dinner", 13) + ' ' + fmtShort(my.dinner));
    if (parts.length > 1) h += '<div class="yp-break">' + parts.join(' <i>+</i> ') + '</div>';
  }
  var row = function (tr, mine) {
    var done = !!settled[tr.key], who = mine ? tr.to : tr.from, canMark = _canMarkTransfer(s, tr);
    var label = (mine ? t("payToName") : t("owesYou")).replace("{name}", '<b>' + escapeHtml(getUserName(who)) + '</b>');
    var act = done ? '<span class="yp-done">' + icon("check", 14) + ' ' + t("paid") + '</span>'
      : canMark ? '<button class="yp-btn" onclick="setTransferSettled(\'' + jsq(s.id) + '\',\'' + tr.key + '\',true)">' + t(mine ? "markPaid" : "payItemReceived") + '</button>'
      : '<span class="yp-wait">' + t("unpaid") + '</span>';
    return '<div class="yp-row' + (done ? ' done' : '') + '">' + avatarHtml(who, 30) + '<span class="yp-who"><span>' + label + '</span><small>' + fmtLAK(tr.amount) + '</small></span>' + act + '</div>';
  };
  h += out.map(function (tr) { return row(tr, true); }).join("") + inn.map(function (tr) { return row(tr, false); }).join("");
  if (!out.length && !inn.length) h += '<div class="yp-ok">' + icon("check", 16) + ' ' + t("nothingOwed") + '</div>';
  else if (out.length && out.every(function (tr) { return settled[tr.key]; }) && !inn.length) h += '<div class="yp-ok">' + icon("check", 16) + ' ' + t("allSettledYou") + '</div>';
  return h + '</div>';
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
        ? '<img src="' + escapeHtml(safeUrl(url)) + '" alt="QR" onclick="openImage(this.src)">'
        : '<div class="qr-missing">' + t("noQr") + '</div>';
    });
  });
}

/** Full-screen image (receipt, QR). Pinch to zoom works natively; tap to close. */
function openImage(src) {
  var viewer = document.createElement("div");
  viewer.className = "image-viewer";
  var shown = safeUrl(src);
  if (!shown || shown.indexOf("img:") === 0) return;     // only real images (data URL or http) open here
  viewer.innerHTML = '<img src="' + escapeHtml(shown) + '" alt=""><button class="image-viewer-close" aria-label="' + t("close") + '">' + icon("close", 26) + '</button>';
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
    // An old session may point at the directory court: use the group's own copy
    courtId: (court && court.id) || s.courtId || (DB_CACHE.courts[0] ? DB_CACHE.courts[0].id : ""),
    courtNos: (s.courtNos || []).slice(),
    pricePerHour: court ? courtPrice(court) : (s.pricePerHour || 0),
    discount: s.discount ? { type: s.discount.type, value: s.discount.value } : { type: "none", value: 0 },
    players: (s.players || []).slice(),
    courtPayer: s.courtPayer || _defaultPayer("defaultCourtPayer", s.players),
    shuttlecocks: (s.shuttlecocks || []).map(function (x) {
      return { brand: x.brand, qty: x.qty || 0, price: x.price || 0, cocksPerTube: x.cocksPerTube || 12 };
    }),
    shuttlePayer: s.shuttlePayer || _defaultPayer("defaultShuttlePayer", s.players),
    otherCosts: (s.otherCosts || []).map(function (x) {
      return { desc: x.desc, amount: x.amount, paidBy: x.paidBy, forUid: x.forUid || null, receipt: x.receipt || null };
    }),
    courtReceipt: s.courtReceipt || null,
    shuttleReceipt: s.shuttleReceipt || null,
    dinner: s.dinner ? {
      totalBill: s.dinner.totalBill || 0,
      paidBy: s.dinner.paidBy || "",
      diners: (s.dinner.diners || []).slice(),
      receiptUrl: s.dinner.receiptUrl || null,
      restaurantId: s.dinner.restaurantId || "",
      restaurantName: s.dinner.restaurantName || ""
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
    { label: t("navGames"), action: "showPage('games')" },
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
  // Which courts were booked (Court 3, 4 / Court A, B)
  var nums = courtNumbers(findCourt(edit.courtId));
  if (nums.length) {
    html += '<div class="form-group"><label class="form-label">' + t("bookedCourts") + '</label><div class="chips court-nos">' + nums.map(function (n) {
      return '<div class="chip' + (edit.courtNos.indexOf(n) >= 0 ? ' active' : '') + '" onclick="editToggleCourtNo(\'' + n + '\')">' + n + '</div>';
    }).join('') + '</div></div>';
  }
  html += '<div class="cost-display" id="courtCostDisplay"></div>';
  html += '</fieldset>' + lockBill;
  html += '<div class="form-group" style="margin-top:8px"><label class="form-label">' + icon("card", 12) + ' ' + t("courtPayer") + '</label>';
  html += '<select class="form-select" data-cs-type="player" data-cs-onpick="editPickCourtPayer" onchange="edit.courtPayer=this.value">' + _payerOptions(edit.courtPayer, edit.players) + '</select></div>';
  html += _receiptFieldHtml("court", -1, edit.courtReceipt);
  html += '</fieldset>' + lockDetails;
  html += '</div>';

  // Players
  var pickable = _pickableUids();
  html += '</fieldset>' + lockDetails;
  html += '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("players") + ' (' + edit.players.length + ')</div>';
  html += '<div class="chips">';
  for (var ui = 0; ui < pickable.length; ui++) {
    var on = edit.players.indexOf(pickable[ui]) >= 0;
    html += '<div class="chip avatar-chip' + (on ? ' active' : '') + '" onclick="editTogglePlayer(\'' + jsq(pickable[ui]) + '\')">' + avatarHtml(pickable[ui], 22) + (on ? icon("check", 12) + ' ' : '') + getUserName(pickable[ui]) + '</div>';
  }
  html += '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted)">' + t("payerHint") + '</div>';
  html += '</div>';

  html += '</fieldset>' + lockBill;

  // Shuttlecocks
  html += '<div class="card"><div class="card-title">' + icon("shuttle", 14) + ' ' + t("shuttlecocks") + ' <span style="font-size:12px;color:var(--text-muted);text-transform:none;letter-spacing:0">' + t("splitEqually") + '</span></div>';
  for (var si = 0; si < edit.shuttlecocks.length; si++) {
    var sc = edit.shuttlecocks[si];
    html += '<div class="item-row">';
    html += '<div class="item-name">' + escapeHtml(sc.brand) + '<div style="font-size:12px;color:var(--text-muted)">' + fmtLAK(sc.price) + ' / ' + escapeHtml(sc.cocksPerTube) + ' ' + t("cocks") + '</div></div>';
    html += '<div class="qty-controls"><button onclick="editShuttleQty(' + si + ',-1)">−</button>';
    html += '<input type="number" class="qty-num" min="0" value="' + escapeHtml(sc.qty) + '" style="width:44px;background:transparent;border:none;color:var(--text);text-align:center" oninput="edit.shuttlecocks[' + si + '].qty=Math.max(0,parseInt(this.value)||0);_updateEditTotals()">';
    html += '<button onclick="editShuttleQty(' + si + ',1)">+</button></div>';
    html += '<div class="item-price" id="scRowTotal' + si + '"></div>';
    html += '<button class="remove-btn" onclick="edit.shuttlecocks.splice(' + si + ',1);renderEditForm()">' + icon("close", 16) + '</button>';
    html += '</div>';
  }
  html += '<button class="add-btn-dashed" onclick="showAddShuttlecock()">+ ' + t("addBrand") + '</button>';
  html += '<div class="form-group" style="margin-top:10px"><label class="form-label">' + icon("card", 12) + ' ' + t("shuttlePayer") + '</label>';
  html += '<select class="form-select" data-cs-type="player" data-cs-onpick="editPickShuttlePayer" onchange="edit.shuttlePayer=this.value">' + _payerOptions(edit.shuttlePayer, edit.players) + '</select></div>';
  html += _receiptFieldHtml("shuttle", -1, edit.shuttleReceipt);
  html += '<div class="subtotal-row"><span>' + t("shuttleTotal") + '</span><span id="shuttleTotal"></span></div>';
  html += '</div>';

  // Other costs
  html += '<div class="card"><div class="card-title">' + icon("other", 14) + ' ' + t("otherCosts") + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">' + t("otherCostHint") + '</div>';
  for (var oi = 0; oi < edit.otherCosts.length; oi++) {
    var oc = edit.otherCosts[oi];
    html += '<div class="item-row"><div class="item-name">' + escapeHtml(oc.desc) +
      '<div style="font-size:12px;color:var(--text-muted)">' + icon("card", 12) + ' ' + getUserName(oc.paidBy) + ' • ' + (oc.forUid ? t("for") + ' ' + getUserName(oc.forUid) : t("everyone")) + '</div></div>' +
      '<div class="item-price">' + fmtLAK(oc.amount) + '</div>' +
      '<button class="remove-btn" onclick="edit.otherCosts.splice(' + oi + ',1);renderEditForm()">' + icon("close", 16) + '</button></div>' +
      _receiptFieldHtml("other", oi, oc.receipt, true);
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
    if (typeof dinnerRestaurantFieldHtml === "function") html += dinnerRestaurantFieldHtml(d);
    html += '<label class="form-label">' + t("selectDiners") + '</label><div class="chips">';
    for (var di = 0; di < pickable.length; di++) {
      var dOn = d.diners.indexOf(pickable[di]) >= 0;
      html += '<div class="chip' + (dOn ? ' active' : '') + '" onclick="editToggleDiner(\'' + jsq(pickable[di]) + '\')">' + (dOn ? icon("check", 12) + ' ' : '') + getUserName(pickable[di]) + '</div>';
    }
    html += '</div>';
    html += '<div class="form-group"><label class="form-label">' + t("uploadReceipt") + '</label>';
    if (d.receiptUrl) html += '<img ' + imgSrcAttrs(d.receiptUrl) + ' class="receipt-thumb" style="margin-bottom:6px" onclick="openImage(this.src)">';
    html += '<input type="file" class="form-input" accept="image/*" style="padding:8px;font-size:13px" onchange="editReceiptChosen(this)"></div>';
    html += '<button class="btn-danger" style="padding:8px;font-size:12px" onclick="edit.dinner=null;renderEditForm()">' + t("removeDinner") + '</button>';
  }
  html += '</div>';

  // Discount on the whole bill (optional)
  var dt = (edit.discount && edit.discount.type) || "none";
  html += '<div class="card"><div class="card-title">' + icon("percent", 14) + ' ' + t("discount") + ' <span class="form-hint">(' + t("optional") + ')</span></div>';
  html += '<div class="seg" role="tablist">' + [["none", t("discountNone")], ["amount", curSymbol()], ["percent", "%"]].map(function (o) {
    return '<button type="button" role="tab" aria-selected="' + (dt === o[0]) + '" class="seg-btn' + (dt === o[0] ? ' active' : '') + '" onclick="editSetDiscType(\'' + o[0] + '\')">' + o[1] + '</button>';
  }).join('') + '</div>';
  if (dt === "amount") html += '<div class="form-group" style="margin-top:10px">' + moneyInput('', edit.discount.value, 'edit.discount.value=parseMoney(this.value);_updateEditTotals()') + '</div>';
  if (dt === "percent") html += '<div class="form-group" style="margin-top:10px"><input type="number" class="form-input" min="0" max="100" step="0.5" inputmode="decimal" value="' + (edit.discount.value || '') + '" placeholder="0" oninput="edit.discount.value=parseFloat(this.value)||0;_updateEditTotals()"></div>';
  if (dt !== "none") html += '<div class="form-hint" style="margin-top:6px">' + t("discountHint") + '</div>';
  html += '</div>';
  html += '</fieldset>';

  // Summary + save
  html += '<div class="card"><div class="card-title">' + t("total") + '</div><div id="editSummary"></div></div>';
  html += '<button class="btn-primary" onclick="saveSessionCosts()">' + t("calculateSplit") + '</button>';
  html += '<button class="btn-secondary" style="margin-top:8px" onclick="cancelEditSession()">' + t("cancel") + '</button>';
  if (currentSession && !currentSession.calculated && canDeleteSession(currentSession)) {
    html += '<button class="btn-danger" style="margin-top:8px" onclick="deleteSessionById(\'' + jsq(currentSession.id) + '\')">' + t("deleteSession") + '</button>';
  }

  container.innerHTML = _renderSessionHeader({
    date: edit.date, time: edit.time, duration: edit.duration, courtId: edit.courtId, courtNos: edit.courtNos,
    courtName: (dbFindById(courts, edit.courtId) || {}).name || (currentSession && currentSession.courtName),
    courtLocation: (dbFindById(courts, edit.courtId) || {}).location
  }) + _sessionTabsHtml(currentSession) + (typeof dinnerPollHtml === "function" ? dinnerPollHtml(currentSession) : "") + html;
  _updateEditTotals();
}

/** Build the session fields that the cost form produces */
function _editToSessionData() {
  var court = findCourt(edit.courtId);
  var pricePerHour = court ? courtPrice(court) : edit.pricePerHour;
  var cc = court ? courtCostFor(court, edit.time, edit.duration) : { cost: Math.round(pricePerHour * (edit.duration || 0)), parts: null };
  var courtCost = cc.cost;

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
    // Optional restaurant (only stored when chosen)
    if (edit.dinner.restaurantId) { dinner.restaurantId = edit.dinner.restaurantId; dinner.restaurantName = edit.dinner.restaurantName || ""; }
  }

  var dinnerAmt = dinner ? dinner.totalBill : 0;
  var gross = courtCost + shuttleTotal + otherTotal + dinnerAmt;
  var disc = edit.discount && edit.discount.type !== "none" ? discountOf(edit.discount, gross) : 0;

  var out = {
    date: edit.date,
    time: edit.time,
    duration: edit.duration,
    courtId: edit.courtId || null,
    courtNos: (edit.courtNos || []).slice(),
    courtName: court ? court.name : (currentSession ? currentSession.courtName : null),
    courtLocation: court ? (court.location || null) : (currentSession ? currentSession.courtLocation || null : null),
    pricePerHour: pricePerHour,
    players: edit.players.slice(),
    courtCost: courtCost,
    courtParts: _partsUseful(cc.parts, pricePerHour) ? cc.parts : null,
    courtPayer: edit.courtPayer || null,
    shuttlecocks: shuttlecocks,
    shuttleTotal: shuttleTotal,
    shuttlePayer: edit.shuttlePayer || null,
    courtReceipt: edit.courtReceipt || null,
    shuttleReceipt: edit.shuttleReceipt || null,
    otherCosts: edit.otherCosts.slice(),
    otherTotal: otherTotal,
    dinner: dinner,
    discount: disc > 0 ? { type: edit.discount.type, value: edit.discount.value } : null,
    discountAmount: disc,
    grandTotal: gross - disc
  };
  // The ledger is the one truth for the total (a dinner with nobody eating, a cost with no players... are not charged)
  out.grandTotal = computeLedger(Object.assign({ settled: {} }, out)).totals.grand;
  return out;
}

function _updateEditTotals() {
  if (!edit) return;
  var data = _editToSessionData();

  var courtEl = document.getElementById("courtCostDisplay");
  if (courtEl) courtEl.innerHTML = (data.courtParts ? courtPartsText(data.courtParts) : fmtHours(edit.duration || 0) + ' × ' + fmtLAK(data.pricePerHour)) + ' = <b style="color:var(--accent)">' + fmtLAK(data.courtCost) + '</b>';

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
      (data.discountAmount > 0 ? '<div class="item-row"><div class="item-name">' + icon("percent", 16) + ' ' + t("discount") + (data.discount.type === "percent" ? ' ' + data.discount.value + '%' : '') + '</div><div class="item-price" style="color:var(--green,#16a34a)">\u2212' + fmtLAK(data.discountAmount) + '</div></div>' : '') +
      '<div class="subtotal-row"><span>' + t("total") + '</span><span style="color:var(--accent)">' + fmtLAK(data.grandTotal) + '</span></div>' +
      (n ? '<div style="font-size:12px;color:var(--text-muted);text-align:right">' + t("courtAndCocksEach").replace("{n}", n) + ' ' + fmtLAK((data.grandTotal - (data.dinner ? data.dinner.totalBill : 0) - data.otherTotal) / n) + '</div>' : '');
  }
}

/** "+ Add new" player from a payer dropdown: add them to the game and pick them */
function _editAddAndPick(uid) {
  if (uid && edit.players.indexOf(uid) < 0) edit.players.push(uid);
}
function editPickCourtPayer(uid) { _editAddAndPick(uid); edit.courtPayer = uid; renderEditForm(); }
function editPickShuttlePayer(uid) { _editAddAndPick(uid); edit.shuttlePayer = uid; renderEditForm(); }
function editPickDinnerPayer(uid) { if (edit.dinner) edit.dinner.paidBy = uid; renderEditForm(); }

function editToggleCourtNo(n) {
  var l = edit.courtNos, i = l.indexOf(n);
  if (i >= 0) l.splice(i, 1); else l.push(n);
  var order = courtNumbers(findCourt(edit.courtId));
  l.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  renderEditForm();
}

function editSetDiscType(type) {
  if (!edit) return;
  edit.discount = { type: type, value: type === (edit.discount && edit.discount.type) ? edit.discount.value : 0 };
  renderEditForm();
}

function editSetCourt(courtId) {
  if (!edit) return;
  if (edit.courtId !== courtId) edit.courtNos = [];
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
  // Who said yes to "Dinner after?" (else everyone who played)
  var poll = (currentSession && currentSession.dinnerPoll) || {};
  var yes = Object.keys(poll).filter(function (u) { return poll[u] === true; });
  edit.dinner = { totalBill: 0, paidBy: "", diners: yes.length ? yes : edit.players.slice(), receiptUrl: null };
  renderEditForm();
}

/* Bill photos (evidence) for the court, the shuttlecocks and each other cost, like the dinner receipt */
var _ocPending = null;   // photo picked in the "add other cost" form
function _receiptFieldHtml(kind, idx, url, small) {
  var arg = "'" + kind + "'," + idx;
  var h = '<div class="rc-field' + (small ? ' small' : '') + '">';
  if (url) h += '<img ' + imgSrcAttrs(url) + ' class="receipt-thumb rc-thumb" alt="' + escapeHtml(t("receipt")) + '" onclick="openImage(this.src)">' +
    '<button type="button" class="rc-x" onclick="editDetachReceipt(' + arg + ')" aria-label="' + escapeHtml(t("removeReceipt")) + '">' + icon("close", 14) + '</button>';
  else h += '<label class="rc-add">' + icon("camera", 16) + ' <span>' + t("attachReceipt") + '</span><input type="file" accept="image/*" onchange="editAttachReceipt(' + arg + ',this)"></label>';
  return h + '</div>';
}
function editAttachReceipt(kind, idx, input) {
  var file = input.files && input.files[0];
  if (!file) return;
  showToast(t("loading"));
  readReceiptImage(file, function (err, dataUrl) {
    if (err) { showToast(err.message); return; }
    if (kind === "court") edit.courtReceipt = dataUrl;
    else if (kind === "shuttle") edit.shuttleReceipt = dataUrl;
    else if (edit.otherCosts[idx]) edit.otherCosts[idx].receipt = dataUrl;
    renderEditForm();
  });
}
function editDetachReceipt(kind, idx) {
  if (kind === "court") edit.courtReceipt = null;
  else if (kind === "shuttle") edit.shuttleReceipt = null;
  else if (edit.otherCosts[idx]) edit.otherCosts[idx].receipt = null;
  renderEditForm();
}
function _ocReceiptChosen(input) {
  var file = input.files && input.files[0], box = document.getElementById("ocRcPrev");
  if (!file) { _ocPending = null; if (box) box.innerHTML = ""; return; }
  readReceiptImage(file, function (err, dataUrl) {
    if (err) { showToast(err.message); input.value = ""; return; }
    _ocPending = dataUrl;
    if (box) box.innerHTML = '<img class="receipt-thumb" src="' + dataUrl + '" alt="">';
  });
}
/** Thumbnail of a stored bill photo, for the result view */
function _receiptThumbHtml(url) {
  return url ? '<div class="rc-view"><img ' + imgSrcAttrs(url) + ' alt="' + escapeHtml(t("receipt")) + '" class="receipt-thumb" onclick="openImage(this.src)"><div class="form-hint" style="margin:4px 0 0;text-align:center">' + icon("camera", 12) + ' ' + t("receipt") + ' \u00B7 ' + t("tapToEnlarge") + '</div></div>' : '';
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
    '<select class="form-select" id="modalFor">' + forOpts + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + icon("camera", 12) + ' ' + t("attachReceipt") + ' <span class="form-hint">(' + t("optional") + ')</span></label>' +
    '<div id="ocRcPrev"></div><input type="file" class="form-input" accept="image/*" style="padding:8px;font-size:13px" onchange="_ocReceiptChosen(this)"></div>';
  _ocPending = null;

  modalCallback = function () {
    var desc = document.getElementById("modalDesc").value.trim();
    var amount = parseMoney(document.getElementById("modalAmount").value);
    var paidBy = document.getElementById("modalPaidBy").value;
    var forUid = document.getElementById("modalFor").value || null;

    if (!desc || amount <= 0 || !paidBy) { showToast(t("fillAllFields")); return; }
    edit.otherCosts.push({ desc: desc, amount: amount, paidBy: paidBy, forUid: forUid, receipt: _ocPending || null });
    _ocPending = null;
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

  // Paid marks stay for payments whose amount did not change; the rest start again
  var keep = _keepPaidMarks(currentSession, data);
  data.settled = keep.settled;
  data.settledAt = keep.settledAt;
  data.status = computeLedger(data).transfers.filter(function (tr) { return !data.settled[tr.key]; }).length ? "active" : "completed";
  var doSave = function () {
    // A new receipt photo is stored on its own (images/), the session keeps a reference
    var jobs = [];
    var up = function (url, apply) {
      if (url && String(url).indexOf("data:") === 0) jobs.push(dbSaveImage(url, "receipt").then(apply));
    };
    if (data.dinner) up(data.dinner.receiptUrl, function (ref) { data.dinner.receiptUrl = ref; if (edit && edit.dinner) edit.dinner.receiptUrl = ref; });
    up(data.courtReceipt, function (ref) { data.courtReceipt = ref; if (edit) edit.courtReceipt = ref; });
    up(data.shuttleReceipt, function (ref) { data.shuttleReceipt = ref; if (edit) edit.shuttleReceipt = ref; });
    (data.otherCosts || []).forEach(function (oc) { up(oc.receipt, function (ref) { oc.receipt = ref; }); });
    var saveReceipt = Promise.all(jobs);

    var oldRefs = _imgRefsOf(currentSession), baseBill = currentSession ? currentSession.billAt || 0 : 0;
    // Someone else published this bill while I was editing: ask before replacing their version
    var guard = fsdb.collection("sessions").doc(currentSessionId).get().then(function (doc) {
      var live = doc.exists ? doc.data() : null;
      if (!live || (live.billAt || 0) === baseBill) return true;
      return new Promise(function (res) { askConfirm({ title: t("billChangedTitle"), body: t("billChangedBody"), yes: t("billReplace"), danger: true }, function () { res(true); }); });
    }).catch(function () { return true; });
    guard.then(function (go) { return go ? saveReceipt : Promise.reject({ code: "cancelled" }); })
      .then(function () { return dbUpdateSession(currentSessionId, data); })
      .then(function () {
        _dropOrphanImgs(oldRefs, _imgRefsOf(data));
        // Show the result straight away, even if the snapshot hasn't arrived yet
        if (currentSession) Object.assign(currentSession, data);
        sessionEditing = false;
        edit = null;
        showToast(t("calculateSplit") + " \u2714");
        renderSessionDetail();
      })
      .catch(function (error) { if (error && error.code === "cancelled") return; showToast(_permError(error)); });
  };
  var proceed = function () { _billPreview(data, doSave); };
  // Changing a paid amount starts that payment again: say so, with the in-app sheet (not the browser popup)
  if (keep.dropped > 0) askConfirm({ title: t("billDropMarks").replace("{n}", keep.dropped), yes: t("confirm") }, proceed);
  else proceed();
}

/** All photo references ("img:<id>") on one bill */
function _imgRefsOf(s) {
  var out = [];
  if (!s) return out;
  var add = function (v) { if (isImgRef(v)) out.push(v); };
  add(s.courtReceipt); add(s.shuttleReceipt); if (s.dinner) add(s.dinner.receiptUrl);
  (s.otherCosts || []).forEach(function (oc) { add(oc.receipt); });
  return out;
}

/** Photos the old bill had and the new one dropped are deleted (only mine; others stay) */
function _dropOrphanImgs(oldRefs, newRefs) {
  oldRefs.forEach(function (r) {
    if (newRefs.indexOf(r) >= 0) return;
    fsdb.collection("images").doc(jsq(r.slice(4))).delete().catch(function () {});
  });
}

/** Paid marks that are still true after an edit: same payment (from + to) and same amount */
function _keepPaidMarks(old, data) {
  var out = { settled: {}, settledAt: {}, dropped: 0 };
  if (!old || !old.calculated) return out;
  var oldAmt = {};
  computeLedger(old).transfers.forEach(function (tr) { oldAmt[tr.key] = tr.amount; });
  var now = {};
  computeLedger(data).transfers.forEach(function (tr) { now[tr.key] = tr.amount; });
  Object.keys(old.settled || {}).forEach(function (k) {
    if (!old.settled[k]) return;
    if (now[k] != null && oldAmt[k] === now[k]) { out.settled[k] = true; if ((old.settledAt || {})[k]) out.settledAt[k] = old.settledAt[k]; }
    else out.dropped++;
  });
  return out;
}

/** Last look before the bill goes out: who pays whom, one total */
function _billPreview(data, onOk) {
  var L = computeLedger(data), rows = "";
  L.transfers.forEach(function (tr) {
    rows += '<div class="bp-row"><span class="bp-who">' + personHtml(tr.from, 28) + '<span class="settle-arrow">' + icon("chevron", 16) + '</span>' + personHtml(tr.to, 28) + '</span><b>' + fmtLAK(tr.amount) + '</b></div>';
  });
  var html = '<div class="bp-total">' + icon("bill", 20) + '<span>' + fmtLAK(L.totals.grand) + '</span></div>' +
    (rows || '<div class="form-hint">' + t("billNoTransfers") + '</div>') +
    '<div class="form-hint" style="margin-top:10px">' + icon("calc", 12) + ' ' + t("billRounded").replace("{n}", fmtLAK(ROUND_TO)) + '</div>';
  document.getElementById("modalTitle").textContent = t("billPreviewTitle");
  document.getElementById("modalBody").innerHTML = html;
  var ok = document.getElementById("modalConfirmBtn"); if (ok) ok.textContent = t("publishBill");
  modalCallback = function () { closeModal(); onOk(); };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Payment Tracking
   ────────────────────────────────────────────────────────── */

function setTransferSettled(sessionId, key, value) {
  var s = currentSession && currentSession.id === sessionId ? currentSession : _findSession(sessionId);
  if (!s) return Promise.resolve();
  var run = function () {
    return settleTransfers(s, [key], value)
      .then(function () { showToast(value ? t("paid") + " \u2714" : t("unpaid")); })
      .catch(function (error) { showToast(_permError(error)); });
  };
  if (value) return run();
  return new Promise(function (res) { askConfirm({ title: t("confirmUnmark"), kind: "warn", yes: t("unpaid"), onNo: function () { res(); } }, function () { res(run()); }); });
}

function _findSession(id) {
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === id) return lastSessions[i];
  return null;
}

/** Mark several transfers of one session paid / unpaid; records when.
 *  Writes only the changed keys (settled.<key>), so two people marking at the
 *  same time do not overwrite each other. */
function settleTransfers(s, keys, value) {
  var settled = Object.assign({}, s.settled || {});
  var FV = firebase.firestore.FieldValue, upd = {};
  keys.forEach(function (key) {
    if (value) { settled[key] = true; upd["settled." + key] = true; upd["settledAt." + key] = Date.now(); }
    else { delete settled[key]; upd["settled." + key] = FV.delete(); upd["settledAt." + key] = FV.delete(); }
  });
  var remaining = computeLedger(s).transfers.filter(function (tr) { return !settled[tr.key]; });
  upd.status = remaining.length ? "active" : "completed";
  return dbUpdateSession(s.id, upd);
}

/* ──────────────────────────────────────────────────────────
   Delete Session
   ────────────────────────────────────────────────────────── */

function deleteSessionById(sessionId) {
  askYes(t("deleteConfirm"), function () {
    var s = (currentSession && currentSession.id === sessionId) ? currentSession : null;
    lastSessions.forEach(function (x) { if (x.id === sessionId) s = x; });
    if (_sessionDocUnsub) { _sessionDocUnsub(); _sessionDocUnsub = null; }
    sessionEditing = false;

    // To the trash (30 days) with Undo
    trashDoc("session", "sessions", sessionId, trashLabelSession(s))
      .then(function () {
        // a confirmed poll and its session go together: the poll this session came from is removed too (deleting only a poll is fine and leaves the session)
        var pl = typeof _findPoll === "function" && s && s.pollId ? _findPoll(s.pollId) : null;
        if (pl && pl.status === "confirmed" && pl.sessionId === sessionId) trashDoc("poll", "polls", pl.id, trashLabelSession(s)).catch(function () {});
        currentSessionId = null;
        showPage("sessions", false);
      })
      .catch(function (error) { showToast(_permError(error)); });
  }, { danger: true, yes: t("delete") });
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
