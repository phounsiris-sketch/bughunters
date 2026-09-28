/* ============================================================
   sessions.js — Session listing, detail, cost splitting,
                  payment tracking, Messenger sharing
   Firebase Firestore COMPAT SDK (global `firebase` object)
   Depends on: firebase-config.js (fsdb, storage),
               auth.js (currentUser),
               db.js (dbGetSessions, dbGetSession, dbUpdateSession,
                      dbDeleteSession, dbGetDinner, dbGetQrCodes,
                      dbGetCourts, dbGetShuttlecocks, dbGetUsers),
               storage.js (uploadDinnerReceipt),
               polls.js (getUserName),
               i18n.js (t),
               router.js (showPage, goBack),
               app.js (showToast, COLORS, openModal, closeModal,
                       modalCallback, escapeHtml)
   ============================================================ */

var sessionsUnsubscribe = null;
var currentSessionId = null;
var sessionShuttlecocks = [];
var sessionOtherCosts = [];
var selectedPlayers = {};
var courtPayer = "";
var shuttlePayer = "";

// Cached master data for the edit form
var _sessionCourts = [];
var _sessionShuttleBrands = [];
var _sessionUsers = [];

/* ──────────────────────────────────────────────────────────
   Sessions List
   ────────────────────────────────────────────────────────── */

function loadSessions() {
  if (sessionsUnsubscribe) {
    sessionsUnsubscribe();
    sessionsUnsubscribe = null;
  }

  // Cache master data for forms
  dbGetCourts(function (c) { _sessionCourts = c; });
  dbGetShuttlecocks(function (s) { _sessionShuttleBrands = s; });
  dbGetUsers(function (u) { _sessionUsers = u; });

  sessionsUnsubscribe = dbGetSessions(function (sessions) {
    renderSessionsList(sessions);
  });
}

function renderSessionsList(sessions) {
  var container = document.getElementById("sessionsList");
  if (!container) return;

  if (!sessions || sessions.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="5" r="3"/>' +
            '<line x1="12" y1="8" x2="12" y2="16"/>' +
            '<path d="M8 20 L12 16 L16 20"/>' +
          '</svg>' +
        '</div>' +
        '<div>' + t("noSessions") + '</div>' +
        '<div style="margin-top:8px;font-size:13px">' + t("createFirst") + '</div>' +
      '</div>';
    return;
  }

  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var html = "";

  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    var dateStr = "";
    if (s.date) {
      var d = new Date(s.date + "T00:00:00");
      dateStr = d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    }

    var playerCount = 0;
    var playerUids = s.players || [];
    playerCount = playerUids.length;

    // Payer names
    var courtPayerName = s.courtPayer ? getUserName(s.courtPayer) : "";
    var shuttlePayerName = s.shuttlePayer ? getUserName(s.shuttlePayer) : "";
    var payerStr = courtPayerName;
    if (shuttlePayerName && shuttlePayerName !== courtPayerName) {
      payerStr += " / " + shuttlePayerName;
    }

    // Grand total and average
    var grandTotal = 0;
    var avgPP = 0;
    if (s.splits) {
      var splitKeys = Object.keys(s.splits);
      for (var sk = 0; sk < splitKeys.length; sk++) {
        grandTotal += (s.splits[splitKeys[sk]].total || 0);
      }
      avgPP = splitKeys.length > 0 ? Math.round(grandTotal / splitKeys.length) : 0;
    } else if (s.grandTotal) {
      grandTotal = s.grandTotal;
      avgPP = playerCount > 0 ? Math.round(grandTotal / playerCount) : 0;
    }

    html +=
      '<div class="session-item" onclick="showSessionDetail(\'' + s.id + '\')">' +
        '<div>' +
          '<div class="session-date">' + dateStr + '</div>' +
          '<div class="session-court">\uD83D\uDCCD ' + (s.courtName || s.court || "") + ' \u2022 ' + (s.time || s.startTime || "") + '</div>' +
          '<div class="session-players">\uD83D\uDC65 ' + playerCount + " " + t("players") +
            (payerStr ? " \u2022 " + payerStr : "") + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="session-total">' + Math.round(grandTotal) + 'K</div>' +
          '<div class="session-each">' + avgPP + 'K ' + t("each") + '</div>' +
        '</div>' +
      '</div>';
  }

  container.innerHTML = html;
}

/* ──────────────────────────────────────────────────────────
   Session Detail
   ────────────────────────────────────────────────────────── */

