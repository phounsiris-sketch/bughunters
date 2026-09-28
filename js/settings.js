/* ============================================================
   settings.js — Settings page with profile, QR codes,
                  courts, shuttlecocks management
   Firebase Firestore COMPAT SDK (global `firebase` object)
   Depends on: firebase-config.js (fsdb, storage),
               auth.js (currentUser, currentUserProfile, logoutUser),
               db.js (dbGetCourts, dbAddCourt, dbDeleteCourt,
                      dbGetShuttlecocks, dbAddShuttlecock,
                      dbDeleteShuttlecock, dbGetUsers, dbUpdateUser,
                      dbGetQrCodes, dbSetQrCodes),
               storage.js (uploadQRImage),
               polls.js (getUserName),
               i18n.js (t),
               app.js (showToast, openModal, closeModal,
                       modalCallback, COLORS)
   ============================================================ */

var settingsCourts = [];
var settingsShuttlecocks = [];
var settingsUsers = [];
var settingsQrCodes = null;

var _settingsUnsubs = [];   // Firestore snapshot unsubscribes

/* ──────────────────────────────────────────────────────────
   Load (real-time listeners)
   ────────────────────────────────────────────────────────── */

function loadSettings() {
  // Unsubscribe previous listeners
  for (var i = 0; i < _settingsUnsubs.length; i++) {
    if (typeof _settingsUnsubs[i] === "function") _settingsUnsubs[i]();
  }
  _settingsUnsubs = [];

  _settingsUnsubs.push(
    dbGetCourts(function (courts) {
      settingsCourts = courts;
      renderSettings();
    })
  );

  _settingsUnsubs.push(
    dbGetShuttlecocks(function (brands) {
      settingsShuttlecocks = brands;
      renderSettings();
    })
  );

  _settingsUnsubs.push(
    dbGetUsers(function (users) {
      settingsUsers = users;
      renderSettings();
    })
  );

  _settingsUnsubs.push(
    dbGetQrCodes(function (qr) {
      settingsQrCodes = qr;
      renderSettings();
    })
  );
}

/* ──────────────────────────────────────────────────────────
   Render Settings
   ────────────────────────────────────────────────────────── */

function renderSettings() {
  var container = document.getElementById("settingsContent");
  if (!container) return;

  var html = "";

  // ─── 1. Players Card ─────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-title">\uD83D\uDC65 ' + t("playerRoster") + '</div>';

  for (var pi = 0; pi < settingsUsers.length; pi++) {
    var player = settingsUsers[pi];
    var pInitial = (player.displayName || "?").charAt(0).toUpperCase();
    var pColor = COLORS[pi % COLORS.length];
    html += '<div class="settings-item">';
    html += '<div class="settings-left">';
    html += '<div class="person-avatar" style="background:' + pColor + ';width:32px;height:32px;font-size:13px">' + pInitial + '</div>';
    html += '<div>';
    html += '<div class="settings-label">' + (player.displayName || "") + '</div>';
    if (player.phone) html += '<div style="font-size:11px;color:var(--text-muted)">' + player.phone + '</div>';
    html += '</div></div>';
    html += '<button class="delete-btn" onclick="deleteSettingsPlayer(\'' + (player.id || player.uid) + '\')">\u2715</button>';
    html += '</div>';
  }

  html += '<button class="add-btn-dashed" onclick="showAddPlayerModal()">+ ' + t("addPlayer") + '</button>';
  html += '</div>';

  // ─── 2. QR Codes Card ────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-title">\uD83D\uDCF1 ' + t("qrCodes") + '</div>';

  // Court Payer QR
  html += _renderQrSection("courtPayer", t("courtPayerQR"));
  // Shuttle Payer QR
  html += _renderQrSection("shuttlePayer", t("shuttlePayerQR"));

  html += '</div>';

  // ─── 3. Courts Card ──────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-title">\uD83C\uDFDF\uFE0F ' + t("courts") + '</div>';

  for (var ci = 0; ci < settingsCourts.length; ci++) {
    var c = settingsCourts[ci];
    html += '<div class="settings-item">';
    html += '<div class="settings-left">';
    html += '<div>';
    html += '<div class="settings-label">' + c.name + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">\uD83D\uDCCD ' + (c.location || "") + '</div>';
    html += '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<div class="settings-value">' + (c.pricePerHour || c.price || 0) + 'K/hr</div>';
    html += '<button class="delete-btn" onclick="deleteSettingsCourt(\'' + c.id + '\')">\u2715</button>';
    html += '</div></div>';
  }

  html += '<button class="add-btn-dashed" onclick="showAddCourtModal()">+ ' + t("addCourt") + '</button>';
  html += '</div>';

  // ─── 4. Shuttlecocks Card ────────────────────────
  html += '<div class="card">';
  html += '<div class="card-title">\uD83E\uDEB6 ' + t("shuttlecockBrands") + '</div>';

  for (var si = 0; si < settingsShuttlecocks.length; si++) {
    var sb = settingsShuttlecocks[si];
    html += '<div class="settings-item">';
    html += '<div class="settings-left">';
    html += '<div class="settings-label">' + sb.name + '</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<div class="settings-value">' + (sb.pricePerTube || sb.price || 0) + 'K/' + t("tubes") + '</div>';
    html += '<button class="delete-btn" onclick="deleteSettingsShuttlecock(\'' + sb.id + '\')">\u2715</button>';
    html += '</div></div>';
  }

  html += '<button class="add-btn-dashed" onclick="showAddShuttlecockModal()">+ ' + t("addShuttlecockBrand") + '</button>';
  html += '</div>';

  container.innerHTML = html;
}

