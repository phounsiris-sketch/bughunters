/* ============================================================
   dinner.js — Dinner splitting with receipt upload
   Firebase Firestore COMPAT SDK (global `firebase` object)
   Depends on: firebase-config.js (fsdb, storage),
               auth.js (currentUser),
               db.js (dbSetDinner, dbGetSession, dbUpdateSession),
               storage.js (uploadDinnerReceipt),
               polls.js (getUserName),
               i18n.js (t),
               app.js (showToast, openModal, closeModal,
                       modalCallback, COLORS)
   ============================================================ */

/* ──────────────────────────────────────────────────────────
   Show Add Dinner Modal
   ────────────────────────────────────────────────────────── */

function showAddDinner(sessionId, sessionPlayers) {
  // sessionPlayers is an array of UIDs
  var players = [];
  if (typeof sessionPlayers === "string") {
    try { players = JSON.parse(sessionPlayers); } catch (e) { players = []; }
  } else if (Array.isArray(sessionPlayers)) {
    players = sessionPlayers;
  }

  // If empty, fetch from session
  if (players.length === 0) {
    dbGetSession(sessionId).then(function (session) {
      if (session && session.players) {
        showAddDinner(sessionId, session.players);
      }
    });
    return;
  }

  // Build payer select options
  var payerOpts = '<option value="">' + t("selectPayer") + '</option>';
  for (var pi = 0; pi < players.length; pi++) {
    var pName = getUserName(players[pi]);
    payerOpts += '<option value="' + players[pi] + '">' + pName + '</option>';
  }

  // Build diner chips — all active by default
  var dinerChips = '';
  for (var di = 0; di < players.length; di++) {
    var dName = getUserName(players[di]);
    var dColor = COLORS[di % COLORS.length];
    dinerChips +=
      '<div class="chip active" data-uid="' + players[di] + '" ' +
        'onclick="toggleDinerChip(this)" ' +
        'style="border-color:' + dColor + '">' +
        dName +
      '</div>';
  }

  document.getElementById("modalTitle").textContent = t("dinnerBill");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group">' +
      '<label class="form-label">' + t("totalBill") + ' (K)</label>' +
      '<input type="number" class="form-input" id="dinnerAmount" min="1" placeholder="e.g. 500">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("dinnerPayer") + '</label>' +
      '<select class="form-select" id="dinnerPayer">' + payerOpts + '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("uploadReceipt") + '</label>' +
      '<input type="file" class="form-input" id="dinnerReceipt" accept="image/*" capture="environment" ' +
        'style="padding:8px;font-size:13px">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("selectDiners") + '</label>' +
      '<div class="chips" id="dinerChips">' + dinerChips + '</div>' +
    '</div>';

  // Store sessionId for the save callback
  var _dinnerSessionId = sessionId;

  modalCallback = function () {
    saveDinner(_dinnerSessionId);
  };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Toggle Diner Chip
   ────────────────────────────────────────────────────────── */

function toggleDinerChip(el) {
  if (el.classList.contains("active")) {
    el.classList.remove("active");
  } else {
    el.classList.add("active");
  }
}

/* ──────────────────────────────────────────────────────────
   Save Dinner
   ────────────────────────────────────────────────────────── */

function saveDinner(sessionId) {
  var amountEl = document.getElementById("dinnerAmount");
  var payerEl = document.getElementById("dinnerPayer");
  var receiptEl = document.getElementById("dinnerReceipt");

  var amount = parseInt(amountEl ? amountEl.value : 0) || 0;
  var paidBy = payerEl ? payerEl.value : "";

  if (amount <= 0) {
    showToast(t("amount") + " > 0");
    return;
  }
  if (!paidBy) {
    showToast(t("selectPayer"));
    return;
  }

  // Collect active diners
  var dinerChipEls = document.querySelectorAll("#dinerChips .chip.active");
  var diners = [];
  for (var i = 0; i < dinerChipEls.length; i++) {
    var uid = dinerChipEls[i].getAttribute("data-uid");
    if (uid) diners.push(uid);
  }

  if (diners.length === 0) {
    showToast(t("selectDiners"));
    return;
  }

  var splitPerPerson = Math.round(amount / diners.length);
  var receiptFile = receiptEl && receiptEl.files && receiptEl.files.length > 0 ? receiptEl.files[0] : null;

  var _doSave = function (receiptUrl) {
    var dinnerData = {
      totalBill: amount,
      receiptUrl: receiptUrl || null,
      diners: diners,
      splitPerPerson: splitPerPerson,
      paidBy: paidBy,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    dbSetDinner(sessionId, dinnerData)
      .then(function () {
        // Update session splits to include dinner cost
        return dbGetSession(sessionId);
      })
      .then(function (session) {
        if (session && session.splits) {
          var splits = session.splits;
          for (var di = 0; di < diners.length; di++) {
            var dUid = diners[di];
            if (splits[dUid]) {
              splits[dUid].dinner = splitPerPerson;
              splits[dUid].total = (splits[dUid].court || 0) + (splits[dUid].shuttle || 0) + (splits[dUid].personal || 0) + splitPerPerson;
            }
          }
          return dbUpdateSession(sessionId, { splits: splits });
        }
      })
      .then(function () {
        closeModal();
        showToast(t("dinnerBill") + " \u2714");
        // Re-render session detail
        if (typeof showSessionDetail === "function") {
          showSessionDetail(sessionId);
        }
      })
      .catch(function (error) {
        showToast(error.message);
      });
  };

  if (receiptFile) {
    uploadDinnerReceipt(sessionId, receiptFile, function (result) {
      if (result.status === "done") {
        _doSave(result.url);
      } else if (result.status === "error") {
        showToast(result.error.message || "Upload failed");
      }
      // Ignore progress events
    });
  } else {
    _doSave(null);
  }
}

/* ──────────────────────────────────────────────────────────
   Render Dinner Section (returns HTML string)
   ────────────────────────────────────────────────────────── */

function renderDinnerSection(dinner) {
  if (!dinner) return "";

  var payerName = dinner.paidBy ? getUserName(dinner.paidBy) : "";
  var dinerCount = dinner.diners ? dinner.diners.length : 0;
  var splitPP = dinner.splitPerPerson || 0;

  var html = '<div class="card">';
  html += '<div class="card-title">\uD83C\uDF7D\uFE0F ' + t("dinnerBill") + '</div>';

  // Total and split info
  html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
  html += '<div style="font-size:14px">' + t("totalBill") + '</div>';
  html += '<div style="font-size:16px;font-weight:700;color:var(--orange)">' + Math.round(dinner.totalBill) + 'K \u20AD</div>';
  html += '</div>';

  html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
  html += '<div style="font-size:12px;color:var(--text-muted)">' + t("dinnerSplit") + ' (\u00F7' + dinerCount + ')</div>';
  html += '<div style="font-size:13px;font-weight:600">' + splitPP + 'K \u20AD ' + t("each") + '</div>';
  html += '</div>';

  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">';
  html += '\uD83D\uDCB3 ' + t("dinnerPayer") + ': <span style="color:var(--accent)">' + payerName + '</span>';
  html += '</div>';

  // Diner list
  if (dinner.diners && dinner.diners.length > 0) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">';
    for (var di = 0; di < dinner.diners.length; di++) {
      var dn = getUserName(dinner.diners[di]);
      var dc = COLORS[di % COLORS.length];
      html += '<div class="chip active" style="font-size:11px;padding:4px 10px;border-color:' + dc + '">' + dn + '</div>';
    }
    html += '</div>';
  }

  // Receipt image
  if (dinner.receiptUrl) {
    html += '<div style="margin-top:8px">';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">' + t("receipt") + '</div>';
    html += '<img src="' + dinner.receiptUrl + '" ' +
      'style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;cursor:pointer" ' +
      'onclick="window.open(\'' + dinner.receiptUrl + '\',\'_blank\')" ' +
      'alt="' + t("receipt") + '">';
    html += '</div>';
  }

  html += '</div>';
  return html;
}