function showSessionDetail(sessionId) {
  currentSessionId = sessionId;
  showPage("session-detail");

  var detailEl = document.getElementById("sessionDetailContent");
  if (detailEl) detailEl.innerHTML = '<div class="loading">Loading...</div>';

  dbGetSession(sessionId).then(function (session) {
    if (!session) {
      showToast("Session not found");
      goBack();
      return;
    }

    // Fetch dinner, QR codes, and users in parallel
    var dinner = null;
    var qrCodes = null;
    var dinnerLoaded = false;
    var qrLoaded = false;

    var dinnerUnsub = dbGetDinner(sessionId, function (d) {
      dinner = d;
      dinnerLoaded = true;
      if (qrLoaded) {
        if (dinnerUnsub) dinnerUnsub();
        renderSessionDetail(session, dinner, qrCodes);
      }
    });

    var qrUnsub = dbGetQrCodes(function (qr) {
      qrCodes = qr;
      qrLoaded = true;
      if (dinnerLoaded) {
        if (qrUnsub) qrUnsub();
        renderSessionDetail(session, dinner, qrCodes);
      }
    });
  });
}

function renderSessionDetail(session, dinner, qrCodes) {
  var container = document.getElementById("sessionDetailContent");
  if (!container) return;

  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var dateStr = "";
  if (session.date) {
    var d = new Date(session.date + "T00:00:00");
    dateStr = d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  var html = "";

  // Header info
  html += '<div style="text-align:center;margin-bottom:16px">';
  html += '<div style="font-size:14px;color:var(--text-secondary)">' + dateStr + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted)">' + (session.time || session.startTime || "") + ' \u2022 ' + (session.courtName || session.court || "") + '</div>';
  html += '</div>';

  if (session.splits && Object.keys(session.splits).length > 0) {
    html += _renderSplitResult(session, dinner, qrCodes);
  } else {
    html += _renderEditSessionForm(session);
  }

  container.innerHTML = html;
}