/* ──────────────────────────────────────────────────────────
   QR Section Helper
   ────────────────────────────────────────────────────────── */

function _renderQrSection(type, label) {
  var qrData = settingsQrCodes && settingsQrCodes[type] ? settingsQrCodes[type] : null;
  var html = '';

  html += '<div style="margin-bottom:14px;padding:10px;background:var(--input-bg);border-radius:10px;border:1px solid var(--border)">';
  html += '<div style="font-size:12px;font-weight:600;margin-bottom:8px">' + label + '</div>';

  // QR image
  if (qrData && qrData.url) {
    html += '<img src="' + qrData.url + '" style="width:120px;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block" alt="QR">';
  }

  // Name input
  html += '<div class="form-group" style="margin-bottom:6px">';
  html += '<label class="form-label">' + t("qrName") + '</label>';
  html += '<input type="text" class="form-input" id="qrName_' + type + '" ' +
    'value="' + (qrData && qrData.name ? qrData.name : "") + '" ' +
    'onchange="saveQrName(\'' + type + '\',this.value)" ' +
    'placeholder="' + t("name") + '" style="font-size:13px">';
  html += '</div>';

  // Upload button
  html += '<div style="display:flex;align-items:center;gap:8px">';
  html += '<input type="file" id="qrFile_' + type + '" accept="image/*" style="display:none" ' +
    'onchange="handleQrUpload(\'' + type + '\')">';
  html += '<button class="edit-btn" onclick="document.getElementById(\'qrFile_' + type + '\').click()">' + t("uploadQR") + '</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

/* ──────────────────────────────────────────────────────────
   QR Upload & Name Save
   ────────────────────────────────────────────────────────── */

function handleQrUpload(type) {
  var fileInput = document.getElementById("qrFile_" + type);
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

  var file = fileInput.files[0];
  showToast("Uploading...");

  uploadQRImage(type, file, function (result) {
    if (result.status === "done") {
      var updateData = {};
      updateData[type] = {
        url: result.url,
        name: (settingsQrCodes && settingsQrCodes[type] && settingsQrCodes[type].name) || ""
      };
      dbSetQrCodes(updateData)
        .then(function () {
          showToast(t("uploadQR") + " \u2714");
        })
        .catch(function (error) {
          showToast(error.message);
        });
    } else if (result.status === "error") {
      showToast(result.error.message || "Upload failed");
    }
  });
}

function saveQrName(type, name) {
  var updateData = {};
  updateData[type] = {
    url: (settingsQrCodes && settingsQrCodes[type] && settingsQrCodes[type].url) || "",
    name: name
  };
  dbSetQrCodes(updateData).catch(function (error) {
    showToast(error.message);
  });
}

/* ──────────────────────────────────────────────────────────
   Add Court Modal
   ────────────────────────────────────────────────────────── */

function showAddCourtModal() {
  document.getElementById("modalTitle").textContent = t("addCourt");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group">' +
      '<label class="form-label">' + t("courtName") + '</label>' +
      '<input class="form-input" id="mCourtName" placeholder="' + t("courtName") + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("location") + '</label>' +
      '<input class="form-input" id="mCourtLoc" placeholder="' + t("location") + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("pricePerHour") + ' (K)</label>' +
      '<input type="number" class="form-input" id="mCourtPrice" min="1">' +
    '</div>';

  modalCallback = function () {
    var name = document.getElementById("mCourtName").value.trim();
    var location = document.getElementById("mCourtLoc").value.trim();
    var price = parseInt(document.getElementById("mCourtPrice").value) || 0;

    if (!name || price <= 0) {
      showToast(t("name") + " & " + t("pricePerHour"));
      return;
    }

    dbAddCourt({
      name: name,
      location: location,
      pricePerHour: price,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
      .then(function () {
        closeModal();
        showToast(t("addCourt") + " \u2714");
      })
      .catch(function (error) {
        showToast(error.message);
      });
  };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Add Shuttlecock Modal
   ────────────────────────────────────────────────────────── */

function showAddShuttlecockModal() {
  document.getElementById("modalTitle").textContent = t("addShuttlecockBrand");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group">' +
      '<label class="form-label">' + t("brandName") + '</label>' +
      '<input class="form-input" id="mBrandName" placeholder="' + t("brandName") + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("pricePerTube") + ' (K)</label>' +
      '<input type="number" class="form-input" id="mBrandPrice" min="1">' +
    '</div>';

  modalCallback = function () {
    var name = document.getElementById("mBrandName").value.trim();
    var price = parseInt(document.getElementById("mBrandPrice").value) || 0;

    if (!name || price <= 0) {
      showToast(t("name") + " & " + t("pricePerTube"));
      return;
    }

    dbAddShuttlecock({
      name: name,
      pricePerTube: price,
      cocksPerTube: 12,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
      .then(function () {
        closeModal();
        showToast(t("addShuttlecockBrand") + " \u2714");
      })
      .catch(function (error) {
        showToast(error.message);
      });
  };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Edit Profile Modal
   ────────────────────────────────────────────────────────── */

function showEditProfileModal() {
  var displayName = currentUserProfile ? currentUserProfile.displayName || "" : "";
  var phone = currentUserProfile ? currentUserProfile.phone || "" : "";

  document.getElementById("modalTitle").textContent = t("editProfile");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group">' +
      '<label class="form-label">' + t("name") + '</label>' +
      '<input class="form-input" id="mProfileName" value="' + displayName + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("phone") + '</label>' +
      '<input class="form-input" id="mProfilePhone" value="' + phone + '" placeholder="020 xxxx xxxx">' +
    '</div>';

  modalCallback = function () {
    var newName = document.getElementById("mProfileName").value.trim();
    var newPhone = document.getElementById("mProfilePhone").value.trim();

    if (!newName) {
      showToast(t("name"));
      return;
    }

    dbUpdateUser(currentUser.uid, {
      displayName: newName,
      phone: newPhone || null
    })
      .then(function () {
        // Update local cache
        currentUserProfile.displayName = newName;
        currentUserProfile.phone = newPhone || null;
        closeModal();
        showToast(t("editProfile") + " \u2714");
        renderSettings();
      })
      .catch(function (error) {
        showToast(error.message);
      });
  };
  openModal();
}

/* ──────────────────────────────────────────────────────────
   Delete Helpers
   ────────────────────────────────────────────────────────── */

function deleteSettingsCourt(id) {
  if (!confirm(t("delete") + "?")) return;

  dbDeleteCourt(id)
    .then(function () {
      showToast(t("delete") + " \u2714");
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

function showAddPlayerModal() {
  document.getElementById("modalTitle").textContent = t("addPlayer");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group">' +
      '<label class="form-label">' + t("name") + '</label>' +
      '<input class="form-input" id="mPlayerName" placeholder="' + t("name") + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label class="form-label">' + t("phone") + '</label>' +
      '<input class="form-input" id="mPlayerPhone" placeholder="020 xxxx xxxx">' +
    '</div>';

  modalCallback = function () {
    var name = document.getElementById("mPlayerName").value.trim();
    var phone = document.getElementById("mPlayerPhone").value.trim();

    if (!name) { showToast(t("name")); return; }

    var uid = 'player-' + name.toLowerCase().replace(/\s/g, '-') + '-' + Date.now();
    fsdb.collection('users').doc(uid).set({
      email: name.toLowerCase().replace(/\s/g, '') + '@godsmash.local',
      displayName: name,
      phone: phone || null,
      avatarUrl: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
      closeModal();
      showToast(name + ' added!');
    }).catch(function(error) {
      showToast(error.message);
    });
  };
  openModal();
}

function deleteSettingsPlayer(id) {
  if (!confirm(t("delete") + "?")) return;
  fsdb.collection('users').doc(id).delete()
    .then(function() { showToast(t("delete") + " \u2714"); })
    .catch(function(error) { showToast(error.message); });
}

function deleteSettingsShuttlecock(id) {
  if (!confirm(t("delete") + "?")) return;

  dbDeleteShuttlecock(id)
    .then(function () {
      showToast(t("delete") + " \u2714");
    })
    .catch(function (error) {
      showToast(error.message);
    });
}
