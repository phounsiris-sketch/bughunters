/* ============================================================
   public.js — The public zone (everyone can see it):
     Open games  openGames/{id}: anyone hosts a game; others join until the
                 slots are full (then a waitlist); it confirms itself when full
     Groups      public groups to join (open or ask-to-join)
     Courts      the shared court directory with map pins
   Group data (polls, sessions, stats) never shows here.
   ============================================================ */

var publicTab = "games";
var _publicGames = [];
var PUBLIC_GAME_TTL_H = 24;                 // a game not confirmed 24 h after posting is removed
var PUBLIC_GAME_MIN_PLAYERS = 4;            // confirmed = at least this many players
var pubCal = { month: "", anchor: "", sel: "", exp: false };   // week shown (or the month when expanded) and the picked day

var _publicGroups = null;
var _publicUnsub = null;
var _here = null; // { lat, lng } once the browser tells us
var GAME_TYPES = ["md", "wd", "xd", "singles", "any"];
var PLAY_MODES = ["fun", "exercise", "competition"];

function publicCity() {
  var v = null;
  try { v = localStorage.getItem("publicCity"); } catch (e) {}
  return normCity(v || (currentGroup && currentGroup.city)) || "Vientiane";
}

function setPublicCity(v) {
  try { localStorage.setItem("publicCity", v); } catch (e) {}
  renderPublic();
}

function setPublicTab(tab) {
  publicTab = tab;
  showPage("public", false);
}

function _locateMe() {
  if (_here || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function (p) {
    _here = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (currentPage === "public") renderPublic();
  }, function () {}, { timeout: 8000, maximumAge: 600000 });
}

function loadPublic() {
  setBreadcrumb(null);
  var tabs = document.getElementById("publicTabs");
  if (tabs) {
    tabs.innerHTML = [["games", "openGames"], ["buddies", "playBuddies"], ["market", "market"], ["groups", "publicGroups"], ["courts", "courtDirectory"], ["restaurants", "tabRestaurants"]].map(function (x) {
      return '<button class="dash-tab' + (publicTab === x[0] ? ' active' : '') + '" onclick="setPublicTab(\'' + x[0] + '\')">' + t(x[1]) + '</button>';
    }).join('');
  }
  if (!_publicUnsub) {
    _publicUnsub = fsdb.collection("openGames").where("status", "in", ["open", "full"]).onSnapshot(function (snap) {
      var list = [];
      snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
      _publicGames = list.filter(_keepGame);
      if (currentPage === "public") renderPublic();
      updatePublicBadge();
    }, function (e) { dbOnError(e, "openGames"); });
  }
  if (publicTab === "groups") {
    fsdb.collection("groups").where("type", "==", "public").get().then(function (snap) {
      _publicGroups = [];
      snap.forEach(function (d) { _publicGroups.push(Object.assign({ id: d.id }, d.data())); });
      if (currentPage === "public") renderPublic();
    }).catch(function (e) { _publicGroups = []; showToast(_permError(e)); });
  }
  if (publicTab === "buddies" && typeof loadBuddies === "function") loadBuddies();
  if (publicTab === "market" && typeof loadMarket === "function") loadMarket();
  _locateMe();
  renderPublic();
}

function stopPublic() {
  if (_publicUnsub) _publicUnsub();
  _publicUnsub = null;
}

function _cityFilterHtml() {
  var city = publicCity();
  return '<div class="filter-bar"><div class="form-group"><select class="form-select" onchange="setPublicCity(this.value)">' +
    '<option value="all"' + (city === "all" ? ' selected' : '') + '>' + t("allCities") + '</option>' +
    cityOptionsHtml(city) +
    '</select></div></div>';
}

