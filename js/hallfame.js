/* ============================================================
   hallfame.js — tournament winner card and the Hall of Fame (v229)
   A finished session tournament leaves a record in groups/{gid}/hallOfFame/{sid}:
   { v, sid, gid, date, n (4–20), champion:{uids,names}, runnerUp|null, third|null, finalScore, finalGames:[text], outs:[{uids,why}], createdBy, createdAt }
   The record stays when the session (or its tournament) is deleted. The Hall of Fame page (Rankings > Hall of fame) is built
   from the saved records; a finished tournament that is still in the sessions but not saved yet (rules not updated, or offline)
   is shown too, and a record that could not be saved is kept on this phone until it can.
   The first part is the plain engine (hof*), no DOM, tested in tests/hallfame.test.js.
   ============================================================ */

var HOF_LOCAL_MAX = 50;

function _hofTeam(T, m, nameOf) {
  if (typeof m !== "number" || m < 0 || !T.__P || !T.__P[m]) return null;   // pair 0 is a real pair
  var pr = T.__P[m].m, uids = [tourUid(T, pr[0]), tourUid(T, pr[1])];   // v242: the player on the position now (a swapped-in player is the champion)
  return { uids: uids, names: uids.map(function (u) { return String(nameOf(u) || "").slice(0, 60); }) };
}

/** The record of a finished tournament, or null (not finished, or nobody left to be champion) */
function hofRecord(s, gid, nameOf, me) {
  var T = typeof tourOf === "function" ? tourOf(s) : null;   // shape-checked: the old v48 `tournament` value and bad data are ignored
  if (!T || typeof tourComplete !== "function" || !tourComplete(T)) return null;
  nameOf = nameOf || function (u) { return u; };
  var order = tourOrder(T);
  if (!order || order[0] < 0) return null;
  T.__P = tourPairs(T);
  var rec = { v: 1, sid: String(s.id), gid: String(gid || s.groupId || ""), date: String(s.date || ""), n: T.n, champion: _hofTeam(T, order[0], nameOf), runnerUp: _hofTeam(T, order[1], nameOf), third: _hofTeam(T, order[2], nameOf),
    finalScore: "", finalGames: [], outs: [], createdBy: String(me || ""), createdAt: s.createdAt || 0 };
  if (tourKind(T) !== "rr") {   // v249: a final (top 4 or top 8); a round robin (top 6) has none
    var fs = tourFinals(T), w = tourFinalWins(T), champIsA = fs.length && order[0] === fs[0].pa;
    rec.finalScore = (champIsA ? w.wa : w.wb) + "–" + (champIsA ? w.wb : w.wa);
    if (w.wa === w.wb) { var pt = tourSerPoints(T, "fin"); rec.finalScore = (champIsA ? pt.pa : pt.pb) + "–" + (champIsA ? pt.pb : pt.pa); }   // v270: 1–1 decided by the total points: the points are the score
    rec.finalGames = fs.slice(0, 3).map(function (g) { return g.v ? "-" : g.wo ? "W/O" : (champIsA ? g.sa + "–" + g.sb : g.sb + "–" + g.sa); });
  } else {
    var row = tourPairTable(T).filter(function (x) { return x.i === order[0]; })[0];
    rec.finalScore = row ? row.w + "–" + row.l : "";
  }
  rec.outs = (T.out || []).slice(0, 4).map(function (o) { var tm = _hofTeam(T, o.p, nameOf); return { uids: tm ? tm.uids : [], why: String(o.why || "other") }; });
  delete T.__P;
  return rec;
}

/** v249: tournaments of 4–20 players; an odd value falls back to 8 as before */
function _hofSizeOf(n) { return typeof n === "number" && Math.floor(n) === n && n >= 4 && n <= 20 ? n : 8; }
/** v249: a record has a final unless the playoff was the 6-player round robin (n 6 or 7) */
function _hofHasFinal(n) { return n !== 6 && n !== 7; }

