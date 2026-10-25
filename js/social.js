/* ============================================================
   social.js — Phase 4: meeting people, safely.
   Play buddies   users/{uid}.buddy { on, lookingFor[], city, times,
                  whoCanInvite groups|played|anyone, intro } (18+, off by
                  default); invites/{id} { from, to, gameId?, date, time,
                  courtId, message, status pending|accepted|ignored }.
                  Phone / WhatsApp show only after Accept; the sender is
                  never told about "Ignore".
   Block / report users/{uid}.blocked [uid]; reports/{id}
   Dinner after   sessions/{id}.dinnerPoll { uid: true|false }
   Gear board     gear/{id}.forSale + salePrice (inside your group)
   ============================================================ */

var _invIn = [], _invOut = [], _invUnsubs = [];
var _buddies = null;
var buddyFilter = { looking: "", level: "" };
var buddyForm = null;
var MAX_OPEN_INVITES = 5;

/* ---------- Blocking ---------- */

function myBlocked() { var me = findUser(currentUser.uid) || currentUserProfile || {}; return me.blocked || []; }

/** Either of us blocked the other */
function isBlockedPair(uid, user) {
  if (!uid || !currentUser) return false;
  var other = user || findUser(uid);
  return myBlocked().indexOf(uid) >= 0 || !!(other && (other.blocked || []).indexOf(currentUser.uid) >= 0);
}

function toggleBlock(uid) {
  var list = myBlocked().slice(), i = list.indexOf(uid);
  var blocking = i < 0;
  var _go = function () {

    if (blocking) list.push(uid); else list.splice(i, 1);
    dbUpdateUser(currentUser.uid, { blocked: list }).then(function () {
      if (currentUserProfile) currentUserProfile.blocked = list;
      closeModal();
      showToast(t(blocking ? "blocked" : "unblocked") + " ✔");
      refreshCurrentPage("users");
    }).catch(function (e) { showToast(_permError(e)); });
  };
  if (blocking) askYes(t("blockConfirm").replace("{name}", plainUserName(findUser(uid))), _go, { danger: true, yes: t("blocked") });
  else _go();
}

/** "…" menu on a profile: block or report */
function showPersonMenu(uid) {
  var u = findUser(uid);
  var isBlocked = myBlocked().indexOf(uid) >= 0;
  document.getElementById("modalTitle").textContent = plainUserName(u);
  document.getElementById("modalBody").innerHTML =
    '<button class="btn-secondary" onclick="toggleBlock(\'' + jsq(uid) + '\')">' + icon("lock", 16) + ' ' + t(isBlocked ? "unblock" : "block") + '</button>' +
    '<div class="form-hint" style="margin:-4px 0 12px">' + t("blockHint") + '</div>' +
    '<button class="btn-danger" onclick="showReportModal(\'' + jsq(uid) + '\')">' + icon("warning", 16) + ' ' + t("report") + '</button>';
  modalCallback = null;
  openModal();
}

function showReportModal(uid) {
  var reasons = ["rude", "harassment", "fake", "noshow", "other"];
  document.getElementById("modalTitle").textContent = t("reportName").replace("{name}", plainUserName(findUser(uid)));
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("reason") + ' *</label><select class="form-select" id="repReason">' +
      reasons.map(function (r) { return '<option value="' + r + '">' + t("reason_" + r) + '</option>'; }).join('') + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + t("details") + '</label><textarea class="form-input" id="repDetails" rows="3" maxlength="300"></textarea></div>' +
    '<div class="form-hint">' + t(currentPage === "public" || !dbFindById(DB_CACHE.users, uid) ? "reportToOwner" : "reportToAdmins") + '</div>';
  modalCallback = function () {
    var inGroup = GROUPS_ON && currentGroupId && dbFindById(DB_CACHE.users, uid) && currentPage !== "public";
    var data = { from: currentUser.uid, about: uid, reason: document.getElementById("repReason").value,
      details: document.getElementById("repDetails").value.trim(), zone: inGroup ? "group" : "public", createdAt: Date.now() };
    if (inGroup) data.groupId = currentGroupId;
    fsdb.collection("reports").add(data).then(function () { closeModal(); showToast(t("reportSent") + " ✔"); })
      .catch(function (e) { showToast(_permError(e)); });
  };
  openModal();
}

/* ---------- Play buddies ---------- */

function startInviteListeners() {
  stopInviteListeners();
  if (!GROUPS_ON || !currentUser) return;
  _invUnsubs.push(fsdb.collection("invites").where("to", "==", currentUser.uid).onSnapshot(function (snap) {
    _invIn = []; snap.forEach(function (d) { _invIn.push(Object.assign({ id: d.id }, d.data())); });
    if (currentPage === "public") renderPublic();
    if (typeof updateNotifications === "function") updateNotifications();
  }, function () {}));
  _invUnsubs.push(fsdb.collection("invites").where("from", "==", currentUser.uid).onSnapshot(function (snap) {
    _invOut = []; snap.forEach(function (d) { _invOut.push(Object.assign({ id: d.id }, d.data())); });
    if (currentPage === "public") renderPublic();
  }, function () {}));
}

function stopInviteListeners() {
  _invUnsubs.forEach(function (u) { u(); });
  _invUnsubs = []; _invIn = []; _invOut = [];
}

