/* ============================================================
   payments.js — "My payments": everything I still owe, one total per
   person with their QR codes, and what others owe me.
   Depends on: sessions.js (lastSessions, openTransfers, settleTransfers,
               transferBreakdownHtml), db.js (dbGetUserQr, QR_TYPES),
               app.js / icons.js helpers
   ============================================================ */

/** { owe: { uid: group }, owed: { uid: group } } — unpaid transfers involving me */
function myPaymentSummary() {
  var me = currentUser ? currentUser.uid : null;
  var out = { owe: {}, owed: {}, oweTotal: 0, owedTotal: 0 };
  if (!me) return out;
  lastSessions.forEach(function (s) {
    openTransfers(s).forEach(function (tr) {
      var side = tr.from === me ? "owe" : tr.to === me ? "owed" : null;
      if (!side) return;
      var other = side === "owe" ? tr.to : tr.from;
      var g = out[side][other] || (out[side][other] = { uid: other, total: 0, items: [] });
      g.total += tr.amount;
      g.items.push({ session: s, transfer: tr });
      out[side + "Total"] += tr.amount;
    });
  });
  return out;
}

/** The "you still have a payment" notice for Home and Dashboard. It must be seen: orange, big amount, count badge, "Pay now".
    Only money owed TO me (nothing to pay) gets a calmer green version. One tap opens the Payments page, where each payment is
    confirmed one by one. Empty string when nothing is open. */
function payBoxHtml() {
  if (typeof myPaymentSummary !== "function" || typeof lastSessions === "undefined") return "";
  var sum = myPaymentSummary();
  var owe = _groupsSorted(sum.owe), owed = _groupsSorted(sum.owed);
  if (!owe.length && !owed.length) return "";
  var names = function (list) {
    var n = list.slice(0, 2).map(function (g) { return getUserName(g.uid); }).join(", ");
    return list.length > 2 ? n + " +" + (list.length - 2) : n;
  };
  var count = function (list) { return list.reduce(function (a, g) { return a + g.items.length; }, 0); };
  if (owe.length) {
    var n = count(owe);
    return '<button type="button" class="paynote" onclick="showMyPayments()">' +
      '<span class="paynote-ic">' + icon("wallet", 24) + '<em>' + n + '</em></span>' +
      '<span class="paynote-main"><small>' + t("payNoteOwe").replace("{n}", n) + '</small>' +
      '<b>' + fmtShort(sum.oweTotal) + '</b>' +
      '<small>' + t("payNoteTo").replace("{names}", names(owe)) + (owed.length ? ' \u00B7 ' + t("payNoteAlso").replace("{amount}", fmtShort(sum.owedTotal)) : '') + '</small></span>' +
      '<span class="paynote-cta">' + t("payNoteCta") + ' \u203A</span></button>';
  }
  var m = count(owed);
  return '<button type="button" class="paynote in" onclick="showMyPayments()">' +
    '<span class="paynote-ic">' + icon("users", 24) + '<em>' + m + '</em></span>' +
    '<span class="paynote-main"><small>' + t("payNoteWaiting") + '</small>' +
    '<b>' + fmtShort(sum.owedTotal) + '</b>' +
    '<small>' + t("payNoteFrom").replace("{names}", names(owed)) + '</small></span>' +
    '<span class="paynote-cta">' + t("payNoteCtaOwed") + ' \u203A</span></button>';
}

function showMyPayments() {
  showPage("payments");
}

function loadPayments() {
  loadSessions(); // make sure the session listener is running
  renderPayments();
}

function _groupsSorted(map) {
  return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
}

function renderPayments() {
  var el = document.getElementById("paymentsContent");
  if (!el) return;
  setBreadcrumb([{ label: t("navGames"), action: "showPage('games')" }, { label: t("myPayments") }]);
  var sum = myPaymentSummary();

  var html = '<div class="cost-breakdown">';
  html += '<div class="cost-card"><div class="cost-card-label">' + t("youOwe") + '</div><div class="cost-card-value" style="color:var(--orange)">' + fmtLAK(sum.oweTotal) + '</div></div>';
  html += '<div class="cost-card"><div class="cost-card-label">' + t("owedToYou") + '</div><div class="cost-card-value">' + fmtLAK(sum.owedTotal) + '</div></div>';
  html += '</div>';

  // What I need to pay — one card per person
  html += '<div class="section-title">' + icon("wallet", 14) + ' ' + t("toPayNow") + '</div>';
  var owe = _groupsSorted(sum.owe);
  if (!owe.length) {
    html += '<div class="card"><div class="empty-state" style="padding:16px"><div class="empty-icon">' + icon("check", 40) + '</div><div>' + t("allPaidUp") + '</div></div></div>';
  }
  owe.forEach(function (g) {
    html += '<div class="card pay-person">';
    html += '<div class="pay-person-head">' + avatarHtml(g.uid, 44) +
      '<div style="flex:1;min-width:0"><div class="pay-person-label">' + t("payTo") + '</div><div class="pay-person-name">' + getUserName(g.uid) + '</div></div>' +
      '<div class="pay-person-total">' + fmtLAK(g.total) + '</div></div>';
    html += '<div class="qr-strip" data-qr-uid="' + g.uid + '"><div class="qr-skel"><i></i><i></i></div></div>';
    html += _paymentItems(g, "owe");
    html += '</div>';
  });

  // Who owes me
  var owed = _groupsSorted(sum.owed);
  if (owed.length) {
    html += '<div class="section-title" style="margin-top:8px">' + icon("users", 14) + ' ' + t("owedToYou") + '</div>';
    owed.forEach(function (g) {
      html += '<div class="card pay-person">';
      html += '<div class="pay-person-head">' + avatarHtml(g.uid, 40) +
        '<div style="flex:1;min-width:0"><div class="pay-person-name">' + getUserName(g.uid) + '</div></div>' +
        '<div class="pay-person-total" style="color:var(--accent)">' + fmtLAK(g.total) + '</div></div>';
      html += _paymentItems(g, "owed");
      html += '</div>';
    });
  }

  el.innerHTML = html;
  _fillQrStrips(el);
}

