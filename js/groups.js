/* ============================================================
   groups.js — Many groups in one app.
   Every poll, session, cock brand and manual player belongs to a group
   (field groupId). You can be in several groups and switch in the header.
     groups/{gid}           name, type private|public, joinMode invite|ask|open,
                            city, currency, lang, minPlayers, default payers,
                            courtPrices {courtId: price}, ownerId, …
     groupSecrets/{gid}     inviteCode (only admins can read it)
     members/{gid}_{uid}    role owner|admin|member, perms {…}, status active|pending
   Before the "Migrate to groups" job + new rules, the app runs exactly as
   before (GROUPS_ON = false): one group, no groupId.
   ============================================================ */

var GROUPS_ON = false;      // multi-group mode
var currentGroupId = null;
var currentGroup = null;    // groups/{currentGroupId}
var myMemberships = {};     // gid -> my member doc (active or pending)
var myGroupsInfo = {};      // gid -> group doc
var groupMembers = [];      // member docs of the current group
var _groupUnsubs = [];
var _myMemberUnsub = null;

// The 18 provinces of Laos (ids kept from the first city list: "Vientiane" =
// Vientiane Capital, "Udomxai" = Oudomxay). Old "Pakse" / "Thakhek" values
// are read as their provinces.
var CITIES = ["Vientiane", "Vientiane Province", "Luang Prabang", "Phongsaly", "Luang Namtha", "Udomxai", "Bokeo",
  "Houaphanh", "Xayaboury", "Xiengkhouang", "Xaisomboun", "Bolikhamxay", "Khammouane", "Savannakhet",
  "Salavan", "Sekong", "Champasak", "Attapeu", "Other"];
var CITY_ALIASES = { "Pakse": "Champasak", "Thakhek": "Khammouane" };
function normCity(c) { return CITY_ALIASES[c] || c || ""; }
function cityLabel(c) { c = normCity(c); return c ? t("city_" + c.replace(/\s/g, "")) : ""; }
function cityOptionsHtml(selected) {
  selected = normCity(selected);
  return CITIES.map(function (c) { return '<option value="' + c + '"' + (selected === c ? ' selected' : '') + '>' + cityLabel(c) + '</option>'; }).join('');
}
/* ---------- Player levels (the scale used in Lao badminton) ----------
   BG Beginner · N Novice · S Starter/Standard · P Practicer/Pro ·
   CL Club/Competitive (shown "C") · BA National & international pro
   (shown "B&A"). The first version used A–D, so "C" there means the old
   third tier: read A→P, B→S, C→N, D→BG. */
var LEVELS = ["BG", "N", "S", "P", "CL", "BA"];
var LEVEL_LEGACY = { A: "P", B: "S", C: "N", D: "BG" };
function normLevel(l) { return LEVELS.indexOf(l) >= 0 ? l : (LEVEL_LEGACY[l] || ""); }
function levelShort(l) { l = normLevel(l); return l === "BA" ? "B&A" : l === "CL" ? "C" : l; }
function levelName(l) { l = normLevel(l); return l ? t("lvName_" + l) : ""; }
function levelBadgeHtml(l, small) {
  l = normLevel(l);
  if (!l) return "";
  return '<span class="level-badge' + (small ? ' sm' : '') + ' lv-' + l + '" title="' + escapeHtml(levelName(l)) + '">' + levelShort(l) + '</span>';
}
/** Six level buttons. onPick(l) returns the onclick code for level l. */
function levelButtonsHtml(selected, onPick, id) {
  selected = normLevel(selected);
  return '<div class="level-pick"' + (id ? ' id="' + id + '"' : '') + '>' + LEVELS.map(function (l) {
    return '<button type="button" class="level-opt lv-' + l + (selected === l ? ' active' : '') + '" data-level="' + l + '" title="' + escapeHtml(levelName(l)) + '" onclick="' + onPick(l) + '">' + levelShort(l) + '</button>';
  }).join('') + '</div>' +
    '<div class="form-hint level-hint">' + (selected ? '<b>' + escapeHtml(levelName(selected)) + '</b> — ' + escapeHtml(t("lvDesc_" + selected)) + ' · ' : '') +
    '<a href="javascript:void(0)" onclick="showLevelGuide()">' + t("levelGuideLink") + '</a></div>';
}
/** onclick for buttons that only mark themselves active (read back on save) */
function levelPickLocal(l) {
  return "levelPickSet(this)";
}
function levelPickSet(btn) {
  var box = btn.parentNode;
  box.querySelectorAll(".level-opt").forEach(function (b) { b.classList.toggle("active", b === btn && !b.classList.contains("active")); });
  var l = box.querySelector(".level-opt.active"), hint = box.nextElementSibling;
  if (hint) hint.innerHTML = (l ? '<b>' + escapeHtml(levelName(l.dataset.level)) + '</b> — ' + escapeHtml(t("lvDesc_" + l.dataset.level)) + ' · ' : '') +
    '<a href="javascript:void(0)" onclick="showLevelGuide()">' + t("levelGuideLink") + '</a>';
}
function levelPicked(id) { var b = document.querySelector("#" + id + " .level-opt.active"); return b ? b.dataset.level : ""; }
/** The level table, as a sheet over whatever is open */
function showLevelGuide() {
  var el = document.createElement("div");
  el.className = "image-viewer level-guide";
  el.onclick = function (e) { if (e.target === el || e.target.closest(".lg-close")) el.remove(); };
  el.innerHTML = '<div class="lg-sheet"><div class="lg-head"><b>' + t("levelGuideTitle") + '</b><button class="lg-close" aria-label="' + t("close") + '">' + icon("close", 18) + '</button></div>' +
    LEVELS.map(function (l) {
      return '<div class="lg-row">' + levelBadgeHtml(l) + '<div><div class="lg-name">' + escapeHtml(levelName(l)) + '</div><div class="lg-desc">' + escapeHtml(t("lvDesc_" + l)) + '</div></div></div>';
    }).join('') + '<div class="form-hint" style="margin-top:8px">' + t("levelGuideNote") + '</div></div>';
  document.body.appendChild(el);
}

