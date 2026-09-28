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

  // ─── 1. Profile Card ─────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-title">\uD83D\uDC64 ' + t("profile") + '</div>';

  if (currentUserProfile) {
    html += '<div class="settings-item" style="border:none;padding:8px 0;margin-bottom:0">';
    html += '<div class="settings-left">';
    var initial = (currentUserProfile.displayName || "?").charAt(0).toUpperCase();
    html += '<div class="person-avatar" style="background:' + COLORS[0] + ';width:36px;height:36px;font-size:16px">' + initial + '</div>';
    html += '<div>';
    html += '<div style="font-size:14px;font-weight:600">' + (currentUserProfile.displayName || "") + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' + (currentUser ? currentUser.email : "") + '</div>';
    if (currentUserProfile.phone) {
      html += '<div style="font-size:11px;color:var(--text-muted)">\uD83D\uDCDE ' + currentUserProfile.phone + '</div>';
    }
    html += '</div></div>';
    html += '<button class="edit-btn" onclick="showEditProfileModal()">' + t("editProfile") + '</button>';
    html += '</div>';
  }

  html += '<button class="btn-danger" style="margin-top:8px;padding:8px;font-size:13px" onclick="logoutUser()">' + t("logout") + '</button>';
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
    html += '<div class="settings-value">' + c.price + 'K/hr</div>';
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
    html += '<div class="settings-value">' + sb.price + 'K/' + t("tubes") + '</div>';
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
      price: price,
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
      price: price,
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