/** A record read from the database, made safe: strings cut, lists capped, shape fixed. null when it has no champion. */
function hofClean(r) {
  if (!r || typeof r !== "object") return null;
  function s(x, n) { return String(x == null ? "" : x).slice(0, n); }
  function team(x) {
    if (!x || typeof x !== "object") return null;
    var u = Array.isArray(x.uids) ? x.uids.slice(0, 2).map(function (v) { return s(v, 80); }) : [], nm = Array.isArray(x.names) ? x.names.slice(0, 2).map(function (v) { return s(v, 60); }) : [];
    return u.length ? { uids: u, names: nm } : null;
  }
  var champ = team(r.champion);
  if (!champ) return null;
  return { v: 1, sid: s(r.sid, 80), gid: s(r.gid, 80), date: s(r.date, 10), n: _hofSizeOf(r.n), champion: champ, runnerUp: team(r.runnerUp), third: team(r.third),
    finalScore: s(r.finalScore, 8), finalGames: (Array.isArray(r.finalGames) ? r.finalGames : []).slice(0, 3).map(function (v) { return s(v, 8); }),
    outs: (Array.isArray(r.outs) ? r.outs : []).slice(0, 4).map(function (o) { return { uids: Array.isArray(o && o.uids) ? o.uids.slice(0, 2).map(function (v) { return s(v, 80); }) : [], why: s(o && o.why, 10) }; }),
    createdBy: s(r.createdBy, 80), createdAt: typeof r.createdAt === "number" ? r.createdAt : 0 };
}

/** Saved records first, then records kept on this phone, then finished tournaments still in the sessions. One per session. */
function hofMerge(stored, local, derived) {
  var map = {}, order = [], onlyDerived = 0;
  function add(list, tag) {
    (list || []).forEach(function (r) {
      var c = hofClean(r);
      if (!c || !c.sid || map[c.sid]) return;
      c.src = tag; map[c.sid] = c; order.push(c.sid);
      if (tag === "derived") onlyDerived++;
    });
  }
  add(stored, "stored"); add(local, "local"); add(derived, "derived");
  var list = order.map(function (k) { return map[k]; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || (a.sid < b.sid ? -1 : 1); });
  return { list: list, unsaved: onlyDerived + list.filter(function (r) { return r.src === "local"; }).length };
}

function _hofKey(uids) { return uids.slice().sort().join("+"); }