var CURRENCIES = { LAK: { symbol: "₭", round: 1000 }, THB: { symbol: "฿", round: 1 }, USD: { symbol: "$", round: 1 } };

/* ---------- Small helpers used everywhere ---------- */

/** A query limited to the current group (unchanged before groups) */
function groupScoped(ref) {
  return GROUPS_ON && currentGroupId ? ref.where("groupId", "==", currentGroupId) : ref;
}

/** Stamp new data with the current group */
function withGroup(data) {
  if (GROUPS_ON && currentGroupId) data.groupId = currentGroupId;
  return data;
}

function myMember() { return GROUPS_ON && currentGroupId ? myMemberships[currentGroupId] || null : null; }

function memberOf(uid) {
  for (var i = 0; i < groupMembers.length; i++) if (groupMembers[i].uid === uid) return groupMembers[i];
  return null;
}

/** Owner / admin of the current group (or the app owner) */
function isGroupAdminMe() {
  if (isSuperAdmin()) return true;
  var m = myMember();
  return !!(m && m.status === "active" && (m.role === "owner" || m.role === "admin"));
}

function groupCurrency() {
  var c = currentGroup && currentGroup.currency;
  return CURRENCIES[c] ? c : "LAK";
}

/** The group's own price for a court (shared directory courts have no price) */
function courtPrice(court) {
  if (!court) return 0;
  if (GROUPS_ON && currentGroup && currentGroup.courtPrices && currentGroup.courtPrices[court.id] != null) {
    return currentGroup.courtPrices[court.id];
  }
  return court.pricePerHour || 0;
}

function _shortId(n) {
  var abc = "abcdefghjkmnpqrstuvwxyz23456789", s = "";
  var buf = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : null;
  for (var i = 0; i < n; i++) s += abc[(buf ? buf[i] : Math.floor(Math.random() * 256)) % abc.length];
  return s;
}

function _newInviteCode() { return _shortId(6).toUpperCase(); }

/* ---------- Loading the group context after sign-in ---------- */

/**
 * Find my groups. Resolves when GROUPS_ON / currentGroupId are known.
 * Old rules (before the migration) refuse the members query → legacy mode.
 */
function loadGroupContext() {
  GROUPS_ON = false;
  currentGroupId = null;
  currentGroup = null;
  myMemberships = {};
  myGroupsInfo = {};
  groupMembers = [];
  return fsdb.collection("members").where("uid", "==", currentUser.uid).get()
    .then(function (snap) {
      GROUPS_ON = true;
      snap.forEach(function (d) { myMemberships[d.data().gid] = Object.assign({ id: d.id }, d.data()); });
      return Promise.all(Object.keys(myMemberships).map(function (gid) {
        return fsdb.collection("groups").doc(gid).get().then(function (doc) {
          if (doc.exists) myGroupsInfo[gid] = Object.assign({ id: gid }, doc.data());
        }).catch(function () {});
      }));
    }, function () { GROUPS_ON = false; })
    .then(function () {
      if (!GROUPS_ON) return;
      var active = _activeGroupIds();
      var saved = null;
      try { saved = localStorage.getItem("group"); } catch (e) {}
      currentGroupId = active.indexOf(saved) >= 0 ? saved : (active.indexOf("main") >= 0 ? "main" : (active[0] || null));
      currentGroup = currentGroupId ? myGroupsInfo[currentGroupId] : null;
      _applyGroupMoney();
    });
}

function _activeGroupIds() {
  return Object.keys(myMemberships).filter(function (g) {
    return myMemberships[g].status === "active" && myGroupsInfo[g];
  }).sort(function (a, b) { return (myGroupsInfo[a].name || "").localeCompare(myGroupsInfo[b].name || ""); });
}