/* ---------- Rendered split result (session already calculated) ---------- */
function _renderSplitResult(session, dinner, qrCodes) {
  var s = session;
  var splits = s.splits;
  var splitKeys = Object.keys(splits);
  var playerCount = splitKeys.length;

  // Calculate totals from splits
  var grandTotal = 0;
  var courtTotal = 0;
  var shuttleTotal = 0;
  var dinnerTotal = 0;
  for (var i = 0; i < splitKeys.length; i++) {
    var sp = splits[splitKeys[i]];
    grandTotal += (sp.total || 0);
    courtTotal += (sp.court || 0);
    shuttleTotal += (sp.shuttle || 0);
    dinnerTotal += (sp.dinner || 0);
  }

  var courtPP = playerCount > 0 ? Math.round(courtTotal / playerCount) : 0;
  var shuttlePP = playerCount > 0 ? Math.round(shuttleTotal / playerCount) : 0;

  var html = "";

  // Big total
  html += '<div class="split-header">';
  html += '<div class="split-label">' + t("totalSession") + '</div>';
  html += '<div class="split-amount">' + Math.round(grandTotal) + 'K \u20AD</div>';
  html += '</div>';

  // Cost breakdown cards
  html += '<div class="cost-breakdown">';
  html += '<div class="cost-card"><div class="cost-icon">\uD83C\uDFDF\uFE0F</div><div class="cost-card-label">' + t("court") + '</div>';
  html += '<div class="cost-card-value">' + Math.round(courtTotal) + 'K</div>';
  html += '<div class="cost-card-sub">\u00F7' + playerCount + ' = ' + courtPP + 'K</div></div>';

  html += '<div class="cost-card"><div class="cost-icon">\uD83E\uDEB6</div><div class="cost-card-label">' + t("shuttlecocks") + '</div>';
  html += '<div class="cost-card-value">' + Math.round(shuttleTotal) + 'K</div>';
  html += '<div class="cost-card-sub">\u00F7' + playerCount + ' = ' + shuttlePP + 'K</div></div>';

  html += '<div class="cost-card personal"><div class="cost-icon">\uD83C\uDF7D\uFE0F</div><div class="cost-card-label orange">' + t("personal") + '</div>';
  html += '<div class="cost-card-value" style="color:var(--orange)">' + Math.round(dinnerTotal) + 'K</div>';
  html += '<div class="cost-card-sub">' + (dinner ? t("dinnerSplit") : t("notSplit")) + '</div></div>';
  html += '</div>';

  // Per-person breakdown
  html += '<div class="card"><div class="card-title">' + t("perPerson") + '</div>';
  for (var pi = 0; pi < splitKeys.length; pi++) {
    var uid = splitKeys[pi];
    var ps = splits[uid];
    var pName = getUserName(uid);
    var isCourtPayer = uid === s.courtPayer;
    var isShuttlePayer = uid === s.shuttlePayer;
    var color = COLORS[pi % COLORS.length];

    var statusTags = "";
    if (isCourtPayer) statusTags += '<span class="person-status status-payer">' + t("courtPayer") + '</span> ';
    if (isShuttlePayer) statusTags += '<span class="person-status status-payer">' + t("shuttlePayer") + '</span> ';
    if (!isCourtPayer && !isShuttlePayer) statusTags += '<span class="person-status status-owes">' + t("owes") + '</span>';

    var breakdown = '\uD83C\uDFDF\uFE0F' + Math.round(ps.court || 0) + 'K + \uD83E\uDEB6' + Math.round(ps.shuttle || 0) + 'K';
    if (ps.dinner > 0) breakdown += ' + <span style="color:var(--orange)">\uD83C\uDF7D\uFE0F' + Math.round(ps.dinner) + 'K</span>';

    html += '<div class="person-row"><div class="person-left">';
    html += '<div class="person-avatar" style="background:' + color + '">' + pName.charAt(0).toUpperCase() + '</div>';
    html += '<div><div style="font-size:14px">' + pName + '</div>' + statusTags + '</div></div>';
    html += '<div class="person-right"><div class="person-amount">' + Math.round(ps.total || 0) + 'K \u20AD</div>';
    html += '<div class="person-breakdown">' + breakdown + '</div></div></div>';
  }
  html += '</div>';

  // QR code section
  if (qrCodes) {
    var hasCourtQR = qrCodes.courtPayer && qrCodes.courtPayer.url;
    var hasShuttleQR = qrCodes.shuttlePayer && qrCodes.shuttlePayer.url;
    if (hasCourtQR || hasShuttleQR) {
      html += '<div class="card"><div class="card-title">' + t("qrCodes") + '</div>';
      html += '<div style="display:flex;gap:10px">';
      if (hasCourtQR) {
        html += '<div style="flex:1;text-align:center">';
        html += '<img src="' + qrCodes.courtPayer.url + '" style="width:100%;border-radius:10px;max-width:160px" alt="Court QR">';
        html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + t("courtPayer") + ': ' + (qrCodes.courtPayer.name || getUserName(s.courtPayer)) + '</div>';
        html += '</div>';
      }
      if (hasShuttleQR) {
        html += '<div style="flex:1;text-align:center">';
        html += '<img src="' + qrCodes.shuttlePayer.url + '" style="width:100%;border-radius:10px;max-width:160px" alt="Shuttle QR">';
        html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + t("shuttlePayer") + ': ' + (qrCodes.shuttlePayer.name || getUserName(s.shuttlePayer)) + '</div>';
        html += '</div>';
      }
      html += '</div></div>';
    }
  }

  // Payment status
  html += '<div class="card"><div class="card-title">' + t("paymentStatus") + '</div>';
  for (var pk = 0; pk < splitKeys.length; pk++) {
    var pUid = splitKeys[pk];
    var pSplit = splits[pUid];
    var pN = getUserName(pUid);
    var isPaid = pSplit.paid;
    var pColor = COLORS[pk % COLORS.length];

    html += '<div class="person-row">';
    html += '<div class="person-left">';
    html += '<div class="person-avatar" style="background:' + pColor + '">' + pN.charAt(0).toUpperCase() + '</div>';
    html += '<div style="font-size:14px">' + pN + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    if (isPaid) {
      html += '<span class="person-status status-payer">' + t("paid") + '</span>';
    } else {
      html += '<span class="person-status status-owes">' + t("unpaid") + '</span>';
      if (currentUser && pUid === currentUser.uid) {
        html += '<button class="edit-btn" onclick="markPaid(\'' + s.id + '\',\'' + pUid + '\')">' + t("markPaid") + '</button>';
      }
    }
    html += '</div></div>';
  }
  html += '</div>';

  // Dinner section
  html += renderDinnerSection(dinner);

  // Add dinner button (if none yet)
  if (!dinner) {
    var playersJSON = encodeURIComponent(JSON.stringify(s.players || []));
    html += '<button class="btn-secondary" style="margin-bottom:8px" onclick="showAddDinner(\'' + s.id + '\',' + "decodeURIComponent('" + playersJSON + "')" + ')">' + t("addDinner") + '</button>';
  }

  // Messenger copy & preview
  var messengerText = buildMessengerText(session, dinner);
  html += '<button class="btn-share" onclick="copyMessengerFromPreview()">' + t("copyMessenger") + '</button>';
  html += '<div class="card" style="margin-top:12px"><div class="card-title">Messenger Preview</div>';
  html += '<div class="messenger-preview" id="messengerPreview">' + escapeHtml(messengerText) + '</div></div>';

  // Delete
  html += '<button class="btn-danger" onclick="deleteSessionById(\'' + s.id + '\')">' + t("deleteSession") + '</button>';
  html += '<button class="btn-secondary" style="margin-top:8px" onclick="goBack()">' + t("backToNew") + '</button>';

  return html;
}