function renderPublic() {
  var box = document.getElementById("publicContent");
  if (!box) return;
  if ((publicTab === "courts" || publicTab === "restaurants") && document.activeElement && document.activeElement.id === "cmQ") return;   // typing in the map search
  if (publicTab === "buddies") box.innerHTML = _cityFilterHtml() + _renderBuddies();
  else if (publicTab === "groups") box.innerHTML = _cityFilterHtml() + _renderPublicGroups();
  else if (publicTab === "market") box.innerHTML = _cityFilterHtml() + _renderMarket();
  else if (publicTab === "courts") box.innerHTML = _renderDirectory();
  else if (publicTab === "restaurants") box.innerHTML = typeof cmHtml === "function" ? cmHtml("rest") : "";
  else box.innerHTML = _cityFilterHtml() + _renderGames();
  if ((publicTab === "courts" || publicTab === "restaurants") && typeof cmInit === "function") cmInit();
  uiMotion(box, publicTab + "|" + (pubCal.sel || "") + "|" + (pubCal.month || ""));
}

/* ---------- Open games ---------- */

/** Confirmed = at least 4 players have joined (or all the places when there are fewer than 4) */
function gameConfirmed(g) { return (g.players || []).length >= Math.min(PUBLIC_GAME_MIN_PLAYERS, g.slots || PUBLIC_GAME_MIN_PLAYERS); }
/** A game that is not confirmed a day after it was posted is cleared; its host's phone removes it */
function _gameExpired(g) {
  return (g.status === "open" || g.status === "full") && g.createdAt && !gameConfirmed(g) && Date.now() > g.createdAt + PUBLIC_GAME_TTL_H * 3600e3;
}
function _keepGame(g) {
  if (!_gameExpired(g)) return true;
  if (currentUser && g.hostId === currentUser.uid) {
    fsdb.collection("openGames").doc(g.id).delete()
      .then(function () { showToast(t("gameExpiredToast").replace("{game}", g.title || g.courtName || "")); }).catch(function () {});
  }
  return false;
}

function _addDays(iso, n) {
  var p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}
function setPubDay(iso) { pubCal.sel = pubCal.sel === iso ? "" : iso; if (pubCal.sel) { pubCal.anchor = iso; pubCal.month = iso.slice(0, 7); } renderPublic(); }
function pubNav(delta) {
  if (pubCal.exp) {
    var p = (pubCal.month || _todayIso().slice(0, 7)).split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1 + delta, 1));
    pubCal.month = d.toISOString().slice(0, 7);
  } else {
    pubCal.anchor = _addDays(pubCal.anchor || _todayIso(), 7 * delta);
    pubCal.month = pubCal.anchor.slice(0, 7);
  }
  renderPublic();
}
function pubToggleCal() { pubCal.exp = !pubCal.exp; pubCal.month = (pubCal.anchor || _todayIso()).slice(0, 7); renderPublic(); }

function gameStartMs(g) {
  if (!g.date || !g.time) return 0;
  var p = g.date.split("-").map(Number), h = g.time.split(":").map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2], h[0] - 7, h[1] || 0); // Vientiane time
}

function _visibleGames() {
  var city = publicCity(), now = Date.now();
  return _publicGames.filter(function (g) {
    var end = gameStartMs(g) + (g.duration || 2) * 3600e3;
    if (typeof isBlockedPair === "function" && isBlockedPair(g.hostId)) return false;
    return end > now && (city === "all" || normCity(g.city) === city || (g.players || []).indexOf(currentUser.uid) >= 0 || g.hostId === currentUser.uid);
  }).sort(function (a, b) { return gameStartMs(a) - gameStartMs(b); });
}

function updatePublicBadge() {
  var el = document.getElementById("navBadge-public");
  if (!el || !currentUser) return;
  var mine = _publicGames.filter(function (g) { return g.hostId === currentUser.uid && gameStartMs(g) > Date.now(); }).length;
  el.style.display = "none";
  el.textContent = mine;
}

