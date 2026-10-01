/* ============================================================
   settings.js — Settings with sub-menu:
                 Profile | Players | Courts | Cocks | QR
   Depends on: db.js (DB_CACHE, dbAddCourt, dbUpdateCourt, dbDeleteCourt,
                      dbAddShuttlecock, dbUpdateShuttlecock,
                      dbDeleteShuttlecock, dbUpdateUser, dbSetQrCodes),
               storage.js (readQrImage), auth.js (currentUser,
               currentUserProfile, logoutUser), i18n.js (t),
               app.js (showToast, openModal, closeModal, modalCallback,
                       escapeHtml, fmtLAK, fmtShort, COLORS)
   ============================================================ */

var settingsTab = (function () {
  try { return localStorage.getItem('settingsTab') || 'profile'; } catch (e) { return 'profile'; }
})();
var SETTINGS_TABS = [['profile', 'tabProfile'], ['players', 'tabPlayers'], ['courts', 'tabCourts'], ['shuttle', 'tabShuttle'], ['qr', 'tabQR']];

function setSettingsTab(tab) {
  settingsTab = tab;
  try { localStorage.setItem('settingsTab', tab); } catch (e) {}
  renderSettings();
}

function loadSettings() {
  // Data comes from the shared cache; it re-renders this page when it changes
  renderSettings();
}

/* ──────────────────────────────────────────────────────────
   Render
   ────────────────────────────────────────────────────────── */

function renderSettings() {
  var container = document.getElementById("settingsContent");
  if (!container) return;

  var tabsEl = document.getElementById("settingsTabs");
  if (tabsEl) {
    var tHtml = '';
    for (var ti = 0; ti < SETTINGS_TABS.length; ti++) {
      tHtml += '<button class="dash-tab' + (SETTINGS_TABS[ti][0] === settingsTab ? ' active' : '') +
        '" style="padding:8px 4px;font-size:12px" onclick="setSettingsTab(\'' + SETTINGS_TABS[ti][0] + '\')">' + t(SETTINGS_TABS[ti][1]) + '</button>';
    }
    tabsEl.innerHTML = tHtml;
  }

  // Don't wipe the profile form while the user is typing in it
  if (settingsTab === 'profile' && document.activeElement && /^pf/.test(document.activeElement.id || '')) return;

  var html = '';
  if (settingsTab === 'profile') html = _renderProfileTab();
  else if (settingsTab === 'players') html = _renderPlayersTab();
  else if (settingsTab === 'courts') html = _renderCourtsTab();
  else if (settingsTab === 'shuttle') html = _renderShuttleTab();
  else if (settingsTab === 'qr') html = _renderQrTab();
  container.innerHTML = html;
}

/* ---------- Profile ---------- */
function _renderProfileTab() {
  var prof = currentUserProfile || {};
  var pName = prof.displayName || '';
  var html = '<div class="card">';
  html += '<div style="display:flex;justify-content:center;margin-bottom:14px"><div class="person-avatar" style="background:' + COLORS[0] + ';width:64px;height:64px;font-size:26px">' + escapeHtml((pName.charAt(0) || '?').toUpperCase()) + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("emailLabel") + '</label>';
  html += '<input class="form-input" value="' + escapeHtml(prof.email || (currentUser && currentUser.email) || '') + '" disabled></div>';
  html += '<div class="form-group"><label class="form-label">' + t("displayName") + '</label>';
  html += '<input class="form-input" id="pfName" value="' + escapeHtml(pName) + '"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("phone") + '</label>';
  html += '<input class="form-input" id="pfPhone" inputmode="tel" value="' + escapeHtml(prof.phone || '') + '" placeholder="020 xxxx xxxx"></div>';
  html += '<button class="btn-primary" onclick="saveProfileSettings()">' + t("save") + '</button>';
  html += '</div>';

  html += '<div class="card"><div class="card-title">' + t("appSettings") + '</div>';
  html += '<div class="settings-item"><div class="settings-label">' + t("language") + '</div><button class="edit-btn" onclick="toggleLang()">' + (currentLang === 'en' ? 'English → ລາວ' : 'ລາວ → English') + '</button></div>';
  html += '<div class="settings-item"><div class="settings-label">' + t("theme") + '</div><button class="edit-btn" onclick="toggleTheme()">' + (currentTheme === 'dark' ? '🌙 → ☀️' : '☀️ → 🌙') + '</button></div>';
  html += '</div>';

  html += '<button class="btn-danger" onclick="logoutUser()">' + t("logout") + '</button>';
  return html;
}