function _paymentItems(g, side) {
  var html = '<div class="pay-items">';
  g.items.slice().sort(byLatest(function (x) { return x.session.date || ""; })).forEach(function (it) {
    html += '<div class="pay-item" onclick="showSessionDetail(\'' + jsq(it.session.id) + '\',\'bill\')">' +
      '<div style="min-width:0"><div class="pay-item-date">' + fmtDate(it.session.date) + ' • ' + escapeHtml(it.session.courtName || "") + '</div>' +
      '<div class="person-breakdown">' + transferBreakdownHtml(it.transfer) + '</div></div>' +
      '<div class="pay-item-right"><div class="pay-item-amount">' + fmtLAK(it.transfer.amount) + '</div>' +
      '<button type="button" class="pay-item-btn' + (side === "owe" ? '' : ' alt') + '" onclick="event.stopPropagation();markPaymentOne(\'' + side + '\',\'' + jsq(g.uid) + '\',\'' + jsq(it.session.id) + '\',\'' + it.transfer.key + '\')">' +
        icon("check", 14) + ' ' + t(side === "owe" ? "payItemPaid" : "payItemReceived") + '</button></div></div>';
  });
  return html + '</div>';
}

/** All the receiver's QR codes, labelled by type */
function _fillQrStrips(root) {
  root.querySelectorAll(".qr-strip[data-qr-uid]").forEach(function (strip) {
    strip.innerHTML = '<div class="qr-skel"><i></i><i></i></div>';
    dbGetUserQr(strip.getAttribute("data-qr-uid")).then(function (qr) {
      var labels = { court: t("court"), shuttle: t("shuttlecocks"), dinner: t("dinnerAndOther") };
      var html = "";
      var main = qrFor(qr, null);
      if (main) html += '<div class="qr-strip-item"><img src="' + escapeHtml(safeUrl(main)) + '" alt="QR" onclick="openImage(this.src)"><div>' + icon("qr", 12) + ' ' + t("qrMainShort") + '</div></div>';
      qrExtras(qr).forEach(function (x) {
        html += '<div class="qr-strip-item"><img src="' + escapeHtml(safeUrl(x.url)) + '" alt="QR" onclick="openImage(this.src)">' +
          '<div>' + icon(COST_ICON[x.type], 12) + ' ' + labels[x.type] + '</div></div>';
      });
      strip.innerHTML = html || '<div class="qr-missing">' + t("noQr") + '</div>';
    }).catch(function () {
      strip.innerHTML = '<button type="button" class="qr-retry" onclick="_fillQrStrips(this.parentNode.parentNode)">' + icon("qr", 14) + ' ' + t("qrRetry") + '</button>';
    });
  });
}

/** Confirm ONE payment (one session between me and `uid`) as paid / received — never several at once */
function markPaymentOne(side, uid, sessionId, key) {
  var g = myPaymentSummary()[side][uid];
  if (!g) return;
  var it = g.items.filter(function (x) { return x.session.id === sessionId && x.transfer.key === key; })[0];
  if (!it) return;
  askConfirm({
    title: t(side === "owe" ? "sheetPaidTitle" : "sheetReceivedTitle").replace("{name}", plainUserName(findUser(uid))),
    big: fmtLAK(it.transfer.amount),
    body: fmtDate(it.session.date) + (it.session.courtName ? " \u2022 " + it.session.courtName : ""),
    yes: t(side === "owe" ? "payItemPaid" : "payItemReceived")
  }, function () {
    settleTransfers(it.session, [key], true)
      .then(function () { showToast(t("paid") + " \u2714"); })
      .catch(function (error) { showToast(_permError(error)); });
  });
}