function _renderGames() {
  var games = _visibleGames();
  var counts = {};
  games.forEach(function (g) { counts[g.date] = (counts[g.date] || 0) + 1; });
  if (!pubCal.anchor) pubCal.anchor = _todayIso();
  if (!pubCal.month) pubCal.month = pubCal.anchor.slice(0, 7);
  var html = calendarHtml({ month: pubCal.month, anchor: pubCal.anchor, expanded: pubCal.exp, counts: counts, selected: pubCal.sel, pick: "setPubDay", nav: "pubNav", toggle: "pubToggleCal" });
  var shown = pubCal.sel ? games.filter(function (g) { return g.date === pubCal.sel; }) : games;
  if (pubCal.sel) html += '<div class="cal-sel"><b>' + fmtDate(pubCal.sel) + '</b><button type="button" class="link-btn" onclick="setPubDay(\'' + pubCal.sel + '\')">' + t("clear") + '</button></div>';
  if (!shown.length) {
    html += '<div class="empty-state"><div class="empty-icon">' + icon("globe", 44) + '</div><div>' + t("noOpenGames") + '</div>' +
      '<button class="btn-primary" style="margin-top:14px" onclick="showPage(\'game-create\')">+ ' + t("newPublicGame") + '</button></div>';
    return html;
  }
  shown.forEach(function (g) { html += gameCardHtml(g); });
  return html;
}

function gameCardHtml(g) {
  var me = currentUser.uid;
  var players = g.players || [], wait = g.waitlist || [];
  var inGame = players.indexOf(me) >= 0, onWait = wait.indexOf(me) >= 0, host = g.hostId === me;
  var left = Math.max(0, (g.slots || 0) - players.length);
  var court = findCourt(g.courtId);
  var dist = _here && court && hasPin(court) ? fmtKm(distanceKm(_here, court)) : "";
  var closed = g.closesAt && Date.now() >= g.closesAt;
  var chip = inGame ? pillHtml("green", t("youreIn"))
    : left ? pillHtml("blue", t("slotsLeft").replace("{n}", left))
    : pillHtml("orange", t("gameFull") + (wait.length ? ' \u00B7 ' + t("waitlistN").replace("{n}", wait.length) : ''));
  var levels = g.levelMin || g.levelMax ? levelShort(g.levelMin || "BG") + (g.levelMax && normLevel(g.levelMax) !== normLevel(g.levelMin) ? "\u2013" + levelShort(g.levelMax || "BA") : "") : "";
  var html = '<div class="card game-card compact">';
  html += '<div class="gc2-row">' + (g.photo ? '<img class="gc2-thumb" ' + imgSrcAttrs(g.photo) + ' alt="" onclick="openImage(this.src)">' : '') +
    '<div class="gc2-main"><div class="game-when">' + weekdayShort(new Date(g.date + "T00:00:00").getDay()) + ' ' + fmtDate(g.date) + ' \u00B7 ' + escapeHtml(g.time || "") + '</div>' +
    '<div class="game-facts">' + icon("court", 13) + ' ' + escapeHtml(g.courtName || (court && court.name) || "") + (dist ? ' \u00B7 ' + dist : '') + '</div>' +
    '<div class="game-facts game-facts2">' + escapeHtml(_moneyIn(g.price, g.currency)) + ' ' + t("each") + (levels ? ' \u00B7 ' + t("levelShort") + ' ' + levels : '') + '</div></div>' + chip + '</div>';
  html += '<div class="game-tags"><span class="tag">' + t("gameType_" + (g.gameType || "any")) + '</span><span class="tag mode-' + (g.mode || "fun") + '">' + t("mode_" + (g.mode || "fun")) + '</span>' +
    (g.dinner ? '<span class="tag">' + icon("dinner", 12) + ' ' + t("dinnerAfterTag") + '</span>' : '') + (g.seriesId ? '<span class="tag">' + icon("history", 12) + ' ' + t("repeatWeekly") + '</span>' : '') + '</div>';
  if (g.note) html += '<div class="game-note">' + escapeHtml(g.note) + '</div>';
  html += '<div class="gc2-people">' + personHtml(g.hostId, 22, t("hostWord")) + (players.length ? peopleHtml(players.filter(function (u) { return u !== g.hostId; }), 22, 4) : '') +
    (left ? '<span class="slot-row">' + Array(Math.min(left, 6) + 1).join('<span class="slot-empty"></span>') + (left > 6 ? '<small>+' + (left - 6) + '</small>' : '') + '</span>' : '') + '</div>';
  html += '<div class="game-actions">';
  if (host) {
    html += '<button class="btn-secondary" onclick="editPublicGame(\'' + jsq(g.id) + '\')">' + icon("edit", 16) + ' ' + t("edit") + '</button>' +
      '<details class="poll-manage host-manage"><summary>' + icon("settings", 14) + ' ' + t("pollManage") + '</summary><div class="poll-manage-btns">' +
      '<button class="edit-btn" onclick="cancelGame(\'' + jsq(g.id) + '\')">' + t("cancelGame") + '</button>' +
      '<button class="edit-btn danger" onclick="deletePublicGame(\'' + jsq(g.id) + '\')">' + icon("trash", 14) + ' ' + t("delete") + '</button></div></details>';
  } else if (inGame || onWait) {
    html += '<button class="btn-secondary" onclick="toggleGame(\'' + jsq(g.id) + '\')"' + (closed ? ' disabled' : '') + '>' + t(onWait ? "leaveWaitlist" : "leaveGame") + '</button>';
  } else {
    html += '<button class="btn-primary" onclick="toggleGame(\'' + jsq(g.id) + '\')"' + (closed ? ' disabled' : '') + '>' + t(left ? "joinGame" : "joinWaitlist") + '</button>';
  }
  if (court && hasPin(court)) html += courtMapLink(court, t("directions"));
  html += '</div>';
  if (closed && !host) html += '<div class="form-hint">' + t("joinClosed") + '</div>';
  return html + '</div>';
}

