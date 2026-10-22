/* ============================================================
   restaurants.js — Optional restaurant for a session's dinner.
   A shared master list (restaurants/{id}: name, location, lat, lng,
   photo (optional "img:<id>"), createdBy, createdAt) with search, a map pin, validation of new
   items (name, place, no duplicates) and 5-star reviews written by the
   people in that dinner (restaurantReviews/{restaurantId_uid}:
   restaurantId, uid, stars 1-5, comment, sessionId, gid, updatedAt).
   The dinner stores dinner.restaurantId + dinner.restaurantName.
   ============================================================ */

var REST_NAME_MIN = 2, REST_NAME_MAX = 60, REST_LOC_MAX = 120, REST_COMMENT_MAX = 200;
var REST_DUP_KM = 0.3;   // same name closer than this (or without a pin) = the same place

/* ---------- Data helpers ---------- */

function restaurantList() { return DB_CACHE.restaurants || []; }
function restaurantById(id) { return id ? dbFindById(restaurantList(), id) : null; }
function restaurantReviews(id) { return (DB_CACHE.reviews || []).filter(function (r) { return r.restaurantId === id; }); }

function restaurantStats(id) {
  var rs = restaurantReviews(id);
  if (!rs.length) return { avg: 0, n: 0 };
  var sum = rs.reduce(function (s, r) { return s + (r.stars || 0); }, 0);
  return { avg: sum / rs.length, n: rs.length };
}