function _myAge() { return typeof _myPrivate !== "undefined" && _myPrivate && _myPrivate.dob ? ageFromDob(_myPrivate.dob) : null; }

function loadBuddies() {
  if (typeof _myPrivate === "undefined" || _myPrivate === null) {
    fsdb.collection("userPrivate").doc(currentUser.uid).get().then(function (doc) { _myPrivate = doc.exists ? doc.data() : {}; if (currentPage === "public") renderPublic(); }).catch(function () { _myPrivate = {}; });
  }
  fsdb.collection("users").where("buddy.on", "==", true).get().then(function (snap) {
    _buddies = [];
    snap.forEach(function (d) { _buddies.push(Object.assign({ id: d.id }, d.data())); });
    if (currentPage === "public") renderPublic();
  }).catch(function () { _buddies = []; });
}

var buddyCal = { month: "", anchor: "", sel: "", exp: false };
function setBuddyDay(iso) { buddyCal.sel = buddyCal.sel === iso ? "" : iso; if (buddyCal.sel) { buddyCal.anchor = iso; buddyCal.month = iso.slice(0, 7); } renderPublic(); }
function buddyNav(delta) {
  if (buddyCal.exp) {
    var p = (buddyCal.month || _todayIso().slice(0, 7)).split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1 + delta, 1));
    buddyCal.month = d.toISOString().slice(0, 7);
  } else {
    buddyCal.anchor = _addDays(buddyCal.anchor || _todayIso(), 7 * delta);
    buddyCal.month = buddyCal.anchor.slice(0, 7);
  }
  renderPublic();
}
function buddyToggleCal() { buddyCal.exp = !buddyCal.exp; buddyCal.month = (buddyCal.anchor || _todayIso()).slice(0, 7); renderPublic(); }

/** The weekdays (0 = Sunday) a buddy is free: the ones they set for buddies, else the ones on their profile if I may see them */
function _buddyDays(u) {
  var bb = u.buddy || {};
  if (Array.isArray(bb.days) && bb.days.length) return bb.days;
  var a = u.about || {};
  return Array.isArray(a.daysFree) && canSeeField(u, "daysFree") ? a.daysFree : [];
}
function _buddyFreeOn(u, iso) { return _buddyDays(u).indexOf(new Date(iso + "T00:00:00").getDay()) >= 0; }
/** Buddies that match the filters (and, when a day is picked on the calendar, are free that weekday) */
function _buddyMatches(byDay) {
  var city = publicCity();
  return (_buddies || []).filter(function (u) {
    var bb = u.buddy || {};
    return u.id !== currentUser.uid && !isBlockedPair(u.id, u) && (city === "all" || !bb.city || normCity(bb.city) === city) &&
      (!buddyFilter.looking || (bb.lookingFor || []).indexOf(buddyFilter.looking) >= 0) &&
      (!buddyFilter.level || normLevel(u.selfLevel || (u.about || {}).selfLevel) === buddyFilter.level) &&
      (!byDay || !buddyCal.sel || _buddyFreeOn(u, buddyCal.sel));
  });
}