function _moneyIn(n, cur) {
  var sym = (CURRENCIES[cur] || CURRENCIES.LAK).symbol;
  return Math.round(n || 0).toLocaleString("en-US") + " " + sym;
}

/** Join / leave (or waitlist). Leaving moves the first on the waitlist up. */
function toggleGame(id) {
  var me = currentUser.uid;
  var ref = fsdb.collection("openGames").doc(id);
  var result = "";
  fsdb.runTransaction(function (tx) {
    return tx.get(ref).then(function (doc) {
      if (!doc.exists) throw new Error(t("noData"));
      var g = doc.data();
      if (g.status !== "open" && g.status !== "full") throw new Error(t("gameCancelled"));
      var players = (g.players || []).slice(), wait = (g.waitlist || []).slice();
      var upd = {};
      var log = {};
      if (players.indexOf(me) >= 0) {
        players.splice(players.indexOf(me), 1);
        if (wait.length) players.push(wait.shift());
        log = { a: "leave", at: Date.now() };
        result = "leftGame";
      } else if (wait.indexOf(me) >= 0) {
        wait.splice(wait.indexOf(me), 1);
        log = { a: "leave", at: Date.now() };
        result = "leftGame";
      } else if (players.length < g.slots) {
        players.push(me);
        log = { a: "join", at: Date.now() };
        result = "joinedGame";
      } else {
        wait.push(me);
        log = { a: "wait", at: Date.now() };
        result = "joinedWaitlist";
      }
      upd.players = players;
      upd.waitlist = wait;
      upd.status = players.length >= g.slots ? "full" : "open";
      if (upd.status === "full" && g.status !== "full") upd.fullAt = Date.now();
      upd["log." + me] = log;
      tx.update(ref, upd);
    });
  }).then(function () { showToast(t(result) + " ✔"); })
    .catch(function (e) { showToast(e && e.code === "permission-denied" ? t("joinClosed") : (e.message || _permError(e))); });
}

function cancelGame(id) {
  askYes(t("cancelGameConfirm"), function () {
    fsdb.collection("openGames").doc(id).update({ status: "cancelled", cancelledAt: Date.now() })
      .then(function () { showToast(t("cancelGame") + " ✔"); })
      .catch(function (e) { showToast(_permError(e)); });
  }, { danger: true, yes: t("confirm") });
}

