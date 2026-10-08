/* ============================================================
   people.js — Read-only profile of any player: photo, name, role,
   phone, payment QR codes, all-time stats, links to their activity.
   Open with showUserProfile(uid) — from names/photos around the app.
   ============================================================ */

var viewUserId = null;

function showUserProfile(uid, e) {
  if (e) e.stopPropagation();
  if (!uid) return;
  if (currentUser && uid === currentUser.uid) { showPage("profile"); return; }
  viewUserId = uid;
  showPage("user");
}

function loadUserProfile() {
  var box = document.getElementById("userContent");
  var uid = viewUserId;
  if (!box || !uid) return;
  var u = findUser(uid) || { id: uid };
  setBreadcrumb([{ label: t("players"), action: "goBack()" }, { label: getUserName(uid) }]);

  // Stats from every session / poll
  var played = 0, dinners = 0, joinVotes = 0, created = 0, paid = 0, share = 0;
  (lastSessions || []).forEach(function (s) {
    if ((s.players || []).indexOf(uid) >= 0) played++;
    if (s.dinner && (s.dinner.diners || []).indexOf(uid) >= 0) dinners++;
    if (s.calculated) {
      var L = computeLedger(s);
      paid += L.paid[uid] || 0;
      share += (L.shares[uid] && L.shares[uid].total) || 0;
    }
  });
  (lastPolls || []).forEach(function (p) {
    if (p.createdBy === uid) created++;
    if (_pollResponses(p)[uid] === 0) joinVotes++;
  });
  var showUp = joinVotes ? Math.round(Math.min(played, joinVotes) / joinVotes * 100) + "%" : "—";

  var html = '<div class="card profile-head">';
  if (typeof showPersonMenu === "function" && GROUPS_ON && !u.manual) {
    html += '<button class="person-menu-btn" aria-label="' + t("moreActions") + '" onclick="showPersonMenu(\'' + uid + '\')">\u2026</button>';
  }
  html += '<div class="avatar-edit">' + avatarZoomHtml(uid, 84) + '</div>';
  if (typeof myBlocked === "function" && myBlocked().indexOf(uid) >= 0) html += '<div class="perm-note" style="margin-top:8px">' + icon("lock", 12) + ' ' + t("youBlocked") + '</div>';
  html += '<div class="profile-name">' + escapeHtml(plainUserName(u)) + '</div>';
  html += '<div style="margin-top:8px">' + (u.manual ? '<span class="perm-badge">' + icon("manual", 12) + ' ' + t("manualPlayer") + '</span>' : _permBadges(userPerms(u))) + '</div>';
  if (u.phone && (typeof canSeeField !== "function" || canSeeField(u, "phone"))) {
    html += '<div class="user-contact"><a class="edit-btn" href="tel:' + escapeHtml(u.phone) + '">' + icon("phone", 14) + ' ' + escapeHtml(fmtPhone(u.phone)) + '</a>' +
      '<a class="edit-btn" href="https://wa.me/' + escapeHtml(u.phone.replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp</a></div>';
  }
  if (isSuperAdmin() && u.email) html += '<div class="profile-email" style="margin-top:6px">' + escapeHtml(u.email) + '</div>';
  html += '</div>';

  // Their story photos (if they let me see them)
  if (typeof storyCardHtml === "function" && !u.manual) html += storyCardHtml(uid, false);
  // About (only what they let me see) and their main gear
  if (typeof aboutViewHtml === "function") html += aboutViewHtml(u);

  // Stats
  html += '<div class="user-stats">' +
    _userStat("shuttle", played, t("playedWord")) +
    _userStat("dinner", dinners, t("dinnersWord")) +
    _userStat("polls", joinVotes, t("votedJoin")) +
    _userStat("check", showUp, t("showUp")) +
    _userStat("wallet", fmtShort(paid), t("paidForGroup")) +
    _userStat("sessions", fmtShort(share), t("totalSpent")) + '</div>';

  if (typeof gearCardHtml === "function" && !u.manual) html += gearCardHtml(uid, false);

  // Payment QR codes
  html += '<div class="card"><div class="card-title">' + icon("qr", 14) + ' ' + t("qrCodes") + '</div>' +
    '<div class="user-qr" id="userQr"><div class="empty-state" style="padding:8px">' + t("loading") + '</div></div></div>';

  // Links
  html += '<button class="card nav-card" onclick="dashTab=\'activity\';dashActivityUser=\'' + uid + '\';showPage(\'dashboard\')">' +
    '<span class="nav-card-icon">' + icon("dashboard", 22) + '</span>' +
    '<span class="nav-card-text"><b>' + t("seeActivity") + '</b><small>' + t("seeActivityHint") + '</small></span>' + icon("chevron", 16) + '</button>';
  if (isSuperAdmin() && !u.manual && userPerms(u) !== "super") {
    html += '<button class="btn-secondary" onclick="showPermsModal(\'' + uid + '\')">' + icon("key", 16) + ' ' + t("permissions") + '</button>';
  }
  if (u.manual && can("editConfig")) {
    html += '<button class="btn-secondary" onclick="showPlayerModal(\'' + uid + '\')">' + icon("pen", 16) + ' ' + t("editDetails") + '</button>';
  }
  box.innerHTML = html;

  dbGetUserQr(uid).then(function (qr) {
    var el = document.getElementById("userQr");
    if (!el || viewUserId !== uid) return;
    var labels = { court: t("court"), shuttle: t("shuttlecocks"), dinner: t("dinnerAndOther") };
    var main = qrFor(qr, null);
    var items = main ? [{ url: main, label: t("qrMainShort") }] : [];
    qrExtras(qr).forEach(function (x) { items.push({ url: x.url, label: labels[x.type] }); });
    el.innerHTML = items.length ? items.map(function (x) {
      return '<div class="user-qr-item"><img src="' + x.url + '" alt="QR" onclick="openImage(this.src)"><span>' + x.label + '</span></div>';
    }).join('') : '<div style="font-size:13px;color:var(--text-muted)">' + t("noQr") + '</div>';
  });
}

function _userStat(iconName, value, label) {
  return '<div class="user-stat">' + icon(iconName, 16) + '<b>' + value + '</b><span>' + label + '</span></div>';
}

/** Clickable name + photo used around the app */
function userLink(uid, size) {
  return '<span class="user-link" role="button" onclick="showUserProfile(\'' + uid + '\',event)">' + avatarHtml(uid, size || 22) + '<b>' + getUserName(uid) + '</b></span>';
}
