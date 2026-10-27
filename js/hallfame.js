/* ============================================================
   hallfame.js — tournament winner card and the Hall of Fame (v229)
   A finished session tournament leaves a record in groups/{gid}/hallOfFame/{sid}:
   { v, sid, gid, date, n, champion:{uids,names}, runnerUp|null, third|null, finalScore, finalGames:[text], outs:[{uids,why}], createdBy, createdAt }
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
  if (T.n === 8) {
    var fs = tourFinals(T), w = tourFinalWins(T), champIsA = fs.length && order[0] === fs[0].pa;
    rec.finalScore = (champIsA ? w.wa : w.wb) + "–" + (champIsA ? w.wb : w.wa);
    rec.finalGames = fs.slice(0, 3).map(function (g) { return g.v ? "-" : g.wo ? "W/O" : (champIsA ? g.sa + "–" + g.sb : g.sb + "–" + g.sa); });
  } else {
    var row = tourPairTable(T).filter(function (x) { return x.i === order[0]; })[0];
    rec.finalScore = row ? row.w + "–" + row.l : "";
  }
  rec.outs = (T.out || []).slice(0, 4).map(function (o) { var tm = _hofTeam(T, o.p, nameOf); return { uids: tm ? tm.uids : [], why: String(o.why || "other") }; });
  delete T.__P;
  return rec;
}

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
  return { v: 1, sid: s(r.sid, 80), gid: s(r.gid, 80), date: s(r.date, 10), n: r.n === 6 ? 6 : 8, champion: champ, runnerUp: team(r.runnerUp), third: team(r.third),
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
      return '<div class="hof-t"><div class="hof-t-h"><b>' + escapeHtml(fmtDate(r.date)) + '</b><span class="hof-t-n">' + escapeHtml(t(r.n === 8 ? "hofSize8" : "hofSize6")) + (r.finalScore ? ' · ' + escapeHtml(r.finalScore) : '') + '</span>' +
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

function _hofDrawAvatar(c, uid, x, y, r, P, nm, font) {
  var im = _hofAv[uid];
  c.save(); c.shadowColor = P.accent; c.shadowBlur = 24; c.strokeStyle = P.accent; c.lineWidth = 6; c.beginPath(); c.arc(x, y, r + 6, 0, 7); c.stroke(); c.restore();
  c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip();
  if (im) { var s = Math.min(im.width, im.height); c.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, x - r, y - r, r * 2, r * 2); }
  else { c.fillStyle = P.pill; c.fillRect(x - r, y - r, r * 2, r * 2); c.fillStyle = "#fff"; c.font = font(r, 800); c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(String(nm || "?").charAt(0).toUpperCase(), x, y + 4); c.textBaseline = "alphabetic"; }
  c.restore();
}
function _hofFit(c, txt, max) { txt = String(txt); while (c.measureText(txt).width > max && txt.length > 3) txt = txt.slice(0, -2); return txt; }

/** The winner card. d = shareTournamentNow(...) */
function drawTournamentCard(canvas, d, id, fmt) {
  var r = d.rec, W = 1080, H = fmt === "square" ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d"), sq = fmt === "square";
  canvas.width = W; canvas.height = H;
  var font = function (px, w) { return (w || 700) + " " + px + "px Montserrat, 'Noto Sans Lao', 'Noto Sans', sans-serif"; };
  _scBackdrop(c, W, H, id, P); _scCourt(c, W, H, P);
  var top = sq ? 70 : 150;
  c.textAlign = "center"; c.fillStyle = P.accent; c.font = font(36, 800); c.fillText("GODSMASH  BADMINTON", W / 2, top);
  _scShuttle(c, 150, top - 12, 46, -35, P.text, .95); _scShuttle(c, W - 150, top - 12, 46, 35, P.text, .95);
  c.fillStyle = P.dim; c.font = font(28, 600); c.fillText(t("tourTitle") + "  ·  " + d.date + (d.group ? "  ·  " + d.group : ""), W / 2, top + 46);
  // crown
  var cy = top + (sq ? 120 : 200);
  c.save(); c.shadowColor = P.accent; c.shadowBlur = 30; c.fillStyle = P.accent; c.beginPath();
  c.moveTo(W / 2 - 70, cy + 40); c.lineTo(W / 2 - 84, cy - 30); c.lineTo(W / 2 - 38, cy + 4); c.lineTo(W / 2, cy - 54); c.lineTo(W / 2 + 38, cy + 4); c.lineTo(W / 2 + 84, cy - 30); c.lineTo(W / 2 + 70, cy + 40); c.closePath(); c.fill();
  c.fillRect(W / 2 - 70, cy + 50, 140, 14); c.restore();
  c.fillStyle = P.text; c.font = font(sq ? 52 : 60, 800); c.fillText(t("hofChampions").toUpperCase(), W / 2, cy + (sq ? 130 : 150));
  // champion pair
  var ar = sq ? 120 : 150, ay = cy + (sq ? 290 : 350), ch = r.champion;
  [0, 1].forEach(function (i) {
    var ux = W / 2 + (i ? 1 : -1) * (ar + 40), uid = ch.uids[i];
    if (!uid) return;
    _hofDrawAvatar(c, uid, ux, ay, ar, P, ch.names[i], font);
    c.fillStyle = P.text; c.font = font(sq ? 40 : 46, 800); c.textAlign = "center"; c.fillText(_hofFit(c, _hofName(uid, ch.names[i]), ar * 2 + 60), ux, ay + ar + (sq ? 64 : 76));
  });
  // final score
  var sy = ay + ar + (sq ? 200 : 260);
  if (r.finalScore) {
    c.save(); c.shadowColor = P.accent; c.shadowBlur = 30; c.fillStyle = P.text; c.font = font(sq ? 150 : 190, 800); c.fillText(r.finalScore, W / 2, sy); c.restore();
    c.fillStyle = P.dim; c.font = font(28, 700); c.fillText((r.n === 8 ? t("hofFinalLine") : t("hofRoundRobin")).toUpperCase() + (r.finalGames.length ? "   " + r.finalGames.join("  ·  ") : ""), W / 2, sy + 52);
  }
  // runner-up and third
  var y = sy + (sq ? 100 : 130);
  [[r.runnerUp, t("tourPlace2")], [r.third, t("tourPlace3")]].forEach(function (x) {
    if (!x[0]) return;
    c.fillStyle = P.card; _scRound(c, 90, y, W - 180, sq ? 104 : 120, 36); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    c.textAlign = "left"; c.fillStyle = P.dim; c.font = font(26, 700); c.fillText(x[1].toUpperCase(), 130, y + (sq ? 42 : 48));
    c.fillStyle = P.text; c.font = font(sq ? 36 : 42, 800); c.fillText(_hofFit(c, x[0].uids.map(function (u, i) { return _hofName(u, x[0].names[i]); }).join(" + "), W - 300), 130, y + (sq ? 88 : 98));
    c.textAlign = "center"; y += (sq ? 104 : 120) + 24;
  });
  if (r.outs.length) {
    c.fillStyle = P.dim; c.font = font(24, 600);
    c.fillText(_hofFit(c, r.outs.map(function (o) { return o.uids.map(function (u) { return _hofName(u, ""); }).join(" + ") + " · " + _hofOutWhy(o.why); }).join("   "), W - 160), W / 2, y + 30);
  }
  c.fillStyle = P.dim; c.font = font(26, 600); c.fillText("phounsiris-sketch.github.io/bughunters", W / 2, H - (sq ? 40 : 70));
}