/** Host removes the card for good (players are not told; use Cancel to tell them) */
function deletePublicGame(id) {
  askYes(t("deleteGameConfirm"), function () {
    fsdb.collection("openGames").doc(id).delete()
      .then(function () { showToast(t("delete") + " \u2714"); })
      .catch(function (e) { showToast(_permError(e)); });
  }, { danger: true, yes: t("delete") });
}

/* ---------- Host a public game ---------- */

var newGame = null;
var _gameEditOpen = false;

/** Host opens his own card in the same form to change it */
function editPublicGame(id) {
  var g = _publicGames.filter(function (x) { return x.id === id; })[0];
  if (!g || !currentUser || g.hostId !== currentUser.uid) return;
  newGame = { _editId: id, _photo: g.photo || null, date: g.date, time: g.time, duration: g.duration || 2, courtId: g.courtId || "",
    slots: g.slots || 4, hostPlays: (g.players || []).indexOf(g.hostId) >= 0, gameType: g.gameType || "md", mode: g.mode || "fun",
    levelMin: g.levelMin || "", levelMax: g.levelMax || "", price: g.price || 0, dinner: !!g.dinner, note: g.note || "", title: g.title || "",
    repeat: "none", repeatN: 4, photoData: null, _more: true };
  _gameEditOpen = true;
  showPage("game-create");
}

function loadGameCreate() {
  setBreadcrumb([{ label: t("navPublic"), action: "showPage('public')" }, { label: t("newPublicGame") }]);
  if (newGame && newGame._editId && !_gameEditOpen) newGame = null;   // an abandoned edit is not a draft
  _gameEditOpen = false;
  if (!newGame) {
    var d = new Date(Date.now() + 86400e3);
    newGame = { date: d.toISOString().slice(0, 10), time: (currentGroup && currentGroup.usualTime) || "18:00", duration: 2, courtId: "",
      slots: 4, hostPlays: true, gameType: "md", mode: "fun", levelMin: "", levelMax: "", price: 0, dinner: false, note: "", title: "", repeat: "none", repeatN: 4, photoData: null };
  }
  _locateMe();
  renderGameForm();
}

function _gameCourts() {
  var list = (DB_CACHE.allCourts || []).slice();
  if (_here) list.sort(function (a, b) { return (hasPin(a) ? distanceKm(_here, a) : 1e9) - (hasPin(b) ? distanceKm(_here, b) : 1e9); });
  else list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  return list;
}