function saveProfileSettings() {
  var name = document.getElementById("pfName").value.trim();
  var phone = document.getElementById("pfPhone").value.trim();
  if (!name) { showToast(t("displayName")); return; }

  dbUpdateUser(currentUser.uid, { displayName: name, phone: phone || null })
    .then(function () {
      currentUserProfile.displayName = name;
      currentUserProfile.phone = phone || null;
      if (document.activeElement) document.activeElement.blur();
      showToast(t("profileSaved") + " ✔");
      renderSettings();
    })
    .catch(function (error) { showToast(error.message); });
}

/* ---------- Players ---------- */
function _appUrl() {
  return window.location.origin + window.location.pathname;
}

function _renderPlayersTab() {
  var users = DB_CACHE.users;
  var html = '<div class="card"><div class="card-title">\uD83D\uDC65 ' + t("playerRoster") + ' (' + users.length + ')</div>';
  if (!users.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noData") + '</div>';
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var isMe = currentUser && u.id === currentUser.uid;
    html += '<div class="settings-item"><div class="settings-left">';
    html += '<div class="person-avatar" style="background:' + COLORS[i % COLORS.length] + ';width:32px;height:32px;font-size:13px">' + escapeHtml((u.displayName || '?').charAt(0).toUpperCase()) + '</div>';
    html += '<div><div class="settings-label">' + escapeHtml(u.displayName || '') +
      (isMe ? ' <span style="font-size:11px;color:var(--accent)">(' + t("you") + ')</span>' : '') + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' +
      (u.manual ? '\u270D\uFE0F ' + t("manualPlayer") : '\u2709\uFE0F ' + t("registeredPlayer")) +
      (u.phone ? ' \u2022 \uD83D\uDCDE ' + escapeHtml(u.phone) : '') + '</div>';
    html += '</div></div>';
    if (u.manual) {
      html += '<div style="display:flex;gap:8px">';
      html += '<button class="edit-btn" onclick="showPlayerModal(\'' + u.id + '\')">\u270F\uFE0F</button>';
      html += '<button class="delete-btn" onclick="deleteManualPlayer(\'' + u.id + '\')">\u2715</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '<button class="add-btn-dashed" onclick="showPlayerModal(null)">+ ' + t("addPlayer") + '</button>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + t("manualPlayerHint") + '</div>';
  html += '</div>';

  html += '<div class="card"><div class="card-title">\u2709\uFE0F ' + t("invitePlayers") + '</div>';
  html += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">' + t("inviteHint") + '</div>';
  html += '<input class="form-input" value="' + escapeHtml(_appUrl()) + '" readonly onclick="this.select()" style="margin-bottom:8px">';
  html += '<button class="btn-primary" onclick="copyInviteLink()">' + t("copyInvite") + '</button>';
  html += '</div>';
  return html;
}

function showPlayerModal(uid) {
  var u = uid ? dbFindById(DB_CACHE.users, uid) : null;
  document.getElementById("modalTitle").textContent = u ? t("editPlayer") : t("addPlayer");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("name") + '</label>' +
      '<input class="form-input" id="mPlayerName" value="' + escapeHtml(u ? u.displayName : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("phone") + '</label>' +
      '<input class="form-input" id="mPlayerPhone" inputmode="tel" value="' + escapeHtml(u && u.phone ? u.phone : '') + '" placeholder="020 xxxx xxxx"></div>';

  modalCallback = function () {
    var name = document.getElementById("mPlayerName").value.trim();
    var phone = document.getElementById("mPlayerPhone").value.trim() || null;
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
      ? dbUpdateUser(u.id, { displayName: name, phone: phone, manual: true })
      : dbAddManualPlayer({ displayName: name, phone: phone, email: null, avatarUrl: null });
    op.then(function () { closeModal(); showToast(name + " \u2714"); })
      .catch(function (error) { showToast(error.message); });
  };
  openModal();
}

function deleteManualPlayer(uid) {
  var u = dbFindById(DB_CACHE.users, uid);
  if (!u || !confirm(t("delete") + " " + (u.displayName || "") + "?")) return;
  dbDeleteManualPlayer(uid)
    .then(function () { showToast(t("delete") + " \u2714"); })
    .catch(function (error) { showToast(error.message); });
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
  var html = '<div class="card"><div class="card-title">🏟️ ' + t("courts") + '</div>';
  if (!courts.length) html += '<div style="font-size:13px;color:var(--text-muted)">' + t("noCourtsYet") + '</div>';
  for (var i = 0; i < courts.length; i++) {
    var c = courts[i];
    html += '<div class="settings-item">';
    html += '<div style="flex:1;min-width:0;cursor:pointer" onclick="showCourtModal(\'' + c.id + '\')"><div class="settings-label">' + escapeHtml(c.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">📍 ' + escapeHtml(c.location || '—') + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<div class="settings-value">' + fmtLAK(c.pricePerHour) + '/h</div>';
    html += '<button class="edit-btn" onclick="showCourtModal(\'' + c.id + '\')">✏️</button>';
    html += '<button class="delete-btn" onclick="deleteSettingsCourt(\'' + c.id + '\')">✕</button>';
    html += '</div></div>';
  }
  html += '<button class="add-btn-dashed" onclick="showCourtModal(null)">+ ' + t("addCourt") + '</button>';
  html += '</div>';
  return html;
}

function showCourtModal(courtId) {
  var c = courtId ? dbFindById(DB_CACHE.courts, courtId) : null;
  document.getElementById("modalTitle").textContent = c ? t("editCourt") : t("addCourt");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("courtName") + '</label>' +
      '<input class="form-input" id="mCourtName" value="' + escapeHtml(c ? c.name : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("location") + '</label>' +
      '<input class="form-input" id="mCourtLoc" value="' + escapeHtml(c ? c.location || '' : '') + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("pricePerHour") + ' (\u20AD)</label>' +
      moneyInput('mCourtPrice', c ? c.pricePerHour : 0, '') + '</div>';

  modalCallback = function () {
    var data = {
      name: document.getElementById("mCourtName").value.trim(),
      location: document.getElementById("mCourtLoc").value.trim(),
      pricePerHour: parseMoney(document.getElementById("mCourtPrice").value)
    };
    if (!data.name || data.pricePerHour <= 0) {
      showToast(t("courtName") + " & " + t("pricePerHour"));
      return;
    }
    var op = c ? dbUpdateCourt(c.id, data) : dbAddCourt(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    op.then(function () { closeModal(); showToast(t("save") + " ✔"); })
      .catch(function (error) { showToast(error.message); });
  };
  openModal();
}

function deleteSettingsCourt(id) {
  if (!confirm(t("delete") + "?")) return;
  dbDeleteCourt(id)
    .then(function () { showToast(t("delete") + " ✔"); })
    .catch(function (error) { showToast(error.message); });
}

/* ---------- Shuttlecock brands ---------- */
function _renderShuttleTab() {
  var brands = DB_CACHE.shuttlecocks;
  var html = '<div class="card"><div class="card-title">🪶 ' + t("shuttlecockBrands") + '</div>';
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
    html += '<button class="edit-btn" onclick="showShuttleModal(\'' + b.id + '\')">✏️</button>';
    html += '<button class="delete-btn" onclick="deleteSettingsShuttlecock(\'' + b.id + '\')">✕</button>';
    html += '</div></div>';
  }
  html += '<button class="add-btn-dashed" onclick="showShuttleModal(null)">+ ' + t("addShuttlecockBrand") + '</button>';
  html += '</div>';
  return html;
}

function showShuttleModal(brandId) {
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
    var op = b ? dbUpdateShuttlecock(b.id, data) : dbAddShuttlecock(Object.assign(data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    op.then(function () { closeModal(); showToast(t("save") + " ✔"); })
      .catch(function (error) { showToast(error.message); });
  };
  openModal();
}

function deleteSettingsShuttlecock(id) {
  if (!confirm(t("delete") + "?")) return;
  dbDeleteShuttlecock(id)
    .then(function () { showToast(t("delete") + " ✔"); })
    .catch(function (error) { showToast(error.message); });
}

/* ---------- QR codes ---------- */
function _renderQrTab() {
  var html = '<div class="card"><div class="card-title">📱 ' + t("qrCodes") + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + t("qrHint") + '</div>';
  html += _renderQrSection("courtPayer", t("courtPayerQR"));
  html += _renderQrSection("shuttlePayer", t("shuttlePayerQR"));
  html += '</div>';
  return html;
}

function _renderQrSection(type, label) {
  var qr = DB_CACHE.qrCodes && DB_CACHE.qrCodes[type] ? DB_CACHE.qrCodes[type] : null;
  var html = '<div style="margin-bottom:14px;padding:12px;background:var(--input-bg);border-radius:10px;border:1px solid var(--border)">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">' + label + '</div>';
  if (qr && qr.url) {
    html += '<img src="' + qr.url + '" style="width:140px;height:140px;object-fit:contain;border-radius:8px;margin-bottom:8px;display:block;background:#fff" alt="QR">';
  }
  html += '<div class="form-group" style="margin-bottom:8px"><label class="form-label">' + t("qrName") + '</label>';
  html += '<input type="text" class="form-input" value="' + escapeHtml(qr && qr.name ? qr.name : '') + '" ' +
    'onchange="saveQrName(\'' + type + '\',this.value)" placeholder="' + t("qrNamePlaceholder") + '"></div>';
  html += '<input type="file" id="qrFile_' + type + '" accept="image/*" style="display:none" onchange="handleQrUpload(\'' + type + '\',this)">';
  html += '<div style="display:flex;gap:8px">';
  html += '<button class="edit-btn" onclick="document.getElementById(\'qrFile_' + type + '\').click()">📷 ' + t("uploadQR") + '</button>';
  if (qr && qr.url) html += '<button class="delete-btn" onclick="removeQr(\'' + type + '\')">✕</button>';
  html += '</div></div>';
  return html;
}

function _qrUpdate(type, fields) {
  var cur = (DB_CACHE.qrCodes && DB_CACHE.qrCodes[type]) || {};
  var data = {};
  data[type] = { url: cur.url || "", name: cur.name || "" };
  Object.assign(data[type], fields);
  return dbSetQrCodes(data);
}

function handleQrUpload(type, input) {
  var file = input.files && input.files[0];
  if (!file) return;
  showToast(t("loading"));
  readQrImage(file, function (err, dataUrl) {
    input.value = "";
    if (err) { showToast(err.message); return; }
    _qrUpdate(type, { url: dataUrl })
      .then(function () { showToast(t("uploadQR") + " ✔"); })
      .catch(function (error) { showToast(error.message); });
  });
}

function saveQrName(type, name) {
  _qrUpdate(type, { name: name.trim() })
    .then(function () { showToast(t("save") + " ✔"); })
    .catch(function (error) { showToast(error.message); });
}

function removeQr(type) {
  if (!confirm(t("delete") + "?")) return;
  _qrUpdate(type, { url: "" }).catch(function (error) { showToast(error.message); });
}
