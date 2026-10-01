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

/** "🪶 49,286 + 🍽️ 125,000 − 🏟️ 42,857" — what a transfer is made of */
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

function renderSessionsList(sessions) {
  var container = document.getElementById("sessionsList");
  if (!container) return;

  var html = '<button class="btn-secondary" style="margin-bottom:12px" onclick="createAdHocSession()">+ ' + t("newSession") + '</button>';

  if (!sessions || sessions.length === 0) {
    container.innerHTML = html +
      '<div class="empty-state">' +
        '<div class="empty-icon">🏸</div>' +
        '<div>' + t("noSessions") + '</div>' +
        '<div style="margin-top:8px;font-size:13px">' + t("createFirst") + '</div>' +
      '</div>';
    return;
  }

  // Newest play date first
  var sorted = sessions.slice().sort(function (a, b) {
    return ((b.date || "") + (b.time || "")).localeCompare((a.date || "") + (a.time || ""));
  });

  for (var i = 0; i < sorted.length; i++) {
    var s = sorted[i];
    var playerCount = (s.players || []).length;
    var badge;
    if (!s.calculated) {
      badge = '<span class="person-status status-owes">' + t("needsCosts") + '</span>';
    } else {
      var open = openTransfers(s).length;
      badge = open > 0
        ? '<span class="person-status status-owes">' + open + ' ' + t("unpaid") + '</span>'
        : '<span class="person-status status-payer">' + t("settled") + '</span>';
    }

    html +=
      '<div class="session-item" onclick="showSessionDetail(\'' + s.id + '\')">' +
        '<div style="min-width:0">' +
          '<div class="session-date">' + fmtDate(s.date) + '</div>' +
          '<div class="session-court">📍 ' + escapeHtml(s.courtName || "") + ' • ' + escapeHtml(s.time || "") + (s.duration ? ' (' + s.duration + 'h)' : '') + '</div>' +
          '<div class="session-players">👥 ' + playerCount + ' ' + t("players") + ' ' + badge + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div class="session-total">' + (s.calculated ? fmtShort(s.grandTotal) : '—') + '</div>' +
          (s.calculated && playerCount ? '<div class="session-each">~' + fmtShort((s.grandTotal || 0) / playerCount) + ' ' + t("each") + '</div>' : '') +
        '</div>' +
      '</div>';
  }

  container.innerHTML = html;
}

/** Start a session directly (without a poll), with me as the first player */
function createAdHocSession() {
  var court = DB_CACHE.courts[0];
  var data = {
    pollId: null,
    date: _todayIso(),
    time: "18:00",
    duration: 2,
    courtId: court ? court.id : null,
    courtName: court ? court.name : null,
    courtLocation: court ? (court.location || null) : null,
    pricePerHour: court ? (court.pricePerHour || 0) : 0,
    status: "active",
    players: currentUser ? [currentUser.uid] : [],
    calculated: false,
    createdBy: currentUser ? currentUser.uid : null
  };
  dbCreateSession(data)
    .then(function (ref) { showSessionDetail(ref.id); })
    .catch(function (error) { showToast(error.message); });
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

  if (!s.calculated && !sessionEditing) {
    startEditSession();
    return;
  }

  var html = _renderSessionHeader(s);
  html += _renderSplitResult(s);
  container.innerHTML = html;
}