function renderGameForm() {
  var box = document.getElementById("gameCreateContent");
  if (!box) return;
  var g = newGame;
  var seg = function (field, opts, labelOf) {
    return '<div class="seg seg-wrap">' + opts.map(function (o) {
      return '<button type="button" class="seg-btn' + (g[field] === o ? ' active' : '') + '" onclick="gameSet(\'' + field + '\',\'' + o + '\')">' + labelOf(o) + '</button>';
    }).join('') + '</div>';
  };
  var courts = _gameCourts();
  var court = findCourt(g.courtId);
  var est = court && courtPrice(court) && g.slots ? Math.ceil(courtPrice(court) * g.duration / Math.max(1, g.slots) / 1000) * 1000 : 0;
  var html = '<div class="card">';
  html += '<div class="form-row"><div class="form-group"><label class="form-label">' + t("date") + ' *</label><input type="date" class="form-input" value="' + g.date + '" onchange="gameSet(\'date\',this.value,true)"></div>' +
    '<div class="form-group"><label class="form-label">' + t("time") + ' *</label><input type="time" class="form-input" value="' + g.time + '" onchange="gameSet(\'time\',this.value,true)"></div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("court") + ' *</label><select class="form-select" onchange="gameSet(\'courtId\',this.value)">' +
    '<option value="">' + t("selectCourt") + '</option>' + courts.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === g.courtId ? ' selected' : '') + '>' + escapeHtml(c.name) + (_here && hasPin(c) ? ' · ' + fmtKm(distanceKm(_here, c)) : '') + '</option>';
    }).join('') + '</select><button type="button" class="link-btn" onclick="showCourtModal(null,function(id){newGame.courtId=id;renderGameForm();},{directoryOnly:true})">+ ' + t("addCourt") + '</button></div>';
  html += '<div class="form-group"><label class="form-label">' + t("slots") + ' *</label><div class="stepper">' +
    '<button type="button" onclick="gameSet(\'slots\',Math.max(2,newGame.slots-1))">−</button><b>' + g.slots + '</b>' +
    '<button type="button" onclick="gameSet(\'slots\',Math.min(24,newGame.slots+1))">+</button></div><div class="form-hint">' + t("slotsHint") + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("gameType") + ' *</label>' + seg("gameType", GAME_TYPES, function (x) { return t("gameType_" + x); }) + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("playMode") + ' *</label>' + seg("mode", PLAY_MODES, function (x) { return t("mode_" + x); }) +
    '<div class="form-hint">' + t("modeHint_" + g.mode) + (g.mode === "competition" ? ' ' + t("publicNoRating") : '') + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + t("pricePerPerson") + ' (' + curSymbol() + ') *</label>' +
    moneyInput("gPrice", g.price || est, "gameSet(\'price\',parseMoney(this.value),true)") +
    (est ? '<div class="form-hint">' + t("priceEstimate").replace("{amount}", fmtLAK(est)) + '</div>' : '') + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("duration") + '</label><div class="stepper">' +
    '<button type="button" onclick="gameSet(\'duration\',Math.max(1,newGame.duration-0.5))">−</button><b>' + fmtHours(g.duration) + '</b>' +
    '<button type="button" onclick="gameSet(\'duration\',Math.min(4,newGame.duration+0.5))">+</button></div></div>';
  html += '<label class="perm-row"><input type="checkbox"' + (g.hostPlays ? ' checked' : '') + ' onchange="newGame.hostPlays=this.checked"><div>' + t("iAmPlaying") + '</div></label>';
  html += '<div class="form-group"><label class="form-label">' + t("levelRange") + '</label><div class="form-row">' +
    '<select class="form-select" onchange="newGame.levelMin=this.value"><option value="">' + t("anyLevel") + '</option>' + LEVELS.map(function (l) { return '<option value="' + l + '"' + (normLevel(g.levelMin) === l ? ' selected' : '') + '>' + levelShort(l) + ' · ' + levelName(l) + '</option>'; }).join('') + '</select>' +
    '<select class="form-select" onchange="newGame.levelMax=this.value"><option value="">' + t("anyLevel") + '</option>' + LEVELS.map(function (l) { return '<option value="' + l + '"' + (normLevel(g.levelMax) === l ? ' selected' : '') + '>' + levelShort(l) + ' · ' + levelName(l) + '</option>'; }).join('') + '</select></div>' +
    '<div class="form-hint">' + t("levelSelfHint") + '</div></div>';
  html += '<div class="form-group"><label class="form-label">' + icon("camera", 12) + ' ' + t("gamePhoto") + ' <span class="form-hint">(' + t("optional") + ')</span></label>' +
    (g.photoData ? '<img class="rest-photo" src="' + escapeHtml(safeUrl(g.photoData)) + '" alt="">' : '') +
    '<input type="file" class="form-input" accept="image/*" style="padding:8px;font-size:13px" onchange="gamePhotoChosen(this)"></div>';
  if (!g._editId) html += '<div class="form-group"><label class="form-label">' + icon("history", 12) + ' ' + t("repeatLabel") + '</label>' +
    '<div class="seg seg-wrap"><button type="button" class="seg-btn' + (g.repeat !== "weekly" ? ' active' : '') + '" onclick="gameSet(\'repeat\',\'none\')">' + t("repeatNone") + '</button>' +
    '<button type="button" class="seg-btn' + (g.repeat === "weekly" ? ' active' : '') + '" onclick="gameSet(\'repeat\',\'weekly\')">' + t("repeatWeekly") + '</button></div>' +
    (g.repeat === "weekly" ? '<div class="stepper" style="margin-top:8px"><button type="button" onclick="gameSet(\'repeatN\',Math.max(2,newGame.repeatN-1))">\u2212</button><b>' + t("repeatTimes").replace("{n}", g.repeatN) + '</b>' +
      '<button type="button" onclick="gameSet(\'repeatN\',Math.min(12,newGame.repeatN+1))">+</button></div>' : '') + '</div>';
  html += '<details class="more-details"' + (g._more ? ' open' : '') + ' ontoggle="newGame._more=this.open"><summary>' + t("moreDetails") + '</summary>' +
    '<div class="form-group"><label class="form-label">' + t("gameTitle") + '</label><input class="form-input" maxlength="60" placeholder="' + t("gameTitleAuto") + '" value="' + escapeHtml(g.title) + '" oninput="newGame.title=this.value"></div>' +
    '<label class="perm-row"><input type="checkbox"' + (g.dinner ? ' checked' : '') + ' onchange="newGame.dinner=this.checked"><div>' + t("dinnerAfterTag") + '</div></label>' +
    '<div class="form-group"><label class="form-label">' + t("note") + '</label><textarea class="form-input" rows="2" maxlength="200" oninput="newGame.note=this.value">' + escapeHtml(g.note) + '</textarea></div>' +
    '</details>';
  html += '<div class="live-summary">' + _gameSummary() + '</div>';
  html += '<button class="btn-primary" onclick="submitGame()">' + (g._editId ? icon("check", 16) + ' ' + t("save") : icon("globe", 16) + ' ' + t("postPublicly")) + '</button>';
  if (!g._editId) html += '<div class="form-hint" style="text-align:center;margin-top:8px">' + t("publicSafety") + '</div>';
  html += '</div>';
  box.innerHTML = html;
}