/** Live updates: the current group, its roster, my memberships */
function startGroupListeners() {
  stopGroupListeners();
  if (!GROUPS_ON) return;
  // My memberships (a join request approved, removed from a group, …)
  _myMemberUnsub = fsdb.collection("members").where("uid", "==", currentUser.uid).onSnapshot(function (snap) {
    var before = myMemberships[currentGroupId];
    var next = {};
    snap.forEach(function (d) { next[d.data().gid] = Object.assign({ id: d.id }, d.data()); });
    var newGids = Object.keys(next).filter(function (g) { return !myGroupsInfo[g]; });
    myMemberships = next;
    Promise.all(newGids.map(function (gid) {
      return fsdb.collection("groups").doc(gid).get().then(function (doc) { if (doc.exists) myGroupsInfo[gid] = Object.assign({ id: gid }, doc.data()); }).catch(function () {});
    })).then(function () {
      if (currentGroupId && before && !next[currentGroupId]) { showToast(t("leftGroupToast")); switchGroup(_activeGroupIds()[0] || null); return; }
      if (!currentGroupId && _activeGroupIds().length) { switchGroup(_activeGroupIds()[0]); return; }
      updateHeaderGroup();
      if (typeof syncMyPerms === "function") syncMyPerms();
      if (/^(groups|settings)$/.test(currentPage)) refreshCurrentPage("group");
    });
  }, function () {});
  if (!currentGroupId) return;
  _groupUnsubs.push(fsdb.collection("groups").doc(currentGroupId).onSnapshot(function (doc) {
    if (!doc.exists) return;
    currentGroup = Object.assign({ id: doc.id }, doc.data());
    myGroupsInfo[currentGroupId] = currentGroup;
    _applyGroupMoney();
    rebuildGroupCache();
    updateHeaderGroup();
    refreshCurrentPage("app");
  }, dbOnError));
  _groupUnsubs.push(fsdb.collection("members").where("gid", "==", currentGroupId).onSnapshot(function (snap) {
    var list = [];
    snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
    groupMembers = list;
    rebuildGroupCache();
    refreshCurrentPage("users");
  }, dbOnError));
}

function stopGroupListeners() {
  _groupUnsubs.forEach(function (u) { if (typeof u === "function") u(); });
  _groupUnsubs = [];
  if (_myMemberUnsub) { _myMemberUnsub(); _myMemberUnsub = null; }
}

/** Roster = active members + this group's manual players; courts = the group's courts */
function rebuildGroupCache() {
  var all = DB_CACHE.allUsers || [];
  if (!GROUPS_ON) {
    DB_CACHE.users = all;
    DB_CACHE.courts = DB_CACHE.allCourts || [];
    return;
  }
  var active = {};
  groupMembers.forEach(function (m) { if (m.status === "active") active[m.uid] = true; });
  DB_CACHE.users = all.filter(function (u) { return u.manual ? u.groupId === currentGroupId : !!active[u.id]; });
  var prices = (currentGroup && currentGroup.courtPrices) || {};
  DB_CACHE.courts = (DB_CACHE.allCourts || []).filter(function (c) { return prices[c.id] != null; });
}

/** Currency symbol + rounding of the current group */
function _applyGroupMoney() {
  var c = CURRENCIES[groupCurrency()];
  if (typeof ROUND_TO !== "undefined") ROUND_TO = c.round;
}

/** Switch to another group (or none) and reload everything for it */
function switchGroup(gid) {
  closeModal();
  currentGroupId = gid || null;
  currentGroup = gid ? myGroupsInfo[gid] || null : null;
  try { if (gid) localStorage.setItem("group", gid); } catch (e) {}
  _applyGroupMoney();
  if (typeof stopPolls === "function") stopPolls();
  if (typeof stopSessions === "function") stopSessions();
  if (typeof stopMatches === "function") stopMatches();
  lastPolls = [];
  lastSessions = [];
  startGroupListeners();
  initApp();
  updateHeaderGroup();
  if (!currentGroupId) { showPage("groups"); return; }
  loadSessions();
  loadMatches();
  showPage("dashboard");
}

/* ---------- Header: group name + switcher ---------- */

function updateHeaderGroup() {
  var el = document.getElementById("headerTitle");
  if (!el) return;
  if (GROUPS_ON && currentGroup) {
    el.innerHTML = '<button class="group-switch" onclick="showGroupSwitcher()">' + escapeHtml(currentGroup.name || "Godsmash") +
      ' <span class="group-caret">▾</span></button>';
  } else {
    el.textContent = t("headerTitle");
  }
  ["nav-public", "nav-stats"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = GROUPS_ON ? "" : "none";
  });
}

function showGroupSwitcher() {
  var ids = Object.keys(myMemberships);
  var html = '<div class="group-list">';
  ids.sort(function (a, b) { return ((myGroupsInfo[a] || {}).name || "").localeCompare((myGroupsInfo[b] || {}).name || ""); });
  ids.forEach(function (gid) {
    var g = myGroupsInfo[gid] || { name: gid };
    var m = myMemberships[gid];
    var pending = m.status !== "active";
    html += '<button class="group-row' + (gid === currentGroupId ? ' active' : '') + '"' + (pending ? ' disabled' : ' onclick="switchGroup(\'' + gid + '\')"') + '>' +
      '<span class="group-badge">' + escapeHtml((g.name || "?").charAt(0).toUpperCase()) + '</span>' +
      '<span class="group-row-text"><b>' + escapeHtml(g.name || gid) + '</b><small>' +
      (pending ? t("requestPending") : t(g.type === "public" ? "groupPublic" : "groupPrivate") + ' · ' + t("role_" + m.role)) + '</small></span>' +
      (gid === currentGroupId ? icon("check", 18) : '') + '</button>';
  });
  html += '</div>';
  html += '<div class="group-actions"><button class="btn-secondary" onclick="closeModal();showPage(\'group-create\')">+ ' + t("createGroup") + '</button>' +
    '<button class="btn-secondary" onclick="closeModal();showJoinByLink()">' + icon("link", 15) + ' ' + t("joinWithLink") + '</button>' +
    '<button class="btn-secondary" onclick="closeModal();publicTab=\'groups\';showPage(\'public\')">' + icon("globe", 15) + ' ' + t("findGroup") + '</button></div>';
  document.getElementById("modalTitle").textContent = t("yourGroups");
  document.getElementById("modalBody").innerHTML = html;
  modalCallback = null;
  openModal();
}

