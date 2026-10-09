/* ============================================================
   profile.js — Profile extras and gear.
   users/{uid}.about  public part: gender, selfLevel, hand, position,
                      homeCourtId, daysFree, birthYear (only if age is shown),
                      relationship (only if not "only me")
   users/{uid}.vis    who sees each field: everyone | groups | me
   userPrivate/{uid}  only you: dob, relationship
   gear/{id}          { uid, kind racket|shoes, name, brand, photo (img:<id>),
                        main, weight, string, tension, shoeSize, note }
   ============================================================ */

var VIS_DEFAULT = { gender: "groups", age: "groups", relationship: "me", selfLevel: "everyone", hand: "everyone",
  position: "everyone", homeCourtId: "groups", daysFree: "groups", phone: "groups", story: "groups", fullName: "groups" };
var _myPrivate = null;
var _gearCache = {};   // uid -> [gear]
var _gearLoadedAt = {}; // uid -> when it was last read
var aboutForm = null;

function profileVis(u, key) { return ((u && u.vis) || {})[key] || VIS_DEFAULT[key] || "groups"; }

/** May the signed-in user see this field of u? */
function canSeeField(u, key) {
  if (!u) return false;
  if (currentUser && u.id === currentUser.uid) return true;
  var v = profileVis(u, key);
  if (v === "everyone") return true;
  if (v === "me") return false;
  // groups: someone in my current group (everyone before groups)
  return !GROUPS_ON || !!dbFindById(DB_CACHE.users, u.id);
}

function ageFromYear(y) { return y ? new Date().getFullYear() - y : null; }

function ageFromDob(dob) {
  if (!dob) return null;
  var d = new Date(dob + "T00:00:00"), n = new Date();
  var a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}

/* ---------- My profile: personal info (one card, one Save) ---------- */