function gamePhotoChosen(input) {
  var file = input.files && input.files[0];
  if (!file) { newGame.photoData = null; renderGameForm(); return; }
  resizeImageToDataUrl(file, 800, function (err, dataUrl) {
    if (err) { showToast(err.message); input.value = ""; return; }
    newGame.photoData = dataUrl;
    renderGameForm();
  });
}

function _gameSummary() {
  var g = newGame;
  var close = typeof defaultCloseAt === "function" ? defaultCloseAt(g.date, g.time, Date.now()) : 0;
  return t("gameSummary").replace("{n}", g.slots).replace("{price}", fmtLAK(g.price || 0)).replace("{close}", close ? fmtCloseTime(close) : "");
}

function gameSet(field, value, quiet) {
  newGame[field] = value;
  if (field === "courtId" && !newGame.price) newGame.price = 0;
  if (!quiet) renderGameForm();
  else { var el = document.querySelector("#gameCreateContent .live-summary"); if (el) el.innerHTML = _gameSummary(); }
}

function submitGame() {
  var g = newGame;
  var court = findCourt(g.courtId);
  var start = gameStartMs(g);
  var priceEl = document.getElementById("gPrice");
  if (priceEl) g.price = parseMoney(priceEl.value);
  if (!court) { showToast(t("selectCourt")); return; }
  if (!start || start < Date.now() + 2 * 3600e3) { showToast(t("gameTooSoon")); return; }
  if (!(g.price >= 0)) { showToast(t("pricePerPerson")); return; }
  var me = currentUser.uid;
  if (g._editId) {
    var upd = { title: (g.title || "").trim() || t("gameType_" + g.gameType) + " · " + court.name, date: g.date, time: g.time, duration: g.duration,
      courtId: court.id, courtName: court.name, slots: g.slots, gameType: g.gameType, mode: g.mode, levelMin: g.levelMin || null, levelMax: g.levelMax || null,
      price: g.price, dinner: !!g.dinner, note: (g.note || "").trim(), closesAt: defaultCloseAt(g.date, g.time, Date.now()) };
    var saved = g.photoData ? dbSaveImage(g.photoData, "game") : Promise.resolve(null);
    saved.then(function (ref) {
      if (ref) upd.photo = ref;
      return fsdb.collection("openGames").doc(g._editId).update(upd);
    }).then(function () {
      newGame = null; publicTab = "games";
      showToast(t("save") + " \u2714"); showPage("public");
    }).catch(function (e) { showToast(_permError(e)); });
    return;
  }
  var data = {
    hostId: me, title: (g.title || "").trim() || t("gameType_" + g.gameType) + " · " + court.name,
    date: g.date, time: g.time, duration: g.duration, courtId: court.id, courtName: court.name,
    city: publicCity() !== "all" ? publicCity() : ((currentGroup && currentGroup.city) || "Vientiane"),
    slots: g.slots, players: g.hostPlays ? [me] : [], waitlist: [], gameType: g.gameType, mode: g.mode,
    levelMin: g.levelMin || null, levelMax: g.levelMax || null, price: g.price, currency: groupCurrency(),
    dinner: !!g.dinner, note: (g.note || "").trim(), status: "open", log: {},
    closesAt: defaultCloseAt(g.date, g.time, Date.now()), createdAt: Date.now()
  };
  var weeks = g.repeat === "weekly" ? Math.max(2, Math.min(12, g.repeatN || 2)) : 1;
  var series = weeks > 1 ? "s" + Date.now().toString(36) : null;
  var photoSaved = g.photoData ? dbSaveImage(g.photoData, "game") : Promise.resolve(null);
  photoSaved.then(function (ref) {
    if (ref) data.photo = ref;
    var jobs = [];
    for (var k = 0; k < weeks; k++) {
      var one = Object.assign({}, data, { date: _addDays(g.date, 7 * k), closesAt: defaultCloseAt(_addDays(g.date, 7 * k), g.time, k ? 0 : Date.now()) });
      if (series) one.seriesId = series;
      jobs.push(fsdb.collection("openGames").add(one));
    }
    return Promise.all(jobs);
  }).then(function () {
    newGame = null;
    publicTab = "games";
    showToast(t("gamePosted") + (weeks > 1 ? " \u00D7" + weeks : "") + " \u2714");
    showPage("public");
  }).catch(function (e) { showToast(_permError(e)); });
}

