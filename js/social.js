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
   Round robin    sessions/{id}.tournament { pairs: [{a,b}], at, by }
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
  if (blocking && !confirm(t("blockConfirm").replace("{name}", plainUserName(findUser(uid))))) return;
  if (blocking) list.push(uid); else list.splice(i, 1);
  dbUpdateUser(currentUser.uid, { blocked: list }).then(function () {
    if (currentUserProfile) currentUserProfile.blocked = list;
    closeModal();
    showToast(t(blocking ? "blocked" : "unblocked") + " ✔");
    refreshCurrentPage("users");
  }).catch(function (e) { showToast(_permError(e)); });
}

/** "…" menu on a profile: block or report */
function showPersonMenu(uid) {
  var u = findUser(uid);
  var isBlocked = myBlocked().indexOf(uid) >= 0;
  document.getElementById("modalTitle").textContent = plainUserName(u);
  document.getElementById("modalBody").innerHTML =
    '<button class="btn-secondary" onclick="toggleBlock(\'' + uid + '\')">' + icon("lock", 16) + ' ' + t(isBlocked ? "unblock" : "block") + '</button>' +
    '<div class="form-hint" style="margin:-4px 0 12px">' + t("blockHint") + '</div>' +
    '<button class="btn-danger" onclick="showReportModal(\'' + uid + '\')">' + icon("warning", 16) + ' ' + t("report") + '</button>';
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

function _renderBuddies() {
  var me = findUser(currentUser.uid) || currentUserProfile || {};
  var b = me.buddy || {};
  var html = '';
  var age = _myAge();
  // Invites for me
  var pendingIn = _invIn.filter(function (i) { return i.status === "pending" && !isBlockedPair(i.from); });
  if (pendingIn.length) {
    html += '<div class="settings-section">' + t("invitesForYou") + ' (' + pendingIn.length + ')</div>';
    pendingIn.forEach(function (i) { html += _inviteCard(i, true); });
  }
  var accepted = _invIn.concat(_invOut).filter(function (i) { return i.status === "accepted" && _inviteUpcoming(i); });
  if (accepted.length) {
    html += '<div class="settings-section">' + t("acceptedInvites") + '</div>';
    accepted.forEach(function (i) { html += _inviteCard(i, i.to === currentUser.uid); });
  }
  var sent = _invOut.filter(function (i) { return i.status !== "accepted" && _inviteUpcoming(i); });
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
  var city = publicCity();
  var list = _buddies.filter(function (u) {
    var bb = u.buddy || {};
    return u.id !== currentUser.uid && !isBlockedPair(u.id, u) && (city === "all" || !bb.city || normCity(bb.city) === city) &&
      (!buddyFilter.looking || (bb.lookingFor || []).indexOf(buddyFilter.looking) >= 0) &&
      (!buddyFilter.level || normLevel(u.selfLevel || (u.about || {}).selfLevel) === buddyFilter.level);
  });
  if (!list.length) html += '<div class="empty-state" style="padding:16px">' + t("noBuddies") + '</div>';
  list.forEach(function (u) { html += _buddyCard(u); });
  return html;
}

function _inviteUpcoming(i) { return !i.date || i.date >= _todayIso(); }

function _buddySetupHtml(me, age) {
  var b = me.buddy || {};
  buddyForm = buddyForm || { on: true, lookingFor: (b.lookingFor || ["doubles"]).slice(), city: b.city || (publicCity() !== "all" ? publicCity() : "Vientiane"),
    timeFrom: b.timeFrom || "", timeTo: b.timeTo || "", times: b.times || "", whoCanInvite: b.whoCanInvite || "groups", intro: b.intro || "" };
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
  html += '<div class="form-group"><label class="form-label">' + t("timeUsuallyFree") + '</label>' +
    timeRangeHtml(f.timeFrom, f.timeTo, "buddyForm.timeFrom=this.value", "buddyForm.timeTo=this.value") + '</div>';
  html += '<button class="btn-primary" onclick="saveBuddy(true)">' + t(b.on ? "save" : "buddyTurnOn") + '</button>';
  if (b.on) html += '<button class="btn-secondary" style="margin-top:8px" onclick="saveBuddy(false)">' + t("buddyTurnOff") + '</button>';
  return html + '</div>';
}

function editBuddy() { buddyForm = null; var me = findUser(currentUser.uid) || {}; buddyForm = Object.assign({ on: true, lookingFor: [], city: "Vientiane", times: "", whoCanInvite: "groups", intro: "" }, me.buddy || {}); buddyForm.lookingFor = (buddyForm.lookingFor || []).slice(); renderPublic(); }

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
    times: f.timeFrom ? fmtTimeRange(f.timeFrom, f.timeTo) : (f.times || "").trim(), whoCanInvite: f.whoCanInvite, intro: (f.intro || "").trim() }
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
  var html = '<div class="card game-card"><div class="buddy-head" onclick="showUserProfile(\'' + u.id + '\',event)">' + avatarHtml(u.id, 44) +
    '<div><div class="game-when" style="font-size:16px">' + escapeHtml(plainUserName(u)) + (lvl ? ' ' + levelBadgeHtml(lvl, true) : '') + '</div>' +
    (bb.intro ? '<div class="game-facts" style="margin-top:2px">' + escapeHtml(bb.intro) + '</div>' : '') + '</div></div>' +
    '<div class="game-tags">' + (bb.lookingFor || []).map(function (x) { return '<span class="tag">' + t("look_" + x) + '</span>'; }).join('') +
    (bb.times ? '<span class="tag">' + icon("clock", 12) + ' ' + escapeHtml(bb.times) + '</span>' : '') + '</div><div class="game-actions">';
  if (pending) html += '<span class="status-chip st-costs">' + t("inviteSent") + '</span>';
  else if (canInvite(u)) html += '<button class="btn-primary" onclick="showInviteModal(\'' + u.id + '\')">' + t("inviteToPlay") + '</button>';
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
    fsdb.collection("invites").add(data).then(function () { closeModal(); showToast(t("inviteSent") + " ✔"); })
      .catch(function (e) { showToast(e && e.code === "permission-denied" ? t("inviteNotAllowed") : _permError(e)); });
  };
  openModal();
}