/* ---------- Page: my groups / getting started ---------- */

function loadGroupsPage() {
  var box = document.getElementById("groupsContent");
  if (!box) return;
  var ids = Object.keys(myMemberships);
  var html = '';
  if (!_activeGroupIds().length) {
    html += '<div class="card welcome-card"><div class="welcome-icon">' + icon("users", 40) + '</div>' +
      '<h2>' + t("welcomeGroupsTitle") + '</h2><p>' + t("welcomeGroupsText") + '</p></div>';
  }
  if (ids.length) {
    html += '<div class="settings-section">' + t("yourGroups") + '</div><div class="card">';
    ids.forEach(function (gid) {
      var g = myGroupsInfo[gid] || { name: gid }, m = myMemberships[gid];
      html += '<div class="settings-item"><div class="settings-left"><span class="group-badge">' + escapeHtml((g.name || "?").charAt(0).toUpperCase()) + '</span>' +
        '<div><div class="settings-label">' + escapeHtml(g.name || gid) + '</div><div style="font-size:11px;color:var(--text-muted)">' +
        (m.status === "active" ? t("role_" + m.role) : t("requestPending")) + '</div></div></div>' +
        (m.status === "active" && gid !== currentGroupId ? '<button class="edit-btn" onclick="switchGroup(\'' + gid + '\')">' + t("open") + '</button>' : '') +
        (m.status !== "active" ? '<button class="edit-btn" onclick="cancelJoinRequest(\'' + gid + '\')">' + t("cancel") + '</button>' : '') + '</div>';
    });
    html += '</div>';
  }
  html += '<button class="card nav-card" onclick="showPage(\'group-create\')"><span class="nav-card-icon">' + icon("users", 22) + '</span>' +
    '<span class="nav-card-text"><b>' + t("createGroup") + '</b><small>' + t("createGroupHint") + '</small></span>' + icon("chevron", 16) + '</button>';
  html += '<button class="card nav-card" onclick="showJoinByLink()"><span class="nav-card-icon">' + icon("link", 22) + '</span>' +
    '<span class="nav-card-text"><b>' + t("joinWithLink") + '</b><small>' + t("joinWithLinkHint") + '</small></span>' + icon("chevron", 16) + '</button>';
  html += '<button class="card nav-card" onclick="publicTab=\'groups\';showPage(\'public\')"><span class="nav-card-icon">' + icon("globe", 22) + '</span>' +
    '<span class="nav-card-text"><b>' + t("findGroup") + '</b><small>' + t("findGroupHint") + '</small></span>' + icon("chevron", 16) + '</button>';
  box.innerHTML = html;
}

/* ---------- Create a group ---------- */

var newGroupForm = null;

function loadGroupCreate() {
  newGroupForm = newGroupForm || { name: "", type: "private", joinMode: "invite", city: "Vientiane", currency: "LAK",
    lang: currentLang === "la" ? "la" : "en", minPlayers: 4, description: "", usualDays: [], usualTime: "" };
  setBreadcrumb([{ label: t("yourGroups"), action: "showPage('groups')" }, { label: t("createGroup") }]);
  renderGroupForm("groupCreateContent", newGroupForm, false);
}