/* ---------- Public groups ---------- */

function _renderPublicGroups() {
  if (_publicGroups === null) return '<div class="empty-state">' + t("loading") + '</div>';
  var city = publicCity();
  var list = _publicGroups.filter(function (g) { return city === "all" || normCity(g.city) === city; });
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">' + icon("users", 44) + '</div><div>' + t("noPublicGroups") + '</div>' +
    '<button class="btn-primary" style="margin-top:14px" onclick="showPage(\'group-create\')">+ ' + t("createGroup") + '</button></div>';
  return list.map(function (g) {
    var m = myMemberships[g.id];
    var days = (g.usualDays || []).map(function (d) { return weekdayShort(d); }).join(", ");
    var action = m ? (m.status === "active" ? '<button class="btn-secondary" onclick="switchGroup(\'' + jsq(g.id) + '\')">' + t("open") + '</button>'
      : '<span class="status-chip st-costs">' + t("requestPending") + '</span>')
      : '<button class="btn-primary" onclick="joinGroup(\'' + jsq(g.id) + '\')">' + t(g.joinMode === "open" ? "joinGroup" : "askToJoinShort") + '</button>';
    return '<div class="card game-card"><div class="game-head"><div class="game-when">' + escapeHtml(g.name) + '</div>' +
      '<span class="tag">' + t(g.joinMode === "open" ? "joinOpen" : "joinAsk") + '</span></div>' +
      '<div class="game-facts">' + icon("pin", 13) + ' ' + escapeHtml(cityLabel(g.city)) +
      (days ? ' · ' + days : '') + (g.usualTime ? ' ' + escapeHtml(fmtTimeRange(g.usualTime, g.usualTimeTo)) : '') + '</div>' +
      (g.description ? '<div class="game-note">' + escapeHtml(g.description) + '</div>' : '') +
      '<div class="game-actions">' + action + '</div></div>';
  }).join('');
}

/* ---------- Court directory ---------- */

function _renderDirectory() {
  return typeof cmHtml === "function" ? cmHtml("court") : "";
}