function _renderBuddies() {
  var me = findUser(currentUser.uid) || currentUserProfile || {};
  var b = me.buddy || {};
  var html = '';
  var age = _myAge();
  // A calendar like the public games one: each day shows how many buddies are free that weekday plus my invites that day;
  // tap a day to see only those (v215)
  var dated = _invIn.concat(_invOut).filter(function (i) { return i.date && _inviteUpcoming(i) && !(i.status === "pending" && isBlockedPair(i.from)); });
  var counts = {};
  dated.forEach(function (i) { inviteDates(i).forEach(function (d) { counts[d] = (counts[d] || 0) + 1; }); });
  var pool = b.on && _buddies !== null ? _buddyMatches(false) : [];
  if (pool.length) for (var k = 0; k < 120; k++) {
    var dayIso = _addDays(_todayIso(), k), free = pool.filter(function (u) { return _buddyFreeOn(u, dayIso); }).length;
    if (free) counts[dayIso] = (counts[dayIso] || 0) + free;
  }
  if (dated.length || pool.length) {
    if (!buddyCal.anchor) buddyCal.anchor = _todayIso();
    if (!buddyCal.month) buddyCal.month = buddyCal.anchor.slice(0, 7);
    html += calendarHtml({ month: buddyCal.month, anchor: buddyCal.anchor, expanded: buddyCal.exp, counts: counts, selected: buddyCal.sel, pick: "setBuddyDay", nav: "buddyNav", toggle: "buddyToggleCal" });
    if (buddyCal.sel) html += '<div class="cal-sel"><b>' + fmtDate(buddyCal.sel) + '</b><button type="button" class="link-btn" onclick="setBuddyDay(\'' + buddyCal.sel + '\')">' + t("clear") + '</button></div>';
  }
  var onDay = function (i) { return !buddyCal.sel || inviteDates(i).indexOf(buddyCal.sel) >= 0; };
  // Invites for me
  var pendingIn = _invIn.filter(function (i) { return i.status === "pending" && !isBlockedPair(i.from) && onDay(i); });
  if (pendingIn.length) {
    html += '<div class="settings-section">' + t("invitesForYou") + ' (' + pendingIn.length + ')</div>';
    pendingIn.forEach(function (i) { html += _inviteCard(i, true); });
  }
  var accepted = _invIn.concat(_invOut).filter(function (i) { return i.status === "accepted" && _inviteUpcoming(i) && onDay(i); });
  if (accepted.length) {
    html += '<div class="settings-section">' + t("acceptedInvites") + '</div>';
    accepted.forEach(function (i) { html += _inviteCard(i, i.to === currentUser.uid); });
  }
  var sent = _invOut.filter(function (i) { return i.status !== "accepted" && _inviteUpcoming(i) && onDay(i); });
  if (sent.length) {
    html += '<div class="settings-section">' + t("sentInvites") + '</div>';
    sent.forEach(function (i) { html += _inviteCard(i, false); });
  }
  // My buddy settings
  if (!b.on || buddyForm) {
    html += _buddySetupHtml(me, age);
  } else {
    html += '<div class="card buddy-on"><div class="game-head"><div><b>' + t("buddyOnTitle") + '</b><div class="form-hint">' + t("buddyOnHint") + '</div></div>' +
      '<button class="edit-btn" onclick="buddyForm=null;editBuddy()">' + icon("pen", 14) + '</button></div></div>';
  }
  if (!b.on) return html;
  // People open to play
  html += '<div class="filter-bar"><div class="form-group"><select class="form-select" onchange="buddyFilter.looking=this.value;renderPublic()">' +
    '<option value="">' + t("lookingForAny") + '</option>' + ["doubles", "mixed", "singles", "dinner"].map(function (x) {
      return '<option value="' + x + '"' + (buddyFilter.looking === x ? ' selected' : '') + '>' + t("look_" + x) + '</option>'; }).join('') +
    '</select></div><div class="form-group"><select class="form-select" onchange="buddyFilter.level=this.value;renderPublic()"><option value="">' + t("anyLevel") + '</option>' +
    LEVELS.map(function (l) { return '<option value="' + l + '"' + (buddyFilter.level === l ? ' selected' : '') + '>' + levelShort(l) + ' · ' + levelName(l) + '</option>'; }).join('') + '</select></div></div>';
  if (_buddies === null) return html + '<div class="empty-state">' + t("loading") + '</div>';
  var list = _buddyMatches(true);
  if (!list.length) html += '<div class="empty-state" style="padding:16px">' + t(buddyCal.sel ? "noBuddiesDay" : "noBuddies") + '</div>';
  list.forEach(function (u) { html += _buddyCard(u); });
  return html;
}

/** The dates of an invite: one date, or one per week when it repeats */
function inviteDates(i) {
  var out = [], n = Math.max(1, Math.min(12, i.repeatWeeks || 1));
  if (!i.date) return out;
  for (var k = 0; k < n; k++) out.push(_addDays(i.date, 7 * k));
  return out;
}
/** The next date of an invite that is still to come (or its first date) */
function nextInviteDate(i) {
  var today = _todayIso(), d = inviteDates(i).filter(function (x) { return x >= today; });
  return d[0] || i.date;
}
function _inviteUpcoming(i) { return !i.date || nextInviteDate(i) >= _todayIso(); }

function _buddySetupHtml(me, age) {
  var b = me.buddy || {};
  buddyForm = buddyForm || { on: true, lookingFor: (b.lookingFor || ["doubles"]).slice(), city: b.city || (publicCity() !== "all" ? publicCity() : "Vientiane"),
    timeFrom: b.timeFrom || "", timeTo: b.timeTo || "", times: b.times || "", whoCanInvite: b.whoCanInvite || "groups", intro: b.intro || "", days: (b.days || []).slice() };
  var f = buddyForm;
  var html = '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("playBuddies") + '</div>' +
    '<div class="form-hint" style="margin-bottom:10px">' + t("buddyIntro") + '</div>';
  if (age === null || age < 18) {
    return html + '<div class="perm-note">' + icon("lock", 14) + ' ' + t(age === null ? "buddyNeedDob" : "buddyAdultsOnly") + '</div>' +
      '<button class="btn-secondary" onclick="showPage(\'profile\')">' + t("myProfile") + '</button></div>';
  }
  html += '<div class="form-group"><label class="form-label">' + t("lookingFor") + ' *</label><div class="chips">' +
    ["doubles", "mixed", "singles", "dinner"].map(function (x) {
      return '<div class="chip' + (f.lookingFor.indexOf(x) >= 0 ? ' active' : '') + '" onclick="buddyLook(\'' + x + '\')">' + t("look_" + x) + '</div>';
    }).join('') + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("whoMayInvite") + ' *</label><select class="form-select" onchange="buddyForm.whoCanInvite=this.value">' +
    ["groups", "played", "anyone"].map(function (x) { return '<option value="' + x + '"' + (f.whoCanInvite === x ? ' selected' : '') + '>' + t("invitePolicy_" + x) + '</option>'; }).join('') + '</select></div>';
  html += '<div class="form-group"><label class="form-label">' + t("city") + '</label><select class="form-select" onchange="buddyForm.city=this.value">' +
    cityOptionsHtml(f.city) + '</select></div>';
  html += '<div class="form-group"><label class="form-label">' + t("shortIntro") + '</label><input class="form-input" maxlength="120" placeholder="' + t("shortIntroHint") + '" value="' + escapeHtml(f.intro) + '" oninput="buddyForm.intro=this.value"></div>';
  html += '<div class="form-group"><label class="form-label">' + t("daysFree") + '</label><div class="chips">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
    return '<div class="chip' + ((f.days || []).indexOf(d) >= 0 ? ' active' : '') + '" onclick="buddyDay(' + d + ')">' + weekdayShort(d) + '</div>';
  }).join('') + '</div><div class="form-hint">' + t("buddyDaysHint") + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("timeUsuallyFree") + '</label>' +
    timeRangeHtml(f.timeFrom, f.timeTo, "buddyForm.timeFrom=this.value", "buddyForm.timeTo=this.value") + '</div>';
  html += '<button class="btn-primary" onclick="saveBuddy(true)">' + t(b.on ? "save" : "buddyTurnOn") + '</button>';
  if (b.on) html += '<button class="btn-secondary" style="margin-top:8px" onclick="saveBuddy(false)">' + t("buddyTurnOff") + '</button>';
  return html + '</div>';
}