/* ---------- Edit session form (no splits yet) ---------- */
function _renderEditSessionForm(session) {
  var s = session;
  var playerUids = s.players || [];

  // Reset form state
  sessionShuttlecocks = [];
  sessionOtherCosts = [];
  selectedPlayers = {};
  courtPayer = s.courtPayer || "";
  shuttlePayer = s.shuttlePayer || "";

  // Pre-populate shuttlecocks from session if any
  if (s.shuttlecocks && s.shuttlecocks.length > 0) {
    for (var si = 0; si < s.shuttlecocks.length; si++) {
      var sc = s.shuttlecocks[si];
      sessionShuttlecocks.push({
        brand: sc.brand || sc.name || "",
        qty: sc.qty || 1,
        price: sc.price || 0
      });
    }
  }

  // Pre-populate other costs
  if (s.otherCosts && s.otherCosts.length > 0) {
    for (var oi = 0; oi < s.otherCosts.length; oi++) {
      sessionOtherCosts.push(s.otherCosts[oi]);
    }
  }

  // Mark players as selected
  for (var pi = 0; pi < playerUids.length; pi++) {
    selectedPlayers[playerUids[pi]] = true;
  }

  var html = "";

  // Court select
  html += '<div class="card">';
  html += '<div class="card-title">' + t("courtDetails") + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("court") + '</label>';
  html += '<select class="form-select" id="editCourtSelect" onchange="updateCourtCost()">';
  for (var ci = 0; ci < _sessionCourts.length; ci++) {
    var ct = _sessionCourts[ci];
    var selAttr = (ct.id === s.courtId || ct.name === s.courtName) ? " selected" : "";
    html += '<option value="' + ct.id + '" data-name="' + ct.name + '" data-price="' + ct.price + '"' + selAttr + '>' + ct.name + ' (' + ct.price + 'K/hr)</option>';
  }
  html += '</select></div>';

  // Duration
  html += '<div class="form-group"><label class="form-label">' + t("duration") + ' (hrs)</label>';
  html += '<div class="form-row">';
  html += '<input type="number" class="form-input" id="editDuration" value="' + (s.duration || 2) + '" min="1" max="8" style="flex:0 0 70px;text-align:center" onchange="updateCourtCost()">';
  html += '<div class="cost-display" id="courtCostDisplay"></div>';
  html += '</div></div>';

  // Court payer
  html += '<div class="form-group"><label class="form-label">' + t("courtPayer") + '</label>';
  html += '<select class="form-select" id="courtPayerSelect" onchange="courtPayer=this.value">';
  html += '<option value="">' + t("selectPayer") + '</option>';
  for (var cp = 0; cp < playerUids.length; cp++) {
    var cpName = getUserName(playerUids[cp]);
    var cpSel = playerUids[cp] === courtPayer ? " selected" : "";
    html += '<option value="' + playerUids[cp] + '"' + cpSel + '>' + cpName + '</option>';
  }
  html += '</select></div>';
  html += '</div>';

  // Players
  html += '<div class="card"><div class="card-title">' + t("players") + '</div>';
  html += '<div class="chips" id="editPlayerChips">';
  for (var ui = 0; ui < playerUids.length; ui++) {
    var uName = getUserName(playerUids[ui]);
    var uColor = COLORS[ui % COLORS.length];
    html += '<div class="chip active" style="border-color:' + uColor + '">' + uName + '</div>';
  }
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + t("payerHint") + '</div>';
  html += '</div>';

  // Shuttlecocks
  html += '<div class="card"><div class="card-title">' + t("shuttlecocks") + ' <span style="font-size:9px;color:var(--text-muted);text-transform:none;letter-spacing:0">' + t("splitEqually") + '</span></div>';
  html += '<div id="shuttlecockRows"></div>';
  html += '<button class="add-btn-dashed" onclick="showAddShuttlecock()">+ ' + t("addBrand") + '</button>';

  // Shuttle payer
  html += '<div class="form-group" style="margin-top:8px"><label class="form-label">' + t("shuttlePayer") + '</label>';
  html += '<select class="form-select" id="shuttlePayerSelect" onchange="shuttlePayer=this.value">';
  html += '<option value="">' + t("selectPayer") + '</option>';
  for (var sp = 0; sp < playerUids.length; sp++) {
    var spName = getUserName(playerUids[sp]);
    var spSel = playerUids[sp] === shuttlePayer ? " selected" : "";
    html += '<option value="' + playerUids[sp] + '"' + spSel + '>' + spName + '</option>';
  }
  html += '</select></div>';

  html += '<div class="subtotal-row"><span class="subtotal-label">' + t("shuttleTotal") + '</span>';
  html += '<span class="subtotal-value" id="shuttleTotal">0K \u20AD</span></div>';
  html += '</div>';

  // Other costs
  html += '<div class="card"><div class="card-title">' + t("otherCosts") + '</div>';
  html += '<div style="background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:var(--status-owes-text)">' + t("otherCostHint") + '</div>';
  html += '<div id="otherCostRows"></div>';
  html += '<button class="add-btn-dashed" onclick="showAddOtherCost()">+ ' + t("addOtherCost") + '</button>';
  html += '<div class="subtotal-row"><span class="subtotal-label">' + t("otherTotal") + '</span>';
  html += '<span class="subtotal-value" id="otherTotal" style="color:var(--orange)">0K \u20AD</span></div>';
  html += '</div>';

  // Calculate button
  html += '<button class="btn-primary" onclick="calculateAndSaveSplit(\'' + s.id + '\')">' + t("calculateSplit") + '</button>';

  // Schedule a re-render of dynamic rows after the DOM is populated
  setTimeout(function () {
    renderShuttlecockRows();
    renderOtherCostRows();
    updateCourtCost();
  }, 0);

  return html;
}