function aboutCardHtml() {
  var me = findUser(currentUser.uid) || currentUserProfile || {};
  var prof = currentUserProfile || me;
  var about = me.about || {};
  if (!aboutForm) {
    aboutForm = {
      name: prof.displayName || me.displayName || "", phone: phoneDigits(prof.phone || me.phone),
      firstName: prof.firstName || me.firstName || "", lastName: prof.lastName || me.lastName || "", nickname: prof.nickname || me.nickname || "",
      gender: about.gender || "", selfLevel: normLevel(about.selfLevel || me.selfLevel), hand: about.hand || "", position: about.position || "",
      homeCourtId: about.homeCourtId || "", daysFree: (about.daysFree || []).slice(), relationship: about.relationship || "",
      timeFrom: about.timeFrom || "", timeTo: about.timeTo || "",
      dob: "", dobD: "", dobM: "", dobY: "", vis: Object.assign({}, VIS_DEFAULT, me.vis || {})
    };
    fsdb.collection("userPrivate").doc(currentUser.uid).get().then(function (doc) {
      _myPrivate = doc.exists ? doc.data() : {};
      if (aboutForm) {
        _setDobParts(_myPrivate.dob || "");
        if (!aboutForm.relationship) aboutForm.relationship = _myPrivate.relationship || "";
      }
      _rerenderAbout();
    }).catch(function () {});
  }
  var f = aboutForm;
  var vis = function (key) {
    return '<select class="vis-select" aria-label="' + t("whoCanSee") + '" onchange="aboutForm.vis.' + key + '=this.value">' +
      ["everyone", "groups", "me"].map(function (v) { return '<option value="' + v + '"' + (f.vis[key] === v ? ' selected' : '') + '>' + t("vis_" + v) + '</option>'; }).join('') + '</select>';
  };
  var seg = function (key, opts, prefix) {
    return '<div class="seg seg-wrap">' + opts.map(function (o) {
      return '<button type="button" class="seg-btn' + (f[key] === o ? ' active' : '') + '" onclick="aboutSet(\'' + key + '\',\'' + o + '\')">' + (prefix ? t(prefix + o) : o) + '</button>';
    }).join('') + '</div>';
  };
  var row = function (label, key, input, visKey) {
    return '<div class="form-group"><div class="about-label"><label class="form-label">' + label + '</label>' + (visKey === false ? '' : vis(visKey || key)) + '</div>' + input + '</div>';
  };
  var age = ageFromDob(f.dob);
  var email = prof.email || (currentUser && currentUser.email) || "";
  var html = '<div class="card" id="aboutCard"><div class="card-title">' + icon("user", 14) + ' ' + t("personalInfo") + '</div>' +
    '<div class="form-hint" style="margin-bottom:10px">' + t("aboutHint") + '</div>';
  // Who I am
  // Name: first name + surname (who can see them), nickname, and the name shown in the app
  html += row(t("fullName"), "fullName", '<div class="form-row name-row">' +
    '<input class="form-input" id="pfFirst" maxlength="30" placeholder="' + t("firstName") + '" aria-label="' + t("firstName") + '" value="' + escapeHtml(f.firstName) + '" oninput="aboutForm.firstName=this.value">' +
    '<input class="form-input" id="pfLast" maxlength="30" placeholder="' + t("lastName") + '" aria-label="' + t("lastName") + '" value="' + escapeHtml(f.lastName) + '" oninput="aboutForm.lastName=this.value"></div>');
  html += row(t("nickname"), "nickname", '<input class="form-input" id="pfNick" maxlength="20" placeholder="' + t("nicknameHint") + '" value="' + escapeHtml(f.nickname) + '" oninput="aboutForm.nickname=this.value">', false);
  html += row(t("displayName") + ' *', "name", '<input class="form-input" id="pfName" maxlength="40" value="' + escapeHtml(f.name) + '" oninput="aboutForm.name=this.value">' +
    '<div class="form-hint">' + t("displayNameHint") + '</div>', false);
  html += row(t("phone"), "phone", phoneInputHtml("pfPhone", f.phone).replace('oninput="', 'oninput="aboutForm.phone=this.value.replace(/\\D/g,\'\').slice(0,8);'));
  html += row(t("emailLabel"), "email", '<input class="form-input" value="' + escapeHtml(email) + '" disabled>', false);
  html += row(t("gender"), "gender", seg("gender", ["male", "female", "na"], "gender_"));
  html += row(t("dateOfBirth"), "dob", _dobSelectsHtml() +
    '<div class="form-hint">' + t("dobHint") + (age !== null ? ' · <b>' + t("ageN").replace("{n}", age) + '</b>' : '') + '</div>', "age");
  html += row(t("relationship"), "relationship", '<select class="form-select" onchange="aboutForm.relationship=this.value"><option value="">—</option>' +
    ["single", "relationship", "married", "na"].map(function (o) { return '<option value="' + o + '"' + (f.relationship === o ? ' selected' : '') + '>' + t("rel_" + o) + '</option>'; }).join('') + '</select>');
  // How I play
  html += '<div class="settings-section about-sub">' + icon("shuttle", 13) + ' ' + t("howIPlay") + '</div>';
  html += row(t("selfLevel"), "selfLevel", levelButtonsHtml(f.selfLevel, function (l) { return "aboutSet('selfLevel','" + l + "')"; }));
  html += row(t("hand"), "hand", seg("hand", ["right", "left"], "hand_"));
  html += row(t("position"), "position", seg("position", ["front", "back", "both"], "pos_"));
  html += row(t("homeCourt"), "homeCourtId", '<select class="form-select" onchange="aboutForm.homeCourtId=this.value"><option value="">—</option>' +
    (DB_CACHE.allCourts || DB_CACHE.courts || []).map(function (c) { return '<option value="' + c.id + '"' + (f.homeCourtId === c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'; }).join('') + '</select>');
  html += row(t("daysFree"), "daysFree", '<div class="chips">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
    return '<div class="chip' + (f.daysFree.indexOf(d) >= 0 ? ' active' : '') + '" onclick="aboutDay(' + d + ')">' + weekdayShort(d) + '</div>';
  }).join('') + '</div>' +
    '<div class="form-label" style="margin-top:10px">' + t("timeUsuallyFree") + '</div>' +
    timeRangeHtml(f.timeFrom, f.timeTo, "aboutForm.timeFrom=this.value", "aboutForm.timeTo=this.value"));
  html += '<button class="btn-primary" onclick="saveAbout()">' + t("save") + '</button></div>';
  return html;
}

/* Date of birth as day / month / year lists — the year is one tap away */
function _setDobParts(dob) {
  var p = (dob || "").split("-");
  aboutForm.dob = dob || "";
  aboutForm.dobY = p[0] || ""; aboutForm.dobM = p[1] ? String(Number(p[1])) : ""; aboutForm.dobD = p[2] ? String(Number(p[2])) : "";
}
function _dobSelectsHtml() {
  var f = aboutForm, y0 = new Date().getFullYear();
  var opt = function (v, label, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>'; };
  var days = '', months = '', years = '';
  for (var d = 1; d <= 31; d++) days += opt(d, d, f.dobD);
  for (var m = 1; m <= 12; m++) months += opt(m, _dobMonthName(m), f.dobM);
  for (var y = y0; y >= y0 - 90; y--) years += opt(y, y, f.dobY);
  return '<div class="dob-row">' +
    '<select class="form-select" aria-label="' + t("day") + '" onchange="dobSet(\'dobD\',this.value)"><option value="">' + t("day") + '</option>' + days + '</select>' +
    '<select class="form-select" aria-label="' + t("month") + '" onchange="dobSet(\'dobM\',this.value)"><option value="">' + t("month") + '</option>' + months + '</select>' +
    '<select class="form-select" aria-label="' + t("year") + '" onchange="dobSet(\'dobY\',this.value)"><option value="">' + t("year") + '</option>' + years + '</select></div>';
}
function _dobMonthName(m) {
  try { return new Date(2000, m - 1, 1).toLocaleDateString(currentLang === "la" ? "lo-LA" : "en-GB", { month: "short" }); } catch (e) { return String(m); }
}
function dobSet(part, v) {
  aboutForm[part] = v;
  var f = aboutForm;
  if (f.dobD && f.dobM && f.dobY) {
    var last = new Date(Number(f.dobY), Number(f.dobM), 0).getDate();
    if (Number(f.dobD) > last) f.dobD = String(last);
    f.dob = f.dobY + "-" + ("0" + f.dobM).slice(-2) + "-" + ("0" + f.dobD).slice(-2);
  } else f.dob = "";
  _rerenderAbout();
}

function aboutSet(key, v) { aboutForm[key] = aboutForm[key] === v ? "" : v; _rerenderAbout(); }
function aboutDay(d) { var l = aboutForm.daysFree, i = l.indexOf(d); if (i >= 0) l.splice(i, 1); else l.push(d); _rerenderAbout(); }
function _rerenderAbout() { var box = document.getElementById("aboutCard"); if (box) box.outerHTML = aboutCardHtml(); }

function saveAbout() {
  var f = aboutForm, uid = currentUser.uid;
  var name = (f.name || "").trim();
  if (!name) { showToast(t("displayName") + " *"); return; }
  var ph = readPhone("pfPhone");
  if (!ph.ok) { showToast(t("phoneInvalid")); return; }
  if ((f.dobD || f.dobM || f.dobY) && !f.dob) { showToast(t("dobIncomplete")); return; }
  var age = ageFromDob(f.dob);
  if (f.dob && (age === null || age < 0 || age > 100 || f.dob > _todayIso())) { showToast(t("dobInvalid")); return; }
  if (!timeRangeOk(f.timeFrom, f.timeTo)) { showToast(t("timeRangeInvalid")); return; }
  var about = { gender: f.gender || null, selfLevel: f.selfLevel || null, hand: f.hand || null, position: f.position || null,
    homeCourtId: f.homeCourtId || null, daysFree: f.daysFree.slice().sort(), timeFrom: f.timeFrom || null, timeTo: f.timeTo || null };
  // Kept to yourself = never written where others can read it
  about.birthYear = f.dob && f.vis.age !== "me" ? Number(f.dob.slice(0, 4)) : null;
  about.relationship = f.relationship && f.vis.relationship !== "me" ? f.relationship : null;
  var vis = {};
  Object.keys(VIS_DEFAULT).forEach(function (k) { vis[k] = f.vis[k] || VIS_DEFAULT[k]; });
  Promise.all([
    dbUpdateUser(uid, { displayName: name, firstName: (f.firstName || "").trim() || null, lastName: (f.lastName || "").trim() || null,
      nickname: (f.nickname || "").trim() || null, phone: ph.value || null, about: about, vis: vis, selfLevel: f.selfLevel || null }),
    fsdb.collection("userPrivate").doc(uid).set({ dob: f.dob || null, relationship: f.relationship || null }, { merge: true })
  ]).then(function () {
    if (currentUserProfile) {
      currentUserProfile.displayName = name; currentUserProfile.phone = ph.value || null;
      currentUserProfile.firstName = (f.firstName || "").trim() || null; currentUserProfile.lastName = (f.lastName || "").trim() || null; currentUserProfile.nickname = (f.nickname || "").trim() || null;
      currentUserProfile.about = about; currentUserProfile.vis = vis; currentUserProfile.selfLevel = f.selfLevel || null;
    }
    if (_myPrivate) _myPrivate.dob = f.dob || null;
    if (document.activeElement) document.activeElement.blur();
    showToast(t("profileSaved") + " ✔");
  }).catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Story: up to 5 photos under the profile ----------
   users/{uid}.story [{ img: "img:<id>", at }] ; who sees it: vis.story */
var MAX_STORY = 5;

function storyCardHtml(uid, editable) {
  var u = (editable ? (currentUserProfile || findUser(uid)) : findUser(uid)) || {};
  var list = (u.story || []).slice(0, MAX_STORY);
  if (!editable && (!list.length || !canSeeField(Object.assign({ id: uid }, u), "story"))) return "";
  var html = '<div class="card story-card" id="storyCard"><div class="story-head"><div class="card-title" style="margin:0">' + icon("camera", 14) + ' ' + t("storyTitle") +
    (editable ? ' <span class="badges-count">' + list.length + '/' + MAX_STORY + '</span>' : '') + '</div>';
  if (editable) {
    var v = profileVis(u, "story");
    html += '<select class="vis-select" aria-label="' + t("whoCanSee") + '" onchange="setStoryVis(this.value)">' +
      ["everyone", "groups", "me"].map(function (x) { return '<option value="' + x + '"' + (v === x ? ' selected' : '') + '>' + t("vis_" + x) + '</option>'; }).join('') + '</select>';
  }
  html += '</div><div class="story-strip">';
  list.forEach(function (it, i) {
    html += '<div class="story-tile"><img ' + imgSrcAttrs(it.img) + ' alt="" onclick="openImage(this.src)">' +
      (editable ? '<button class="story-del" aria-label="' + t("delete") + '" onclick="removeStoryPhoto(' + i + ')">\u00D7</button>' : '') + '</div>';
  });
  if (editable && list.length < MAX_STORY) {
    html += '<label class="story-tile story-add">' + icon("add", 22) + '<small>' + t("addPhoto") + '</small>' +
      '<input type="file" accept="image/*" style="display:none" onchange="addStoryPhoto(this)"></label>';
  }
  html += '</div>';
  if (editable && !list.length) html += '<div class="form-hint" style="margin-top:8px">' + t("storyHint").replace("{n}", MAX_STORY) + '</div>';
  return html + '</div>';
}

function _rerenderStory() { var box = document.getElementById("storyCard"); if (box) box.outerHTML = storyCardHtml(currentUser.uid, true); }

function addStoryPhoto(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var me = currentUserProfile || {};
  var list = (me.story || []).slice();
  if (list.length >= MAX_STORY) { showToast(t("storyFull").replace("{n}", MAX_STORY)); return; }
  showToast(t("uploading"));
  resizeImageToDataUrl(file, 1000, function (err, url) {
    if (err) { showToast(err.message); return; }
    dbSaveImage(url, "story").then(function (ref) {
      list.push({ img: ref, at: Date.now() });
      return dbUpdateUser(currentUser.uid, { story: list }).then(function () { me.story = list; _rerenderStory(); showToast(t("save") + " \u2714"); });
    }).catch(function (e) { showToast(_permError(e)); });
  });
}

function removeStoryPhoto(i) {
  var me = currentUserProfile || {};
  var list = (me.story || []).slice();
  var it = list[i];
  if (!it || !confirm(t("delete") + "?")) return;
  list.splice(i, 1);
  dbUpdateUser(currentUser.uid, { story: list }).then(function () {
    me.story = list;
    _rerenderStory();
    if (isImgRef(it.img)) fsdb.collection("images").doc(it.img.slice(4)).delete().catch(function () {});
  }).catch(function (e) { showToast(_permError(e)); });
}

function setStoryVis(v) {
  var me = currentUserProfile || {};
  var vis = Object.assign({}, VIS_DEFAULT, me.vis || {}, { story: v });
  dbUpdateUser(currentUser.uid, { vis: vis }).then(function () { me.vis = vis; if (aboutForm) aboutForm.vis.story = v; showToast(t("save") + " \u2714"); })
    .catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Gear ---------- */

function loadGear(uid) {
  return fsdb.collection("gear").where("uid", "==", uid).get().then(function (snap) {
    var list = [];
    snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
    // Rackets, then shoes, then bags & other; the main one first in each
    var order = { racket: 0, shoes: 1, other: 2 };
    list.sort(function (a, b) { return ((order[a.kind] != null ? order[a.kind] : 3) - (order[b.kind] != null ? order[b.kind] : 3)) || ((b.main ? 1 : 0) - (a.main ? 1 : 0)) || String(a.name).localeCompare(String(b.name)); });
    _gearCache[uid] = list;
    _gearLoadedAt[uid] = Date.now();
    return list;
  }).catch(function () { return []; });
}

function gearCardHtml(uid, editable) {
  var list = _gearCache[uid];
  // Someone else's gear: read it again when their profile opens, so new
  // items and photos show (the copy in memory may be from earlier)
  var stale = !_gearLoadedAt[uid] || (!editable && Date.now() - _gearLoadedAt[uid] > 5000);
  if (!list || stale) {
    loadGear(uid).then(function () { var box = document.getElementById("gearCard"); if (box) box.outerHTML = gearCardHtml(uid, editable); });
    list = list || [];
  }
  var shown = list;
  var selling = list.filter(function (g) { return g.forSale; }).length;
  var html = '<div class="card" id="gearCard"><div class="card-title">' + icon("shuttle", 14) + ' ' + t(editable ? "myGear" : "gear") +
    (editable && selling ? ' <span class="badges-count">' + t("sellingN").replace("{n}", selling).replace("{max}", MAX_LISTINGS) + '</span>' : '') + '</div>';
  if (!shown.length) html += '<div class="form-hint">' + t(editable ? "noGearYet" : "noGear") + '</div>';
  shown.forEach(function (g) {
    html += '<div class="gear-row"' + (editable ? ' onclick="showGearModal(\'' + g.id + '\')"' : '') + '>' +
      (g.photo ? '<img class="gear-photo" ' + imgSrcAttrs(g.photo) + ' alt="" onclick="event.stopPropagation();openImage(this.src)">' : '<span class="gear-photo empty">' + icon(g.kind === "shoes" ? "user" : g.kind === "other" ? "other" : "shuttle", 18) + '</span>') +
      '<span class="gear-text"><b>' + escapeHtml(g.name) + (g.main ? ' <span class="tag">' + t("mainItem") + '</span>' : '') + '</b>' +
      '<small>' + t("gearKind_" + g.kind) + (g.brand ? ' · ' + escapeHtml(g.brand) : '') +
      (g.weight ? ' · ' + escapeHtml(g.weight) : '') + (g.string ? ' · ' + escapeHtml(g.string) + (g.tension ? ' ' + g.tension + ' lbs' : '') : '') +
      (g.shoeSize ? ' · EU ' + g.shoeSize : '') + '</small>' +
      (g.forSale ? '<small class="sale-line">' + icon("wallet", 12) + ' ' + t("forSale") + (g.salePrice ? ' ' + fmtMoneyIn(g.salePrice, g.saleCurrency) : '') + ' · ' + t(g.saleScope === "public" ? "saleScope_public" : "saleScope_groups") + '</small>'
        : g.sold ? '<small class="sale-line sold">' + icon("check", 12) + ' ' + t("soldWord") + '</small>' : '') + '</span>' +
      (editable && g.forSale ? '<span class="sale-actions" onclick="event.stopPropagation()"><button class="edit-btn" onclick="markGearSold(\'' + g.id + '\')">' + t("markSold") + '</button>' +
        '<button class="edit-btn" onclick="removeFromSale(\'' + g.id + '\')">' + t("removeSale") + '</button></span>' : '') + '</div>';
  });
  if (editable && list.length < 10) html += '<button class="add-btn-dashed" onclick="showGearModal(null)">+ ' + t("addGear") + '</button>';
  return html + '</div>';
}

var _gearPhoto = null;
var GEAR_KINDS = ["racket", "shoes", "other"];
var MAX_LISTINGS = 3;

/** Sold: off the market (frees a listing slot), marked "Sold" on the item */
function markGearSold(id) {
  if (!confirm(t("markSoldQ"))) return;
  _updateSale(id, { forSale: false, sold: true, soldAt: Date.now() }, t("soldWord"));
}
/** Take it off sale without selling */
function removeFromSale(id) { _updateSale(id, { forSale: false }, t("removeSale")); }

function _updateSale(id, upd, label) {
  fsdb.collection("gear").doc(id).update(upd).then(function () {
    showToast(label + " \u2714");
    if (typeof _gearBoard !== "undefined") _gearBoard = null;
    if (typeof currentPage !== "undefined" && currentPage === "public" && typeof loadMarket === "function") loadMarket();
    return loadGear(currentUser.uid);
  }).then(function () { var box = document.getElementById("gearCard"); if (box) box.outerHTML = gearCardHtml(currentUser.uid, true); })
    .catch(function (e) { showToast(_permError(e)); });
}
function _gearSaleToggle(on) { var b = document.getElementById("gSaleBox"); if (b) b.hidden = !on; }

function showGearModal(id) {
  var mine = _gearCache[currentUser.uid] || [];
  var g = id ? mine.filter(function (x) { return x.id === id; })[0] : null;
  var f = g ? Object.assign({}, g) : { kind: "racket", name: "", brand: "", main: !mine.some(function (x) { return x.kind === "racket" && x.main; }), weight: "", string: "", tension: "", shoeSize: "", note: "" };
  _gearPhoto = f.photo || null;
  var draw = function () {
    var isR = f.kind === "racket";
    document.getElementById("modalBody").innerHTML =
      '<div class="form-group"><label class="form-label">' + t("gearKind") + ' *</label><div class="seg">' +
        GEAR_KINDS.map(function (k) { return '<button type="button" class="seg-btn' + (f.kind === k ? ' active' : '') + '" data-kind="' + k + '">' + t("gearKind_" + k) + '</button>'; }).join('') + '</div></div>' +
      '<div class="form-group"><label class="form-label">' + t("name") + ' *</label><input class="form-input" id="gName" maxlength="40" placeholder="' + ({ racket: 'Astrox 99 Pro', shoes: 'Power Cushion 65Z', other: t("gearOtherHint") })[f.kind] + '" value="' + escapeHtml(f.name) + '"></div>' +
      '<div class="form-group"><label class="form-label">' + t("photo") + '</label>' +
        '<label class="gear-photo-pick">' + (_gearPhoto ? '<img class="gear-photo big" ' + imgSrcAttrs(_gearPhoto) + ' alt="">' +
          '<span class="gear-photo-change">' + icon("camera", 16) + ' ' + t("changePhoto") + '</span>'
          : '<span class="gear-photo-empty">' + icon("camera", 28) + '<b>' + t("addPhoto") + '</b><small>' + t("addPhotoHint") + '</small></span>') +
        '<input type="file" accept="image/*" id="gPhotoFile" style="display:none"></label>' +
        (_gearPhoto ? '<button type="button" class="link-btn" style="color:var(--red)" id="gPhotoRemove">' + t("removePhoto") + '</button>' : '') + '</div>' +
      '<label class="perm-row"><input type="checkbox" id="gMain"' + (f.main ? ' checked' : '') + '><div><b>' + t("mainItem") + '</b><div class="form-hint">' + t("mainItemHint") + '</div></div></label>' +
      // Selling: shown to my groups first; "Everyone" also lists it in Public → Market
      '<label class="perm-row"><input type="checkbox" id="gSale"' + (f.forSale ? ' checked' : '') + ' onchange="_gearSaleToggle(this.checked)"><div><b>' + t("forSale") + '</b><div class="form-hint">' + t("forSaleHint") + '</div></div></label>' +
      '<div id="gSaleBox"' + (f.forSale ? '' : ' hidden') + '>' +
        '<div class="form-group"><label class="form-label">' + t("salePrice") + ' (' + curSymbol() + ')</label>' + moneyInput("gSalePrice", f.salePrice || 0, "") + '</div>' +
        '<div class="form-group"><label class="form-label">' + t("saleWhoSees") + '</label><div class="seg" id="gSaleScope">' +
          [["groups", t("saleScope_groups")], ["public", t("saleScope_public")]].map(function (o) {
            return '<button type="button" class="seg-btn' + ((f.saleScope || "groups") === o[0] ? ' active' : '') + '" data-scope="' + o[0] + '">' + o[1] + '</button>';
          }).join('') + '</div><div class="form-hint">' + t("saleScopeHint") + '</div></div>' +
        '<div class="form-group"><label class="form-label">' + t("city") + '</label><select class="form-select" id="gSaleCity">' +
          cityOptionsHtml(f.saleCity || (typeof publicCity === "function" && publicCity() !== "all" ? publicCity() : (currentGroup && currentGroup.city) || "Vientiane")) + '</select></div>' +
      '</div>' +
      '<details class="more-details"><summary>' + t("moreDetails") + '</summary>' +
        '<div class="form-group"><label class="form-label">' + t("brand") + '</label><input class="form-input" id="gBrand" list="gBrands" value="' + escapeHtml(f.brand || "") + '">' +
          '<datalist id="gBrands">' + ["Yonex", "Li-Ning", "Victor", "Apacs", "Kawasaki", "Mizuno", "Felet"].map(function (b) { return '<option value="' + b + '">'; }).join('') + '</datalist></div>' +
        (isR ? '<div class="form-row"><div class="form-group"><label class="form-label">' + t("racketWeight") + '</label><select class="form-select" id="gWeight"><option value="">—</option>' +
            ["2U", "3U", "4U", "5U"].map(function (w) { return '<option' + (f.weight === w ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">' + t("tension") + ' (lbs)</label><input type="number" class="form-input" id="gTension" min="18" max="35" value="' + escapeHtml(String(f.tension || "")) + '"></div></div>' +
          '<div class="form-group"><label class="form-label">' + t("stringName") + '</label><input class="form-input" id="gString" placeholder="BG80" value="' + escapeHtml(f.string || "") + '"></div>'
        : f.kind === "shoes" ? '<div class="form-group"><label class="form-label">' + t("shoeSize") + ' (EU)</label><input type="number" class="form-input" id="gShoe" min="34" max="48" value="' + escapeHtml(String(f.shoeSize || "")) + '"></div>' : '') +
        '<div class="form-group"><label class="form-label">' + t("note") + '</label><input class="form-input" id="gNote" maxlength="100" value="' + escapeHtml(f.note || "") + '"></div>' +
      '</details>' +
      (g ? '<button class="btn-danger" onclick="deleteGear(\'' + g.id + '\')">' + t("delete") + '</button>' : '');
    document.querySelectorAll("#gSaleScope [data-scope]").forEach(function (b) {
      b.onclick = function () { f.saleScope = b.getAttribute("data-scope"); document.querySelectorAll("#gSaleScope .seg-btn").forEach(function (x) { x.classList.toggle("active", x === b); }); };
    });
    document.querySelectorAll("#modalBody [data-kind]").forEach(function (b) {
      b.onclick = function () { f.name = document.getElementById("gName").value; f.kind = b.getAttribute("data-kind"); draw(); };
    });
    document.getElementById("gPhotoFile").onchange = function () {
      var file = this.files && this.files[0];
      if (!file) return;
      resizeImageToDataUrl(file, 500, function (err, url) { if (err) { showToast(err.message); return; } _gearPhoto = url; f.name = document.getElementById("gName").value; draw(); });
    };
    var rm = document.getElementById("gPhotoRemove");
    if (rm) rm.onclick = function () { _gearPhoto = null; f.name = document.getElementById("gName").value; draw(); };
  };
  document.getElementById("modalTitle").textContent = g ? t("editGear") : t("addGear");
  draw();
  modalCallback = function () {
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
    var data = { uid: currentUser.uid, kind: f.kind, name: val("gName"), main: document.getElementById("gMain").checked,
      brand: val("gBrand") || null, note: val("gNote") || null, weight: null, string: null, tension: null, shoeSize: null,
      forSale: document.getElementById("gSale").checked, salePrice: parseMoney(val("gSalePrice")) || null,
      saleScope: f.saleScope === "public" ? "public" : "groups", saleCity: val("gSaleCity") || null,
      saleCurrency: groupCurrency(), sellerName: (currentUserProfile && currentUserProfile.displayName) || null };
    if (!data.forSale) { data.saleScope = "groups"; }
    if (f.kind === "racket") { data.weight = val("gWeight") || null; data.string = val("gString") || null; data.tension = parseInt(val("gTension"), 10) || null; }
    else if (f.kind === "shoes") data.shoeSize = parseInt(val("gShoe"), 10) || null;
    if (!data.name) { showToast(t("name")); return; }
    // At most MAX_LISTINGS items for sale at a time
    if (data.forSale && !(g && g.forSale) && mine.filter(function (x) { return x.forSale && (!g || x.id !== g.id); }).length >= MAX_LISTINGS) {
      showToast(t("tooManyListings").replace("{max}", MAX_LISTINGS)); return;
    }
    if (data.forSale) { data.sold = false; data.listedAt = (g && g.forSale && g.listedAt) || Date.now(); }
    if (data.tension && (data.tension < 18 || data.tension > 35)) { showToast(t("tension") + " 18–35"); return; }
    var savePhoto = _gearPhoto && _gearPhoto.indexOf("data:") === 0 ? dbSaveImage(_gearPhoto, "gear") : Promise.resolve(_gearPhoto || null);
    savePhoto.then(function (ref) {
      data.photo = ref;
      var batch = fsdb.batch();
      var gref = g ? fsdb.collection("gear").doc(g.id) : fsdb.collection("gear").doc();
      batch.set(gref, data);
      // Only one main racket and one main pair of shoes
      if (data.main) mine.forEach(function (x) { if (x.id !== gref.id && x.kind === data.kind && x.main) batch.update(fsdb.collection("gear").doc(x.id), { main: false }); });
      return batch.commit();
    }).then(function () {
      closeModal();
      showToast(t("save") + " ✔");
      return loadGear(currentUser.uid);
    }).then(function () { var box = document.getElementById("gearCard"); if (box) box.outerHTML = gearCardHtml(currentUser.uid, true); })
      .catch(function (e) { showToast(_permError(e)); });
  };
  openModal();
}

function deleteGear(id) {
  if (!confirm(t("delete") + "?")) return;
  fsdb.collection("gear").doc(id).delete().then(function () {
    closeModal();
    return loadGear(currentUser.uid);
  }).then(function () { var box = document.getElementById("gearCard"); if (box) box.outerHTML = gearCardHtml(currentUser.uid, true); })
    .catch(function (e) { showToast(_permError(e)); });
}

/* ---------- On someone's profile page ---------- */

function aboutViewHtml(u) {
  var a = (u && u.about) || {};
  var facts = [];
  var push = function (key, label, value) { if (value && canSeeField(u, key)) facts.push('<span class="about-fact"><small>' + label + '</small><b>' + value + '</b></span>'); };
  if (GROUPS_ON && dbFindById(DB_CACHE.users, u.id) && typeof playerLevel === "function") {
    var lv = playerLevel(u.id), r = computeStats().players[u.id];
    if (lv || (r && r.comp)) facts.push('<span class="about-fact"><small>' + t("groupLevel") + '</small><b>' + levelBadgeHtml(lv, true) + (lv ? ' ' + escapeHtml(levelName(lv)) : '') + (r && r.comp ? ' · ' + Math.round(r.rating) : '') + '</b></span>');
  }
  var full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  push("fullName", t("fullName"), full ? escapeHtml(full) : "");
  if (u.nickname) facts.push('<span class="about-fact"><small>' + t("nickname") + '</small><b>' + escapeHtml(u.nickname) + '</b></span>');
  var sl = normLevel(a.selfLevel || u.selfLevel);
  push("selfLevel", t("selfLevel"), sl ? levelBadgeHtml(sl, true) + ' ' + escapeHtml(levelName(sl)) : "");
  push("gender", t("gender"), a.gender ? t("gender_" + a.gender) : "");
  push("age", t("age"), a.birthYear ? String(ageFromYear(a.birthYear)) : "");
  push("relationship", t("relationship"), a.relationship ? t("rel_" + a.relationship) : "");
  push("hand", t("hand"), a.hand ? t("hand_" + a.hand) : "");
  push("position", t("position"), a.position ? t("pos_" + a.position) : "");
  var hc = a.homeCourtId ? findCourt(a.homeCourtId) : null;
  push("homeCourtId", t("homeCourt"), hc ? escapeHtml(hc.name) : "");
  push("daysFree", t("daysFree"), (a.daysFree || []).map(function (d) { return weekdayShort(d); }).join(", ") +
    (a.timeFrom ? ((a.daysFree || []).length ? " · " : "") + fmtTimeRange(a.timeFrom, a.timeTo) : ""));
  var badges = GROUPS_ON && dbFindById(DB_CACHE.users, u.id) && typeof badgesHtml === "function" ? badgesHtml(u.id, false) : "";
  if (!facts.length) return badges;
  return '<div class="card"><div class="about-facts">' + facts.join('') + '</div></div>' + badges;
}