function editBuddy() { buddyForm = null; var me = findUser(currentUser.uid) || {}; buddyForm = Object.assign({ on: true, lookingFor: [], city: "Vientiane", times: "", whoCanInvite: "groups", intro: "" }, me.buddy || {}); buddyForm.lookingFor = (buddyForm.lookingFor || []).slice(); renderPublic(); }

function buddyDay(d) { buddyForm.days = buddyForm.days || []; var l = buddyForm.days, i = l.indexOf(d); if (i >= 0) l.splice(i, 1); else l.push(d); renderPublic(); }

function buddyLook(x) {
  var l = buddyForm.lookingFor, i = l.indexOf(x);
  if (i >= 0) l.splice(i, 1); else l.push(x);
  renderPublic();
}

function saveBuddy(on) {
  var f = buddyForm || {};
  if (on && (!f.lookingFor || !f.lookingFor.length)) { showToast(t("lookingFor")); return; }
  if (on && (_myAge() === null || _myAge() < 18)) { showToast(t("buddyAdultsOnly")); return; }
  if (on && !timeRangeOk(f.timeFrom, f.timeTo)) { showToast(t("timeRangeInvalid")); return; }
  var data = on ? { on: true, lookingFor: f.lookingFor, city: f.city, timeFrom: f.timeFrom || null, timeTo: f.timeTo || null,
    times: f.timeFrom ? fmtTimeRange(f.timeFrom, f.timeTo) : (f.times || "").trim(), whoCanInvite: f.whoCanInvite, intro: (f.intro || "").trim(), days: (f.days || []).slice().sort() }
    : { on: false };
  dbUpdateUser(currentUser.uid, { buddy: data }).then(function () {
    buddyForm = null;
    if (currentUserProfile) currentUserProfile.buddy = data;
    showToast(t(on ? "buddyOnTitle" : "buddyTurnedOff") + " ✔");
    loadBuddies();
    renderPublic();
  }).catch(function (e) { showToast(_permError(e)); });
}

/** May I invite this person (their "who may invite me")? */
function canInvite(u) {
  var p = (u.buddy || {}).whoCanInvite || "groups";
  if (p === "anyone") return true;
  var inMyGroup = !!dbFindById(DB_CACHE.users, u.id);
  if (p === "groups") return inMyGroup;
  // played: in a session or match together
  return (lastSessions || []).some(function (s) { var pl = s.players || []; return pl.indexOf(u.id) >= 0 && pl.indexOf(currentUser.uid) >= 0; }) ||
    (typeof lastMatches !== "undefined" && lastMatches.some(function (m) { var a = m.teamA.concat(m.teamB); return a.indexOf(u.id) >= 0 && a.indexOf(currentUser.uid) >= 0; }));
}

function _buddyCard(u) {
  var bb = u.buddy || {}, lvl = u.selfLevel || (u.about || {}).selfLevel;
  var pending = _invOut.some(function (i) { return i.to === u.id && i.status === "pending"; });
  var html = '<div class="card game-card"><div class="buddy-head" onclick="showUserProfile(\'' + jsq(u.id) + '\',event)">' + avatarHtml(u.id, 44) +
    '<div><div class="game-when" style="font-size:16px">' + escapeHtml(plainUserName(u)) + (lvl ? ' ' + levelBadgeHtml(lvl, true) : '') + '</div>' +
    (bb.intro ? '<div class="game-facts" style="margin-top:2px">' + escapeHtml(bb.intro) + '</div>' : '') + '</div></div>' +
    '<div class="game-tags">' + (bb.lookingFor || []).map(function (x) { return '<span class="tag">' + t("look_" + x) + '</span>'; }).join('') +
    (_buddyDays(u).length ? '<span class="tag">' + icon("calendar", 12) + ' ' + _buddyDays(u).slice().sort(function (x, y) { return (x || 7) - (y || 7); }).map(function (d) { return weekdayShort(d); }).join(", ") + '</span>' : '') +
    (bb.times ? '<span class="tag">' + icon("clock", 12) + ' ' + escapeHtml(bb.times) + '</span>' : '') + '</div><div class="game-actions">';
  if (pending) html += '<span class="status-chip st-costs">' + t("inviteSent") + '</span>';
  else if (canInvite(u)) html += '<button class="btn-primary" onclick="showInviteModal(\'' + jsq(u.id) + '\')">' + t("inviteToPlay") + '</button>';
  else html += '<span class="form-hint">' + t("invitesOnlyKnown") + '</span>';
  return html + '</div></div>';
}