/* ──────────────────────────────────────────────────────────
   Shuttlecock Rows (used in edit form)
   ────────────────────────────────────────────────────────── */

function renderShuttlecockRows() {
  var container = document.getElementById("shuttlecockRows");
  if (!container) return;

  container.innerHTML = "";
  var total = 0;

  for (var idx = 0; idx < sessionShuttlecocks.length; idx++) {
    var sc = sessionShuttlecocks[idx];
    var rowTotal = Math.round((sc.qty / 12) * sc.price);
    total += rowTotal;

    container.innerHTML +=
      '<div class="item-row">' +
        '<div class="item-name">' + sc.brand +
          '<div style="font-size:10px;color:var(--text-muted)">' + sc.qty + '/12 = ' + (sc.qty / 12).toFixed(2) + ' ' + t("tubes") + ' \u00D7 ' + sc.price + 'K</div>' +
        '</div>' +
        '<div class="qty-controls">' +
          '<button class="qty-btn" onclick="changeQty(' + idx + ',-1)">\u2212</button>' +
          '<span class="qty-num">' + sc.qty + '</span>' +
          '<button class="qty-btn" onclick="changeQty(' + idx + ',1)">+</button>' +
        '</div>' +
        '<div class="item-price">' + rowTotal + 'K \u20AD</div>' +
        '<button class="remove-btn" onclick="removeShuttlecock(' + idx + ')">\u2715</button>' +
      '</div>';
  }

  var totalEl = document.getElementById("shuttleTotal");
  if (totalEl) totalEl.textContent = total + "K \u20AD";
}

function changeQty(idx, delta) {
  sessionShuttlecocks[idx].qty = Math.max(1, sessionShuttlecocks[idx].qty + delta);
  renderShuttlecockRows();
}

function removeShuttlecock(idx) {
  sessionShuttlecocks.splice(idx, 1);
  renderShuttlecockRows();
}

