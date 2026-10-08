/* ============================================================
   settings.js — Profile page (your own info, QR, notifications) and the
                 Configuration page: Players | Courts | Cocks | Players' QR | General
   Depends on: db.js (DB_CACHE, dbAddCourt, dbUpdateCourt, dbDeleteCourt,
                      dbAddShuttlecock, dbUpdateShuttlecock,
                      dbDeleteShuttlecock, dbUpdateUser, dbSetQrCodes),
               storage.js (readQrImage), auth.js (currentUser,
               currentUserProfile, logoutUser), i18n.js (t),
               app.js (showToast, openModal, closeModal, modalCallback,
                       escapeHtml, fmtLAK, fmtShort, COLORS)
   ============================================================ */

var SETTINGS_TABS = [['players', 'tabPlayers'], ['courts', 'tabCourts'], ['shuttle', 'tabShuttle'], ['qr', 'tabPlayersQr'], ['general', 'tabGeneral']];
var settingsTab = (function () {
  var v = null;
  try { v = localStorage.getItem('settingsTab'); } catch (e) {}
  return SETTINGS_TABS.some(function (x) { return x[0] === v; }) ? v : 'players';
})();

function setSettingsTab(tab) {
  settingsTab = tab;
  try { localStorage.setItem('settingsTab', tab); } catch (e) {}
  renderSettings();
}

function loadSettings() {
  qrExtrasOpen = false; // opens by itself when someone has extra QR codes
  // Data comes from the shared cache; it re-renders this page when it changes
  renderSettings();
}

function loadConfig() { qrExtrasOpen = false; renderSettings(); }

/** Tabs on the Configuration page (Players' QR only for editConfig) */
function _configTabs() {
  return SETTINGS_TABS.filter(function (x) { return x[0] !== 'qr' || can("editConfig"); });
}

/* ──────────────────────────────────────────────────────────
   Render
   ────────────────────────────────────────────────────────── */

function renderSettings() {
  var page = typeof currentPage !== "undefined" ? currentPage : "";
  if (page === "config") { _renderConfigPage(); return; }
  if (page === "profile") {
    var pc = document.getElementById("profileContent");
    if (!pc) return;
    // Don't wipe the profile form while the user is typing in it
    if (document.activeElement && /^pf/.test(document.activeElement.id || '')) return;
    setBreadcrumb([{ label: t("navSettings"), action: "showPage('settings')" }, { label: t("myProfile") }]);
    pc.innerHTML = _renderProfileTab();
    _fillQrCard();
    return;
  }
  var container = document.getElementById("settingsContent");
  if (container) container.innerHTML = _renderSettingsPage();
}