function _normName(s) {
  return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** "★★★★☆" for 0-5 */
function starsText(n) {
  var full = Math.round(n || 0), out = "";
  for (var i = 1; i <= 5; i++) out += i <= full ? "★" : "☆";
  return out;
}

function ratingHtml(id) {
  var st = restaurantStats(id);
  return st.n ? '<span class="rest-rating"><b>' + st.avg.toFixed(1) + '</b> <span class="rest-stars">' + starsText(st.avg) + '</span> <small>(' + st.n + ')</small></span>'
    : '<span class="rest-rating none">' + t("restNoReviews") + '</span>';
}

/** Small round photo of a restaurant (or a plate icon when it has none) */
function restThumbHtml(r, size) {
  size = size || 44;
  return r && r.photo
    ? '<img class="rest-thumb" style="width:' + size + 'px;height:' + size + 'px" ' + imgSrcAttrs(r.photo) + ' alt="">'
    : '<span class="rest-thumb ph" style="width:' + size + 'px;height:' + size + 'px">' + icon("dinner", Math.round(size / 2)) + '</span>';
}

/* ---------- Validation of a new / edited item ---------- */

/** Returns { error: i18n key | null, dup: existing restaurant | null } */
function validateRestaurant(data, excludeId) {
  var name = (data.name || "").trim(), loc = (data.location || "").trim();
  if (name.length < REST_NAME_MIN || name.length > REST_NAME_MAX) return { error: "restNameInvalid", dup: null };
  if (loc.length > REST_LOC_MAX) return { error: "restLocTooLong", dup: null };
  var pinned = hasPin(data);
  if (!loc && !pinned) return { error: "restNeedPlace", dup: null };
  if (pinned && (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180)) return { error: "restPinInvalid", dup: null };
  var key = _normName(name), dup = null;
  restaurantList().forEach(function (r) {
    if (dup || r.id === excludeId || _normName(r.name) !== key) return;
    if (!hasPin(r) || !pinned || distanceKm({ lat: r.lat, lng: r.lng }, { lat: data.lat, lng: data.lng }) < REST_DUP_KM) dup = r;
  });
  return { error: dup ? "restDuplicate" : null, dup: dup };
}

/* ---------- Dinner form (edit card) ---------- */

/** The optional "Restaurant" row inside the dinner card of the edit form */
function dinnerRestaurantFieldHtml(d) {
  var r = restaurantById(d.restaurantId);
  var name = r ? r.name : d.restaurantName || "";
  var html = '<div class="form-group"><label class="form-label">' + icon("dinner", 12) + ' ' + t("restaurant") + ' <span class="form-hint">(' + t("optional") + ')</span></label>';
  if (d.restaurantId) {
    html += '<div class="rest-picked">' + restThumbHtml(r, 40) + '<div style="min-width:0"><b>' + escapeHtml(name) + '</b>' +
      (r && r.location ? '<div class="form-hint" style="margin:0">' + escapeHtml(r.location) + '</div>' : '') + '</div>' +
      (r && _restCanManage(r) ? '<button type="button" class="btn-secondary" onclick="showRestaurantForm(null,\'' + jsq(r.id) + '\',function(){renderEditForm()})" aria-label="' + escapeHtml(t("restEdit")) + '">' + icon("pen", 14) + '</button>' : '') +
      '<button type="button" class="btn-secondary" onclick="editChooseRestaurant()">' + t("change") + '</button>' +
      '<button type="button" class="btn-secondary" onclick="editClearRestaurant()" aria-label="' + t("removePin") + '">✕</button></div>';
  } else {
    html += '<button type="button" class="add-btn-dashed" onclick="editChooseRestaurant()">+ ' + t("chooseRestaurant") + '</button>';
  }
  return html + '</div>';
}

function editChooseRestaurant() { showRestaurantPicker(editPickRestaurant); }

function editPickRestaurant(id) {
  var r = restaurantById(id);
  if (!r || !edit.dinner) return;
  edit.dinner.restaurantId = r.id;
  edit.dinner.restaurantName = r.name;
  renderEditForm();
}

function editClearRestaurant() {
  if (!edit.dinner) return;
  edit.dinner.restaurantId = "";
  edit.dinner.restaurantName = "";
  renderEditForm();
}

/* ---------- Picker with search ---------- */

var _restPickCb = null;

function showRestaurantPicker(onPick) {
  _restPickCb = onPick;
  document.getElementById("modalTitle").textContent = t("chooseRestaurant");
  document.getElementById("modalBody").innerHTML =
    '<input class="form-input" id="restSearch" type="search" autocomplete="off" placeholder="' + escapeHtml(t("restSearch")) + '" oninput="_restFilter(this.value)">' +
    '<div id="restList" class="rest-list"></div>' +
    '<button type="button" class="add-btn-dashed" style="margin-top:10px" onclick="showRestaurantForm(document.getElementById(\'restSearch\').value)">+ ' + t("restNew") + '</button>';
  modalCallback = function () { closeModal(); };
  openModal();
  _restFilter("");
}

function _restFilter(q) {
  var el = document.getElementById("restList");
  if (!el) return;
  var key = _normName(q);
  var list = restaurantList().filter(function (r) {
    return !key || _normName(r.name).indexOf(key) >= 0 || _normName(r.location).indexOf(key) >= 0;
  }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  if (!list.length) {
    el.innerHTML = '<div class="empty-state" style="padding:12px">' + t(restaurantList().length ? "restNoMatch" : "restEmpty") + '</div>';
    return;
  }
  el.innerHTML = list.map(function (r) {
    return '<div class="rest-item" onclick="_restPick(\'' + jsq(r.id) + '\')">' + restThumbHtml(r, 44) + '<div style="min-width:0;flex:1"><b>' + escapeHtml(r.name) + '</b>' +
      (r.location ? '<div class="form-hint" style="margin:0">' + escapeHtml(r.location) + '</div>' : '') + '</div>' +
      '<div class="rest-item-side">' + ratingHtml(r.id) + (hasPin(r) ? ' <span class="tag">' + icon("pin", 11) + '</span>' : '') + '</div></div>';
  }).join('');
}

function _restPick(id) {
  var cb = _restPickCb;
  closeModal();
  if (cb) cb(id);
}

/* ---------- New restaurant form (with map pin and validation) ---------- */

var _restEditId = null, _restDone = null;   // editing this restaurant; what to do after saving

function showRestaurantForm(prefillName, editId, onDone, pin, prefillLoc) {
  closeMapPicker("restPin");
  _restEditId = typeof editId === "string" && editId ? editId : null;
  _restDone = onDone || null;
  var cur = _restEditId ? restaurantById(_restEditId) : null;
  document.getElementById("modalTitle").textContent = t(cur ? "restEdit" : "restNew");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("restName") + ' *</label>' +
      '<input class="form-input" id="mRestName" maxlength="' + REST_NAME_MAX + '" value="' + escapeHtml(cur ? cur.name : (prefillName || "")) + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("location") + '</label>' +
      '<input class="form-input" id="mRestLoc" maxlength="' + REST_LOC_MAX + '" placeholder="' + escapeHtml(t("addressHint")) + '" value="' + escapeHtml(cur && cur.location ? cur.location : (prefillLoc || "")) + '"></div>' +
    '<div class="form-group"><label class="form-label">' + t("mapPin") + '</label>' + mapPickerHtml("restPin") + '</div>' +
    '<div class="form-hint">' + t("restNeedPlaceHint") + '</div>' +
    '<div class="form-group" style="margin-top:12px"><label class="form-label">' + icon("camera", 12) + ' ' + t("restPhoto") + ' <span class="form-hint">(' + t("optional") + ')</span></label>' +
      '<div id="restPhotoPreview">' + (cur && cur.photo ? '<img class="rest-photo" ' + imgSrcAttrs(cur.photo) + ' alt="">' : '') + '</div>' +
      '<input type="file" class="form-input" accept="image/*" style="padding:8px;font-size:13px" onchange="_restPhotoChosen(this)"></div>' +
    '<div id="restDup"></div>';
  _restPhoto = null;
  modalCallback = _restSave;
  openModal();
  initMapPicker("restPin", pin ? pin.lat : cur && hasPin(cur) ? cur.lat : null, pin ? pin.lng : cur && hasPin(cur) ? cur.lng : null);
}

var _restPhoto = null;   // data URL of the photo picked in the form

function _restPhotoChosen(input) {
  var file = input.files && input.files[0];
  var box = document.getElementById("restPhotoPreview");
  if (!file) { _restPhoto = null; if (box) box.innerHTML = ""; return; }
  resizeImageToDataUrl(file, 800, function (err, dataUrl) {
    if (err) { showToast(err.message); input.value = ""; return; }
    _restPhoto = dataUrl;
    if (box) box.innerHTML = '<img class="rest-photo" src="' + dataUrl + '" alt="">';
  });
}

function _restSave() {
  var pin = mapPickerActive("restPin") ? getMapPick("restPin") : { lat: null, lng: null };
  var data = {
    name: document.getElementById("mRestName").value.trim().replace(/\s+/g, " "),
    location: document.getElementById("mRestLoc").value.trim(),
    lat: pin.lat, lng: pin.lng
  };
  var v = validateRestaurant(data, _restEditId);
  var dupEl = document.getElementById("restDup");
  if (dupEl) dupEl.innerHTML = "";
  if (v.dup) {
    if (dupEl) dupEl.innerHTML = '<div class="rest-dup"><b>' + t("restDuplicate") + '</b><div>' + escapeHtml(v.dup.name) + (v.dup.location ? ' · ' + escapeHtml(v.dup.location) : '') + '</div>' +
      '<button type="button" class="btn-secondary" onclick="_restPick(\'' + jsq(v.dup.id) + '\')">' + t("restUseExisting") + '</button></div>';
    return;
  }
  if (v.error) { showToast(t(v.error)); return; }
  if (_restEditId) {
    var old = restaurantById(_restEditId) || {};
    var upd = { name: data.name, location: data.location, lat: data.lat, lng: data.lng, createdBy: old.createdBy || currentUser.uid, createdAt: old.createdAt || Date.now(), updatedAt: Date.now(), updatedBy: currentUser.uid };
    var eid = _restEditId;
    (_restPhoto ? dbSaveImage(_restPhoto, "restaurant") : Promise.resolve(null)).then(function (ref) {
      upd.photo = ref || old.photo || null;
      return fsdb.collection("restaurants").doc(eid).set(upd);
    }).then(function () {
      closeMapPicker("restPin");
      var done = _restDone;
      closeModal();
      showToast(t("save") + " ✔");
      setTimeout(function () { if (done) done(eid); else if (typeof renderSettings === "function") renderSettings(); }, 250);
    }).catch(function (error) { showToast(_permError(error)); });
    return;
  }
  var doc = { name: data.name, location: data.location, lat: data.lat, lng: data.lng, createdBy: currentUser.uid, createdAt: Date.now() };
  // The photo (optional) is stored as images/{id}; the restaurant keeps "img:<id>"
  (_restPhoto ? dbSaveImage(_restPhoto, "restaurant") : Promise.resolve(null)).then(function (ref) {
    if (ref) doc.photo = ref;
    return fsdb.collection("restaurants").add(doc);
  }).then(function (ref) {
    closeMapPicker("restPin");
    var cb = _restPickCb;
    closeModal();
    showToast(t("save") + " ✔");
    // The new item reaches the cache a moment later; pick it by id once it is there
    if (cb) setTimeout(function () { cb(ref.id); }, 250);
  }).catch(function (error) { showToast(_permError(error)); });
}

/* ---------- Bill view: restaurant + reviews ---------- */

var _revDraft = {};   // restaurantId -> { stars, comment } while typing

function _myReview(restId) {
  var uid = currentUser ? currentUser.uid : "";
  return (DB_CACHE.reviews || []).filter(function (r) { return r.restaurantId === restId && r.uid === uid; })[0] || null;
}

/** Restaurant name, map link, average stars, and the review box for people in the dinner */
function dinnerRestaurantViewHtml(s) {
  var d = s && s.dinner;
  if (!d || !d.restaurantId) return "";
  var r = restaurantById(d.restaurantId);
  var name = r ? r.name : d.restaurantName || "";
  var html = '<div class="rest-view">' + (r && r.photo ? '<img class="rest-photo" ' + imgSrcAttrs(r.photo) + ' alt="' + escapeHtml(name) + '" onclick="openImage(this.src)">' : '') +
    '<div class="rest-view-head"><div style="min-width:0"><b>' + icon("dinner", 14) + ' ' + escapeHtml(name) + '</b>' +
    (r && r.location ? '<div class="form-hint" style="margin:0">' + escapeHtml(r.location) + '</div>' : '') + '</div>' +
    '<div>' + ratingHtml(d.restaurantId) + (r && _restCanManage(r) ? ' <button type="button" class="edit-btn" onclick="showRestaurantForm(null,\'' + jsq(r.id) + '\',function(){renderSessionDetail()})" aria-label="' + escapeHtml(t("restEdit")) + '">' + icon("pen", 14) + '</button>' : '') + '</div></div>';
  if (r && hasPin(r)) html += '<div style="margin-top:6px">' + courtMapLink(r, t("openMap")) + '</div>';

  var me = currentUser ? currentUser.uid : "";
  if ((d.diners || []).indexOf(me) >= 0) {
    var mine = _myReview(d.restaurantId);
    var draft = _revDraft[d.restaurantId] || (_revDraft[d.restaurantId] = { stars: mine ? mine.stars : 0, comment: mine ? mine.comment || "" : "" });
    html += '<div class="rev-box"><div class="form-hint" style="margin:0 0 4px">' + t(mine ? "revYours" : "revRate") + '</div>' +
      '<div class="rev-stars" id="revStars">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" class="rev-star' + (n <= draft.stars ? ' on' : '') + '" aria-label="' + n + '" onclick="reviewStar(\'' + jsq(d.restaurantId) + '\',' + n + ')">★</button>';
      }).join('') + '</div>' +
      '<input class="form-input" maxlength="' + REST_COMMENT_MAX + '" placeholder="' + escapeHtml(t("revComment")) + '" value="' + escapeHtml(draft.comment) + '" oninput="_revDraft[\'' + jsq(d.restaurantId) + '\'].comment=this.value">' +
      '<div class="rev-actions"><button type="button" class="btn-primary" style="width:auto;padding:8px 16px" onclick="saveRestaurantReview(\'' + jsq(d.restaurantId) + '\',\'' + jsq(s.id) + '\')">' + t("revSave") + '</button>' +
      (mine ? '<button type="button" class="btn-secondary" onclick="deleteMyReview(\'' + jsq(d.restaurantId) + '\')">' + t("delete") + '</button>' : '') + '</div></div>';
  }

  var others = restaurantReviews(d.restaurantId).filter(function (x) { return x.comment || x.uid !== me; })
    .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).slice(0, 5);
  if (others.length) {
    html += '<div class="rev-list">' + others.map(function (x) {
      return '<div class="rev-item"><span class="rest-stars">' + starsText(x.stars) + '</span> <b>' + escapeHtml(getUserName(x.uid)) + '</b>' +
        (x.comment ? '<div class="form-hint" style="margin:2px 0 0">' + escapeHtml(x.comment) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  return html + '</div>';
}

function reviewStar(restId, n) {
  var dr = _revDraft[restId] || (_revDraft[restId] = { stars: 0, comment: "" });
  dr.stars = n;
  var btns = document.querySelectorAll("#revStars .rev-star");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i < n);
}

function saveRestaurantReview(restId, sessionId) {
  var dr = _revDraft[restId] || { stars: 0, comment: "" };
  if (!(dr.stars >= 1 && dr.stars <= 5)) { showToast(t("revPickStars")); return; }
  var uid = currentUser.uid;
  fsdb.collection("restaurantReviews").doc(restId + "_" + uid).set({
    restaurantId: restId, uid: uid, stars: dr.stars, comment: String(dr.comment || "").trim().slice(0, REST_COMMENT_MAX),
    sessionId: sessionId, gid: currentGroupId || "", updatedAt: Date.now()
  }).then(function () { showToast(t("revThanks")); })
    .catch(function (error) { showToast(_permError(error)); });
}

function deleteMyReview(restId) {
  if (!confirm(t("delete") + "?")) return;
  fsdb.collection("restaurantReviews").doc(restId + "_" + currentUser.uid).delete()
    .then(function () { delete _revDraft[restId]; })
    .catch(function (error) { showToast(_permError(error)); });
}


/* ---------- Master data: Settings > Restaurants (see, edit, delete) ---------- */

/** The person who added it, a group admin who edits config, or the super admin */
function _restCanManage(r) {
  if (!r || !currentUser) return false;
  return r.createdBy === currentUser.uid || (typeof can === "function" && can("editConfig")) || (typeof isSuperAdmin === "function" && isSuperAdmin());
}

/** Deleting is only for who added it or the super admin (the Firestore rule says the same) */
function _restCanDelete(r) {
  return !!(r && currentUser && (r.createdBy === currentUser.uid || (typeof isSuperAdmin === "function" && isSuperAdmin())));
}

function _restUsage(id) {
  return (typeof lastSessions !== "undefined" ? lastSessions : []).filter(function (x) { return x.dinner && x.dinner.restaurantId === id; }).length;
}

var _restQ = "";
function _renderRestaurantsTab() {
  var key = _normName(_restQ);
  var list = restaurantList().filter(function (r) { return !key || _normName(r.name).indexOf(key) >= 0 || _normName(r.location).indexOf(key) >= 0; })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  var html = '<div class="card"><div class="card-title">' + icon("dinner", 14) + ' ' + t("tabRestaurants") + ' (' + restaurantList().length + ')</div>' +
    '<div class="form-hint" style="margin-bottom:8px">' + t("restMasterHint") + '</div>' +
    '<input class="form-input" id="restMasterQ" type="search" autocomplete="off" placeholder="' + escapeHtml(t("restSearch")) + '" value="' + escapeHtml(_restQ) + '" oninput="_restQ=this.value;_restMasterList()">' +
    '<div id="restMasterList">' + _restMasterRows(list) + '</div>' +
    '<button class="add-btn-dashed" onclick="showRestaurantForm(\'\',null,function(){renderSettings()})">+ ' + t("restNew") + '</button></div>';
  return html;
}

function _restMasterList() {
  var key = _normName(_restQ), el = document.getElementById("restMasterList");
  if (!el) return;
  el.innerHTML = _restMasterRows(restaurantList().filter(function (r) { return !key || _normName(r.name).indexOf(key) >= 0 || _normName(r.location).indexOf(key) >= 0; })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }));
}