/** Champion teams and players, most titles first. A tournament counts once. */
function hofAggregate(list) {
  var teams = {}, players = {};
  function P(u, nm) { return players[u] || (players[u] = { uid: u, name: nm || u, titles: 0, runnerUps: 0, thirds: 0, last: "" }); }
  (list || []).forEach(function (r) {
    var c = r.champion; if (!c) return;
    var k = _hofKey(c.uids), tm = teams[k] || (teams[k] = { key: k, uids: c.uids.slice(), names: c.names.slice(), titles: 0, runnerUps: 0, last: "" });
    tm.titles++; if (r.date > tm.last) tm.last = r.date;
    c.uids.forEach(function (u, i) { var p = P(u, c.names[i]); p.titles++; if (r.date > p.last) p.last = r.date; });
    if (r.runnerUp) {
      var rk = _hofKey(r.runnerUp.uids); if (teams[rk]) teams[rk].runnerUps++; else teams[rk] = { key: rk, uids: r.runnerUp.uids.slice(), names: r.runnerUp.names.slice(), titles: 0, runnerUps: 1, last: "" };
      r.runnerUp.uids.forEach(function (u, i) { P(u, r.runnerUp.names[i]).runnerUps++; });
    }
    if (r.third) r.third.uids.forEach(function (u, i) { P(u, r.third.names[i]).thirds++; });
  });
  function arr(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  var byTitles = function (a, b) { return b.titles - a.titles || b.runnerUps - a.runnerUps || String(b.last).localeCompare(String(a.last)) || String(a.name || a.key).localeCompare(String(b.name || b.key)); };
  return { teams: arr(teams).filter(function (x) { return x.titles > 0; }).sort(byTitles), players: arr(players).filter(function (x) { return x.titles > 0 || x.runnerUps > 0; }).sort(byTitles), count: (list || []).length };
}

/** Records kept on this phone while the database refused them (rules not updated yet) */
function hofLocalGet(gid) { try { var v = JSON.parse(localStorage.getItem("hof:" + gid) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function hofLocalSet(gid, list) { try { localStorage.setItem("hof:" + gid, JSON.stringify(list.slice(-HOF_LOCAL_MAX))); } catch (e) {} }
function hofLocalPut(gid, rec) { var l = hofLocalGet(gid).filter(function (r) { return r && r.sid !== rec.sid; }); l.push(rec); hofLocalSet(gid, l); }
function hofLocalDrop(gid, sid) { hofLocalSet(gid, hofLocalGet(gid).filter(function (r) { return r && r.sid !== sid; })); }

/* ============================================================
   Screen and database
   ============================================================ */

var _hofStored = [], _hofUnsub = null, _hofDenied = false, _hofSaved = {};

function _hofName(uid, fb) { var u = typeof findUser === "function" ? findUser(uid) : null; return u ? plainUserName(u) : (fb || "?"); }
function _hofCol() { return fsdb.collection("groups").doc(currentGroupId).collection("hallOfFame"); }

function hofLoad() {
  if (_hofUnsub || typeof GROUPS_ON === "undefined" || !GROUPS_ON || !currentGroupId) return;
  _hofUnsub = _hofCol().onSnapshot(function (snap) {
    var l = []; snap.forEach(function (d) { l.push(Object.assign({ sid: d.id }, d.data())); });
    _hofStored = l; _hofDenied = false;
    if (typeof statsTab !== "undefined" && statsTab === "hof" && currentPage === "stats" && typeof renderStats === "function") renderStats();
  }, function () {
    // rules not updated yet (or offline): show what the sessions and this phone know, say so quietly. Never the red error bar.
    _hofDenied = true;
    if (typeof statsTab !== "undefined" && statsTab === "hof" && currentPage === "stats" && typeof renderStats === "function") renderStats();
  });
}
function hofStop() { if (_hofUnsub) _hofUnsub(); _hofUnsub = null; _hofStored = []; _hofDenied = false; _hofSaved = {}; }

function _hofDerived() {
  var me = typeof currentUser !== "undefined" && currentUser ? currentUser.uid : "", out = [];
  (typeof lastSessions !== "undefined" ? lastSessions : []).forEach(function (s) { var r = hofRecord(s, currentGroupId, function (u) { return _hofName(u, u); }, me); if (r) out.push(r); });
  return out;
}
function hofRecords() { return hofMerge(_hofStored, typeof currentGroupId !== "undefined" ? hofLocalGet(currentGroupId) : [], _hofDerived()); }

/** A tournament has just finished (or its result changed): keep the winners. A refused write is kept on this phone. */
function hofSave(s) {
  if (typeof GROUPS_ON === "undefined" || !GROUPS_ON || !currentGroupId || typeof fsdb === "undefined") return;
  var rec = hofRecord(s, currentGroupId, function (u) { return _hofName(u, u); }, currentUser ? currentUser.uid : "");
  if (!rec) return;
  var sig = JSON.stringify([rec.champion, rec.runnerUp, rec.third, rec.finalScore, rec.finalGames, rec.outs, rec.date]);
  if (_hofSaved[rec.sid] === sig) return;
  _hofSaved[rec.sid] = sig;
  var prev = _hofStored.filter(function (r) { return r.sid === rec.sid; })[0];
  if (prev) rec.createdBy = prev.createdBy || rec.createdBy;
  _hofCol().doc(rec.sid).set(rec).then(function () { hofLocalDrop(currentGroupId, rec.sid); }, function () {
    delete _hofSaved[rec.sid]; _hofDenied = true; hofLocalPut(currentGroupId, rec);
  });
}

/** v268: clearing a tournament takes its Hall of Fame record with it. Resolves with the record (for Undo) or null when there is none; rejects when the rules refuse the delete. */
function hofTake(sid) {
  if (typeof GROUPS_ON === "undefined" || !GROUPS_ON || !currentGroupId || typeof fsdb === "undefined") return Promise.resolve(null);
  hofLocalDrop(currentGroupId, sid); delete _hofSaved[sid];   // a copy kept on this phone must not bring it back
  var ref = _hofCol().doc(sid);
  return ref.get().then(function (d) {
    if (!d.exists) return null;
    var rec = Object.assign({}, d.data(), { sid: d.id });
    return ref.delete().then(function () { return rec; });
  });
}
/** v268: Undo of a clear: write the record back with the same id and the same data. Never rejects; resolves true when it is back. */
function hofRestore(rec) {
  if (!rec || !rec.sid || typeof GROUPS_ON === "undefined" || !GROUPS_ON || !currentGroupId || typeof fsdb === "undefined") return Promise.resolve(false);
  return _hofCol().doc(rec.sid).set(rec).then(function () {
    _hofSaved[rec.sid] = JSON.stringify([rec.champion, rec.runnerUp, rec.third, rec.finalScore, rec.finalGames, rec.outs, rec.date]);   // same signature as hofSave: it will not rewrite it with another createdBy
    return true;
  }, function () { return false; });
}

function _hofCanRemove(r) { return r.src === "stored" && typeof currentUser !== "undefined" && currentUser && ((typeof isGroupAdminMe === "function" && isGroupAdminMe()) || r.createdBy === currentUser.uid); }

function hofRemove(sid) {
  askYes(t("hofRemoveTitle"), function () {
    _hofCol().doc(sid).delete().then(function () { hofLocalDrop(currentGroupId, sid); showToast(t("delete") + " ✔"); }, function () { showToast(t("tourSaveFail")); });
  }, { kind: "danger", body: t("hofRemoveBody"), yes: t("delete") });
}

function _hofTeamHtml(tm, sz) {
  return '<span class="hof-team">' + tm.uids.map(function (u, i) { return '<span class="hof-who">' + avatarHtml(u, sz || 26) + '<span>' + escapeHtml(_hofName(u, tm.names[i])) + '</span></span>'; }).join("") + '</span>';
}
function _hofTeamText(tm) { return tm.uids.map(function (u, i) { return _hofName(u, tm.names[i]); }).join(" + "); }

/** The Rankings > Hall of fame tab */
function hofHtml() {
  hofLoad();
  var m = hofRecords(), agg = hofAggregate(m.list), h = "";
  if (!m.list.length) return '<div class="card hof-empty">' + icon("trophy", 28) + '<p>' + escapeHtml(t("hofEmpty")) + '</p></div>';
  h += '<div class="card"><div class="card-title">' + icon("crown", 14) + ' ' + escapeHtml(t("hofTeams")) + '</div><div class="hof-rows">' +
    agg.teams.map(function (x, i) {
      return '<div class="hof-row' + (i === 0 ? ' top' : '') + '"><span class="hof-no">' + (i + 1) + '</span>' + _hofTeamHtml(x, 28) +
        '<span class="hof-num"><b>' + x.titles + '</b> ' + escapeHtml(t("hofTitles")) + (x.runnerUps ? ' · ' + x.runnerUps + ' ' + escapeHtml(t("hofRunnerUps")) : '') + '<small>' + escapeHtml(t("hofLastWin")) + ' ' + escapeHtml(fmtDate(x.last)) + '</small></span></div>';
    }).join("") + '</div></div>';
  h += '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + escapeHtml(t("hofPlayers")) + '</div><div class="hof-rows">' +
    agg.players.map(function (x, i) {
      return '<div class="hof-row' + (i === 0 && x.titles ? ' top' : '') + '"><span class="hof-no">' + (i + 1) + '</span><span class="hof-who">' + avatarHtml(x.uid, 28) + '<span>' + escapeHtml(_hofName(x.uid, x.name)) + '</span></span>' +
        '<span class="hof-num"><b>' + x.titles + '</b> ' + escapeHtml(t("hofTitles")) + (x.runnerUps ? ' · ' + x.runnerUps + ' ' + escapeHtml(t("hofRunnerUps")) : '') + '</span></div>';
    }).join("") + '</div></div>';
  h += '<div class="card"><div class="card-title">' + icon("trophy", 14) + ' ' + escapeHtml(t("hofList")) + '</div><div class="hof-rows">' +
    m.list.map(function (r) {
      return '<div class="hof-t"><div class="hof-t-h"><b>' + escapeHtml(fmtDate(r.date)) + '</b><span class="hof-t-n">' + escapeHtml(t("hofSizeN").replace("{n}", r.n)) + (r.finalScore ? ' · ' + escapeHtml(r.finalScore) : '') + '</span>' +
        '<span class="hof-t-acts"><button type="button" class="how-btn" aria-label="' + escapeHtml(t("hofShare")) + '" onclick="openShareCard(\'\',\'tournament\',\'' + jsq(r.sid) + '\')">' + icon("shareOut", 14) + '</button>' +
        (_hofCanRemove(r) ? '<button type="button" class="delete-btn" aria-label="' + escapeHtml(t("delete")) + '" onclick="hofRemove(\'' + jsq(r.sid) + '\')">' + icon("trash", 14) + '</button>' : '') + '</span></div>' +
        '<div class="hof-t-c">' + icon("crown", 14) + ' ' + _hofTeamHtml(r.champion, 24) + '</div>' +
        (r.runnerUp ? '<div class="hof-t-s"><span>' + escapeHtml(t("tourPlace2")) + '</span> ' + escapeHtml(_hofTeamText(r.runnerUp)) + '</div>' : '') +
        (r.third ? '<div class="hof-t-s"><span>' + escapeHtml(t("tourPlace3")) + '</span> ' + escapeHtml(_hofTeamText(r.third)) + '</div>' : '') +
        (r.outs.length ? '<div class="hof-t-s out">' + r.outs.map(function (o) { return escapeHtml(_hofTeamText({ uids: o.uids, names: [] }) + ' · ' + _hofOutWhy(o.why)); }).join(' · ') + '</div>' : '') + '</div>';
    }).join("") + '</div></div>';
  if (m.unsaved || _hofDenied) h += '<p class="hof-note">' + escapeHtml(t("hofLocalNote")) + '</p>';
  return h;
}
function _hofOutWhy(w) { return t("tourOutTag").replace("{why}", t(w === "injury" || w === "left" ? "tourWhy_" + w : "tourWhy_other")); }

/* ---- the winner card (share sheet mode "tournament") ---- */

var _hofAv = {};
function shareTournamentNow(sid) {
  var r = hofRecords().list.filter(function (x) { return x.sid === sid; })[0];
  if (!r) return null;
  return { rec: r, group: typeof currentGroup !== "undefined" && currentGroup ? currentGroup.name : "", date: typeof fmtDate === "function" ? fmtDate(r.date) : r.date };
}
function loadTournamentAvatars(sid) {
  var d = shareTournamentNow(sid), uids = [];
  if (!d) return Promise.resolve();
  [d.rec.champion, d.rec.runnerUp, d.rec.third].forEach(function (tm) { if (tm) tm.uids.forEach(function (u) { if (uids.indexOf(u) < 0) uids.push(u); }); });
  _hofAv = {};
  return Promise.all(uids.map(function (u) { return _scLoadAvatar(u).then(function (im) { _hofAv[u] = im; }); }));
}

/* v257: the winner card is a podium: champion pair on a gold step in the middle (spotlight, crown, confetti), 2nd on a silver step on the left,
   3rd on a bronze step on the right (no 3rd place with 4-5 players: two steps). All art is drawn here from simple shapes. */
var HOF_METAL = [["#fff0a8", "#f6c431", "#b97a0b"], ["#f7f9fc", "#c7ceda", "#8b94a6"], ["#f6c394", "#d08a47", "#8f5322"]];   // light, mid, dark: gold, silver, bronze
var HOF_INIT_COLS = ["#7c3aed", "#0d9488", "#db2777", "#2563eb", "#ea580c", "#16a34a", "#9333ea", "#0891b2"];
/** A steady colour for a player without a photo (same player, same colour) */
function _hofColor(uid) { var h = 0, k = String(uid || "?"); for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return HOF_INIT_COLS[h % HOF_INIT_COLS.length]; }

/** Round avatar: photo, or the first letter on a coloured circle. ring = the metal colour. */
function _hofAvatar(c, uid, x, y, r, ring, nm, font) {
  var im = _hofAv[uid];
  c.save(); c.shadowColor = ring; c.shadowBlur = 26; c.fillStyle = ring; c.beginPath(); c.arc(x, y, r + Math.max(5, r * .06), 0, 7); c.fill(); c.restore();
  c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip();
  if (im) { var s = Math.min(im.width, im.height); c.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, x - r, y - r, r * 2, r * 2); }
  else { c.fillStyle = _hofColor(uid); c.fillRect(x - r, y - r, r * 2, r * 2); c.fillStyle = "#fff"; c.font = font(Math.round(r * 1.05), 800); c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(String(nm || "?").charAt(0).toUpperCase(), x, y + 4); c.textBaseline = "alphabetic"; }
  c.restore();
}
function _hofFit(c, txt, max) { txt = String(txt); while (c.measureText(txt).width > max && txt.length > 3) txt = txt.slice(0, -2); return txt; }

/** Gold crown with a band of jewels. (x, y) = middle of its bottom edge, s = width. */
function _hofCrown(c, x, y, s) {
  c.save(); c.translate(x, y); c.lineJoin = "round";
  var g = c.createLinearGradient(0, -s * .78, 0, 0); g.addColorStop(0, "#fff3b0"); g.addColorStop(.45, "#f6c431"); g.addColorStop(1, "#b97a0b");
  c.shadowColor = "rgba(255,200,60,.7)"; c.shadowBlur = s * .3; c.fillStyle = g; c.strokeStyle = "#8f5a05"; c.lineWidth = Math.max(2, s * .022);
  c.beginPath(); c.moveTo(-s / 2, 0); c.lineTo(-s / 2, -s * .56); c.lineTo(-s * .26, -s * .24); c.lineTo(0, -s * .74); c.lineTo(s * .26, -s * .24); c.lineTo(s / 2, -s * .56); c.lineTo(s / 2, 0); c.closePath(); c.fill(); c.shadowBlur = 0; c.stroke();
  c.fillStyle = "rgba(255,255,255,.26)"; c.beginPath(); c.moveTo(0, -s * .74); c.lineTo(-s * .26, -s * .24); c.lineTo(-s * .06, -s * .17); c.closePath(); c.fill();   // light facets on the left,
  c.beginPath(); c.moveTo(-s / 2, -s * .56); c.lineTo(-s * .26, -s * .24); c.lineTo(-s * .45, -s * .17); c.closePath(); c.fill();
  c.fillStyle = "rgba(120,60,0,.2)"; c.beginPath(); c.moveTo(0, -s * .74); c.lineTo(s * .26, -s * .24); c.lineTo(s * .06, -s * .17); c.closePath(); c.fill();   // shade on the right
  c.beginPath(); c.moveTo(s / 2, -s * .56); c.lineTo(s * .26, -s * .24); c.lineTo(s * .45, -s * .17); c.closePath(); c.fill();
  var bg = c.createLinearGradient(0, -s * .17, 0, 0); bg.addColorStop(0, "#f0b323"); bg.addColorStop(1, "#a56a06");
  c.fillStyle = bg; _scRound(c, -s / 2, -s * .18, s, s * .18, s * .04); c.fill(); c.stroke();
  [[-s * .3, "#ef4444"], [0, "#38bdf8"], [s * .3, "#22c55e"]].forEach(function (j) {
    c.fillStyle = j[1]; c.beginPath(); c.arc(j[0], -s * .09, s * .042, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.arc(j[0] - s * .012, -s * .1, s * .014, 0, 7); c.fill();
  });
  c.fillStyle = "#fff3b0"; [[-s / 2, -s * .58], [0, -s * .77], [s / 2, -s * .58]].forEach(function (b) { c.beginPath(); c.arc(b[0], b[1], s * .055, 0, 7); c.fill(); c.stroke(); });
  c.restore();
}

/** Static confetti: small rectangles and dots, the same every time (no random: the picture of a card never changes) */
function _hofConfetti(c, W, y0, y1, n, cols) {
  var rnd = function (i) { var x = Math.sin(i * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };
  c.save();
  for (var i = 0; i < n; i++) {
    var x = 30 + rnd(i) * (W - 60), y = y0 + rnd(i + 200) * (y1 - y0), r = rnd(i + 400) * 6.28;
    c.globalAlpha = .35 + rnd(i + 600) * .4; c.fillStyle = cols[i % cols.length];
    if (i % 3 === 0) { c.beginPath(); c.arc(x, y, 5 + rnd(i + 800) * 4, 0, 7); c.fill(); }
    else { c.save(); c.translate(x, y); c.rotate(r); c.fillRect(-9, -4, 18, 8); c.restore(); }
  }
  c.restore();
}

/** One podium step: metal block, light top edge, gloss, the place number and a dark plaque per player name */
function _hofStep(c, x, topY, w, h, k, names, font, sc) {
  var m = HOF_METAL[k], g = c.createLinearGradient(0, topY, 0, topY + h);
  g.addColorStop(0, m[1]); g.addColorStop(1, m[2]);
  c.save(); c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 24; c.fillStyle = g; _scRound(c, x, topY, w, h, 18); c.fill(); c.restore();
  var gl = c.createLinearGradient(x, 0, x + w, 0); gl.addColorStop(0, "rgba(255,255,255,.28)"); gl.addColorStop(.5, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(0,0,0,.16)");
  c.fillStyle = gl; _scRound(c, x, topY, w, h, 18); c.fill();
  c.fillStyle = m[0]; _scRound(c, x, topY, w, 26 * sc, 14); c.fill();
  c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 3; _scRound(c, x, topY, w, h, 18); c.stroke();
  var cx = x + w / 2, ns = Math.round(Math.min(w * .4, h * .36)), ny = topY + 26 * sc + ns * .95;
  c.textAlign = "center"; c.font = font(ns, 800);
  c.fillStyle = "rgba(255,255,255,.6)"; c.fillText(String(k + 1), cx, ny + 3);
  c.fillStyle = "rgba(80,40,0,.55)"; c.fillText(String(k + 1), cx, ny);
  var fs = Math.round((k === 0 ? 40 : 31) * sc), lh = Math.round(fs * 1.5), py = ny + 22 * sc;
  names.forEach(function (nm, i) {
    c.font = font(fs, 800);
    var tx = _hofFit(c, nm, w - 56), tw = Math.min(w - 24, c.measureText(tx).width + 36), yy = py + i * (lh + 8);
    c.fillStyle = "rgba(0,0,0,.34)"; _scRound(c, cx - tw / 2, yy, tw, lh, lh / 2); c.fill();
    c.fillStyle = "#fff"; c.fillText(tx, cx, yy + lh * .72);
  });
}

/** The winner card. d = shareTournamentNow(...) */
function drawTournamentCard(canvas, d, id, fmt) {
  var r = d.rec, W = 1080, H = fmt === "square" ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d"), sq = fmt === "square";
  canvas.width = W; canvas.height = H;
  var font = function (px, w) { return (w || 700) + " " + px + "px Montserrat, 'Noto Sans Lao', 'Noto Sans', sans-serif"; };
  P.line = "rgba(255,255,255,.12)";   // court lines stay in the background
  _scBackdrop(c, W, H, id, P); _scCourt(c, W, H, P);
  var sc = sq ? .8 : 1, top = sq ? 70 : 150, ay = sq ? 470 : 760, r1 = sq ? 80 : 100, h1 = sq ? 330 : 470, r2 = Math.round(r1 * .64);
  // spotlight from above the champion, soft rays, confetti
  var sp = c.createRadialGradient(W / 2, ay - 40, 20, W / 2, ay - 40, sq ? 620 : 760); sp.addColorStop(0, "rgba(255,236,160,.5)"); sp.addColorStop(.45, "rgba(255,220,120,.16)"); sp.addColorStop(1, "rgba(255,220,120,0)");
  c.fillStyle = sp; c.fillRect(0, 0, W, H);
  c.save(); c.fillStyle = "rgba(255,240,190,.07)";
  for (var ri = -4; ri <= 4; ri++) { c.beginPath(); c.moveTo(W / 2, ay - 120); c.lineTo(W / 2 + ri * 260 - 70, ay + 900); c.lineTo(W / 2 + ri * 260 + 70, ay + 900); c.closePath(); c.fill(); }
  c.restore();
  _hofConfetti(c, W, top + 80, ay + r1 + 260, sq ? 44 : 64, ["#fde047", "#ffffff", P.accent, "#f87171", "#60a5fa", "#34d399"]);
  // brand, tournament, date, group
  c.textAlign = "center"; c.fillStyle = P.accent; c.font = font(36, 800); c.fillText("GODSMASH  BADMINTON", W / 2, top);
  _scShuttle(c, 150, top - 12, 46, -35, P.text, .95); _scShuttle(c, W - 150, top - 12, 46, 35, P.text, .95);
  c.fillStyle = P.dim; c.font = font(28, 600); c.fillText(t("tourTitle") + "  ·  " + d.date, W / 2, top + 46);
  if (d.group) {
    c.font = font(sq ? 28 : 32, 800); var gt = _hofFit(c, d.group, 640), gw = c.measureText(gt).width + 64, gy = top + (sq ? 70 : 100), gh = sq ? 48 : 56;
    c.fillStyle = P.card; _scRound(c, W / 2 - gw / 2, gy, gw, gh, gh / 2); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    c.fillStyle = P.text; c.fillText(gt, W / 2, gy + gh * .68);
  }
  c.fillStyle = P.text; c.font = font(Math.round(60 * sc), 800); c.save(); c.shadowColor = "rgba(255,200,60,.6)"; c.shadowBlur = 24;
  var labY = sq ? 262 : 440; c.fillText(t("hofChampions").toUpperCase(), W / 2, labY); c.restore();
  _hofCrown(c, W / 2, ay - r1 - 14, sq ? 140 : 190);
  // podium: steps abut, 2nd left, 1st in the middle, 3rd right; two places = centred pair of steps
  var base = ay + r1 + 14 + h1, w1 = 400, w2 = 300, has3 = !!r.third && !!r.runnerUp;
  var slots = [];
  if (r.runnerUp) slots.push({ k: 1, tm: r.runnerUp, w: w2, h: Math.round(h1 * .72), r: r2 });
  slots.push({ k: 0, tm: r.champion, w: w1, h: h1, r: r1 });
  if (has3) slots.push({ k: 2, tm: r.third, w: w2, h: Math.round(h1 * .57), r: r2 });
  var tot = slots.reduce(function (a, x) { return a + x.w; }, 0), sx = (W - tot) / 2;
  slots.forEach(function (sl) {
    var topY = base - sl.h, cx = sx + sl.w / 2, nms = sl.tm.uids.map(function (u, i) { return _hofName(u, sl.tm.names[i]); }), off = sl.r + (sl.k === 0 ? 8 : 6);
    _hofStep(c, sx, topY, sl.w, sl.h, sl.k, nms, font, sc);
    sl.tm.uids.forEach(function (u, i) { if (u) _hofAvatar(c, u, cx + (i ? 1 : -1) * off, topY - 14 - sl.r, sl.r, HOF_METAL[sl.k][1], nms[i], font); });
    sx += sl.w;
  });
  c.fillStyle = "rgba(255,255,255,.22)"; _scRound(c, (W - tot) / 2 - 20, base + 6, tot + 40, 8, 4); c.fill();   // the floor
  // final score, one pill per game
  var y = base + (sq ? 44 : 56), games = r.finalGames || [];
  if (r.finalScore) {
    var ph = sq ? 215 : 285, pw = W - 180, pillY;
    c.fillStyle = P.card; _scRound(c, 90, y, pw, ph, 36); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    c.fillStyle = P.dim; c.font = font(26, 700); c.fillText((_hofHasFinal(r.n) ? t("hofFinalLine") : t("hofRoundRobin")).toUpperCase(), W / 2, y + 44);
    c.save(); c.shadowColor = P.accent; c.shadowBlur = 26; c.fillStyle = P.text; c.font = font(sq ? 96 : 130, 800); c.fillText(r.finalScore, W / 2, y + (sq ? 124 : 158)); c.restore();
    if (games.length) {
      var gw2 = sq ? 170 : 200, gh2 = sq ? 46 : 56, gap = 18, gx = W / 2 - (games.length * gw2 + (games.length - 1) * gap) / 2; pillY = y + ph - gh2 - (sq ? 14 : 20);
      games.forEach(function (gm, i) {
        var bx = gx + i * (gw2 + gap); c.fillStyle = P.pill; _scRound(c, bx, pillY, gw2, gh2, gh2 / 2); c.fill(); c.strokeStyle = P.accent; c.lineWidth = 3; c.stroke();
        c.fillStyle = "#fff"; c.font = font(sq ? 28 : 34, 800); c.fillText(gm, bx + gw2 / 2, pillY + gh2 * .7);
      });
    }
    y += ph + 34;
  }
  if (r.outs.length) {
    c.fillStyle = P.dim; c.font = font(24, 600);
    c.fillText(_hofFit(c, r.outs.map(function (o) { return o.uids.map(function (u) { return _hofName(u, ""); }).join(" + ") + " · " + _hofOutWhy(o.why); }).join("   "), W - 160), W / 2, y + 10);
  }
  c.fillStyle = P.dim; c.font = font(26, 600); c.fillText("phounsiris-sketch.github.io/bughunters", W / 2, H - (sq ? 40 : 70));
}