function showAddShuttlecock() {
  if (_sessionShuttleBrands.length === 0) {
    showToast("Add shuttlecock brands in Settings first!");
    return;
  }

  var opts = "";
  for (var i = 0; i < _sessionShuttleBrands.length; i++) {
    var sb = _sessionShuttleBrands[i];
    opts += '<option value="' + sb.id + '" data-name="' + sb.name + '" data-price="' + sb.price + '">' + sb.name + ' (' + sb.price + 'K)</option>';
  }

  document.getElementById("modalTitle").textContent = t("addBrand");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("selectBrand") + '</label>' +
    '<select class="form-select" id="modalBrand">' + opts + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + t("cocksUsed") + '</label>' +
    '<input type="number" class="form-input" id="modalQty" value="1" min="1" placeholder="e.g. 8"></div>';

  modalCallback = function () {
    var sel = document.getElementById("modalBrand");
    var selOpt = sel.options[sel.selectedIndex];
    var brandName = selOpt.getAttribute("data-name");
    var brandPrice = parseInt(selOpt.getAttribute("data-price")) || 0;
    var qty = parseInt(document.getElementById("modalQty").value) || 1;

    if (brandName) {
      var existing = null;
      for (var e = 0; e < sessionShuttlecocks.length; e++) {
        if (sessionShuttlecocks[e].brand === brandName) { existing = sessionShuttlecocks[e]; break; }
      }
      if (existing) {
        existing.qty += qty;
      } else {
        sessionShuttlecocks.push({ brand: brandName, qty: qty, price: brandPrice });
      }
      renderShuttlecockRows();
    }
    closeModal();
  };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Other Cost Rows
   ────────────────────────────────────────────────────────── */

function renderOtherCostRows() {
  var container = document.getElementById("otherCostRows");
  if (!container) return;

  container.innerHTML = "";
  var total = 0;

  for (var idx = 0; idx < sessionOtherCosts.length; idx++) {
    var oc = sessionOtherCosts[idx];
    total += oc.amount;
    var pName = oc.playerName || getUserName(oc.player || oc.uid || "");
    var colorIdx = idx;
    var color = COLORS[colorIdx % COLORS.length];

    container.innerHTML +=
      '<div class="other-row">' +
        '<div class="other-avatar" style="background:' + color + '">' + pName.charAt(0).toUpperCase() + '</div>' +
        '<div class="other-info"><div class="other-player">' + pName + '</div><div class="other-desc">' + (oc.desc || "") + '</div></div>' +
        '<div class="other-amount">' + oc.amount + 'K \u20AD</div>' +
        '<button class="remove-btn" onclick="removeOtherCost(' + idx + ')">\u2715</button>' +
      '</div>';
  }

  var totalEl = document.getElementById("otherTotal");
  if (totalEl) totalEl.textContent = total + "K \u20AD";
}

function removeOtherCost(idx) {
  sessionOtherCosts.splice(idx, 1);
  renderOtherCostRows();
}

function showAddOtherCost() {
  var activePlayers = Object.keys(selectedPlayers);
  if (activePlayers.length === 0) {
    showToast("Select players first!");
    return;
  }

  var opts = "";
  for (var i = 0; i < activePlayers.length; i++) {
    var nm = getUserName(activePlayers[i]);
    opts += '<option value="' + activePlayers[i] + '">' + nm + '</option>';
  }

  document.getElementById("modalTitle").textContent = t("addOtherCost");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("player") + '</label>' +
    '<select class="form-select" id="modalPlayer">' + opts + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + t("description") + '</label>' +
    '<input type="text" class="form-input" id="modalDesc" placeholder="Water, drinks..."></div>' +
    '<div class="form-group"><label class="form-label">' + t("amount") + ' (K)</label>' +
    '<input type="number" class="form-input" id="modalAmount" min="1"></div>';

  modalCallback = function () {
    var playerUid = document.getElementById("modalPlayer").value;
    var desc = document.getElementById("modalDesc").value;
    var amount = parseInt(document.getElementById("modalAmount").value) || 0;

    if (playerUid && desc && amount > 0) {
      sessionOtherCosts.push({
        player: playerUid,
        playerName: getUserName(playerUid),
        desc: desc,
        amount: amount
      });
      renderOtherCostRows();
    }
    closeModal();
  };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Payer Selects & Court Cost
   ────────────────────────────────────────────────────────── */

function updatePayerSelects() {
  var activePlayers = Object.keys(selectedPlayers);
  var courtSel = document.getElementById("courtPayerSelect");
  var shuttleSel = document.getElementById("shuttlePayerSelect");
  if (!courtSel || !shuttleSel) return;

  var prevCourt = courtPayer;
  var prevShuttle = shuttlePayer;

  courtSel.innerHTML = '<option value="">' + t("selectPayer") + '</option>';
  shuttleSel.innerHTML = '<option value="">' + t("selectPayer") + '</option>';

  for (var i = 0; i < activePlayers.length; i++) {
    var uid = activePlayers[i];
    var nm = getUserName(uid);
    courtSel.innerHTML += '<option value="' + uid + '"' + (uid === prevCourt ? " selected" : "") + '>' + nm + '</option>';
    shuttleSel.innerHTML += '<option value="' + uid + '"' + (uid === prevShuttle ? " selected" : "") + '>' + nm + '</option>';
  }

  if (activePlayers.indexOf(prevCourt) >= 0) courtPayer = prevCourt;
  else { courtPayer = ""; courtSel.value = ""; }

  if (activePlayers.indexOf(prevShuttle) >= 0) shuttlePayer = prevShuttle;
  else { shuttlePayer = ""; shuttleSel.value = ""; }
}

function updateCourtCost() {
  var courtSel = document.getElementById("editCourtSelect");
  var durationEl = document.getElementById("editDuration");
  var displayEl = document.getElementById("courtCostDisplay");
  if (!courtSel || !durationEl || !displayEl) return;

  var selOpt = courtSel.options[courtSel.selectedIndex];
  var price = selOpt ? parseInt(selOpt.getAttribute("data-price")) || 0 : 0;
  var duration = parseInt(durationEl.value) || 0;
  var cost = price * duration;

  displayEl.innerHTML = '\u00D7 ' + price + 'K/hr = <span class="amount">' + cost + 'K \u20AD</span>';
}

/* ──────────────────────────────────────────────────────────
   Calculate & Save Split
   ────────────────────────────────────────────────────────── */

function calculateAndSaveSplit(sessionId) {
  var activePlayers = Object.keys(selectedPlayers);
  if (activePlayers.length < 2) { showToast("Need at least 2 players!"); return; }
  if (!courtPayer) { showToast(t("selectPayer") + " (" + t("courtPayer") + ")"); return; }
  if (sessionShuttlecocks.length > 0 && !shuttlePayer) { showToast(t("selectPayer") + " (" + t("shuttlePayer") + ")"); return; }

  // Court cost
  var courtSel = document.getElementById("editCourtSelect");
  var selOpt = courtSel ? courtSel.options[courtSel.selectedIndex] : null;
  var courtPrice = selOpt ? parseInt(selOpt.getAttribute("data-price")) || 0 : 0;
  var courtName = selOpt ? selOpt.getAttribute("data-name") || "" : "";
  var courtId = courtSel ? courtSel.value : "";
  var duration = parseInt((document.getElementById("editDuration") || {}).value) || 2;
  var courtCost = courtPrice * duration;

  // Shuttle total
  var shuttleTotal = 0;
  var scItems = [];
  for (var si = 0; si < sessionShuttlecocks.length; si++) {
    var sc = sessionShuttlecocks[si];
    var scTotal = Math.round((sc.qty / 12) * sc.price);
    scItems.push({ brand: sc.brand, qty: sc.qty, price: sc.price, total: scTotal });
    shuttleTotal += scTotal;
  }

  // Other costs (personal)
  var otherTotal = 0;
  var personalCosts = {};
  for (var oi = 0; oi < sessionOtherCosts.length; oi++) {
    var oc = sessionOtherCosts[oi];
    otherTotal += oc.amount;
    var pKey = oc.player || oc.uid || "";
    personalCosts[pKey] = (personalCosts[pKey] || 0) + oc.amount;
  }

  var n = activePlayers.length;
  var courtPP = Math.round(courtCost / n);
  var shuttlePP = shuttleTotal > 0 ? Math.round(shuttleTotal / n) : 0;
  var effectiveShuttlePayer = shuttlePayer || courtPayer;

  // Build splits object keyed by uid
  var splits = {};
  for (var pi = 0; pi < activePlayers.length; pi++) {
    var uid = activePlayers[pi];
    var personal = personalCosts[uid] || 0;
    splits[uid] = {
      court: courtPP,
      shuttle: shuttlePP,
      dinner: 0,
      personal: personal,
      total: courtPP + shuttlePP + personal,
      paid: uid === courtPayer || uid === effectiveShuttlePayer ? true : false
    };
  }

  var grandTotal = courtCost + shuttleTotal + otherTotal;

  var updateData = {
    courtId: courtId,
    courtName: courtName,
    courtCost: courtCost,
    duration: duration,
    courtPayer: courtPayer,
    shuttlePayer: effectiveShuttlePayer,
    shuttlecocks: scItems,
    shuttleTotal: shuttleTotal,
    otherCosts: sessionOtherCosts.slice(),
    otherTotal: otherTotal,
    grandTotal: grandTotal,
    splits: splits,
    status: "active"
  };

  dbUpdateSession(sessionId, updateData)
    .then(function () {
      showToast(t("calculateSplit") + " \u2714");
      showSessionDetail(sessionId);
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ──────────────────────────────────────────────────────────
   Payment Tracking
   ────────────────────────────────────────────────────────── */

function markPaid(sessionId, uid) {
  var updateData = {};
  updateData["splits." + uid + ".paid"] = true;

  dbUpdateSession(sessionId, updateData)
    .then(function () {
      showToast(t("paid") + "!");
      // Check if all paid
      dbGetSession(sessionId).then(function (session) {
        if (!session || !session.splits) return;
        var allPaid = true;
        var keys = Object.keys(session.splits);
        for (var i = 0; i < keys.length; i++) {
          if (!session.splits[keys[i]].paid) { allPaid = false; break; }
        }
        if (allPaid) {
          dbUpdateSession(sessionId, { status: "completed" });
        }
        showSessionDetail(sessionId);
      });
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ──────────────────────────────────────────────────────────
   Delete Session
   ────────────────────────────────────────────────────────── */

function deleteSessionById(sessionId) {
  if (!confirm(t("deleteConfirm"))) return;

  dbDeleteSession(sessionId)
    .then(function () {
      showToast(t("deleteSession") + " \u2714");
      goBack();
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ──────────────────────────────────────────────────────────
   Messenger Text Builder
   ────────────────────────────────────────────────────────── */

function buildMessengerText(session, dinner) {
  var s = session;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var dateStr = "";
  if (s.date) {
    var d = new Date(s.date + "T00:00:00");
    dateStr = d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  var startTime = s.time || s.startTime || "18:00";
  var startParts = startTime.split(":");
  var startH = parseInt(startParts[0]);
  var startM = parseInt(startParts[1] || "0");
  var endH = startH + (s.duration || 2);
  var startStr = String(startH).padStart(2, "0") + ":" + String(startM).padStart(2, "0");
  var endStr = String(endH).padStart(2, "0") + ":" + String(startM).padStart(2, "0");

  var splits = s.splits || {};
  var splitKeys = Object.keys(splits);
  var n = splitKeys.length;

  var lines = [];
  lines.push("\uD83C\uDFF8 Badminton \u2014 " + dateStr);
  lines.push("\uD83D\uDCCD " + (s.courtName || s.court || "") + " | " + startStr + "-" + endStr);
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");

  var courtCost = s.courtCost || 0;
  var courtPP = n > 0 ? Math.round(courtCost / n) : 0;
  var shuttleTotal = s.shuttleTotal || 0;
  var shuttlePP = n > 0 && shuttleTotal > 0 ? Math.round(shuttleTotal / n) : 0;

  var cpName = s.courtPayer ? getUserName(s.courtPayer) : "";
  var spName = s.shuttlePayer ? getUserName(s.shuttlePayer) : "";

  lines.push("\uD83C\uDFDF\uFE0F Court: " + Math.round(courtCost) + "K \u20AD (\u00F7" + n + " = " + courtPP + "K)");
  lines.push("   \uD83D\uDCB3 Paid by " + cpName);

  if (shuttleTotal > 0) {
    var cocksList = "";
    if (s.shuttlecocks) {
      var parts = [];
      for (var ci = 0; ci < s.shuttlecocks.length; ci++) {
        parts.push(s.shuttlecocks[ci].qty + " " + s.shuttlecocks[ci].brand);
      }
      cocksList = parts.join(", ");
    }
    lines.push("\uD83E\uDEB6 Shuttle: " + Math.round(shuttleTotal) + "K \u20AD (" + cocksList + ") (\u00F7" + n + " = " + shuttlePP + "K)");
    lines.push("   \uD83D\uDCB3 Paid by " + spName);
  }

  // Dinner
  if (dinner && dinner.totalBill > 0) {
    var dinerCount = dinner.diners ? dinner.diners.length : n;
    var dinnerPP = dinner.splitPerPerson || Math.round(dinner.totalBill / dinerCount);
    var dinnerPayerName = dinner.paidBy ? getUserName(dinner.paidBy) : "";
    lines.push("\uD83C\uDF7D\uFE0F Dinner: " + Math.round(dinner.totalBill) + "K \u20AD (\u00F7" + dinerCount + " = " + dinnerPP + "K)");
    lines.push("   \uD83D\uDCB3 Paid by " + dinnerPayerName);
  }

  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");

  // Calculate net debts between payers
  var debts = {}; // debts[creditor][debtor] = amount
  for (var di = 0; di < splitKeys.length; di++) {
    var pUid = splitKeys[di];
    if (pUid !== s.courtPayer) {
      if (!debts[s.courtPayer]) debts[s.courtPayer] = {};
      debts[s.courtPayer][pUid] = (debts[s.courtPayer][pUid] || 0) + courtPP;
    }
    if (shuttlePP > 0 && pUid !== s.shuttlePayer) {
      if (!debts[s.shuttlePayer]) debts[s.shuttlePayer] = {};
      debts[s.shuttlePayer][pUid] = (debts[s.shuttlePayer][pUid] || 0) + shuttlePP;
    }
    if (dinner && dinner.paidBy && dinner.diners) {
      var isDiner = dinner.diners.indexOf(pUid) >= 0;
      if (isDiner && pUid !== dinner.paidBy) {
        var dpp = dinner.splitPerPerson || 0;
        if (!debts[dinner.paidBy]) debts[dinner.paidBy] = {};
        debts[dinner.paidBy][pUid] = (debts[dinner.paidBy][pUid] || 0) + dpp;
      }
    }
  }

  // Net between payer pairs
  var cp = s.courtPayer;
  var sp = s.shuttlePayer;
  if (cp && sp && cp !== sp) {
    var cpOwesSp = (debts[sp] && debts[sp][cp]) || 0;
    var spOwesCp = (debts[cp] && debts[cp][sp]) || 0;
    if (cpOwesSp > spOwesCp) {
      if (debts[sp]) debts[sp][cp] = cpOwesSp - spOwesCp;
      if (debts[cp] && debts[cp][sp]) delete debts[cp][sp];
    } else if (spOwesCp > cpOwesSp) {
      if (debts[cp]) debts[cp][sp] = spOwesCp - cpOwesSp;
      if (debts[sp] && debts[sp][cp]) delete debts[sp][cp];
    } else {
      if (debts[cp] && debts[cp][sp]) delete debts[cp][sp];
      if (debts[sp] && debts[sp][cp]) delete debts[sp][cp];
    }
  }

  // Print debts
  var payerNames = Object.keys(debts);
  for (var pk = 0; pk < payerNames.length; pk++) {
    var payTo = payerNames[pk];
    var payToName = getUserName(payTo);
    lines.push("\uD83D\uDC49 Pay to " + payToName + ":");
    var debtors = Object.keys(debts[payTo]);
    for (var dk = 0; dk < debtors.length; dk++) {
      var amt = debts[payTo][debtors[dk]];
      if (amt > 0) {
        var debtorName = getUserName(debtors[dk]);
        var personalAmt = splits[debtors[dk]] ? (splits[debtors[dk]].personal || 0) : 0;
        var line = "  " + debtorName + " \u2014 " + Math.round(amt) + "K \u20AD";
        if (personalAmt > 0) line += " (+\uD83E\uDDC3" + Math.round(personalAmt) + "K)";
        lines.push(line);
      }
    }
  }

  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");

  var grandTotal = s.grandTotal || 0;
  if (dinner && dinner.totalBill) grandTotal += dinner.totalBill;
  lines.push("\uD83D\uDCB0 Total: " + Math.round(grandTotal) + "K \u20AD");

  return lines.join("\n");
}

function copyMessengerFromPreview() {
  var previewEl = document.getElementById("messengerPreview");
  if (!previewEl) return;

  var text = previewEl.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function () {
      showToast(t("copied"));
    });
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
