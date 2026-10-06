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
  setBreadcrumb([{ label: t("navSessions"), action: "showPage('sessions')" }, { label: t("myPayments") }]);
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
    html += '<div class="qr-strip" data-qr-uid="' + g.uid + '"><div class="qr-missing">' + t("loading") + '</div></div>';
    html += _paymentItems(g, "owe");
    html += '<button class="btn-primary" onclick="markGroupPaid(\'owe\',\'' + g.uid + '\')">✔ ' + t("markAllPaidTo").replace("{name}", getUserName(g.uid)) + '</button>';
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
      html += '<button class="btn-secondary" onclick="markGroupPaid(\'owed\',\'' + g.uid + '\')">✔ ' + t("markReceived") + '</button>';
      html += '</div>';
    });
  }

  el.innerHTML = html;
  _fillQrStrips(el);
}

function _paymentItems(g, side) {
  var html = '<div class="pay-items">';
  g.items.slice().sort(byLatest(function (x) { return x.session.date || ""; })).forEach(function (it) {
    html += '<div class="pay-item" onclick="showSessionDetail(\'' + it.session.id + '\')">' +
      '<div style="min-width:0"><div class="pay-item-date">' + fmtDate(it.session.date) + ' • ' + escapeHtml(it.session.courtName || "") + '</div>' +
      '<div class="person-breakdown">' + transferBreakdownHtml(it.transfer) + '</div></div>' +
      '<div class="pay-item-amount">' + fmtLAK(it.transfer.amount) + '</div></div>';
  });
  return html + '</div>';
}

/** All the receiver's QR codes, labelled by type */
function _fillQrStrips(root) {
  root.querySelectorAll(".qr-strip[data-qr-uid]").forEach(function (strip) {
    dbGetUserQr(strip.getAttribute("data-qr-uid")).then(function (qr) {
      var labels = { court: t("court"), shuttle: t("shuttlecocks"), dinner: t("dinnerAndOther") };
      var html = "";
      var main = qrFor(qr, null);
      if (main) html += '<div class="qr-strip-item"><img src="' + main + '" alt="QR" onclick="openImage(this.src)"><div>' + icon("qr", 12) + ' ' + t("qrMainShort") + '</div></div>';
      qrExtras(qr).forEach(function (x) {
        html += '<div class="qr-strip-item"><img src="' + x.url + '" alt="QR" onclick="openImage(this.src)">' +
          '<div>' + icon(COST_ICON[x.type], 12) + ' ' + labels[x.type] + '</div></div>';
      });
      strip.innerHTML = html || '<div class="qr-missing">' + t("noQr") + '</div>';
    });
  });
}

/** Mark every open transfer between me and `uid` as paid */
function markGroupPaid(side, uid) {
  var g = myPaymentSummary()[side][uid];
  if (!g) return;
  if (!confirm(t("confirmMarkPaid").replace("{amount}", fmtLAK(g.total)).replace("{name}", getUserName(uid)))) return;
  var bySession = {};
  g.items.forEach(function (it) {
    (bySession[it.session.id] = bySession[it.session.id] || { s: it.session, keys: [] }).keys.push(it.transfer.key);
  });
  Promise.all(Object.keys(bySession).map(function (id) { return settleTransfers(bySession[id].s, bySession[id].keys, true); }))
    .then(function () { showToast(t("paid") + " ✔"); })
    .catch(function (error) { showToast(_permError(error)); });
}