function _restMasterRows(list) {
  if (!list.length) return '<div class="empty-state" style="padding:12px">' + t(restaurantList().length ? "restNoMatch" : "restEmpty") + '</div>';
  return list.map(function (r) {
    var used = _restUsage(r.id), can = _restCanManage(r);
    return '<div class="settings-item rest-master"><div style="flex:1;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:10px">' + restThumbHtml(r, 40) + '<div style="min-width:0"><div class="settings-label">' + escapeHtml(r.name) + '</div>' +
      '<div class="form-hint" style="margin:0">' + (r.location ? escapeHtml(r.location) : '') + (hasPin(r) ? ' ' + courtMapLink(r) : ' <span class="no-pin">' + t("noPinYet") + '</span>') + '</div>' +
      '<div class="form-hint" style="margin:0">' + ratingHtml(r.id) + (used ? ' \u00B7 ' + t("restUsedN").replace("{n}", used) : '') + '</div></div></div></div>' +
      (can ? '<div style="display:flex;gap:8px"><button class="edit-btn" aria-label="' + escapeHtml(t("restEdit")) + '" onclick="showRestaurantForm(null,\'' + jsq(r.id) + '\',function(){renderSettings()})">' + icon("pen", 16) + '</button>' +
      (_restCanDelete(r) ? '<button class="delete-btn" aria-label="' + escapeHtml(t("delete")) + '" onclick="deleteRestaurant(\'' + jsq(r.id) + '\')">' + icon("trash", 16) + '</button>' : '') + '</div>' : '') + '</div>';
  }).join('');
}

function deleteRestaurant(id) {
  var r = restaurantById(id);
  if (!r || !_restCanDelete(r)) return;
  var used = _restUsage(id);
  askConfirm({ title: t("restDeleteTitle"), big: r.name, body: used ? t("restDeleteUsed").replace("{n}", used) : t("restDeleteHint"), yes: t("delete"), danger: true }, function () {
    fsdb.collection("restaurants").doc(id).delete().then(function () { showToast(t("delete") + " ✔"); setTimeout(function () { if (typeof renderSettings === "function") renderSettings(); }, 250); })
      .catch(function (error) { showToast(_permError(error)); });
  });
}