function _renderSessionHeader(s) {
  var html = '<div style="text-align:center;margin-bottom:16px">';
  html += '<div style="font-size:16px;font-weight:700">' + fmtDate(s.date) + '</div>';
  html += '<div style="font-size:13px;color:var(--text-secondary)">' + escapeHtml(s.time || "") + (s.duration ? ' • ' + s.duration + 'h' : '') +
    ' • ' + escapeHtml(s.courtName || "") + (s.courtLocation ? ' (' + escapeHtml(s.courtLocation) + ')' : '') + '</div>';
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
  html += _costCard("🏟️", t("court"), L.totals.court, s.courtPayer);
  html += _costCard("🪶", t("shuttlecocks"), L.totals.shuttle, s.shuttlePayer);
  html += _costCard("🥤", t("otherCosts"), L.totals.other, null);
  html += _costCard("🍽️", t("dinnerBill"), L.totals.dinner, s.dinner ? s.dinner.paidBy : null);
  html += '</div>';

  // Who pays whom — grouped by the person receiving the money
  html += '<div class="card"><div class="card-title">\uD83D\uDC49 ' + t("whoPaysWhom") + '</div>';
  if (L.transfers.length === 0) {
    html += '<div style="font-size:13px;color:var(--text-muted)">' + t("nothingToPay") + '</div>';
  }
  var lastTo = null;
  for (var ti = 0; ti < L.transfers.length; ti++) {
    var tr = L.transfers[ti];
    if (tr.to !== lastTo) {
      lastTo = tr.to;
      html += '<div class="pay-group-head"><span>\uD83D\uDCB3 ' + t("payTo") + ' <b>' + getUserName(tr.to) + '</b></span>' +
        '<span class="pay-group-total">' + fmtLAK(L.received[tr.to]) + '</span></div>';
    }
    var isDone = !!settled[tr.key];
    var canMark = _canMarkTransfer(s, tr);
    html += '<div class="person-row">';
    html += '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">' + getUserName(tr.from) + '</div>' +
      '<div class="person-breakdown">' + escapeHtml(transferBreakdown(tr)) + '</div></div>';
    html += '<div class="person-amount" style="white-space:nowrap;' + (isDone ? 'text-decoration:line-through;color:var(--text-muted)' : '') + '">' + fmtLAK(tr.amount) + '</div>';
    if (isDone) {
      html += '<span class="person-status status-payer">' + t("paid") + '</span>';
      if (canMark) html += '<button class="edit-btn" onclick="setTransferSettled(\'' + s.id + '\',\'' + tr.key + '\',false)">\u21A9</button>';
    } else if (canMark) {
      html += '<button class="edit-btn" onclick="setTransferSettled(\'' + s.id + '\',\'' + tr.key + '\',true)">' + t("markPaid") + '</button>';
    } else {
      html += '<span class="person-status status-owes">' + t("unpaid") + '</span>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Per person
  html += '<div class="card"><div class="card-title">' + t("perPerson") + '</div>';
  var shareUids = Object.keys(L.shares).filter(function (u) { return L.shares[u].total > 0 || L.paid[u] > 0; });
  for (var pi = 0; pi < shareUids.length; pi++) {
    var uid = shareUids[pi];
    var ps = L.shares[uid];
    var parts = [];
    if (ps.court) parts.push('🏟️' + fmtLAK(ps.court));
    if (ps.shuttle) parts.push('🪶' + fmtLAK(ps.shuttle));
    if (ps.other) parts.push('🥤' + fmtLAK(ps.other));
    if (ps.dinner) parts.push('🍽️' + fmtLAK(ps.dinner));
    var paidStr = L.paid[uid] > 0 ? '<div style="font-size:11px;color:var(--accent)">' + t("paidOut") + ' ' + fmtLAK(L.paid[uid]) + '</div>' : '';
    var notPlaying = players.indexOf(uid) < 0 ? ' <span style="font-size:10px;color:var(--text-muted)">(' + t("notPlaying") + ')</span>' : '';

    html += '<div class="person-row"><div class="person-left">';
    html += '<div class="person-avatar" style="background:' + COLORS[pi % COLORS.length] + '">' + getUserName(uid).charAt(0).toUpperCase() + '</div>';
    html += '<div style="min-width:0"><div style="font-size:14px">' + getUserName(uid) + notPlaying + '</div>' + paidStr +
      '<div class="person-breakdown">' + parts.join(' + ') + '</div></div></div>';
    html += '<div class="person-right"><div class="person-amount">' + fmtLAK(ps.total) + '</div></div></div>';
  }
  html += '</div>';

  // Itemised costs
  html += '<div class="card"><div class="card-title">' + t("costDetails") + '</div>';
  html += _detailLine('🏟️ ' + escapeHtml(s.courtName || t("court")) + ' — ' + (s.duration || 0) + 'h × ' + fmtLAK(s.pricePerHour), s.courtCost, s.courtPayer);
  var scs = s.shuttlecocks || [];
  for (var si = 0; si < scs.length; si++) {
    html += _detailLine('🪶 ' + escapeHtml(scs[si].brand) + ' — ' + scs[si].qty + ' ' + t("cocks") + ' (' + fmtLAK(scs[si].price) + '/' + scs[si].cocksPerTube + ')', scs[si].total, s.shuttlePayer);
  }
  var ocs = s.otherCosts || [];
  for (var oi = 0; oi < ocs.length; oi++) {
    var forStr = ocs[oi].forUid ? ' (' + t("for") + ' ' + getUserName(ocs[oi].forUid) + ')' : ' (' + t("everyone") + ')';
    html += _detailLine('🥤 ' + escapeHtml(ocs[oi].desc) + forStr, ocs[oi].amount, ocs[oi].paidBy);
  }
  if (s.dinner && s.dinner.totalBill > 0) {
    html += _detailLine('🍽️ ' + t("dinnerBill") + ' (÷' + (s.dinner.diners || []).length + ')', s.dinner.totalBill, s.dinner.paidBy);
    if (s.dinner.receiptUrl) {
      html += '<img src="' + s.dinner.receiptUrl + '" alt="' + t("receipt") + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;margin-top:8px;cursor:pointer" onclick="openImage(this.src)">';
    }
  }
  html += '</div>';

  // QR codes of the people being paid
  html += _renderQrForPayees(s, L);

  // Messenger copy & preview
  html += '<button class="btn-share" onclick="copyMessengerFromPreview()">' + t("copyMessenger") + '</button>';
  html += '<div class="messenger-preview" id="messengerPreview">' + escapeHtml(buildMessengerText(s)) + '</div>';

  html += '<button class="btn-secondary" style="margin-bottom:8px" onclick="startEditSession()">✏️ ' + t("editCosts") + '</button>';
  html += '<button class="btn-danger" onclick="deleteSessionById(\'' + s.id + '\')">' + t("deleteSession") + '</button>';
  return html;
}

/** The payer, the receiver, the session creator, or anyone when a manual
 *  player (who cannot sign in) is involved, may mark a transfer as paid */
function _canMarkTransfer(s, tr) {
  if (!currentUser) return false;
  var me = currentUser.uid;
  if (me === tr.from || me === tr.to || me === s.createdBy) return true;
  var from = dbFindById(DB_CACHE.users, tr.from);
  var to = dbFindById(DB_CACHE.users, tr.to);
  return !!((from && from.manual) || (to && to.manual));
}

function _detailLine(label, amount, payerUid) {
  return '<div class="item-row"><div class="item-name" style="font-size:13px">' + label +
    (payerUid ? '<div style="font-size:11px;color:var(--text-muted)">💳 ' + t("paidBy") + ' ' + getUserName(payerUid) + '</div>' : '') +
    '</div><div class="item-price">' + fmtLAK(amount) + '</div></div>';
}

function _costCard(icon, label, amount, payerUid) {
  return '<div class="cost-card"><div class="cost-icon">' + icon + '</div>' +
    '<div class="cost-card-label">' + label + '</div>' +
    '<div class="cost-card-value">' + fmtShort(amount) + '</div>' +
    '<div class="cost-card-sub">' + (payerUid && amount ? getUserName(payerUid) : '&nbsp;') + '</div></div>';
}

function _renderQrForPayees(s, L) {
  var qr = DB_CACHE.qrCodes;
  if (!qr) return "";
  var items = [];
  if (qr.courtPayer && qr.courtPayer.url && L.totals.court > 0) items.push({ url: qr.courtPayer.url, label: t("courtPayer") + ': ' + escapeHtml(qr.courtPayer.name || getUserName(s.courtPayer)) });
  if (qr.shuttlePayer && qr.shuttlePayer.url && L.totals.shuttle > 0) items.push({ url: qr.shuttlePayer.url, label: t("shuttlePayer") + ': ' + escapeHtml(qr.shuttlePayer.name || getUserName(s.shuttlePayer)) });
  if (!items.length) return "";
  var html = '<div class="card"><div class="card-title">' + t("qrCodes") + '</div><div style="display:flex;gap:10px">';
  for (var i = 0; i < items.length; i++) {
    html += '<div style="flex:1;text-align:center"><img src="' + items[i].url + '" style="width:100%;max-width:160px;border-radius:10px;cursor:pointer" onclick="openImage(this.src)" alt="QR">' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + items[i].label + '</div></div>';
  }
  return html + '</div></div>';
}

function openImage(src) {
  document.getElementById("modalTitle").textContent = "";
  document.getElementById("modalBody").innerHTML = '<img src="' + src + '" style="width:100%;border-radius:10px">';
  modalCallback = null;
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Cost entry form
   ────────────────────────────────────────────────────────── */

function startEditSession() {
  var s = currentSession;
  if (!s) return;
  sessionEditing = true;

  var court = dbFindById(DB_CACHE.courts, s.courtId);
  edit = {
    date: s.date || _todayIso(),
    time: s.time || "18:00",
    duration: s.duration || 2,
    courtId: s.courtId || (DB_CACHE.courts[0] ? DB_CACHE.courts[0].id : ""),
    pricePerHour: court ? (court.pricePerHour || 0) : (s.pricePerHour || 0),
    players: (s.players || []).slice(),
    courtPayer: s.courtPayer || "",
    shuttlecocks: (s.shuttlecocks || []).map(function (x) {
      return { brand: x.brand, qty: x.qty || 0, price: x.price || 0, cocksPerTube: x.cocksPerTube || 12 };
    }),
    shuttlePayer: s.shuttlePayer || "",
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

  // When & where
  html += '<div class="card"><div class="card-title">📅 ' + t("courtDetails") + '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group"><label class="form-label">' + t("date") + '</label><input type="date" class="form-input" value="' + edit.date + '" onchange="edit.date=this.value"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("startTime") + '</label><input type="time" class="form-input" value="' + edit.time + '" onchange="edit.time=this.value"></div>';
  html += '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group" style="flex:2"><label class="form-label">' + t("court") + '</label><select class="form-select" onchange="editSetCourt(this.value)">';
  if (!courts.length) html += '<option value="">' + t("noCourtsYet") + '</option>';
  for (var ci = 0; ci < courts.length; ci++) {
    html += '<option value="' + courts[ci].id + '"' + (courts[ci].id === edit.courtId ? ' selected' : '') + '>' + escapeHtml(courts[ci].name) + ' (' + fmtLAK(courts[ci].pricePerHour) + '/h)</option>';
  }
  html += '</select></div>';
  html += '<div class="form-group" style="flex:1"><label class="form-label">' + t("duration") + ' (h)</label><input type="number" class="form-input" min="0.5" max="12" step="0.5" value="' + edit.duration + '" oninput="edit.duration=parseFloat(this.value)||0;_updateEditTotals()"></div>';
  html += '</div>';
  html += '<div class="cost-display" id="courtCostDisplay"></div>';
  html += '<div class="form-group" style="margin-top:8px"><label class="form-label">💳 ' + t("courtPayer") + '</label>';
  html += '<select class="form-select" onchange="edit.courtPayer=this.value">' + _payerOptions(edit.courtPayer, edit.players) + '</select></div>';
  html += '</div>';

  // Players
  var pickable = _pickableUids();
  html += '<div class="card"><div class="card-title">👥 ' + t("players") + ' (' + edit.players.length + ')</div>';
  html += '<div class="chips">';
  for (var ui = 0; ui < pickable.length; ui++) {
    var on = edit.players.indexOf(pickable[ui]) >= 0;
    html += '<div class="chip' + (on ? ' active' : '') + '" onclick="editTogglePlayer(\'' + pickable[ui] + '\')">' + (on ? '✔ ' : '') + getUserName(pickable[ui]) + '</div>';
  }
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted)">' + t("payerHint") + '</div>';
  html += '</div>';

  // Shuttlecocks
  html += '<div class="card"><div class="card-title">🪶 ' + t("shuttlecocks") + ' <span style="font-size:10px;color:var(--text-muted);text-transform:none;letter-spacing:0">' + t("splitEqually") + '</span></div>';
  for (var si = 0; si < edit.shuttlecocks.length; si++) {
    var sc = edit.shuttlecocks[si];
    html += '<div class="item-row">';
    html += '<div class="item-name">' + escapeHtml(sc.brand) + '<div style="font-size:10px;color:var(--text-muted)">' + fmtLAK(sc.price) + ' / ' + sc.cocksPerTube + ' ' + t("cocks") + '</div></div>';
    html += '<div class="qty-controls"><button onclick="editShuttleQty(' + si + ',-1)">−</button>';
    html += '<input type="number" class="qty-num" min="0" value="' + sc.qty + '" style="width:44px;background:transparent;border:none;color:var(--text);text-align:center" oninput="edit.shuttlecocks[' + si + '].qty=Math.max(0,parseInt(this.value)||0);_updateEditTotals()">';
    html += '<button onclick="editShuttleQty(' + si + ',1)">+</button></div>';
    html += '<div class="item-price" id="scRowTotal' + si + '"></div>';
    html += '<button class="remove-btn" onclick="edit.shuttlecocks.splice(' + si + ',1);renderEditForm()">✕</button>';
    html += '</div>';
  }
  html += '<button class="add-btn-dashed" onclick="showAddShuttlecock()">+ ' + t("addBrand") + '</button>';
  html += '<div class="form-group" style="margin-top:10px"><label class="form-label">💳 ' + t("shuttlePayer") + '</label>';
  html += '<select class="form-select" onchange="edit.shuttlePayer=this.value">' + _payerOptions(edit.shuttlePayer, edit.players) + '</select></div>';
  html += '<div class="subtotal-row"><span>' + t("shuttleTotal") + '</span><span id="shuttleTotal"></span></div>';
  html += '</div>';

  // Other costs
  html += '<div class="card"><div class="card-title">🥤 ' + t("otherCosts") + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">' + t("otherCostHint") + '</div>';
  for (var oi = 0; oi < edit.otherCosts.length; oi++) {
    var oc = edit.otherCosts[oi];
    html += '<div class="item-row"><div class="item-name">' + escapeHtml(oc.desc) +
      '<div style="font-size:11px;color:var(--text-muted)">💳 ' + getUserName(oc.paidBy) + ' • ' + (oc.forUid ? t("for") + ' ' + getUserName(oc.forUid) : t("everyone")) + '</div></div>' +
      '<div class="item-price">' + fmtLAK(oc.amount) + '</div>' +
      '<button class="remove-btn" onclick="edit.otherCosts.splice(' + oi + ',1);renderEditForm()">✕</button></div>';
  }
  html += '<button class="add-btn-dashed" onclick="showAddOtherCost()">+ ' + t("addOtherCost") + '</button>';
  html += '</div>';

  // Dinner
  html += '<div class="card"><div class="card-title">🍽️ ' + t("dinnerBill") + '</div>';
  if (!edit.dinner) {
    html += '<button class="add-btn-dashed" onclick="editAddDinner()">+ ' + t("addDinner") + '</button>';
  } else {
    var d = edit.dinner;
    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">' + t("totalBill") + ' (\u20AD)</label>' + moneyInput('', d.totalBill, 'edit.dinner.totalBill=parseMoney(this.value);_updateEditTotals()') + '</div>';
    html += '<div class="form-group"><label class="form-label">💳 ' + t("dinnerPayer") + '</label><select class="form-select" onchange="edit.dinner.paidBy=this.value">' + _payerOptions(d.paidBy, pickable) + '</select></div>';
    html += '</div>';
    html += '<label class="form-label">' + t("selectDiners") + '</label><div class="chips">';
    for (var di = 0; di < pickable.length; di++) {
      var dOn = d.diners.indexOf(pickable[di]) >= 0;
      html += '<div class="chip' + (dOn ? ' active' : '') + '" onclick="editToggleDiner(\'' + pickable[di] + '\')">' + (dOn ? '✔ ' : '') + getUserName(pickable[di]) + '</div>';
    }
    html += '</div>';
    html += '<div class="form-group"><label class="form-label">' + t("uploadReceipt") + '</label>';
    if (d.receiptUrl) html += '<img src="' + d.receiptUrl + '" style="width:100%;max-height:160px;object-fit:contain;border-radius:10px;margin-bottom:6px">';
    html += '<input type="file" class="form-input" accept="image/*" style="padding:8px;font-size:13px" onchange="editReceiptChosen(this)"></div>';
    html += '<button class="btn-danger" style="padding:8px;font-size:12px" onclick="edit.dinner=null;renderEditForm()">' + t("removeDinner") + '</button>';
  }
  html += '</div>';

  // Summary + save
  html += '<div class="card"><div class="card-title">' + t("total") + '</div><div id="editSummary"></div></div>';
  html += '<button class="btn-primary" onclick="saveSessionCosts()">' + t("calculateSplit") + '</button>';
  html += '<button class="btn-secondary" style="margin-top:8px" onclick="cancelEditSession()">' + t("cancel") + '</button>';
  if (currentSession && !currentSession.calculated) {
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
  var court = dbFindById(DB_CACHE.courts, edit.courtId);
  var pricePerHour = court ? (court.pricePerHour || 0) : edit.pricePerHour;
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
  if (courtEl) courtEl.innerHTML = (edit.duration || 0) + 'h × ' + fmtLAK(data.pricePerHour) + ' = <b style="color:var(--accent)">' + fmtLAK(data.courtCost) + '</b>';

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
      '<div class="item-row"><div class="item-name">🏟️ ' + t("court") + '</div><div class="item-price">' + fmtLAK(data.courtCost) + '</div></div>' +
      '<div class="item-row"><div class="item-name">🪶 ' + t("shuttlecocks") + '</div><div class="item-price">' + fmtLAK(data.shuttleTotal) + '</div></div>' +
      '<div class="item-row"><div class="item-name">🥤 ' + t("otherCosts") + '</div><div class="item-price">' + fmtLAK(data.otherTotal) + '</div></div>' +
      '<div class="item-row"><div class="item-name">🍽️ ' + t("dinnerBill") + '</div><div class="item-price">' + fmtLAK(data.dinner ? data.dinner.totalBill : 0) + '</div></div>' +
      '<div class="subtotal-row"><span>' + t("total") + '</span><span style="color:var(--accent)">' + fmtLAK(data.grandTotal) + '</span></div>' +
      (n ? '<div style="font-size:12px;color:var(--text-muted);text-align:right">' + t("courtAndCocksEach").replace("{n}", n) + ' ' + fmtLAK((data.courtCost + data.shuttleTotal) / n) + '</div>' : '');
  }
}

function editSetCourt(courtId) {
  edit.courtId = courtId;
  var court = dbFindById(DB_CACHE.courts, courtId);
  if (court) edit.pricePerHour = court.pricePerHour || 0;
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

function showAddShuttlecock() {
  var brands = DB_CACHE.shuttlecocks;
  if (brands.length === 0) {
    showToast(t("addBrandsFirst"));
    return;
  }

  var opts = "";
  for (var i = 0; i < brands.length; i++) {
    opts += '<option value="' + brands[i].id + '">' + escapeHtml(brands[i].name) + ' (' + fmtLAK(brands[i].pricePerTube) + ' / ' + (brands[i].cocksPerTube || 12) + ')</option>';
  }

  document.getElementById("modalTitle").textContent = t("addBrand");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("selectBrand") + '</label>' +
    '<select class="form-select" id="modalBrand">' + opts + '</select></div>' +
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
    '<div class="form-group"><label class="form-label">' + t("amount") + ' (\u20AD)</label>' +
    moneyInput('modalAmount', 0, '') + '</div>' +
    '<div class="form-group"><label class="form-label">💳 ' + t("paidBy") + '</label>' +
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

  if (data.players.length < 2) { showToast(t("needTwoPlayers")); return; }
  if (!data.courtId) { showToast(t("selectCourt")); return; }
  if (data.courtCost > 0 && !data.courtPayer) { showToast(t("selectPayer") + " — " + t("courtPayer")); return; }
  if (data.shuttleTotal > 0 && !data.shuttlePayer) { showToast(t("selectPayer") + " — " + t("shuttlePayer")); return; }
  if (data.dinner) {
    if (!data.dinner.paidBy) { showToast(t("selectPayer") + " — " + t("dinnerPayer")); return; }
    if (!data.dinner.diners.length) { showToast(t("selectDiners")); return; }
  }

  data.calculated = true;
  data.settled = {}; // amounts changed, so earlier "paid" marks no longer apply
  data.status = computeLedger(data).transfers.length ? "active" : "completed";

  dbUpdateSession(currentSessionId, data)
    .then(function () {
      // Show the result straight away, even if the snapshot hasn't arrived yet
      if (currentSession) Object.assign(currentSession, data);
      sessionEditing = false;
      edit = null;
      showToast(t("calculateSplit") + " ✔");
      renderSessionDetail();
    })
    .catch(function (error) { showToast(error.message); });
}

/* ──────────────────────────────────────────────────────────
   Payment Tracking
   ────────────────────────────────────────────────────────── */

function setTransferSettled(sessionId, key, value) {
  var s = currentSession;
  if (!s) return;
  var settled = Object.assign({}, s.settled || {});
  if (value) settled[key] = true;
  else delete settled[key];

  var remaining = computeLedger(s).transfers.filter(function (tr) { return !settled[tr.key]; });
  dbUpdateSession(sessionId, { settled: settled, status: remaining.length ? "active" : "completed" })
    .then(function () { showToast(value ? t("paid") + " ✔" : t("unpaid")); })
    .catch(function (error) { showToast(error.message); });
}

/* ──────────────────────────────────────────────────────────
   Delete Session
   ────────────────────────────────────────────────────────── */

function deleteSessionById(sessionId) {
  if (!confirm(t("deleteConfirm"))) return;
  if (_sessionDocUnsub) { _sessionDocUnsub(); _sessionDocUnsub = null; }
  sessionEditing = false;

  dbDeleteSession(sessionId)
    .then(function () {
      showToast(t("deleteSession") + " ✔");
      currentSessionId = null;
      showPage("sessions", false);
    })
    .catch(function (error) { showToast(error.message); });
}

/* ──────────────────────────────────────────────────────────
   Messenger Text Builder
   ────────────────────────────────────────────────────────── */

function _plainName(uid) {
  var u = dbFindById(DB_CACHE.users, uid);
  return u && u.displayName ? u.displayName : "?";
}

function buildMessengerText(s) {
  var L = computeLedger(s);
  var players = s.players || [];
  var n = players.length;
  var settled = s.settled || {};
  var line = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
  var num = function (v) { return Math.round(v || 0).toLocaleString("en-US"); };
  var out = [];

  // When & where
  var start = s.time || "18:00";
  var sp = start.split(":");
  var endMin = parseInt(sp[0], 10) * 60 + parseInt(sp[1] || "0", 10) + Math.round((s.duration || 0) * 60);
  var end = String(Math.floor(endMin / 60) % 24).padStart(2, "0") + ":" + String(endMin % 60).padStart(2, "0");
  var d = s.date ? new Date(s.date + "T00:00:00") : null;
  var weekday = d ? d.toLocaleDateString(currentLang === "la" ? "lo-LA" : "en-GB", { weekday: "short" }) + " " : "";

  out.push("\uD83C\uDFF8 " + t("msgTitle") + " \u2014 " + weekday + fmtDate(s.date));
  out.push("\uD83D\uDCCD " + (s.courtName || "") + (s.courtLocation ? " (" + s.courtLocation + ")" : ""));
  out.push("\uD83D\uDD55 " + start + "\u2013" + end + (s.duration ? " (" + s.duration + "h)" : ""));
  out.push("\uD83D\uDC65 " + n + " " + t("players") + ": " + players.map(_plainName).join(", "));

  // Costs
  out.push("");
  out.push(line);
  out.push("\uD83E\uDDFE " + t("msgCosts"));
  out.push("");
  if (L.totals.court > 0) {
    out.push("\uD83C\uDFDF\uFE0F " + t("court") + ": " + fmtLAK(L.totals.court));
    out.push("     " + t("paidBy") + " " + _plainName(s.courtPayer) + " \u00B7 \u00F7" + n + " = " + num(L.totals.court / n) + " " + t("each"));
  }
  if (L.totals.shuttle > 0) {
    var cocks = (s.shuttlecocks || []).map(function (c) { return c.qty + " " + c.brand; }).join(", ");
    out.push("\uD83E\uDEB6 " + t("shuttlecocks") + " (" + cocks + "): " + fmtLAK(L.totals.shuttle));
    out.push("     " + t("paidBy") + " " + _plainName(s.shuttlePayer) + " \u00B7 \u00F7" + n + " = " + num(L.totals.shuttle / n) + " " + t("each"));
  }
  var ocs = s.otherCosts || [];
  for (var i = 0; i < ocs.length; i++) {
    out.push("\uD83E\uDD64 " + ocs[i].desc + ": " + fmtLAK(ocs[i].amount));
    out.push("     " + t("paidBy") + " " + _plainName(ocs[i].paidBy) + " \u00B7 " +
      (ocs[i].forUid ? t("for") + " " + _plainName(ocs[i].forUid) : "\u00F7" + n + " = " + num(ocs[i].amount / n) + " " + t("each")));
  }
  if (L.totals.dinner > 0) {
    var diners = s.dinner.diners || [];
    out.push("\uD83C\uDF7D\uFE0F " + t("dinnerBill") + ": " + fmtLAK(L.totals.dinner));
    out.push("     " + t("paidBy") + " " + _plainName(s.dinner.paidBy) + " \u00B7 \u00F7" + diners.length + " = " + num(L.totals.dinner / diners.length) + " " + t("each"));
    out.push("     (" + diners.map(_plainName).join(", ") + ")");
  }
  out.push("");
  out.push("\uD83D\uDCB0 " + t("total").toUpperCase() + ": " + fmtLAK(L.totals.grand));

  // Payments, grouped by who receives the money
  if (L.transfers.length) {
    out.push("");
    out.push(line);
    var lastTo = null;
    for (var k = 0; k < L.transfers.length; k++) {
      var tr = L.transfers[k];
      if (tr.to !== lastTo) {
        if (lastTo !== null) out.push("");
        lastTo = tr.to;
        out.push("\uD83D\uDCB8 " + t("payTo").toUpperCase() + " " + _plainName(tr.to).toUpperCase() + " (" + fmtLAK(L.received[tr.to]) + ")");
      }
      out.push((settled[tr.key] ? "\u2705 " : "\u25AB\uFE0F ") + _plainName(tr.from) + ": " + fmtLAK(tr.amount));
      out.push("     " + transferBreakdown(tr));
    }
  }

  // People who don't need to pay anyone
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