/** Group form (create or settings). Must fields first, the rest folded under More details. */
function renderGroupForm(boxId, f, isEdit) {
  var box = document.getElementById(boxId);
  if (!box) return;
  var seg = function (field, opts) {
    return '<div class="seg">' + opts.map(function (o) {
      return '<button type="button" class="seg-btn' + (f[field] === o[0] ? ' active' : '') + '" onclick="groupFormSet(\'' + boxId + '\',\'' + field + '\',\'' + o[0] + '\')">' + o[1] + '</button>';
    }).join('') + '</div>';
  };
  var joinOpts = f.type === "public"
    ? [["ask", t("joinAsk")], ["open", t("joinOpen")]]
    : [["invite", t("joinInvite")]];
  if (f.type === "public" && f.joinMode === "invite") f.joinMode = "ask";
  if (f.type === "private") f.joinMode = "invite";
  var html = '<div class="card">';
  html += '<div class="form-group"><label class="form-label">' + t("groupName") + ' *</label>' +
    '<input class="form-input" id="gfName" maxlength="40" value="' + escapeHtml(f.name) + '" oninput="groupFormSet(\'' + boxId + '\',\'name\',this.value,true)"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("groupType") + ' *</label>' +
    seg("type", [["private", icon("lock", 14) + ' ' + t("groupPrivate")], ["public", icon("globe", 14) + ' ' + t("groupPublic")]]) +
    '<div class="form-hint">' + t(f.type === "public" ? "groupPublicHint" : "groupPrivateHint") + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("whoCanJoin") + ' *</label>' + seg("joinMode", joinOpts) + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("city") + ' *</label><select class="form-select" onchange="groupFormSet(\'' + boxId + '\',\'city\',this.value)">' +
    cityOptionsHtml(f.city) + '</select></div>';
  html += '<div class="form-group"><label class="form-label">' + t("currency") + ' *</label>' +
    seg("currency", [["LAK", "LAK ₭"], ["THB", "THB ฿"], ["USD", "USD $"]]) + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("minPlayersLabel") + '</label>' +
    '<input type="number" class="form-input" min="2" max="30" value="' + (f.minPlayers || 4) + '" onchange="groupFormSet(\'' + boxId + '\',\'minPlayers\',Math.max(2,parseInt(this.value,10)||4),true)"></div>';
  if (!f.maxPoints) f.maxPoints = "31";
  f.maxPoints = String(f.maxPoints);
  html += '<div class="form-group"><label class="form-label">' + t("maxPointsLabel") + '</label>' +
    seg("maxPoints", [["31", t("maxPoints31")], ["30", t("maxPoints30")]]) + '<div class="form-hint">' + t("maxPointsHint") + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("groupDescription") + '</label>' +
    '<textarea class="form-input" rows="2" maxlength="200" placeholder="' + t("groupDescriptionHint") + '" oninput="groupFormSet(\'' + boxId + '\',\'description\',this.value,true)">' + escapeHtml(f.description || "") + '</textarea></div>';
  html += '<div class="form-group"><label class="form-label">' + t("language") + '</label>' + seg("lang", [["la", "ລາວ"], ["en", "English"]]) + '</div>';
  html += '<details class="more-details"' + (f._more ? ' open' : '') + ' ontoggle="(' + (isEdit ? 'groupEditForm' : 'newGroupForm') + '||{})._more=this.open"><summary>' + t("moreDetails") + '</summary>';
  html += '<div class="form-group"><label class="form-label">' + t("usualDays") + '</label><div class="chips">' +
    [1, 2, 3, 4, 5, 6, 0].map(function (d) {
      var on = (f.usualDays || []).indexOf(d) >= 0;
      return '<div class="chip' + (on ? ' active' : '') + '" onclick="groupFormDay(\'' + boxId + '\',' + d + ')">' + weekdayShort(d) + '</div>';
    }).join('') + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("usualTime") + '</label>' +
    timeRangeHtml(f.usualTime, f.usualTimeTo, "groupFormSet('" + boxId + "','usualTime',this.value,true)", "groupFormSet('" + boxId + "','usualTimeTo',this.value,true)") + '</div>';
  html += '</details>';
  html += '<button class="btn-primary" onclick="' + (isEdit ? 'saveGroupSettings()' : 'submitNewGroup()') + '">' + t(isEdit ? "save" : "createGroup") + '</button>';
  html += '</div>';
  box.innerHTML = html;
}

function _groupFormOf(boxId) { return boxId === "groupCreateContent" ? newGroupForm : groupEditForm; }

function groupFormSet(boxId, field, value, quiet) {
  var f = _groupFormOf(boxId);
  if (!f) return;
  f[field] = value;
  if (field === "type") f.joinMode = value === "public" ? "ask" : "invite";
  if (!quiet) renderGroupForm(boxId, f, boxId !== "groupCreateContent");
}

function groupFormDay(boxId, d) {
  var f = _groupFormOf(boxId);
  var list = f.usualDays || (f.usualDays = []);
  var i = list.indexOf(d);
  if (i >= 0) list.splice(i, 1); else list.push(d);
  renderGroupForm(boxId, f, boxId !== "groupCreateContent");
}

function _groupDataFrom(f) {
  return {
    name: (f.name || "").trim(), type: f.type, joinMode: f.joinMode, city: f.city, currency: f.currency,
    lang: f.lang, minPlayers: f.minPlayers || 4, maxPoints: Number(f.maxPoints) === 30 ? 30 : 31, description: (f.description || "").trim(),
    usualDays: f.usualDays || [], usualTime: f.usualTime || "", usualTimeTo: f.usualTimeTo || ""
  };
}