function _renderConfigPage() {
  var container = document.getElementById("configContent");
  if (!container) return;
  setBreadcrumb([{ label: t("navSettings"), action: "showPage('settings')" }, { label: t("configuration") }]);
  var tabs = _configTabs();
  if (!tabs.some(function (x) { return x[0] === settingsTab; })) settingsTab = 'players';

  var tabsEl = document.getElementById("configTabs");
  if (tabsEl) {
    var tHtml = '';
    for (var ti = 0; ti < tabs.length; ti++) {
      tHtml += '<button class="dash-tab' + (tabs[ti][0] === settingsTab ? ' active' : '') +
        '" style="padding:8px 4px;font-size:12px" onclick="setSettingsTab(\'' + tabs[ti][0] + '\')">' + t(tabs[ti][1]) + '</button>';
    }
    tabsEl.innerHTML = tHtml;
    tabsEl.classList.add("tabs-scroll");
    var activeTab = tabsEl.querySelector(".dash-tab.active");
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  if (settingsTab === 'general' && document.activeElement && document.activeElement.id === 'gMinPlayers') return;

  var html = '';
  if (settingsTab === 'players') html = _renderPlayersTab();
  else if (settingsTab === 'courts') html = _renderCourtsTab();
  else if (settingsTab === 'shuttle') html = _renderShuttleTab();
  else if (settingsTab === 'qr') html = _renderQrTab();
  else if (settingsTab === 'general') html = _renderGeneralTab();
  container.innerHTML = html;
  if (settingsTab === 'qr') _fillQrCard();
}

/* ---------- Profile: who you are, your QR codes ---------- */
function _renderProfileTab() {
  var prof = currentUserProfile || {};
  var email = prof.email || (currentUser && currentUser.email) || '';
  var html = '<div class="card profile-head">';
  html += '<div class="avatar-edit">' + avatarZoomHtml(currentUser ? currentUser.uid : '', 84) +
    '<button class="avatar-edit-btn" onclick="document.getElementById(\'avatarFile\').click()" aria-label="' + t("changePhoto") + '">' + icon("camera", 16) + '</button></div>';
  html += '<input type="file" id="avatarFile" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)">';
  html += '<div class="profile-name">' + escapeHtml(prof.displayName || '') + '</div>';
  html += '<div class="profile-email">' + escapeHtml(email) + '</div>';
  html += '<div style="margin-top:8px">' + _permBadges(isSuperAdmin() ? "super" : (prof.perms || {})) + '</div>';
  html += '<div style="margin-top:6px">' +
    '<button class="link-btn" style="display:inline;margin:0" onclick="document.getElementById(\'avatarFile\').click()">' + t("changePhoto") + '</button>' +
    (prof.avatarUrl ? ' \u2022 <button class="link-btn" style="display:inline;margin:0;color:var(--red)" onclick="removeAvatar()">' + t("removePhoto") + '</button>' : '') + '</div>';
  html += '</div>';

  // Personal details
  html += '<div class="card"><div class="card-title">' + icon("user", 14) + ' ' + t("myDetails") + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("displayName") + '</label>';
  html += '<input class="form-input" id="pfName" value="' + escapeHtml(prof.displayName || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("phone") + '</label>';
  html += phoneInputHtml("pfPhone", prof.phone) + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("emailLabel") + '</label>';
  html += '<input class="form-input" value="' + escapeHtml(email) + '" disabled></div>';
  html += '<button class="btn-primary" onclick="saveProfileSettings()">' + t("save") + '</button>';
  html += '</div>';

  // My payment QR codes — everyone manages their own
  qrOwner = currentUser ? currentUser.uid : null;
  html += _qrCardHtml(t("myQrCodes"), t("myQrHint"), null);
  return html;
}

/* ---------- Settings: notifications, appearance, language, configuration ---------- */
function _seg(options, current, onclickFn) {
  return '<div class="seg">' + options.map(function (o) {
    return '<button class="seg-btn' + (o[0] === current ? ' active' : '') + '" onclick="' + onclickFn + '(\'' + o[0] + '\')">' + o[1] + '</button>';
  }).join('') + '</div>';
}

function setThemeMode(mode) { if (mode !== currentTheme) toggleTheme(); renderSettings(); }
function setLanguage(lang) { if (lang !== currentLang) toggleLang(); renderSettings(); }

function _settingsSection(key) {
  return '<div class="settings-section">' + t(key) + '</div>';
}

function _navCard(onclick, iconName, title, hint) {
  return '<button class="card nav-card" onclick="' + onclick + '">' +
    '<span class="nav-card-icon">' + icon(iconName, 22) + '</span>' +
    '<span class="nav-card-text"><b>' + title + '</b><small>' + hint + '</small></span>' +
    icon("chevron", 16) + '</button>';
}

/* Settings (header gear): who I am first, then app, then group tools */
function _renderSettingsPage() {
  var prof = currentUserProfile || {};
  var uid = currentUser ? currentUser.uid : '';
  var html = '';

  // 1. Me — tap to edit photo, details and payment QR
  html += '<button class="card nav-card me-card" onclick="showPage(\'profile\')">' +
    '<span class="me-avatar">' + avatarHtml(uid, 56) + '</span>' +
    '<span class="nav-card-text"><b class="me-name">' + escapeHtml(prof.displayName || '') + '</b>' +
    '<small>' + t("myProfileHint") + '</small>' +
    '<span class="me-badges">' + _permBadges(isSuperAdmin() ? "super" : (prof.perms || {})) + '</span></span>' +
    icon("chevron", 16) + '</button>';

  // 2. App
  html += _settingsSection("secApp");
  if (typeof pushSettingsCard === "function") html += pushSettingsCard();
  html += '<div class="card"><div class="card-title">' + icon("dashboard", 14) + ' ' + t("appearance") + '</div>';
  html += '<div class="settings-label" style="margin-bottom:8px">' + t("theme") + '</div>';
  html += _seg([["dark", icon("moon", 14) + " " + t("themeDark")], ["light", icon("sun", 14) + " " + t("themeLight")]], currentTheme, "setThemeMode");
  var light = currentTheme === 'light';
  html += '<div class="settings-label" style="margin:14px 0 0">' + t(light ? "lightStyle" : "darkStyle") + '</div>';
  html += '<div class="palette-grid">';
  (light ? LIGHT_PALETTES : PALETTES).forEach(function (p) {
    var on = (light ? currentLightPalette : currentPalette) === p[0];
    html += '<button class="palette-opt' + (on ? ' active' : '') + '" onclick="setPalette(\'' + p[0] + '\')"' + (on ? ' aria-pressed="true"' : '') + '>' +
      '<span class="palette-swatch">' + p[2].map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') +
      (on ? '<i class="palette-check">' + icon("check", 11) + '</i>' : '') + '</span>' +
      '<span class="palette-name">' + t(p[1]) + '</span></button>';
  });
  html += '</div></div>';

  // Language
  html += '<div class="card"><div class="card-title">' + icon("globe", 14) + ' ' + t("language") + '</div>';
  html += _seg([["en", "English"], ["la", "ລາວ"]], currentLang, "setLanguage");
  html += '</div>';

  // 3. Group
  html += _settingsSection("secGroup");
  html += _navCard("showPage('config')", "settings", t("configuration"), t("configurationHint"));
  html += _navCard("showPage('trash')", "trash", t("recentlyDeleted"), t("recentlyDeletedHint"));
  html += _renderMergeCard();

  // 4. Sign out
  html += '<button class="btn-danger" style="margin-top:8px" onclick="logoutUser()">' + t("logout") + '</button>';
  html += '<div class="app-version">Godsmash ' + APP_VERSION + '</div>';
  return html;
}

function handleAvatarUpload(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  showToast(t("loading"));
  readAvatarImage(file, function (err, dataUrl) {
    input.value = "";
    if (err) { showToast(err.message); return; }
    dbUpdateUser(currentUser.uid, { avatarUrl: dataUrl })
      .then(function () { currentUserProfile.avatarUrl = dataUrl; showToast(t("changePhoto") + " \u2714"); renderSettings(); })
      .catch(function (error) { showToast(_permError(error)); });
  });
}

function removeAvatar() {
  dbUpdateUser(currentUser.uid, { avatarUrl: null })
    .then(function () { currentUserProfile.avatarUrl = null; renderSettings(); })
    .catch(function (error) { showToast(_permError(error)); });
}

/** Small badges listing what someone may do */
function _permBadges(perms) {
  if (perms === "super") return '<span class="perm-badge super">' + icon("crown", 12) + ' ' + t("superAdmin") + '</span>';
  var on = PERMISSIONS.filter(function (p) { return perms[p.key]; });
  if (!on.length) return '<span class="perm-badge">' + t("roleMember") + '</span>';
  return on.map(function (p) { return '<span class="perm-badge on">' + icon(p.icon, 12) + ' ' + t("perm_" + p.key) + '</span>'; }).join(' ');
}

function saveProfileSettings() {
  var name = document.getElementById("pfName").value.trim();
  var ph = readPhone("pfPhone");
  if (!ph.ok) { showToast(t("phoneInvalid")); return; }
  var phone = ph.value;
  if (!name) { showToast(t("displayName")); return; }

  dbUpdateUser(currentUser.uid, { displayName: name, phone: phone || null })
    .then(function () {
      currentUserProfile.displayName = name;
      currentUserProfile.phone = phone || null;
      if (document.activeElement) document.activeElement.blur();
      showToast(t("profileSaved") + " ✔");
      renderSettings();
    })
    .catch(function (error) { showToast(_permError(error)); });
}

/* ---------- Players ---------- */
function _appUrl() {
  return window.location.origin + window.location.pathname;
}

function _renderPlayersTab() {
  var users = DB_CACHE.users;
  var html = '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("playerRoster") + ' (' + users.length + ')</div>';
  if (!users.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var isMe = currentUser && u.id === currentUser.uid;
    html += '<div class="settings-item"><div class="settings-left" role="button" style="cursor:pointer" onclick="showUserProfile(\'' + u.id + '\',event)">';
    html += avatarHtml(u.id, 34);
    html += '<div><div class="settings-label">' + escapeHtml(u.displayName || '') +
      (isMe ? ' <span style="font-size:11px;color:var(--accent)">(' + t("you") + ')</span>' : '') + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' +
      (u.manual ? icon("manual", 12) + ' ' + t("manualPlayer") : icon("mail", 12) + ' ' + t("registeredPlayer")) +
      (u.phone ? ' \u2022 ' + icon("phone", 12) + ' ' + escapeHtml(fmtPhone(u.phone)) : '') + '</div>';
    if (!u.manual) html += '<div style="margin-top:4px">' + _permBadges(userPerms(u)) + '</div>';
    html += '</div></div>';
    if (!u.manual && isSuperAdmin() && userPerms(u) !== "super") {
      html += '<button class="edit-btn" onclick="showPermsModal(\'' + u.id + '\')">' + icon("key", 14) + ' ' + t("permissions") + '</button>';
    }
    if (u.manual && can("editConfig")) {
      html += '<div style="display:flex;gap:8px">';
      html += '<button class="edit-btn" onclick="showPlayerModal(\'' + u.id + '\')">' + icon("pen", 16) + '</button>';
      html += '<button class="delete-btn" onclick="deleteManualPlayer(\'' + u.id + '\')">' + icon("trash", 16) + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  if (can("editConfig")) {
    html += '<button class="add-btn-dashed" onclick="showPlayerModal(null)">+ ' + t("addPlayer") + '</button>';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + t("manualPlayerHint") + '</div>';
  }
  html += '</div>';

  html += '<div class="card"><div class="card-title">' + icon("mail", 14) + ' ' + t("invitePlayers") + '</div>';
  html += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">' + t("inviteHint") + '</div>';
  html += '<input class="form-input" value="' + escapeHtml(_appUrl()) + '" readonly onclick="this.select()" style="margin-bottom:8px">';
  html += '<button class="btn-primary" onclick="copyInviteLink()">' + t("copyInvite") + '</button>';
  html += '</div>';
  return html;
}

/** Super Admin: switch permissions on/off for a player */
function showPermsModal(uid) {
  var u = dbFindById(DB_CACHE.users, uid);
  if (!u || !isSuperAdmin()) return;
  var perms = u.perms || {};
  var rows = '';
  PERMISSIONS.forEach(function (p) {
    rows += '<label class="perm-row"><input type="checkbox" data-perm="' + p.key + '"' + (perms[p.key] ? ' checked' : '') + '>' +
      '<div><div style="font-weight:600">' + icon(p.icon, 14) + ' ' + t("perm_" + p.key) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted)">' + t("permDesc_" + p.key) + '</div></div></label>';
  });
  document.getElementById("modalTitle").textContent = t("permissions") + " \u2014 " + (u.displayName || "");
  document.getElementById("modalBody").innerHTML =
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">' + t("permIntro") + '</div>' + rows;
  modalCallback = function () {
    var data = { perms: {} };
    document.querySelectorAll("#modalBody input[data-perm]").forEach(function (cb) { data.perms[cb.getAttribute("data-perm")] = cb.checked; });
    fsdb.collection("users").doc(uid).set(data, { merge: true })
      .then(function () { closeModal(); showToast(t("save") + " \u2714"); })
      .catch(function (error) { showToast(_permError(error)); });
  };
  openModal();
}

function showPlayerModal(uid, onSaved) {
  var u = uid ? dbFindById(DB_CACHE.users, uid) : null;
  document.getElementById("modalTitle").textContent = u ? t("editPlayer") : t("addPlayer");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("name") + '</label>' +
      '<input class="form-input" id="mPlayerName" value="' + escapeHtml(u ? u.displayName : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("phone") + '</label>' +
      phoneInputHtml("mPlayerPhone", u && u.phone) + '</div>';

  modalCallback = function () {
    var name = document.getElementById("mPlayerName").value.trim();
    var ph = readPhone("mPlayerPhone");
    if (!ph.ok) { showToast(t("phoneInvalid")); return; }
    var phone = ph.value;
    if (!name) { showToast(t("name")); return; }

    // Avoid two roster entries with the same name
    for (var i = 0; i < DB_CACHE.users.length; i++) {
      var other = DB_CACHE.users[i];
      if (other.id !== uid && (other.displayName || '').toLowerCase() === name.toLowerCase()) {
        showToast(t("playerExists"));
        return;
      }
    }

    var op = u
      ? dbUpdateUser(u.id, { displayName: name, phone: phone, manual: true }).then(function () { return { id: u.id }; })
      : dbAddManualPlayer({ displayName: name, phone: phone, email: null, avatarUrl: null });
    op.then(function (ref) { closeModal(); showToast(name + " \u2714"); if (onSaved) onSaved(ref.id); })
      .catch(function (error) { showToast(_permError(error)); });
  };
  openModal();
}

function deleteManualPlayer(uid) {
  var u = dbFindById(DB_CACHE.users, uid);
  if (!u || !confirm(t("delete") + " " + (u.displayName || "") + "?")) return;
  trashDoc("player", "users", uid, plainUserName(u))
    .catch(function (error) { showToast(_permError(error)); });
}

function copyInviteLink() {
  var text = t("inviteMessage") + "\n" + _appUrl();
  if (navigator.share) {
    navigator.share({ title: "Godsmash", text: text }).catch(function () {});
    return;
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function () { showToast(t("copied")); });
  } else {
    showToast(_appUrl());
  }
}

/* ---------- Courts ---------- */
function _renderCourtsTab() {
  var courts = DB_CACHE.courts;
  var html = '<div class="card"><div class="card-title">' + icon("court", 14) + ' ' + t("courts") + '</div>';
  if (!courts.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noCourtsYet") + '</div>';
  for (var i = 0; i < courts.length; i++) {
    var c = courts[i];
    html += '<div class="settings-item">';
    html += '<div style="flex:1;min-width:0;cursor:pointer" onclick="showCourtModal(\'' + c.id + '\')"><div class="settings-label">' + escapeHtml(c.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' + icon("pin", 12) + ' ' + escapeHtml(c.location || (hasPin(c) ? '' : '—')) +
      (hasPin(c) ? ' ' + courtMapLink(c) : ' <span class="no-pin">' + t("noPinYet") + '</span>') + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<div class="settings-value">' + fmtLAK(c.pricePerHour) + '/h</div>';
    if (can("editConfig")) {
      html += '<button class="edit-btn" onclick="showCourtModal(\'' + c.id + '\')">' + icon("pen", 16) + '</button>';
      html += '<button class="delete-btn" onclick="deleteSettingsCourt(\'' + c.id + '\')">' + icon("trash", 16) + '</button>';
    }
    html += '</div></div>';
  }
  if (can("editConfig")) html += '<button class="add-btn-dashed" onclick="showCourtModal(null)">+ ' + t("addCourt") + '</button>';
  html += '</div>';
  return html;
}

function showCourtModal(courtId, onSaved) {
  var c = courtId ? dbFindById(DB_CACHE.courts, courtId) : null;
  document.getElementById("modalTitle").textContent = c ? t("editCourt") : t("addCourt");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("courtName") + '</label>' +
      '<input class="form-input" id="mCourtName" value="' + escapeHtml(c ? c.name : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("location") + '</label>' +
      '<input class="form-input" id="mCourtLoc" placeholder="' + t("addressHint") + '" value="' + escapeHtml(c ? c.location || '' : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("mapPin") + '</label>' + mapPickerHtml("courtPin") + '</div>' +
    '<div class="form-group"><label class="form-label">' + t("pricePerHour") + ' (\u20AD)</label>' +
      moneyInput('mCourtPrice', c ? c.pricePerHour : 0, '') + '</div>';

  modalCallback = function () {
    var data = {
      name: document.getElementById("mCourtName").value.trim(),
      location: document.getElementById("mCourtLoc").value.trim(),
      pricePerHour: parseMoney(document.getElementById("mCourtPrice").value)
    };
    var pin = getMapPick("courtPin");
    data.lat = pin.lat;
    data.lng = pin.lng;
    if (!data.name || data.pricePerHour <= 0) {
      showToast(t("courtName") + " & " + t("pricePerHour"));
      return;
    }
    var op = c ? dbUpdateCourt(c.id, data).then(function () { return { id: c.id }; })
               : dbAddCourt(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    op.then(function (ref) { closeMapPicker("courtPin"); closeModal(); showToast(t("save") + " ✔"); if (onSaved) onSaved(ref.id); })
      .catch(function (error) { showToast(_permError(error)); });
  };
  openModal();
  initMapPicker("courtPin", c ? c.lat : null, c ? c.lng : null);
}

function deleteSettingsCourt(id) {
  var c = dbFindById(DB_CACHE.courts, id);
  if (!confirm(t("delete") + (c ? " " + c.name : "") + "?")) return;
  trashDoc("court", "courts", id, c ? c.name : t("court"))
    .catch(function (error) { showToast(_permError(error)); });
}

/* ---------- Shuttlecock brands ---------- */
function _renderShuttleTab() {
  var brands = DB_CACHE.shuttlecocks;
  var html = '<div class="card"><div class="card-title">' + icon("shuttle", 14) + ' ' + t("shuttlecockBrands") + '</div>';
  if (!brands.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  for (var i = 0; i < brands.length; i++) {
    var b = brands[i];
    var cocks = b.cocksPerTube || 12;
    var tube = b.pricePerTube || 0;
    html += '<div class="settings-item">';
    html += '<div style="flex:1;min-width:0;cursor:pointer" onclick="showShuttleModal(\'' + b.id + '\')"><div class="settings-label">' + escapeHtml(b.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' + cocks + ' ' + t("cocks") + ' / ' + t("tube") + ' • ' + fmtLAK(tube / cocks) + ' / ' + t("cock") + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<div class="settings-value">' + fmtLAK(tube) + '/' + t("tube") + '</div>';
    if (can("editConfig")) {
      html += '<button class="edit-btn" onclick="showShuttleModal(\'' + b.id + '\')">' + icon("pen", 16) + '</button>';
      html += '<button class="delete-btn" onclick="deleteSettingsShuttlecock(\'' + b.id + '\')">' + icon("trash", 16) + '</button>';
    }
    html += '</div></div>';
  }
  if (can("editConfig")) html += '<button class="add-btn-dashed" onclick="showShuttleModal(null)">+ ' + t("addShuttlecockBrand") + '</button>';
  html += '</div>';
  return html;
}

function showShuttleModal(brandId, onSaved) {
  var b = brandId ? dbFindById(DB_CACHE.shuttlecocks, brandId) : null;
  document.getElementById("modalTitle").textContent = b ? t("editBrand") : t("addShuttlecockBrand");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("brandName") + '</label>' +
      '<input class="form-input" id="mBrandName" value="' + escapeHtml(b ? b.name : '') + '"></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">' + t("pricePerTube") + ' (\u20AD)</label>' +
        moneyInput('mBrandPrice', b ? b.pricePerTube : 0, '') + '</div>' +
      '<div class="form-group"><label class="form-label">' + t("cocksPerTube") + '</label>' +
        '<input type="number" class="form-input" id="mBrandCocks" min="1" value="' + (b ? b.cocksPerTube || 12 : 12) + '"></div>' +
    '</div>';

  modalCallback = function () {
    var data = {
      name: document.getElementById("mBrandName").value.trim(),
      pricePerTube: parseMoney(document.getElementById("mBrandPrice").value),
      cocksPerTube: parseInt(document.getElementById("mBrandCocks").value, 10) || 0
    };
    if (!data.name || data.pricePerTube <= 0 || data.cocksPerTube <= 0) {
      showToast(t("brandName") + " & " + t("pricePerTube"));
      return;
    }
    var op = b ? dbUpdateShuttlecock(b.id, data).then(function () { return { id: b.id }; })
               : dbAddShuttlecock(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    op.then(function (ref) { closeMapPicker("courtPin"); closeModal(); showToast(t("save") + " ✔"); if (onSaved) onSaved(ref.id); })
      .catch(function (error) { showToast(_permError(error)); });
  };
  openModal();
  initMapPicker("courtPin", c ? c.lat : null, c ? c.lng : null);
}

function deleteSettingsShuttlecock(id) {
  var b = dbFindById(DB_CACHE.shuttlecocks, id);
  var name = b ? (b.name || b.brand || "") : "";
  if (!confirm(t("delete") + (name ? " " + name : "") + "?")) return;
  trashDoc("shuttle", "shuttlecocks", id, name || t("shuttlecocks"))
    .catch(function (error) { showToast(_permError(error)); });
}

/* ---------- QR codes: up to 3 per person (court, cocks, dinner & other) ---------- */
var qrOwner = null;       // whose QR codes are being edited right now
var configQrOwner = null; // manual player picked on Configuration → Players' QR

/** Manual players (they can't sign in to upload their own) — editConfig */
function _qrManualPlayers() {
  if (!can("editConfig")) return [];
  return DB_CACHE.users.filter(function (u) { return u.manual; });
}

function _renderQrTab() {
  var people = _qrManualPlayers();
  if (!people.length) {
    qrOwner = null;
    return '<div class="card"><div class="card-title">' + icon("qr", 14) + ' ' + t("tabPlayersQr") + '</div>' +
      '<div style="font-size:13px;color:var(--text-muted)">' + t("noManualPlayers") + '</div></div>';
  }
  if (!configQrOwner || !people.some(function (u) { return u.id === configQrOwner; })) configQrOwner = people[0].id;
  qrOwner = configQrOwner;
  var sel = '<div class="form-group"><label class="form-label">' + t("qrOwner") + '</label><select class="form-select" onchange="configQrOwner=this.value;renderSettings()">';
  people.forEach(function (u) {
    sel += '<option value="' + u.id + '"' + (u.id === qrOwner ? ' selected' : '') + '>' + escapeHtml(plainUserName(u)) + ' · ' + t("manualPlayer") + '</option>';
  });
  sel += '</select></div>';
  return _qrCardHtml(t("tabPlayersQr"), t("qrManualHint"), sel);
}

var qrExtrasOpen = false;

/** One QR row (thumb, title, status, upload / delete) */
function _qrRowHtml(type, title, iconName, big) {
  var html = '<div class="qr-row' + (big ? ' qr-main' : '') + '" id="qrCell_' + type + '">';
  html += '<div class="qr-thumb" id="qrImg_' + type + '"><div class="qr-missing">' + icon("qr", 22) + '</div></div>';
  html += '<div class="qr-row-info"><div class="qr-row-title">' + icon(iconName, 16) + ' ' + title + '</div>' +
    '<div class="qr-row-status" id="qrStatus_' + type + '">' + t("loading") + '</div></div>';
  html += '<input type="file" id="qrFile_' + type + '" accept="image/*" style="display:none" onchange="handleQrUpload(\'' + type + '\',this)">';
  html += '<div class="qr-row-actions">';
  html += '<button class="edit-btn icon-btn" onclick="document.getElementById(\'qrFile_' + type + '\').click()" aria-label="' + t("uploadQR") + '">' + icon("camera", 18) + '<span>' + t("uploadQR") + '</span></button>';
  html += '<button class="delete-btn icon-btn" id="qrDel_' + type + '" style="display:none" onclick="removeQr(\'' + type + '\')" aria-label="' + t("delete") + '">' + icon("trash", 18) + '</button>';
  return html + '</div></div>';
}

/** QR card of `qrOwner`: one main QR, optional extras per payment type */
function _qrCardHtml(title, hint, extra) {
  var html = '<div class="card"><div class="card-title">' + icon("qr", 14) + ' ' + title + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + hint + '</div>';
  if (extra) html += extra;
  html += '<div id="qrSlots" class="qr-list">' + _qrRowHtml("main", t("qrMain"), "qr", true) + '</div>';
  var labels = { court: t("court"), shuttle: t("shuttlecocks"), dinner: t("dinnerAndOther") };
  var icons = { court: "court", shuttle: "shuttle", dinner: "dinner" };
  html += '<button class="link-btn qr-extras-toggle" id="qrExtrasToggle" onclick="toggleQrExtras()">' + (qrExtrasOpen ? '− ' : '+ ') + t("qrExtrasToggle") + '</button>';
  html += '<div id="qrExtras" class="qr-list" style="' + (qrExtrasOpen ? '' : 'display:none') + '">';
  html += '<div style="font-size:11px;color:var(--text-muted)">' + t("qrExtrasHint") + '</div>';
  QR_TYPES.forEach(function (type) { html += _qrRowHtml(type, labels[type], icons[type], false); });
  html += '</div>';
  return html + '</div>';
}

function toggleQrExtras() {
  qrExtrasOpen = !qrExtrasOpen;
  var box = document.getElementById("qrExtras"), btn = document.getElementById("qrExtrasToggle");
  if (box) box.style.display = qrExtrasOpen ? "" : "none";
  if (btn) btn.textContent = (qrExtrasOpen ? '− ' : '+ ') + t("qrExtrasToggle");
}

/** Fill the images once the card is in the DOM. Older 3-slot uploads are
    moved over once: the first one becomes the main QR. */
function _fillQrCard() {
  var owner = qrOwner;
  if (!owner || !document.getElementById("qrSlots")) return;
  dbGetUserQr(owner).then(function (qr) {
    if (owner !== qrOwner) return;
    if (!qr.main && (qr.court || qr.shuttle || qr.dinner)) {
      var main = qr.court || qr.shuttle || qr.dinner;
      var upd = { main: main };
      QR_TYPES.forEach(function (k) { if (qr[k] === main) upd[k] = null; });
      delete _qrCache[owner];
      fsdb.collection("qrcodes").doc(owner).set(upd, { merge: true })
        .then(function () { if (owner === qrOwner) _fillQrCard(); }).catch(function () {});
      return;
    }
    if (qrExtras(qr).length && !qrExtrasOpen) toggleQrExtras();
    ["main"].concat(QR_TYPES).forEach(function (type) {
      var img = document.getElementById("qrImg_" + type);
      var del = document.getElementById("qrDel_" + type);
      if (!img) return;
      img.innerHTML = qr[type] ? '<img src="' + qr[type] + '" alt="QR" onclick="openImage(this.src)">' : '<div class="qr-missing">' + icon("qr", 22) + '</div>';
      if (del) del.style.display = qr[type] ? "" : "none";
      var st = document.getElementById("qrStatus_" + type);
      if (st) {
        st.textContent = qr[type] ? t("qrUploaded") : (type === "main" ? t("noQr") : t("qrUsesMain"));
        st.classList.toggle("ok", !!qr[type]);
      }
    });
  });
}

function handleQrUpload(type, input) {
  var file = input.files && input.files[0];
  if (!file || !qrOwner) return;
  showToast(t("loading"));
  readQrImage(file, function (err, dataUrl) {
    input.value = "";
    if (err) { showToast(err.message); return; }
    dbSetUserQr(qrOwner, type, dataUrl)
      .then(function () { showToast(t("uploadQR") + " ✔"); renderSettings(); })
      .catch(function (error) {
        showToast(error && error.code === "permission-denied" ? t("qrPermissionError") : _permError(error));
      });
  });
}

function removeQr(type) {
  if (!qrOwner || !confirm(t("delete") + "?")) return;
  var labels = { main: t("qrMainShort"), court: t("court"), shuttle: t("shuttlecocks"), dinner: t("dinnerAndOther") };
  var owner = qrOwner;
  trashField("qr", "qrcodes", owner, type, "QR " + labels[type] + " — " + getUserName(owner))
    .then(function () { delete _qrCache[owner]; renderSettings(); })
    .catch(function (error) { showToast(_permError(error)); });
}

/* ---------- General: minimum players, default payers ---------- */
function _renderGeneralTab() {
  var users = DB_CACHE.users;
  var opts = function (selected) {
    var h = '<option value="">' + t("noDefault") + '</option>';
    users.forEach(function (u) {
      h += '<option value="' + u.id + '"' + (u.id === selected ? ' selected' : '') + '>' + escapeHtml(plainUserName(u)) + '</option>';
    });
    return h;
  };
  var locked = !can("editConfig");
  var html = (locked ? '<div class="perm-note">' + icon("lock", 14) + ' ' + t("noPermission") + '</div><fieldset class="perm-fs perm-lock" disabled>' : '<fieldset class="perm-fs">') +
    '<div class="card"><div class="card-title">' + icon("settings", 14) + ' ' + t("tabGeneral") + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("minPlayersLabel") + '</label>';
  html += '<input type="number" class="form-input" id="gMinPlayers" min="2" max="30" value="' + minPlayersSetting() + '" onchange="saveAppSetting(\'minPlayers\', Math.max(2, parseInt(this.value, 10) || 4))">';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + t("minPlayersHint") + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + icon("court", 14) + ' ' + t("defaultCourtPayer") + '</label>';
  html += '<select class="form-select" onchange="saveAppSetting(\'defaultCourtPayer\', this.value)">' + opts(appSetting("defaultCourtPayer", "")) + '</select></div>';
  html += '<div class="form-group"><label class="form-label">' + icon("shuttle", 14) + ' ' + t("defaultShuttlePayer") + '</label>';
  html += '<select class="form-select" onchange="saveAppSetting(\'defaultShuttlePayer\', this.value)">' + opts(appSetting("defaultShuttlePayer", "")) + '</select></div>';
  html += '<div style="font-size:11px;color:var(--text-muted)">' + t("defaultPayerHint") + '</div>';
  html += '</div></fieldset>';

  // Super Admin only: wipe polls + sessions before going live
  if (isSuperAdmin()) {
    html += '<div class="card danger-card"><div class="card-title">' + icon("trash2", 14) + ' ' + t("dangerZone") + '</div>';
    html += '<div style="font-size:13px;margin-bottom:10px">' + t("resetHint") + '</div>';
    html += '<div class="form-group"><label class="form-label">' + t("resetTypeDelete") + '</label>' +
      '<input class="form-input" id="resetConfirm" autocomplete="off" placeholder="DELETE"></div>';
    html += '<button class="btn-danger" onclick="resetPollsAndSessions()">' + icon("trash", 16) + ' ' + t("resetButton") + '</button>';
    html += '</div>';
  }
  return html;
}

function saveAppSetting(key, value) {
  var data = {};
  data[key] = value;
  dbSetAppSettings(data)
    .then(function () { showToast(t("save") + " ✔"); })
    .catch(function (error) { showToast(_permError(error)); });
}

/* ---------- Merge a manual player into my account (optional) ---------- */
function _renderMergeCard() {
  var manual = DB_CACHE.users.filter(function (u) { return u.manual; });
  if (!manual.length || !currentUser || !isSuperAdmin()) return '';
  var html = '<div class="card"><div class="card-title">' + icon("link", 14) + ' ' + t("mergeTitle") + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + t("mergeHint") + '</div>';
  html += '<div class="form-group"><select class="form-select" id="mergeSelect"><option value="">' + t("mergePick") + '</option>';
  manual.forEach(function (u) { html += '<option value="' + u.id + '">' + escapeHtml(plainUserName(u)) + '</option>'; });
  html += '</select></div>';
  html += '<button class="btn-secondary" onclick="mergeManualPlayer(document.getElementById(\'mergeSelect\').value)">' + t("mergeButton") + '</button>';
  html += '</div>';
  return html;
}

/** Replace `oldId` with `newId` in plain data (arrays, objects, "a__b" keys) */
function _swapUid(value, oldId, newId) {
  if (value === oldId) return newId;
  if (typeof value === "string") return value.split("__").map(function (p) { return p === oldId ? newId : p; }).join("__");
  if (Array.isArray(value)) {
    var arr = value.map(function (v) { return _swapUid(v, oldId, newId); });
    return arr.filter(function (v, i) { return typeof v !== "string" || arr.indexOf(v) === i; }); // no duplicate players
  }
  if (value && typeof value === "object" && typeof value.toDate !== "function") {
    var o = {};
    Object.keys(value).forEach(function (k) { o[_swapUid(k, oldId, newId)] = _swapUid(value[k], oldId, newId); });
    return o;
  }
  return value;
}

function mergeManualPlayer(manualId) {
  var manual = dbFindById(DB_CACHE.users, manualId);
  if (!manual || !manual.manual || !currentUser) { showToast(t("mergePick")); return; }
  if (!confirm(t("mergeConfirm").replace("{name}", plainUserName(manual)))) return;
  var me = currentUser.uid;
  showToast(t("loading"));

  var sessionFields = ["players", "courtPayer", "shuttlePayer", "otherCosts", "dinner", "settled", "createdBy"];
  var pollFields = ["responses", "votes", "createdBy", "confirmedPlayers"];

  function migrate(collection, fields) {
    return fsdb.collection(collection).get().then(function (snap) {
      var jobs = [];
      snap.forEach(function (doc) {
        var data = doc.data();
        if (JSON.stringify(fields.map(function (f) { return data[f] === undefined ? null : data[f]; })).indexOf(manualId) < 0) return;
        var update = {};
        fields.forEach(function (f) { if (data[f] !== undefined) update[f] = _swapUid(data[f], manualId, me); });
        jobs.push(doc.ref.update(update));
      });
      return Promise.all(jobs);
    });
  }

  migrate("sessions", sessionFields)
    .then(function () { return migrate("polls", pollFields); })
    .then(function () {
      // Keep the phone number and QR codes if I don't have my own yet
      var jobs = [];
      if (manual.phone && !(currentUserProfile && currentUserProfile.phone)) {
        jobs.push(dbUpdateUser(me, { phone: manual.phone }));
        if (currentUserProfile) currentUserProfile.phone = manual.phone;
      }
      jobs.push(dbGetUserQr(manualId).then(function (qr) {
        return dbGetUserQr(me).then(function (mine) {
          var copy = ["main"].concat(QR_TYPES).filter(function (k) { return qr[k] && !mine[k]; });
          return Promise.all(copy.map(function (k) { return dbSetUserQr(me, k, qr[k]); }));
        });
      }));
      ["defaultCourtPayer", "defaultShuttlePayer"].forEach(function (k) {
        if (appSetting(k, "") === manualId) { var d = {}; d[k] = me; jobs.push(dbSetAppSettings(d)); }
      });
      return Promise.all(jobs);
    })
    .then(function () { return dbDeleteManualPlayer(manualId); })
    .then(function () { showToast(t("mergeDone").replace("{name}", plainUserName(manual))); renderSettings(); })
    .catch(function (error) { showToast(_permError(error)); });
}

/** Super Admin: delete every poll and session (players, courts, cocks, QR and settings stay) */
function resetPollsAndSessions() {
  if (!isSuperAdmin()) return;
  var typed = (document.getElementById("resetConfirm").value || "").trim();
  if (typed !== "DELETE") { showToast(t("resetTypeDelete")); return; }
  if (!confirm(t("resetConfirm"))) return;
  showToast(t("loading"));

  // Everything goes to the trash (restorable for 30 days), in batches
  var count = 0;
  function wipe(name) {
    return fsdb.collection(name).get().then(function (snap) {
      var docs = [];
      snap.forEach(function (doc) { docs.push(doc); });
      var chain = Promise.resolve();
      for (var i = 0; i < docs.length; i += 200) {
        (function (part) {
          chain = chain.then(function () {
            var batch = fsdb.batch();
            part.forEach(function (doc) {
              var d = doc.data();
              var label = (name === "polls" ? t("trashKind_poll") + " " : "") + fmtDate(d.date) + (d.time ? " " + d.time : "") + (d.courtName ? " · " + d.courtName : "");
              var entry = _trashEntry(name === "polls" ? "poll" : "session", name, doc.id, label);
              entry.data = d;
              batch.set(fsdb.collection("trash").doc(), entry);
              batch.delete(doc.ref);
              count++;
            });
            return batch.commit();
          });
        })(docs.slice(i, i + 200));
      }
      return chain;
    });
  }
  wipe("polls")
    .then(function () { return wipe("sessions"); })
    .then(function () {
      document.getElementById("resetConfirm").value = "";
      showToast(t("resetDone").replace("{n}", count));
    })
    .catch(function (error) { showToast(_permError(error)); });
}