function showInviteModal(uid) {
  var openCount = _invOut.filter(function (i) { return i.status === "pending"; }).length;
  if (openCount >= MAX_OPEN_INVITES) { showToast(t("tooManyInvites").replace("{n}", MAX_OPEN_INVITES)); return; }
  var myGames = (_publicGames || []).filter(function (g) { return (g.players || []).indexOf(currentUser.uid) >= 0 && gameStartMs(g) > Date.now(); });
  var d = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  document.getElementById("modalTitle").textContent = t("inviteName").replace("{name}", plainUserName(findUser(uid)));
  document.getElementById("modalBody").innerHTML =
    '<div class="form-group"><label class="form-label">' + t("suggestedGame") + ' *</label><select class="form-select" id="invGame">' +
      myGames.map(function (g) { return '<option value="' + g.id + '">' + fmtDate(g.date) + ' ' + escapeHtml(g.time) + ' · ' + escapeHtml(g.courtName || "") + '</option>'; }).join('') +
      '<option value="">' + t("pickDateCourt") + '</option></select></div>' +
    '<div id="invCustom"' + (myGames.length ? ' style="display:none"' : '') + '><div class="form-row">' +
      '<div class="form-group"><label class="form-label">' + t("date") + '</label><input type="date" class="form-input" id="invDate" value="' + d + '"></div>' +
      '<div class="form-group"><label class="form-label">' + t("time") + '</label><input type="time" class="form-input" id="invTime" value="18:00"></div></div>' +
      '<div class="form-group"><label class="form-label">' + t("court") + '</label><select class="form-select" id="invCourt">' + _gameCourts().map(function (c) {
        return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="form-group"><label class="form-label">' + icon("history", 12) + ' ' + t("repeatLabel") + '</label><select class="form-select" id="invRepeat"><option value="1">' + t("repeatNone") + '</option>' +
      [2, 3, 4, 5, 6, 8, 10, 12].map(function (n) { return '<option value="' + n + '">' + t("repeatWeekly") + ' \u00B7 ' + t("repeatTimes").replace("{n}", n) + '</option>'; }).join('') + '</select></div>' +
    '<div class="form-group"><label class="form-label">' + t("message") + '</label><input class="form-input" id="invMsg" maxlength="120" placeholder="' + t("inviteMsgHint") + '"></div>' +
    '<div class="form-hint">' + t("inviteSafety") + '</div>';
  document.getElementById("invGame").onchange = function () { document.getElementById("invCustom").style.display = this.value ? "none" : ""; };
  modalCallback = function () {
    var msg = document.getElementById("invMsg").value.trim();
    if (/https?:|www\.|\d{6,}/i.test(msg)) { showToast(t("noLinksInMessage")); return; }
    var gid = document.getElementById("invGame").value;
    var g = gid ? myGames.filter(function (x) { return x.id === gid; })[0] : null;
    var court = g ? findCourt(g.courtId) : findCourt(document.getElementById("invCourt").value);
    var data = { from: currentUser.uid, to: uid, status: "pending", message: msg, createdAt: Date.now(),
      gameId: g ? g.id : null, date: g ? g.date : document.getElementById("invDate").value, time: g ? g.time : document.getElementById("invTime").value,
      courtId: court ? court.id : null, courtName: court ? court.name : "" };
    if (!data.date || !data.courtId) { showToast(t("fillAllFields")); return; }
    var weeks = parseInt((document.getElementById("invRepeat") || {}).value, 10) || 1;
    if (weeks > 1) data.repeatWeeks = weeks;   // one invite that repeats every week
    fsdb.collection("invites").add(data).then(function () { closeModal(); showToast(t("inviteSent") + " ✔"); })
      .catch(function (e) { showToast(e && e.code === "permission-denied" ? t("inviteNotAllowed") : _permError(e)); });
  };
  openModal();
}

function _inviteCard(i, incoming) {
  var other = incoming ? i.from : i.to;
  var u = findUser(other) || {};
  var html = '<div class="card game-card"><div class="buddy-head" onclick="showUserProfile(\'' + jsq(other) + '\',event)">' + avatarHtml(other, 40) +
    '<div><div class="game-when" style="font-size:15px">' + escapeHtml(plainUserName(u)) + '</div>' +
    '<div class="game-facts" style="margin-top:2px">' + fmtDate(nextInviteDate(i)) + ' ' + escapeHtml(i.time || "") + ' · ' + escapeHtml(i.courtName || "") +
      (i.repeatWeeks > 1 ? ' · ' + icon("history", 12) + ' ' + t("repeatWeekly") + ' \u00D7' + i.repeatWeeks : '') + '</div></div></div>' +
    (i.message ? '<div class="game-note">“' + escapeHtml(i.message) + '”</div>' : '') + '<div class="game-actions">';
  if (i.status === "accepted") {
    // Contact only after both agreed
    if (u.phone) html += '<a class="btn-primary contact-btn" href="https://wa.me/' + escapeHtml(u.phone.replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '<a class="btn-secondary contact-btn" href="tel:' + escapeHtml(u.phone) + '">' + icon("phone", 14) + ' ' + t("call") + '</a>';
    else html += '<span class="form-hint">' + t("noPhoneShared") + '</span>';
    if (i.gameId) html += '<button class="btn-secondary" onclick="publicTab=\'games\';showPage(\'public\')">' + t("openGames") + '</button>';
  } else if (incoming) {
    html += '<button class="btn-primary" onclick="answerInvite(\'' + jsq(i.id) + '\',\'accepted\')">' + t("accept") + '</button>' +
      '<button class="btn-secondary" onclick="answerInvite(\'' + jsq(i.id) + '\',\'ignored\')">' + t("ignore") + '</button>';
  } else {
    // The sender never learns about "Ignore"
    html += '<span class="status-chip st-costs">' + t("inviteSent") + '</span><button class="btn-secondary" onclick="withdrawInvite(\'' + jsq(i.id) + '\')">' + t("withdraw") + '</button>';
  }
  return html + '</div></div>';
}

function answerInvite(id, status) {
  fsdb.collection("invites").doc(id).update({ status: status, respondedAt: Date.now() })
    .then(function () { showToast(t(status === "accepted" ? "accept" : "ignore") + " ✔"); })
    .catch(function (e) { showToast(_permError(e)); });
}

function withdrawInvite(id) {
  askYes(t("confirmWithdrawInvite"), function () { _withdrawInviteNow(id); }, { danger: true, yes: t("confirm") });
}
function _withdrawInviteNow(id) {
  fsdb.collection("invites").doc(id).delete().catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Dinner after? (session page) ---------- */

function dinnerPollHtml(s) {
  if (!GROUPS_ON || !s || !currentUser || (s.players || []).indexOf(currentUser.uid) < 0) return "";
  var start = sessionStartMs(s), end = start + (s.duration || 2) * 3600e3, now = Date.now();
  var answers = s.dinnerPoll || {};
  var open = start && now >= end - 30 * 60e3 && now <= end + 12 * 3600e3;
  if (!open && !Object.keys(answers).length) return "";
  var going = Object.keys(answers).filter(function (u) { return answers[u] === true; });
  var mine = answers[currentUser.uid];
  var html = '<div class="card dinner-poll"><div class="card-title">' + icon("dinner", 14) + ' ' + t("dinnerAfterQ") + '</div>';
  if (open) html += '<div class="seg"><button class="seg-btn' + (mine === true ? ' active' : '') + '" onclick="answerDinner(\'' + jsq(s.id) + '\',true)">' + t("answerJoin") + '</button>' +
    '<button class="seg-btn' + (mine === false ? ' active' : '') + '" onclick="answerDinner(\'' + jsq(s.id) + '\',false)">' + t("answerSkip") + '</button></div>';
  html += '<div class="game-players" style="margin-top:8px">' + going.map(function (u) { return '<span title="' + escapeHtml(plainUserName(findUser(u))) + '">' + avatarHtml(u, 26) + '</span>'; }).join('') +
    '<span class="form-hint" style="align-self:center;margin-left:6px">' + t("dinnerGoingN").replace("{n}", going.length) + '</span></div>';
  if (going.length) html += '<div class="form-hint">' + t("dinnerSplitHint") + '</div>';
  return html + '</div>';
}

function answerDinner(sid, yes) {
  var upd = {};
  upd["dinnerPoll." + currentUser.uid] = yes;
  // The bill form doesn't re-render on updates — refresh just this card
  if (currentSession && currentSession.id === sid) {
    currentSession.dinnerPoll = Object.assign({}, currentSession.dinnerPoll || {});
    currentSession.dinnerPoll[currentUser.uid] = yes;
    var el = document.querySelector("#sessionDetailContent .dinner-poll");
    if (el) el.outerHTML = dinnerPollHtml(currentSession);
  }
  fsdb.collection("sessions").doc(sid).update(upd).catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Gear board (group) ---------- */

/* ---------- Reports inbox ----------
   A report made inside a group goes to that group's admins; one made in the
   public zone goes to the app owner. They read it here and mark it handled
   (which deletes it). The person reported is never told who reported them. */
var _reports = null;

function reportsCount() { return _reports ? _reports.length : 0; }

function loadReports(then) {
  if (!GROUPS_ON || !currentGroupId || !isGroupAdminMe()) { _reports = []; if (then) then(); return; }
  var qs = [fsdb.collection("reports").where("groupId", "==", currentGroupId).get()];
  if (isSuperAdmin()) qs.push(fsdb.collection("reports").where("zone", "==", "public").get());
  Promise.all(qs).then(function (snaps) {
    var seen = {}, list = [];
    snaps.forEach(function (snap) { snap.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = true; list.push(Object.assign({ id: d.id }, d.data())); } }); });
    list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var before = _reports ? _reports.length : -1;
    _reports = list;
    if (then) then();
    else if (before !== list.length && currentPage === "settings" && typeof renderSettings === "function") renderSettings();
  }).catch(function () { _reports = []; if (then) then(); });
}

function loadReportsPage() {
  setBreadcrumb([{ label: t("navSettings"), action: "showPage('settings')" }, { label: t("reportsTitle") }]);
  var box = document.getElementById("reportsContent");
  if (!box) return;
  if (!isGroupAdminMe()) { box.innerHTML = '<div class="perm-note">' + icon("lock", 14) + ' ' + t("adminsOnly") + '</div>'; return; }
  box.innerHTML = '<div class="loading">' + t("loading") + '</div>';
  loadReports(_renderReports);
}

function _renderReports() {
  var box = document.getElementById("reportsContent");
  if (!box) return;
  var html = '<div class="form-hint" style="margin:0 2px 12px">' + t("reportsPageHint") + '</div>';
  if (!_reports.length) { box.innerHTML = html + '<div class="empty-state">' + icon("check", 40) + '<div>' + t("reportsEmpty") + '</div></div>'; return; }
  _reports.forEach(function (r) {
    html += '<div class="card report-card"><div class="report-head">' +
      '<span class="report-who" onclick="showUserProfile(\'' + jsq(r.about) + '\',event)">' + avatarHtml(r.about, 32) + '<span><b>' + escapeHtml(getUserName(r.about)) + '</b>' +
      '<small>' + t("reason_" + (r.reason || "other")) + ' · ' + (r.zone === "public" ? t("reportZonePublic") : t("reportZoneGroup")) + '</small></span></span>' +
      '<span class="report-when">' + (r.createdAt && typeof _whenShort === "function" ? _whenShort(r.createdAt) : '') + '</span></div>' +
      (r.details ? '<div class="report-details">\u201C' + escapeHtml(r.details) + '\u201D</div>' : '') +
      '<div class="form-hint" style="margin:6px 0 10px">' + t("reportedBy").replace("{name}", escapeHtml(getUserName(r.from))) + '</div>' +
      '<div class="game-actions"><button class="btn-secondary" onclick="showUserProfile(\'' + jsq(r.about) + '\',event)">' + t("viewProfile") + '</button>' +
      '<button class="btn-primary" onclick="resolveReport(\'' + jsq(r.id) + '\')">' + icon("check", 14) + ' ' + t("markHandled") + '</button></div></div>';
  });
  box.innerHTML = html;
}

function resolveReport(id) {
  askYes(t("markHandledQ"), function () {
    fsdb.collection("reports").doc(id).delete().then(function () {
      _reports = (_reports || []).filter(function (r) { return r.id !== id; });
      showToast(t("markHandled") + " \u2714");
      _renderReports();
    }).catch(function (e) { showToast(_permError(e)); });
  });
}

/* ---------- Market (Public): gear for sale to everyone ----------
   gear/{id}.forSale + saleScope "public" (default "groups" = only on the
   Home board of the seller's groups), saleCity, salePrice, saleCurrency. */
var _market = null;

function loadMarket() {
  fsdb.collection("gear").where("forSale", "==", true).get().then(function (snap) {
    var list = [];
    snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
    list.sort(function (a, b) { return (b.listedAt || 0) - (a.listedAt || 0); });
    _market = list;
    _gearBoard = list;
    if (currentPage === "public" && publicTab === "market") renderPublic();
  }).catch(function (e) { _market = []; showToast(_permError(e)); });
}

function _salePrice(g) { return g.salePrice ? fmtMoneyIn(g.salePrice, g.saleCurrency) : t("priceAsk"); }

var marketFilter = { q: "", kind: "", min: "", max: "", sort: "" };   // sort: "" (as listed) | priceAsc | priceDesc | az
function setMarketFilter(field, value) {
  marketFilter[field] = value;
  var box = document.getElementById("marketList");
  if (box) box.innerHTML = _marketListHtml(); else renderPublic();
}
function clearMarketFilter() { marketFilter = { q: "", kind: "", min: "", max: "", sort: "" }; renderPublic(); }

function _marketItems() {
  var city = publicCity(), f = marketFilter, q = f.q.trim().toLowerCase();
  var min = parseMoney(f.min) || 0, max = parseMoney(f.max) || 0;
  var list = _market.filter(function (g) {
    if (!(g.saleScope === "public" && !g.sold && !isBlockedPair(g.uid) && (city === "all" || !g.saleCity || normCity(g.saleCity) === city))) return false;
    if (f.kind && (g.kind || "other") !== f.kind) return false;
    if (q && (String(g.name || "") + " " + String(g.brand || "") + " " + String(g.note || "")).toLowerCase().indexOf(q) < 0) return false;
    if (min && !(g.salePrice >= min)) return false;
    if (max && !(g.salePrice && g.salePrice <= max)) return false;
    return true;
  });
  // Sort (v222). Items without a price ("ask") go last in both price orders. Prices are compared as listed (each seller's group currency).
  var byName = function (a, b) { return String(a.name || "").localeCompare(String(b.name || ""), currentLang === "la" ? "lo" : "en", { sensitivity: "base" }); };
  if (f.sort === "az") list = list.slice().sort(byName);
  else if (f.sort === "priceAsc" || f.sort === "priceDesc") {
    var dir = f.sort === "priceAsc" ? 1 : -1;
    list = list.slice().sort(function (a, b) {
      var pa = Number(a.salePrice) || 0, pb = Number(b.salePrice) || 0;
      if (!pa && !pb) return byName(a, b);
      if (!pa) return 1;
      if (!pb) return -1;
      return (pa - pb) * dir || byName(a, b);
    });
  }
  return list;
}

function _renderMarket() {
  if (_market === null) return '<div class="empty-state">' + t("loading") + '</div>';
  var f = marketFilter;
  var html = '<div class="form-hint" style="margin:0 2px 8px">' + t("marketHint") + '</div>';
  // Search, type and price range
  html += '<div class="market-filters"><div class="mf-search">' + icon("filter", 16) + '<input class="form-input" type="search" placeholder="' + t("marketSearch") + '" value="' + escapeHtml(f.q) + '" oninput="setMarketFilter(\'q\',this.value)"></div>' +
    '<div class="mf-chips">' + [["", t("allTypes")]].concat(GEAR_KINDS.map(function (k) { return [k, t("gearKind_" + k)]; })).map(function (x) {
      return '<button type="button" class="chip' + (f.kind === x[0] ? ' active' : '') + '" onclick="setMarketFilter(\'kind\',\'' + x[0] + '\');renderPublic()">' + x[1] + '</button>';
    }).join("") + '</div>' +
    '<div class="mf-price"><input class="form-input" inputmode="numeric" placeholder="' + t("priceFrom") + '" value="' + escapeHtml(f.min) + '" oninput="setMarketFilter(\'min\',this.value)"><span>\u2013</span>' +
    '<input class="form-input" inputmode="numeric" placeholder="' + t("priceTo") + '" value="' + escapeHtml(f.max) + '" oninput="setMarketFilter(\'max\',this.value)">' +
    ((f.q || f.kind || f.min || f.max || f.sort) ? '<button type="button" class="edit-btn" onclick="clearMarketFilter()" aria-label="' + t("clear") + '">' + icon("close", 14) + '</button>' : '') + '</div>' +
    '<select class="form-select mf-sort" aria-label="' + t("marketSort") + '" onchange="setMarketFilter(\'sort\',this.value)">' +
    [["", "marketSortNew"], ["priceAsc", "marketSortLow"], ["priceDesc", "marketSortHigh"], ["az", "marketSortAz"]].map(function (o) {
      return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + t(o[1]) + '</option>'; }).join('') + '</select></div>';
  html += '<div id="marketList">' + _marketListHtml() + '</div>';
  return html;
}

function _marketListHtml() {
  var me = currentUser.uid, list = _marketItems(), html = "";
  if (!list.length) return '<div class="empty-state">' + icon("shuttle", 40) + '<div>' + (_market.length ? t("noMatch") : t("marketEmpty")) + '</div></div>';
  list.forEach(function (g) {
    var u = findUser(g.uid);
    var seller = (u && plainUserName(u)) || g.sellerName || "?";
    var phone = u && u.phone && canSeeField(u, "phone") ? u.phone.replace(/\D/g, "") : "";
    html += '<div class="card market-card">' +
      (g.photo ? '<img class="market-photo" ' + imgSrcAttrs(g.photo) + ' alt="" onclick="openImage(this.src)">' : '<div class="market-photo empty">' + icon(g.kind === "other" ? "other" : "shuttle", 36) + '</div>') +
      '<div class="market-body"><div class="market-top"><b>' + escapeHtml(g.name) + '</b><span class="market-price">' + _salePrice(g) + '</span></div>' +
      '<div class="market-facts">' + t("gearKind_" + (g.kind || "other")) + (g.brand ? ' \u00B7 ' + escapeHtml(g.brand) : '') + (g.saleCity ? ' \u00B7 ' + icon("pin", 12) + ' ' + escapeHtml(cityLabel(g.saleCity)) : '') + '</div>' +
      (g.listedAt ? '<div class="market-posted">' + icon("clock", 12) + ' ' + t("postedAt").replace("{when}", _whenShort(g.listedAt)) + '</div>' : '') +
      (g.note ? '<div class="market-note">' + escapeHtml(g.note) + '</div>' : '') +
      '<div class="market-seller" onclick="showUserProfile(\'' + jsq(g.uid) + '\',event)">' + avatarHtml(g.uid, 24) + '<span>' + escapeHtml(seller) + (g.uid === me ? ' (' + t("you") + ')' : '') + '</span></div>' +
      (g.uid === me ? '<div class="game-actions"><button class="btn-primary" onclick="markGearSold(\'' + jsq(g.id) + '\')">' + t("markSold") + '</button><button class="btn-secondary" onclick="removeFromSale(\'' + jsq(g.id) + '\')">' + t("removeSale") + '</button></div>' : '') +
      (g.uid !== me ? '<div class="game-actions">' + (phone ? '<a class="btn-primary contact-btn" href="https://wa.me/' + escapeHtml(phone) + '?text=' + encodeURIComponent(t("marketAskText").replace("{item}", g.name)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
        '<button class="btn-secondary" onclick="showUserProfile(\'' + jsq(g.uid) + '\',event)">' + t("viewSeller") + '</button></div>' : '') +
      '</div></div>';
  });
  return html;
}

var _gearBoard = null;