function submitNewGroup() {
  var f = newGroupForm;
  var data = _groupDataFrom(f);
  if (data.name.length < 3) { showToast(t("groupNameTooShort")); return; }
  if (!timeRangeOk(data.usualTime, data.usualTimeTo)) { showToast(t("timeRangeInvalid")); return; }
  var uid = currentUser.uid;
  var gid = _shortId(8);
  var batch = fsdb.batch();
  batch.set(fsdb.collection("groups").doc(gid), Object.assign(data, { ownerId: uid, createdAt: Date.now(), courtPrices: {} }));
  batch.set(fsdb.collection("groupSecrets").doc(gid), { inviteCode: _newInviteCode() });
  batch.set(fsdb.collection("members").doc(gid + "_" + uid), { gid: gid, uid: uid, role: "owner", perms: {}, status: "active", joinedAt: Date.now() });
  batch.commit().then(function () {
    myMemberships[gid] = { id: gid + "_" + uid, gid: gid, uid: uid, role: "owner", perms: {}, status: "active" };
    myGroupsInfo[gid] = Object.assign({ id: gid }, data, { ownerId: uid, courtPrices: {} });
    newGroupForm = null;
    showToast(t("groupCreated") + " ✔");
    switchGroup(gid);
    setTimeout(function () { showPage("group-settings"); }, 300);
  }).catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Joining ---------- */

/** "…#join=<gid>.<code>" or "<gid>.<code>" → { gid, code } */
function parseInviteText(text) {
  var m = String(text || "").match(/join=([a-z0-9]+)\.([A-Za-z0-9]+)/) || String(text || "").trim().match(/^([a-z0-9]+)\.([A-Za-z0-9]+)$/);
  return m ? { gid: m[1], code: m[2].toUpperCase() } : null;
}

function inviteLink(gid, code) { return _appUrl() + "#join=" + gid + "." + code; }

function showJoinByLink() {
  document.getElementById("modalTitle").textContent = t("joinWithLink");
  document.getElementById("modalBody").innerHTML = '<div class="form-group"><label class="form-label">' + t("pasteInvite") + '</label>' +
    '<input class="form-input" id="joinLinkInput" placeholder="https://…#join=…"></div>';
  modalCallback = function () {
    var inv = parseInviteText(document.getElementById("joinLinkInput").value);
    if (!inv) { showToast(t("inviteInvalid")); return; }
    closeModal();
    joinGroup(inv.gid, inv.code);
  };
  openModal();
}

/** Join with an invite code (private groups) or straight into an open public group */
function joinGroup(gid, code, opts) {
  opts = opts || {};
  if (myMemberships[gid] && myMemberships[gid].status === "active") { switchGroup(gid); return Promise.resolve(); }
  return fsdb.collection("groups").doc(gid).get().then(function (doc) {
    if (!doc.exists) { showToast(t("inviteInvalid")); return; }
    var g = Object.assign({ id: gid }, doc.data());
    var ask = !code && g.type === "public" && g.joinMode === "ask";
    if (!code && !(g.type === "public" && (g.joinMode === "open" || g.joinMode === "ask"))) { showToast(t("inviteOnlyGroup")); return; }
    var go = function (message, level) {
      var m = { gid: gid, uid: currentUser.uid, role: "member", perms: {}, status: ask ? "pending" : "active", joinedAt: Date.now(), level: level || null };
      if (code) m.code = code;
      if (message) m.message = message;
      return fsdb.collection("members").doc(gid + "_" + currentUser.uid).set(m).then(function () {
        myMemberships[gid] = Object.assign({ id: gid + "_" + currentUser.uid }, m);
        myGroupsInfo[gid] = g;
        closeModal();
        if (ask) { showToast(t("requestSent") + " ✔"); refreshCurrentPage("group"); return; }
        showToast(t("joinedGroup").replace("{name}", g.name) + " ✔");
        switchGroup(gid);
      }).catch(function (e) { showToast(code ? t("inviteInvalid") : _permError(e)); });
    };
    document.getElementById("modalTitle").textContent = t(ask ? "askToJoin" : "joinGroupQ").replace("{name}", g.name);
    document.getElementById("modalBody").innerHTML =
      '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">' + escapeHtml(g.description || "") +
        (g.city ? ' · ' + icon("pin", 12) + ' ' + escapeHtml(cityLabel(g.city)) : '') + '</div>' +
      '<div class="form-group"><label class="form-label">' + t("startingLevel") + '</label><div id="joinLevel">' +
        '</div>' + levelButtonsHtml((findUser(currentUser.uid) || currentUserProfile || {}).selfLevel, levelPickLocal, "joinLevelPick") +
      '<div class="form-hint">' + t("startingLevelHint") + '</div></div>' +
      (ask ? '<div class="form-group"><label class="form-label">' + t("messageToAdmin") + '</label><textarea class="form-input" id="joinMsg" rows="2" maxlength="200" placeholder="' + t("messageToAdminHint") + '"></textarea></div>' : '');
    modalCallback = function () {
      var msgEl = document.getElementById("joinMsg");
      go(msgEl ? msgEl.value.trim() : "", levelPicked("joinLevelPick"));
    };
    openModal();
  }).catch(function (e) { showToast(_permError(e)); });
}

function cancelJoinRequest(gid) {
  fsdb.collection("members").doc(gid + "_" + currentUser.uid).delete().then(function () {
    delete myMemberships[gid];
    refreshCurrentPage("group");
  }).catch(function (e) { showToast(_permError(e)); });
}

/** A link like …#join=<gid>.<code> opened the app */
function joinFromHash() {
  var inv = parseInviteText(location.hash);
  if (!inv) return false;
  history.replaceState(null, "", location.pathname);
  joinGroup(inv.gid, inv.code);
  return true;
}

// An invite link opened while the app is already running
window.addEventListener("hashchange", function () {
  if (currentUser && GROUPS_ON) joinFromHash();
});

function leaveGroup() {
  var m = myMember();
  if (!m || m.role === "owner") return;
  if (!confirm(t("leaveGroupConfirm").replace("{name}", currentGroup ? currentGroup.name : ""))) return;
  fsdb.collection("members").doc(m.id).delete().then(function () {
    delete myMemberships[currentGroupId];
    switchGroup(_activeGroupIds()[0] || null);
  }).catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Group settings (admins) ---------- */

var groupEditForm = null;
var _groupSecret = null;

function loadGroupSettings() {
  setBreadcrumb([{ label: t("navSettings"), action: "showPage('settings')" }, { label: t("groupSettings") }]);
  if (!currentGroup) return;
  groupEditForm = Object.assign({}, currentGroup, { _more: groupEditForm && groupEditForm._more });
  var box = document.getElementById("groupSettingsContent");
  if (!box) return;
  if (!isGroupAdminMe()) {
    box.innerHTML = '<div class="perm-note">' + icon("lock", 14) + ' ' + t("adminsOnly") + '</div>';
    return;
  }
  box.innerHTML = '<div id="groupInviteBox"></div><div class="settings-section">' + t("groupDetails") + '</div><div id="groupFormBox"></div>';
  renderGroupForm("groupFormBox", groupEditForm, true);
  _renderInviteBox();
  fsdb.collection("groupSecrets").doc(currentGroupId).get().then(function (doc) {
    _groupSecret = doc.exists ? doc.data() : null;
    _renderInviteBox();
  }).catch(function () {});
}

function _renderInviteBox() {
  var box = document.getElementById("groupInviteBox");
  if (!box) return;
  var code = _groupSecret && _groupSecret.inviteCode;
  var link = code ? inviteLink(currentGroupId, code) : "";
  box.innerHTML = '<div class="card"><div class="card-title">' + icon("link", 14) + ' ' + t("inviteLink") + '</div>' +
    '<div class="form-hint" style="margin-bottom:10px">' + t("inviteLinkHint") + '</div>' +
    (code ? '<div class="invite-qr" id="inviteQr"></div>' +
      '<input class="form-input" value="' + escapeHtml(link) + '" readonly onclick="this.select()" style="margin:10px 0 8px">' +
      '<div class="map-actions"><button class="btn-primary map-btn" onclick="shareInvite()">' + icon("link", 15) + ' ' + t("shareInvite") + '</button>' +
      '<button class="btn-secondary map-btn" onclick="resetInviteCode()">' + t("resetCode") + '</button></div>'
      : '<div class="empty-state" style="padding:8px">' + t("loading") + '</div>') + '</div>';
  if (code) renderQr("inviteQr", link, 180);
}

function shareInvite() {
  var link = inviteLink(currentGroupId, _groupSecret.inviteCode);
  var text = t("inviteGroupMessage").replace("{name}", currentGroup.name) + "\n" + link;
  if (navigator.share) { navigator.share({ title: currentGroup.name, text: text }).catch(function () {}); return; }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { showToast(t("copied")); });
  else showToast(link);
}

function resetInviteCode() {
  if (!confirm(t("resetCodeConfirm"))) return;
  var code = _newInviteCode();
  fsdb.collection("groupSecrets").doc(currentGroupId).set({ inviteCode: code }, { merge: true }).then(function () {
    _groupSecret = { inviteCode: code };
    _renderInviteBox();
    showToast(t("resetCode") + " ✔");
  }).catch(function (e) { showToast(_permError(e)); });
}

function saveGroupSettings() {
  var data = _groupDataFrom(groupEditForm);
  if (data.name.length < 3) { showToast(t("groupNameTooShort")); return; }
  if (!timeRangeOk(data.usualTime, data.usualTimeTo)) { showToast(t("timeRangeInvalid")); return; }
  fsdb.collection("groups").doc(currentGroupId).update(data).then(function () {
    showToast(t("save") + " ✔");
  }).catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Members & requests (admins) ---------- */

function loadGroupMembers() {
  setBreadcrumb([{ label: t("navSettings"), action: "showPage('settings')" }, { label: t("members") }]);
  var box = document.getElementById("groupMembersContent");
  if (!box) return;
  var admin = isGroupAdminMe();
  var pending = groupMembers.filter(function (m) { return m.status === "pending"; });
  var active = groupMembers.filter(function (m) { return m.status === "active"; });
  var rank = { owner: 0, admin: 1, member: 2 };
  active.sort(function (a, b) { return (rank[a.role] - rank[b.role]) || getUserName(a.uid).localeCompare(getUserName(b.uid)); });
  var html = '';
  if (admin && pending.length) {
    html += '<div class="settings-section">' + t("joinRequests") + ' (' + pending.length + ')</div><div class="card">';
    pending.forEach(function (m) {
      html += '<div class="settings-item"><div class="settings-left">' + avatarHtml(m.uid, 34) +
        '<div><div class="settings-label">' + getUserName(m.uid) + ' ' + levelBadgeHtml(m.level || (findUser(m.uid) || {}).selfLevel, true) + '</div>' +
        (m.message ? '<div style="font-size:12px;color:var(--text-secondary)">“' + escapeHtml(m.message) + '”</div>' : '') + '</div></div>' +
        '<div style="display:flex;gap:6px"><button class="edit-btn" onclick="approveMember(\'' + m.id + '\')">' + t("approve") + '</button>' +
        '<button class="delete-btn" onclick="removeMember(\'' + m.id + '\',true)">' + t("decline") + '</button></div></div>';
    });
    html += '</div>';
  }
  html += '<div class="settings-section">' + t("members") + ' (' + active.length + ')</div><div class="card">';
  active.forEach(function (m) {
    var isMe = m.uid === currentUser.uid;
    html += '<div class="settings-item"><div class="settings-left" role="button" style="cursor:pointer" onclick="showUserProfile(\'' + m.uid + '\',event)">' + avatarHtml(m.uid, 34) +
      '<div><div class="settings-label">' + getUserName(m.uid) + (isMe ? ' <span style="font-size:11px;color:var(--accent)">(' + t("you") + ')</span>' : '') + '</div>' +
      '<div style="margin-top:4px">' + memberBadges(m) + '</div></div></div>' +
      (admin && m.role !== "owner" && !isMe ? '<button class="edit-btn" onclick="showMemberModal(\'' + m.id + '\')">' + icon("key", 14) + ' ' + t("permissions") + '</button>' : '') + '</div>';
  });
  html += '</div>';
  if (myMember() && myMember().role !== "owner") {
    html += '<button class="btn-danger" onclick="leaveGroup()">' + t("leaveGroup") + '</button>';
  }
  box.innerHTML = html;
}

/** Role + rights badges for a member */
function memberBadges(m) {
  if (!m) return '';
  if (m.role === "owner") return '<span class="perm-badge super">' + icon("crown", 12) + ' ' + t("role_owner") + '</span>';
  if (m.role === "admin") return '<span class="perm-badge super">' + icon("key", 12) + ' ' + t("role_admin") + '</span>';
  return _permBadges(m.perms || {});
}

function approveMember(mid) {
  fsdb.collection("members").doc(mid).update({ status: "active", approvedAt: Date.now(), approvedBy: currentUser.uid }).then(function () { showToast(t("approve") + " ✔"); })
    .catch(function (e) { showToast(_permError(e)); });
}

function removeMember(mid, isRequest) {
  var m = groupMembers.filter(function (x) { return x.id === mid; })[0];
  if (!m) return;
  if (!isRequest && !confirm(t("removeMemberConfirm").replace("{name}", getUserName(m.uid)))) return;
  fsdb.collection("members").doc(mid).delete().then(function () { closeModal(); showToast(t(isRequest ? "decline" : "removeMember") + " ✔"); })
    .catch(function (e) { showToast(_permError(e)); });
}

function showMemberModal(mid) {
  var m = groupMembers.filter(function (x) { return x.id === mid; })[0];
  if (!m) return;
  var perms = m.perms || {};
  var rows = '<div class="form-group"><label class="form-label">' + t("role") + '</label><div class="seg" id="memberRole">' +
    ["member", "admin"].map(function (r) { return '<button type="button" class="seg-btn' + (m.role === r ? ' active' : '') + '" data-role="' + r + '" onclick="this.parentNode.querySelectorAll(\'.seg-btn\').forEach(function(b){b.classList.remove(\'active\')});this.classList.add(\'active\')">' + t("role_" + r) + '</button>'; }).join('') +
    '</div><div class="form-hint">' + t("roleAdminHint") + '</div></div>';
  rows += '<div class="form-group"><label class="form-label">' + t("groupLevel") + '</label>' +
    levelButtonsHtml(m.level || (findUser(m.uid) || {}).selfLevel, levelPickLocal, "memberLevelPick") + '</div>';
  PERMISSIONS.forEach(function (p) {
    rows += '<label class="perm-row"><input type="checkbox" data-perm="' + p.key + '"' + (perms[p.key] ? ' checked' : '') + '>' +
      '<div><div style="font-weight:600">' + icon(p.icon, 14) + ' ' + t("perm_" + p.key) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted)">' + t("permDesc_" + p.key) + '</div></div></label>';
  });
  rows += '<button class="btn-danger" style="margin-top:10px" onclick="removeMember(\'' + mid + '\')">' + t("removeMember") + '</button>';
  document.getElementById("modalTitle").textContent = t("permissions") + " — " + getUserName(m.uid);
  document.getElementById("modalBody").innerHTML = rows;
  modalCallback = function () {
    var role = document.querySelector("#memberRole .seg-btn.active").getAttribute("data-role");
    var data = { role: role, perms: {}, level: levelPicked("memberLevelPick") || null };
    document.querySelectorAll("#modalBody input[data-perm]").forEach(function (cb) { data.perms[cb.getAttribute("data-perm")] = cb.checked; });
    fsdb.collection("members").doc(mid).update(data).then(function () { closeModal(); showToast(t("save") + " ✔"); })
      .catch(function (e) { showToast(_permError(e)); });
  };
  openModal();
}

/* ---------- QR code (bundled generator, loaded on demand) ---------- */
var _qrLibLoading = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (_qrLibLoading) return _qrLibLoading;
  _qrLibLoading = new Promise(function (resolve, reject) {
    var s = document.createElement("script");
    s.src = "js/vendor/qrcode/qrcode.js";
    s.onload = function () { resolve(window.qrcode); };
    s.onerror = function () { _qrLibLoading = null; reject(new Error("QR")); };
    document.head.appendChild(s);
  });
  return _qrLibLoading;
}

function renderQr(elId, text, size) {
  loadQrLib().then(function (qrcode) {
    var el = document.getElementById(elId);
    if (!el) return;
    var qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    var cell = Math.max(2, Math.floor((size || 180) / (qr.getModuleCount() + 8)));
    el.innerHTML = qr.createSvgTag({ cellSize: cell, margin: cell * 4, scalable: true });
  }).catch(function () {});
}