function _inviteCard(i, incoming) {
  var other = incoming ? i.from : i.to;
  var u = findUser(other) || {};
  var html = '<div class="card game-card"><div class="buddy-head" onclick="showUserProfile(\'' + other + '\',event)">' + avatarHtml(other, 40) +
    '<div><div class="game-when" style="font-size:15px">' + escapeHtml(plainUserName(u)) + '</div>' +
    '<div class="game-facts" style="margin-top:2px">' + fmtDate(i.date) + ' ' + escapeHtml(i.time || "") + ' · ' + escapeHtml(i.courtName || "") + '</div></div></div>' +
    (i.message ? '<div class="game-note">“' + escapeHtml(i.message) + '”</div>' : '') + '<div class="game-actions">';
  if (i.status === "accepted") {
    // Contact only after both agreed
    if (u.phone) html += '<a class="btn-primary contact-btn" href="https://wa.me/' + escapeHtml(u.phone.replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '<a class="btn-secondary contact-btn" href="tel:' + escapeHtml(u.phone) + '">' + icon("phone", 14) + ' ' + t("call") + '</a>';
    else html += '<span class="form-hint">' + t("noPhoneShared") + '</span>';
    if (i.gameId) html += '<button class="btn-secondary" onclick="publicTab=\'games\';showPage(\'public\')">' + t("openGames") + '</button>';
  } else if (incoming) {
    html += '<button class="btn-primary" onclick="answerInvite(\'' + i.id + '\',\'accepted\')">' + t("accept") + '</button>' +
      '<button class="btn-secondary" onclick="answerInvite(\'' + i.id + '\',\'ignored\')">' + t("ignore") + '</button>';
  } else {
    // The sender never learns about "Ignore"
    html += '<span class="status-chip st-costs">' + t("inviteSent") + '</span><button class="btn-secondary" onclick="withdrawInvite(\'' + i.id + '\')">' + t("withdraw") + '</button>';
  }
  return html + '</div></div>';
}

function answerInvite(id, status) {
  fsdb.collection("invites").doc(id).update({ status: status, respondedAt: Date.now() })
    .then(function () { showToast(t(status === "accepted" ? "accept" : "ignore") + " ✔"); })
    .catch(function (e) { showToast(_permError(e)); });
}

function withdrawInvite(id) {
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
  if (open) html += '<div class="seg"><button class="seg-btn' + (mine === true ? ' active' : '') + '" onclick="answerDinner(\'' + s.id + '\',true)">' + t("answerJoin") + '</button>' +
    '<button class="seg-btn' + (mine === false ? ' active' : '') + '" onclick="answerDinner(\'' + s.id + '\',false)">' + t("answerSkip") + '</button></div>';
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

/* ---------- Round robin (Matches page) ---------- */

function tournamentHtml(s, list) {
  if (!s.tournament || !s.tournament.pairs) {
    if ((s.players || []).length >= 6 && (canEditSessionDetails(s) || isGroupAdminMe()) && (s.gameType || "md") !== "singles") {
      return '<button class="add-btn-dashed" onclick="startTournament(\'' + s.id + '\')">' + icon("ranking", 14) + ' ' + t("startRoundRobin") + '</button>';
    }
    return "";
  }
  var pairs = s.tournament.pairs.map(function (p) { return [p.a, p.b]; });
  var key = function (p) { return pairKey(p); };
  var table = pairs.map(function (p) { return { p: p, w: 0, l: 0, pts: 0 }; });
  var done = {};
  list.forEach(function (m) {
    if (m.teamA.length !== 2) return;
    var ia = -1, ib = -1;
    pairs.forEach(function (p, i) { if (key(p) === pairKey(m.teamA)) ia = i; if (key(p) === pairKey(m.teamB)) ib = i; });
    if (ia < 0 || ib < 0) return;
    var w = matchWinner(m), sc = matchScore(m);
    done[Math.min(ia, ib) + "-" + Math.max(ia, ib)] = true;
    if (w === "A") { table[ia].w++; table[ib].l++; } else if (w === "B") { table[ib].w++; table[ia].l++; }
    table[ia].pts += sc.pts; table[ib].pts -= sc.pts;
  });
  var standings = table.slice().sort(function (a, b) { return (b.w - a.w) || (b.pts - a.pts); });
  var html = '<div class="settings-section">' + t("roundRobin") + '</div><div class="card rank-list">';
  standings.forEach(function (r, i) {
    html += '<div class="rank-row"><span class="rank-no">' + (i + 1) + '</span><span class="rank-avatars">' + avatarHtml(r.p[0], 26) + avatarHtml(r.p[1], 26) + '</span>' +
      '<span class="rank-text"><b>' + getUserName(r.p[0]) + ' &amp; ' + getUserName(r.p[1]) + '</b><small>' + _wl(r.w, r.l) + ' · ' + (r.pts >= 0 ? '+' : '') + r.pts + ' ' + t("ptsShort") + '</small></span></div>';
  });
  html += '</div><div class="card">';
  for (var i = 0; i < pairs.length; i++) for (var j = i + 1; j < pairs.length; j++) {
    var isDone = done[i + "-" + j];
    html += '<div class="rr-game' + (isDone ? ' done' : '') + '"><span>' + getUserName(pairs[i][0]) + ' &amp; ' + getUserName(pairs[i][1]) + ' <span class="vs">vs</span> ' +
      getUserName(pairs[j][0]) + ' &amp; ' + getUserName(pairs[j][1]) + '</span>' +
      (isDone ? icon("check", 16) : '<button class="edit-btn" onclick="startRecordMatch(null,{a:[\'' + pairs[i].join("','") + '\'],b:[\'' + pairs[j].join("','") + '\']})">' + t("record") + '</button>') + '</div>';
  }
  return html + '</div>';
}

/** Pairs strongest with weakest (by rating) so the round robin is even */
function startTournament(sid) {
  var s = _matchSession();
  if (!s || !confirm(t("startRoundRobinConfirm"))) return;
  var pl = (s.players || []).slice().sort(function (a, b) { return ratingOf(b) - ratingOf(a); });
  if (pl.length % 2) pl.pop();
  var pairs = [];
  while (pl.length) pairs.push({ a: pl.shift(), b: pl.pop() });
  dbUpdateSession(sid, { tournament: { pairs: pairs, at: Date.now(), by: currentUser.uid } })
    .then(function () { if (currentSession && currentSession.id === sid) currentSession.tournament = { pairs: pairs }; renderMatchesPage(); })
    .catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Gear board (group) ---------- */

var _gearBoard = null;

function gearBoardCardHtml() {
  if (!GROUPS_ON || !currentGroupId) return "";
  if (_gearBoard === null) {
    _gearBoard = [];
    fsdb.collection("gear").where("forSale", "==", true).get().then(function (snap) {
      var list = [];
      snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
      _gearBoard = list;
      if (currentPage === "dashboard" && typeof _renderDashboard === "function") _renderDashboard();
    }).catch(function () {});
  }
  var mine = _gearBoard.filter(function (g) { return dbFindById(DB_CACHE.users, g.uid) && !isBlockedPair(g.uid); });
  if (!mine.length) return "";
  return '<div class="card"><div class="card-title">' + icon("shuttle", 14) + ' ' + t("gearForSale") + ' (' + mine.length + ')</div>' + mine.map(function (g) {
    return '<div class="gear-row" onclick="showUserProfile(\'' + g.uid + '\',event)">' +
      (g.photo ? '<img class="gear-photo" ' + imgSrcAttrs(g.photo) + ' alt="">' : '<span class="gear-photo empty">' + icon("shuttle", 18) + '</span>') +
      '<span class="gear-text"><b>' + escapeHtml(g.name) + '</b><small>' + getUserName(g.uid) + (g.salePrice ? ' · ' + fmtLAK(g.salePrice) : '') +
      (g.note ? ' · ' + escapeHtml(g.note) : '') + '</small></span></div>';
  }).join('') + '</div>';
}
