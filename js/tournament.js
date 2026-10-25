/* ============================================================
   tournament.js — a tournament inside one session (v227)
   1. Rotation: 6 players play 9 games, 8 players play 6, with a random partner each game
      and an even rest (everyone plays the same number of games).
   2. Pairs: best with worst, from the rotation table.
   3. Playoff: 8 players = 2 semis (drawn at random), 3rd place (1 game), final best of 3.
               6 players = round robin of the 3 pairs.
   The first part of this file is the plain engine (tour*), no DOM, tested in tests/tournament.test.js.
   The state is one object saved as sessions/{id}.tournament:
   { v, n, ids:[uid], coin:[idx], games:[{ph,a:[idx],b:[idx],sa,sb}], po:[{ph,lab,fin,a,b,pa,pb,sa,sb}], drawn, semi:[0..3]|null }
   Players inside games are positions (0..n-1) in `ids`, so the nested arrays stay legal in Firestore.
   ============================================================ */

var TOUR_BASE = {
  6: [[[0, 2], [5, 3]], [[1, 4], [3, 2]], [[4, 1], [0, 5]], [[0, 3], [5, 2]], [[1, 2], [4, 5]], [[1, 3], [4, 0]], [[0, 1], [2, 4]], [[3, 4], [5, 2]], [[5, 1], [3, 0]]],
  8: [[[3, 7], [4, 1]], [[0, 6], [2, 5]], [[6, 3], [4, 5]], [[2, 1], [0, 7]], [[7, 6], [5, 1]], [[0, 2], [4, 3]]]
};
var TOUR_MAX_SCORE = 30;

function tourShuffle(a, rnd) {
  rnd = rnd || Math.random;
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
function tourDone(g) { return !!g && g.sa !== null && g.sa !== undefined; }
function tourSizeOk(n) { return n === 6 || n === 8; }
function tourRounds(n) { return TOUR_BASE[n] ? TOUR_BASE[n].length : 0; }

/** Longest rest and longest play streak of any player */
function tourRuns(games, n) {
  var mr = 0, mp = 0;
  for (var p = 0; p < n; p++) {
    var r = 0, q = 0;
    for (var k = 0; k < games.length; k++) {
      var on = games[k].a.indexOf(p) >= 0 || games[k].b.indexOf(p) >= 0;
      if (on) { q++; r = 0; if (q > mp) mp = q; } else { r++; q = 0; if (r > mr) mr = r; }
    }
  }
  return { rest: mr, play: mp };
}

/** The base schedule on a random order of games and a random mix of players; keeps the one with the most even rest */
function tourPickShape(n, rnd) {
  var base = TOUR_BASE[n], limR = n === 8 ? 2 : 1, limP = n === 8 ? 2 : 3, best = null, bs = 1e9, ids = [], i;
  for (i = 0; i < n; i++) ids.push(i);
  for (var t = 0; t < 40000; t++) {
    var ord = tourShuffle(base, rnd), pm = tourShuffle(ids, rnd);
    var gs = ord.map(function (g) {
      return { ph: "rot", a: [pm[g[0][0]], pm[g[0][1]]], b: [pm[g[1][0]], pm[g[1][1]]], sa: null, sb: null };
    });
    var r = tourRuns(gs, n), sc = r.rest * 10 + r.play;
    if (sc < bs) { bs = sc; best = gs; }
    if (r.rest <= limR && r.play <= limP) break;
  }
  return best;
}

/** A new tournament for the players of a session (6 or 8 user ids) */
function tourNew(uids, rnd) {
  var n = uids.length, ids = [], i;
  for (i = 0; i < n; i++) ids.push(i);
  return { v: 1, n: n, ids: uids.slice(), coin: tourShuffle(ids, rnd), games: tourPickShape(n, rnd), po: [], drawn: false, semi: null };
}

function tourAll(T) { return T.games.concat(T.po); }
function tourNext(T) { var a = tourAll(T); for (var i = 0; i < a.length; i++) if (!tourDone(a[i])) return a[i]; return null; }
function tourRotDone(T) { return T.games.length > 0 && T.games.every(tourDone); }

/** Rotation table: wins, then point difference, then points for, then the coin drawn at the start */
function tourStats(T) {
  var st = {}, i, out = [];
  for (i = 0; i < T.n; i++) st[i] = { id: i, w: 0, l: 0, pf: 0, pa: 0, p: 0 };
  T.games.forEach(function (g) {
    if (!tourDone(g)) return;
    g.a.forEach(function (x) { var s = st[x]; s.p++; s.pf += g.sa; s.pa += g.sb; if (g.sa > g.sb) s.w++; else s.l++; });
    g.b.forEach(function (x) { var s = st[x]; s.p++; s.pf += g.sb; s.pa += g.sa; if (g.sb > g.sa) s.w++; else s.l++; });
  });
  for (i = 0; i < T.n; i++) out.push(st[i]);
  var coin = T.coin || [];
  return out.sort(function (x, y) {
    return y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || (coin.indexOf(x.id) - coin.indexOf(y.id)) || x.id - y.id;
  });
}

/** Best with worst: #1+#n, #2+#n-1 ... Sorted by the pair's combined point difference; seed = place in this list */
function tourPairs(T) {
  var r = tourStats(T), n = T.n, out = [];
  for (var k = 0; k < n / 2; k++) {
    var a = r[k], b = r[n - 1 - k];
    out.push({ m: [a.id, b.id], ranks: [k + 1, n - k], diff: (a.pf - a.pa) + (b.pf - b.pa) });
  }
  out.sort(function (x, y) { return y.diff - x.diff || x.ranks[0] - y.ranks[0]; });
  return out.map(function (p, i) { p.seed = i + 1; return p; });
}
function tourSig(T) { return tourPairs(T).map(function (p) { return p.m.slice().sort().join("-"); }).join("|"); }

function tourFinals(T) { return T.po.filter(function (g) { return g.fin; }); }
function tourFinalWins(T) { var wa = 0, wb = 0; tourFinals(T).forEach(function (g) { if (tourDone(g)) { if (g.sa > g.sb) wa++; else wb++; } }); return { wa: wa, wb: wb }; }
function tourFinalDecided(T) { var w = tourFinalWins(T); return w.wa === 2 || w.wb === 2; }
/** How many final games the current results need (the series ends at 2 wins) */
function tourFinalKeep(T) {
  var f = tourFinals(T), wa = 0, wb = 0, keep = 0;
  for (var i = 0; i < f.length; i++) {
    if (wa === 2 || wb === 2) break;
    keep = i + 1;
    if (!tourDone(f[i])) break;
    if (f[i].sa > f[i].sb) wa++; else wb++;
  }
  return keep;
}
/** Trim final games the score no longer needs, add game 2 or 3 when the series asks for it */
function tourSync(T) {
  var f = tourFinals(T);
  if (!f.length) return;
  var kept = f.slice(0, tourFinalKeep(T));
  T.po = T.po.filter(function (g) { return !g.fin; }).concat(kept);
  var w = tourFinalWins(T);
  if (kept.every(tourDone) && w.wa < 2 && w.wb < 2 && kept.length < 3) {
    var k = kept[0];
    T.po.push({ ph: "po", fin: true, a: k.a, b: k.b, pa: k.pa, pb: k.pb, lab: "F" + (kept.length + 1), sa: null, sb: null });
  }
}

/** Build the playoff games from what is drawn and played so far */
function tourBuild(T) {
  if (!tourRotDone(T) || !T.drawn) { T.po = []; return; }
  var P = tourPairs(T);
  function mk(x, lab) { return { ph: "po", a: P[x[0]].m, b: P[x[1]].m, pa: x[0], pb: x[1], lab: lab, sa: null, sb: null }; }
  if (!T.po.length) {
    if (T.n === 6) T.po = [mk([0, 1], "R1"), mk([0, 2], "R2"), mk([1, 2], "R3")];
    else { var o = T.semi || [0, 1, 2, 3]; T.po = [mk([o[0], o[1]], "S1"), mk([o[2], o[3]], "S2")]; }
  }
  if (T.n === 8 && T.po.length >= 2 && tourDone(T.po[0]) && tourDone(T.po[1])) {
    if (T.po.length === 2) {
      var g0 = T.po[0], g1 = T.po[1];
      var w1 = g0.sa > g0.sb ? g0.pa : g0.pb, l1 = g0.sa > g0.sb ? g0.pb : g0.pa;
      var w2 = g1.sa > g1.sb ? g1.pa : g1.pb, l2 = g1.sa > g1.sb ? g1.pb : g1.pa;
      T.po.push({ ph: "po", a: P[l1].m, b: P[l2].m, pa: l1, pb: l2, lab: "T", sa: null, sb: null });
      T.po.push({ ph: "po", fin: true, a: P[w1].m, b: P[w2].m, pa: w1, pb: w2, lab: "F1", sa: null, sb: null });
    }
    tourSync(T);
  }
}

/** Draw the playoff (semifinals at random for 8 players, the pairs for 6) once the rotation is played */
function tourDraw(T, rnd) {
  if (!tourRotDone(T)) return false;
  T.drawn = true; T.semi = T.n === 8 ? tourShuffle([0, 1, 2, 3], rnd) : null; T.po = [];
  tourBuild(T);
  return true;
}

function tourComplete(T) {
  if (!T.po.length || !T.po.every(tourDone)) return false;
  return T.n === 6 ? T.po.length === 3 : (T.po.length >= 4 && tourFinalDecided(T));
}
/** 0 rotation, 1 pairs drawn / waiting for the draw, 2 playoff running, 3 done */
function tourPhase(T) {
  if (!tourRotDone(T)) return 0;
  if (tourComplete(T)) return 3;
  return T.po.some(tourDone) ? 2 : 1;
}

/** 6 players: the round-robin table of the three pairs (wins, point diff, the game between them, seed) */
function tourPairTable(T) {
  var P = tourPairs(T), tab = P.map(function (p) { return { i: p.seed - 1, w: 0, l: 0, d: 0 }; });
  T.po.forEach(function (g) {
    if (!tourDone(g) || g.lab.charAt(0) !== "R") return;
    var df = g.sa - g.sb;
    tab[g.pa].d += df; tab[g.pb].d -= df;
    if (df > 0) { tab[g.pa].w++; tab[g.pb].l++; } else { tab[g.pb].w++; tab[g.pa].l++; }
  });
  function h2h(x, y) {
    for (var k = 0; k < T.po.length; k++) {
      var g = T.po[k];
      if (!tourDone(g) || g.lab.charAt(0) !== "R") continue;
      if (g.pa === x && g.pb === y) return g.sa > g.sb ? -1 : 1;
      if (g.pa === y && g.pb === x) return g.sa > g.sb ? 1 : -1;
    }
    return 0;
  }
  return tab.sort(function (x, y) { return y.w - x.w || y.d - x.d || h2h(x.i, y.i) || x.i - y.i; });
}

/** [1st, 2nd, 3rd] as pair numbers (seed - 1), once everything is played */
function tourOrder(T) {
  if (!tourComplete(T)) return null;
  if (T.n === 8) {
    var t3 = T.po[2], f0 = T.po[3], fw = tourFinalWins(T);
    return [fw.wa > fw.wb ? f0.pa : f0.pb, fw.wa > fw.wb ? f0.pb : f0.pa, t3.sa > t3.sb ? t3.pa : t3.pb];
  }
  return tourPairTable(T).map(function (x) { return x.i; });
}

/** Who partners and who meets whom in the rotation */
function tourMeet(T) {
  var pc = {}, oc = {};
  function k(a, b) { return a < b ? a + "-" + b : b + "-" + a; }
  T.games.forEach(function (g) {
    [g.a, g.b].forEach(function (t) { var x = k(t[0], t[1]); pc[x] = (pc[x] || 0) + 1; });
    g.a.forEach(function (x) { g.b.forEach(function (y) { var q = k(x, y); oc[q] = (oc[q] || 0) + 1; }); });
  });
  var seen = {}, cover = 0;
  Object.keys(pc).concat(Object.keys(oc)).forEach(function (q) { if (!seen[q]) { seen[q] = 1; cover++; } });
  return { pc: pc, oc: oc, cover: cover, total: T.n * (T.n - 1) / 2, partners: Object.keys(pc).length };
}

function tourScoreOk(sa, sb) {
  function ok(x) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x && x >= 0 && x <= TOUR_MAX_SCORE; }
  return ok(sa) && ok(sb) && sa !== sb;
}

function _tourTry(g, sa, sb, fn) { var o = [g.sa, g.sb]; g.sa = sa; g.sb = sb; var r = fn(); g.sa = o[0]; g.sb = o[1]; return r; }

/** What a correction of a played game would throw away: null, or { kind: "pairs"|"semi"|"final", ... } */
function tourImpact(T, g, sa, sb) {
  if (!tourDone(g)) return null;
  var played = T.po.filter(tourDone).length;
  if (g.ph === "rot" && tourRotDone(T) && T.po.length) {
    var before = tourSig(T), after = _tourTry(g, sa, sb, function () { return { sig: tourSig(T), pairs: tourPairs(T).map(function (p) { return p.m.slice(); }) }; });
    if (before !== after.sig && played) return { kind: "pairs", pairs: after.pairs, played: played };
  }
  var i = T.po.indexOf(g);
  if (g.ph === "po" && T.n === 8 && i >= 0 && i < 2 && T.po.length > 2) {
    var flip = (g.sa > g.sb) !== (sa > sb);
    if (flip && (tourDone(T.po[2]) || tourFinals(T).some(tourDone))) return { kind: "semi" };
  }
  if (g.fin) {
    var lost = _tourTry(g, sa, sb, function () { return tourFinals(T).slice(tourFinalKeep(T)).some(tourDone); });
    if (lost) return { kind: "final" };
  }
  return null;
}

/** Write a score into a game and fix what depends on it. Returns what happened. */
function tourApply(T, g, sa, sb) {
  var was = tourDone(g), oldA = was && g.sa > g.sb, res = { fixed: was, pairsChanged: false, semiReset: false };
  var before = (g.ph === "rot" && tourRotDone(T)) ? tourSig(T) : null;
  g.sa = sa; g.sb = sb;
  var i = T.po.indexOf(g);
  if (g.ph === "rot") {
    if (before !== null && tourSig(T) !== before) { T.po = []; T.drawn = false; T.semi = null; res.pairsChanged = true; }
    tourBuild(T);
  } else if (T.n === 8 && i >= 0 && i < 2 && T.po.length > 2 && was && oldA !== (sa > sb)) {
    T.po.length = 2; res.semiReset = true; tourBuild(T);
  } else tourBuild(T);
  return res;
}

/* ============================================================
   The screen
   ============================================================ */

var _tnSid = null;       // session whose tournament screen is open
var _tnEdit = null;      // { gi, sa, sb, err } score being typed
var _tnAnim = null;      // { kind: "teams" | "draw" } while the draw plays
var _tnTimer = null;
var _tnToast = "";
var _tnBusy = false;

var TN_DICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/></svg>';
var TN_CROWN = '<svg class="tn-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11z"/><rect x="3" y="19.5" width="18" height="2" rx="1"/></svg>';

function _tnSession(sid) {
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === sid) return lastSessions[i];
  return null;
}
/** Only people who may edit the session (or its bill) run the tournament; everyone else watches */
function tourCanRun(s) { return !!s && (canEditSessionDetails(s) || canEditBill(s)); }
function _tnReduced() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
function _tnFill(str, o) { return String(str).replace(/\{(\w+)\}/g, function (m, k) { return o[k] === undefined ? m : o[k]; }); }
function _tnPlain(T, i) { return plainUserName(findUser(T.ids[i])); }
function _tnWho(T, i, sz) { return '<span class="tn-who">' + avatarHtml(T.ids[i], sz || 22) + '<span class="tn-nm">' + getUserName(T.ids[i]) + '</span></span>'; }
function _tnPairName(T, m) { return getUserName(T.ids[m[0]]) + " + " + getUserName(T.ids[m[1]]); }
function _tnLab(g) {
  var c = g.lab.charAt(0), n = g.lab.slice(1);
  if (c === "S") return _tnFill(t("tourSemi"), { n: n });
  if (c === "R") return _tnFill(t("tourRound"), { n: n });
  if (c === "F") return _tnFill(t("tourFinalG"), { n: n });
  return t("tourThirdPlace");
}
function _tnDrawWord(T) { return T.n === 8 ? t("tourWordSemi") : t("tourWordPairs"); }

/** What the main button says and does for this session now */
function tourStage(s) {
  var T = s.tournament, org = tourCanRun(s), n = (s.players || []).length;
  if (_tnAnim && _tnSid === s.id) return { act: "", label: t("tourDrawing"), disabled: true };
  if (!T) {
    if (!org) return null;
    if (!tourSizeOk(n)) return { act: "", label: t("tourNeed"), disabled: true };
    return { act: "start", icon: TN_DICE, label: _tnFill(t("tourBtnStart"), { n: n, g: tourRounds(n) }) };
  }
  if (tourComplete(T)) return { act: "winner", icon: icon("trophy", 20), label: t("tourBtnWinner") };
  if (!org) return { act: "view", label: t("tourBtnView") };
  if (tourRotDone(T) && !T.drawn) return { act: "draw", icon: TN_DICE, label: T.n === 8 ? t("tourBtnSemi") : t("tourBtnPairs") };
  var g = tourNext(T);
  if (!g) return { act: "view", label: t("tourBtnView") };
  if (g.ph === "rot") return { act: "play", label: _tnFill(t("tourBtnPlay"), { k: T.games.filter(tourDone).length + 1, g: T.games.length }) };
  return { act: "play", label: _tnFill(t("tourBtnPlayLab"), { label: _tnLab(g) }) };
}

function _tnLine(T) {
  if (!T) return t("tourLineNone");
  var ph = tourPhase(T), played = tourAll(T).filter(tourDone).length;
  if (ph === 3) return _tnFill(t("tourLineDone"), { k: played });
  if (!tourRotDone(T)) return _tnFill(t("tourLineRot"), { k: T.games.filter(tourDone).length, g: T.games.length });
  if (!T.drawn) return _tnFill(t("tourLineWait"), { w: _tnDrawWord(T) });
  return _tnFill(t("tourLinePlay"), { k: T.po.filter(tourDone).length });
}

/** The strip on the session card in the sessions list */
function tourCardHtml(s) {
  var st = tourStage(s);
  if (!st) return "";
  var T = s.tournament, played = T ? tourAll(T).filter(tourDone).length : 0;
  return '<div class="tn-card">' +
    '<div class="tn-card-line">' + icon("trophy", 14) + '<span>' + escapeHtml(_tnLine(T)) + '</span></div>' +
    (T ? '<div class="tn-bar"><i style="width:' + (tourComplete(T) ? 100 : Math.round(played / 12 * 100)) + '%"></i></div>' : '') +
    '<button type="button" class="tn-btn"' + (st.disabled ? ' disabled' : '') + ' onclick="tourCardAct(\'' + jsq(s.id) + '\')">' + (st.icon || "") + '<span>' + escapeHtml(st.label) + '</span></button>' +
    '</div>';
}

function tourCardAct(sid) {
  var s = _tnSession(sid);
  if (!s) return;
  var st = tourStage(s);
  if (!st || st.disabled) return;
  _tnOpen(sid);
  _tnStageAct(s, st);
}

/** The main button, on the card and on the screen */
function _tnStageAct(s, st) {
  if (st.act === "start") tourStartDraw(s, "teams");
  else if (st.act === "draw") tourStartDraw(s, "draw");
  else if (st.act === "play") {
    var g = tourNext(s.tournament);
    if (g) { _tnEdit = { gi: tourAll(s.tournament).indexOf(g), sa: 21, sb: 15, err: "" }; _tnToast = ""; tourRender(); _tnScroll(".tn-game.cur"); }
  } else if (st.act === "winner") _tnScroll("#tnWinner");
  else tourRender();
}

function _tnOpen(sid) {
  _tnSid = sid; _tnEdit = null; _tnToast = "";
  var el = document.getElementById("tnScreen");
  if (!el) {
    el = document.createElement("div");
    el.id = "tnScreen"; el.className = "tn-screen";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", t("tourTitle"));
    el.innerHTML = '<div class="tn-top"><button type="button" class="tn-close" data-act="close" aria-label="' + escapeHtml(t("close")) + '">' + icon("back", 20) + '</button>' +
      '<div class="tn-ttl"><b>' + escapeHtml(t("tourTitle")) + '</b><small id="tnSub"></small></div></div><div class="tn-wrap" id="tnBody"></div>';
    el.onclick = _tnClick;
    document.body.appendChild(el);
    document.body.classList.add("tn-open");
    document.addEventListener("keydown", _tnKey, true);
  }
  tourRender();
}
function _tnKey(e) {
  if (e.key !== "Escape") return;
  if (document.getElementById("askSheet")) return;   // the ask sheet closes first
  tourClose();
}
function tourClose() {
  clearInterval(_tnTimer); _tnAnim = null; _tnEdit = null; _tnSid = null;
  var el = document.getElementById("tnScreen"); if (el) el.remove();
  document.body.classList.remove("tn-open");
  document.removeEventListener("keydown", _tnKey, true);
}
function _tnScroll(sel) {
  try { setTimeout(function () { var e = document.querySelector(sel); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: _tnReduced() ? "auto" : "smooth", block: "center" }); }, 60); } catch (e) {}
}

/** Called when sessions change on the server: show the newest tournament unless someone is typing */
function tourOnSessions() {
  if (!_tnSid || !document.getElementById("tnScreen")) return;
  var s = _tnSession(_tnSid);
  if (!s) { tourClose(); return; }
  if (_tnAnim || _tnBusy) return;
  if (_tnEdit && s.tournament && _tnEdit.gi >= tourAll(s.tournament).length) _tnEdit = null;
  if (_tnEdit) return;   // do not wipe the score being typed
  tourRender();
}

function _tnPut(s) {
  _tnBusy = true;
  return dbUpdateSession(s.id, { tournament: JSON.parse(JSON.stringify(s.tournament)) }).then(function () { _tnBusy = false; }, function (e) {
    _tnBusy = false;
    dbOnError(e, "sessions");
    showToast(t("tourSaveFail"));
  });
}

/** The shuffle on screen, then the real draw is made and saved */
function tourStartDraw(s, kind) {
  if (_tnAnim || _tnBusy) return;
  var sid = s.id;
  function fin() {
    clearInterval(_tnTimer); _tnAnim = null;
    var cur = _tnSession(sid) || s;
    if (kind === "teams") {
      if (cur.tournament || !tourSizeOk((cur.players || []).length)) { tourRender(); return; }
      cur.tournament = tourNew(cur.players.slice());
      _tnToast = _tnFill(t("tourTeamsDrawn"), { g: cur.tournament.games.length });
    } else {
      if (!cur.tournament || !tourDraw(cur.tournament)) { tourRender(); return; }
      _tnToast = cur.tournament.n === 8 ? t("tourSemiDrawn") : t("tourPairsDrawn");
    }
    _tnPut(cur);
    tourRender(); _tnScroll(".tn-game.cur");
  }
  _tnToast = ""; _tnEdit = null;
  _tnAnim = { kind: kind, tick: 0 };
  if (_tnReduced()) { fin(); return; }
  tourRender();
  var t0 = 0;
  _tnTimer = setInterval(function () { t0++; if (t0 >= 14) fin(); else tourRender(); }, 110);
}

function _tnClick(ev) {
  var b = ev.target.closest ? ev.target.closest("[data-act]") : null;
  if (!b) return;
  var s = _tnSession(_tnSid), act = b.getAttribute("data-act");
  if (act === "close") { tourClose(); return; }
  if (!s) return;
  var T = s.tournament, org = tourCanRun(s);
  if (act === "stage") { var st = tourStage(s); if (st && !st.disabled) _tnStageAct(s, st); return; }
  if (!T || !org) return;
  if (act === "edit") {
    var gi = +b.getAttribute("data-i"), g = tourAll(T)[gi]; if (!g) return;
    _tnToast = ""; _tnEdit = { gi: gi, sa: tourDone(g) ? g.sa : 21, sb: tourDone(g) ? g.sb : 15, err: "" }; tourRender();
  } else if (act === "adj" && _tnEdit) {
    var k = b.getAttribute("data-t") === "a" ? "sa" : "sb";
    _tnEdit[k] = Math.max(0, Math.min(TOUR_MAX_SCORE, _tnEdit[k] + (+b.getAttribute("data-d")))); _tnEdit.err = ""; tourRender();
  } else if (act === "save") tourSaveScore(s);
  else if (act === "cancel") { _tnEdit = null; tourRender(); }
  else if (act === "reset") {
    askYes(t("tourResetTitle"), function () {
      var cur = _tnSession(s.id); if (!cur) return;
      clearInterval(_tnTimer); _tnAnim = null; _tnEdit = null; _tnToast = "";
      cur.tournament = null;
      _tnBusy = true;
      dbUpdateSession(cur.id, { tournament: firebase.firestore.FieldValue.delete() }).then(function () { _tnBusy = false; }, function (e) { _tnBusy = false; dbOnError(e, "sessions"); showToast(t("tourSaveFail")); });
      tourClose();
    }, { kind: "danger", body: t("tourResetBody"), yes: t("tourReset") });
  }
}

function tourSaveScore(s) {
  var T = s.tournament, e = _tnEdit, g = e && tourAll(T)[e.gi];
  if (!g) { _tnEdit = null; tourRender(); return; }
  if (!tourScoreOk(e.sa, e.sb)) { e.err = t("tourNoDraw"); tourRender(); return; }
  var imp = tourImpact(T, g, e.sa, e.sb);
  function go() {
    var cur = _tnSession(s.id) || s, T2 = cur.tournament, g2 = T2 && tourAll(T2)[e.gi];
    if (!g2) { _tnEdit = null; tourRender(); return; }
    var res = tourApply(T2, g2, e.sa, e.sb), msg = res.fixed ? t("tourScoreFixed") : t("tourScoreSaved");
    if (res.pairsChanged) msg += " " + _tnFill(t("tourPairsChanged"), { w: _tnDrawWord(T2) });
    if (res.semiReset) msg += " " + t("tourSemiReset");
    _tnEdit = null; _tnToast = msg;
    _tnPut(cur);
    tourRender();
  }
  if (!imp) { go(); return; }
  var body;
  if (imp.kind === "pairs") body = _tnFill(t("tourWarnPairs"), { pairs: imp.pairs.map(function (m) { return _tnPlain(T, m[0]) + " + " + _tnPlain(T, m[1]); }).join(", "), k: imp.played });
  else body = t(imp.kind === "semi" ? "tourWarnSemi" : "tourWarnFinal");
  askConfirm({ title: t("tourCorrect"), body: body, kind: "warn", yes: t("tourYesChange"), no: t("tourKeep") }, go);
}

/* ---- views ---- */

function _tnStepper(T, g, side, sc) {
  var team = side === "a" ? g.a : g.b;
  return '<div class="tn-ed"><div class="tn-names">' + team.map(function (i) { return _tnWho(T, i, 22); }).join("") + '</div>' +
    '<div class="tn-stp"><button type="button" data-act="adj" data-t="' + side + '" data-d="-1" aria-label="' + escapeHtml(t("tourMinus")) + '">' + icon("minus", 16) + '</button><b>' + sc + '</b>' +
    '<button type="button" data-act="adj" data-t="' + side + '" data-d="1" aria-label="' + escapeHtml(t("tourPlus")) + '">' + icon("plus", 16) + '</button></div></div>';
}
function _tnEditor(T, g) {
  return '<div class="tn-editor">' + _tnStepper(T, g, "a", _tnEdit.sa) + _tnStepper(T, g, "b", _tnEdit.sb) +
    (_tnEdit.err ? '<div class="tn-err" role="alert">' + escapeHtml(_tnEdit.err) + '</div>' : '') +
    '<div class="tn-btns"><button type="button" class="tn-b pri" data-act="save">' + escapeHtml(t("tourSave")) + '</button><button type="button" class="tn-b" data-act="cancel">' + escapeHtml(t("cancel")) + '</button></div></div>';
}
function _tnGame(T, g, idx, cur, label, org) {
  var d = tourDone(g), aw = d && g.sa > g.sb, bw = d && g.sb > g.sa, gi = tourAll(T).indexOf(g);
  var editing = _tnEdit && _tnEdit.gi === gi;
  var h = '<div class="tn-game' + (cur ? ' cur' : '') + '"><div class="tn-gh"><span>' + escapeHtml(label || _tnFill(t("tourGame"), { k: idx })) + '</span><span>' + (d ? escapeHtml(t("tourFinalScore")) : (cur ? escapeHtml(t("tourUpNext")) : '')) + '</span></div>';
  [[g.a, g.sa, aw], [g.b, g.sb, bw]].forEach(function (x) {
    h += '<div class="tn-tm ' + (d ? (x[2] ? 'win' : 'lose') : '') + '"><div class="tn-names">' + x[0].map(function (i) { return _tnWho(T, i, 22); }).join("") + '</div><span class="tn-pts">' + (d ? x[1] : '–') + '</span></div>';
  });
  if (g.ph === "rot") {
    var rest = []; for (var i = 0; i < T.n; i++) if (g.a.indexOf(i) < 0 && g.b.indexOf(i) < 0) rest.push(getUserName(T.ids[i]));
    h += '<div class="tn-rest">' + escapeHtml(t("tourResting")) + ' ' + rest.join(", ") + '</div>';
  }
  if (org) {
    if (editing) h += _tnEditor(T, g);
    else if (d) h += '<button type="button" class="tn-b sm" data-act="edit" data-i="' + gi + '">' + escapeHtml(t("tourCorrect")) + '</button>';
    else if (cur) h += '<button type="button" class="tn-b pri sm" data-act="edit" data-i="' + gi + '">' + escapeHtml(t("tourEnterScore")) + '</button>';
  }
  return h + '</div>';
}

function _tnMeetCard(T) {
  var m = tourMeet(T), n = T.n, rows = "", i, j;
  function k(a, b) { return a < b ? a + "-" + b : b + "-" + a; }
  var head = '<tr><th></th>';
  for (j = 0; j < n; j++) head += '<th class="c">' + avatarHtml(T.ids[j], 22) + '</th>';
  head += '</tr>';
  for (i = 0; i < n; i++) {
    rows += '<tr><td>' + avatarHtml(T.ids[i], 22) + '</td>';
    for (j = 0; j < n; j++) {
      if (i === j) { rows += '<td class="c dim">·</td>'; continue; }
      var q = k(i, j), p = m.pc[q] || 0, o = m.oc[q] || 0;
      rows += '<td class="c">' + (p ? '<b class="tn-p">P' + (p > 1 ? p : '') + '</b>' : '') + (p && o ? ' ' : '') + (o ? '<span class="dim">v' + (o > 1 ? o : '') + '</span>' : '') + (!p && !o ? '<span class="tn-no">–</span>' : '') + '</td>';
    }
    rows += '</tr>';
  }
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourMeetTitle")) + '</h3><p>' + escapeHtml(_tnFill(t("tourMeetHint"), { a: m.cover, b: m.total, c: m.partners })) + '</p><div class="tn-scroll"><table class="tn-tab">' + head + rows + '</table></div></div>';
}
function _tnRestCard(T) {
  var G = T.games.length, r = tourRuns(T.games, T.n), rows = '<div class="tn-rr" style="--g:' + G + '"><span></span>';
  for (var k = 0; k < G; k++) rows += '<span class="h">G' + (k + 1) + '</span>';
  rows += '<span></span></div>';
  for (var p = 0; p < T.n; p++) {
    var pl = 0, cells = "";
    T.games.forEach(function (g) { var on = g.a.indexOf(p) >= 0 || g.b.indexOf(p) >= 0; if (on) pl++; cells += '<i class="tn-rc' + (on ? ' on' : '') + '"></i>'; });
    rows += '<div class="tn-rr" style="--g:' + G + '"><span class="tn-who">' + avatarHtml(T.ids[p], 22) + '<span class="tn-nm">' + getUserName(T.ids[p]) + '</span></span>' + cells + '<span class="e">' + escapeHtml(_tnFill(t("tourPlayRest"), { p: pl, r: G - pl })) + '</span></div>';
  }
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourRestTitle")) + '</h3><p>' + escapeHtml(_tnFill(t("tourRestHint"), { p: G * 4 / T.n, r: G - G * 4 / T.n, mr: r.rest, mp: r.play })) + '</p><div class="tn-rt">' + rows + '</div></div>';
}
function _tnStandCard(T, ph) {
  var r = tourStats(T), body = '';
  r.forEach(function (s, i) {
    var d = s.pf - s.pa;
    body += '<tr class="' + ((ph >= 1 && (i < 2 || i >= r.length - 2)) ? 'top' : '') + '"><td class="dim">' + (i + 1) + '</td><td>' + _tnWho(T, s.id, 22) + '</td><td>' + s.p + '</td><td>' + s.w + '</td><td>' + s.l + '</td><td>' + (d > 0 ? '+' : '') + d + '</td></tr>';
  });
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourStandTitle")) + '</h3><div class="tn-scroll"><table class="tn-tab"><tr><th>#</th><th class="l">' + escapeHtml(t("tourPlayer")) + '</th><th>' + escapeHtml(t("tourColP")) + '</th><th>' + escapeHtml(t("tourColW")) + '</th><th>' + escapeHtml(t("tourColL")) + '</th><th>+/−</th></tr>' + body + '</table></div><p class="tn-note">' + escapeHtml(t("tourStandHint")) + '</p></div>';
}
function _tnPairCard(T, P) {
  var h = '<div class="tn-sec"><h3>' + escapeHtml(t("tourPairsTitle")) + '</h3><p>' + escapeHtml(t(T.n === 8 ? "tourPairsHint8" : "tourPairsHint6")) + '</p><div class="tn-pairs">';
  P.forEach(function (p) {
    h += '<div class="tn-pair"><span class="tn-tag">' + escapeHtml(_tnFill(t("tourPairN"), { n: p.seed })) + '</span><div class="tn-chips">' + _tnWho(T, p.m[0], 22) + _tnWho(T, p.m[1], 22) + '</div><span class="tn-rk">' + escapeHtml(_tnFill(t("tourPairRk"), { a: p.ranks[0], b: p.ranks[1], d: (p.diff > 0 ? '+' : '') + p.diff })) + '</span></div>';
  });
  return h + '</div></div>';
}

function _tnPbRow(T, g, side, score, win, lose, extra) {
  var team = side === "a" ? g.a : g.b;
  return '<div class="tn-pr' + (win ? ' w' : '') + (lose ? ' l' : '') + '"><div class="tn-pn">' + team.map(function (i) { return _tnWho(T, i, 22); }).join("") + '</div><span class="tn-ps">' + extra + (score === null ? '–' : score) + '</span></div>';
}
function _tnSemiBox(T, g, cur) {
  var d = tourDone(g);
  return '<div class="tn-pb' + (cur ? ' cur' : '') + '"><div class="tn-pbt"><span>' + escapeHtml(_tnLab(g)) + '</span><span>' + (d ? escapeHtml(t("tourFinalScore")) : (cur ? escapeHtml(t("tourUpNext")) : '')) + '</span></div>' +
    _tnPbRow(T, g, "a", d ? g.sa : null, d && g.sa > g.sb, d && g.sa < g.sb, '') + _tnPbRow(T, g, "b", d ? g.sb : null, d && g.sb > g.sa, d && g.sb < g.sa, '') + '</div>';
}
function _tnFinalBox(T, cur) {
  var f = tourFinals(T);
  if (!f.length) return '<div class="tn-pb fin"><div class="tn-pbt"><span>' + escapeHtml(t("tourFinalBo3")) + '</span></div><div class="tn-pn tbd">' + escapeHtml(t("tourFinalTbd")) + '</div></div>';
  var w = tourFinalWins(T), dec = w.wa === 2 || w.wb === 2, k = f[0];
  function pips(n) { return '<span class="tn-pip' + (n >= 1 ? ' on' : '') + '"></span><span class="tn-pip' + (n >= 2 ? ' on' : '') + '"></span>'; }
  function row(team, wins, win) {
    return '<div class="tn-pr' + (win ? ' w' : (dec ? ' l' : '')) + '"><div class="tn-pn">' + team.map(function (i) { return _tnWho(T, i, 22); }).join("") + '</div><span class="tn-ps">' + (win ? TN_CROWN : '') + pips(wins) + '</span></div>';
  }
  return '<div class="tn-pb fin' + (cur ? ' cur' : '') + '"><div class="tn-pbt"><span>' + escapeHtml(t("tourFinalBo3")) + '</span><span>' + (dec ? escapeHtml(t("tourChampion")) : '') + '</span></div>' +
    row(k.a, w.wa, w.wa === 2) + row(k.b, w.wb, w.wb === 2) +
    '<div class="tn-pbn">' + f.map(function (g, i) { return 'G' + (i + 1) + ' ' + (tourDone(g) ? g.sa + '–' + g.sb : '–'); }).join(' · ') + ' · ' + escapeHtml(t("tourFirstTo2")) + '</div></div>';
}
function _tnBracket(T, ng) {
  if (T.n !== 8 || !T.drawn || T.po.length < 2) return "";
  var third = T.po[2], semisDone = tourDone(T.po[0]) && tourDone(T.po[1]);
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourBracketTitle")) + '</h3><div class="tn-bk"><div class="tn-bks">' + _tnSemiBox(T, T.po[0], T.po[0] === ng) + _tnSemiBox(T, T.po[1], T.po[1] === ng) +
    '</div><div class="tn-bkc' + (semisDone ? ' on' : '') + '"></div><div>' + _tnFinalBox(T, tourFinals(T).some(function (g) { return g === ng; })) + '</div></div>' +
    '<div class="tn-third"><div class="tn-bt">' + escapeHtml(t("tourThirdTitle")) + '</div>' + (third ? _tnSemiBox(T, third, third === ng) : '<div class="tn-pb tbd">' + escapeHtml(t("tourThirdTbd")) + '</div>') + '</div></div>';
}

function _tnDrawCard(T) {
  var a = _tnAnim, s = _tnSession(_tnSid), h = '<div class="tn-sec"><h3>' + escapeHtml(a.kind === "teams" ? t("tourDrawingTeams") : (T && T.n === 8 ? t("tourDrawingSemi") : t("tourDrawingPairs"))) + '</h3><div class="tn-draw">';
  if (a.kind === "teams") {
    tourShuffle(s ? s.players : [], Math.random).forEach(function (u) { h += '<div class="tn-slot">' + avatarHtml(u, 28) + '<span>' + getUserName(u) + '</span></div>'; });
  } else if (T) {
    var P = tourPairs(T);
    if (T.n === 6) tourShuffle([0, 1, 2]).forEach(function (i, k) { h += '<div class="tn-slot"><small>' + escapeHtml(_tnFill(t("tourPairN"), { n: k + 1 })) + '</small>' + _tnPairName(T, P[i].m) + '</div>'; });
    else { var o = tourShuffle([0, 1, 2, 3]); [[0, 1], [2, 3]].forEach(function (x, k) { h += '<div class="tn-slot"><small>' + escapeHtml(_tnFill(t("tourSemi"), { n: k + 1 })) + '</small>' + _tnPairName(T, P[o[x[0]]].m) + '<small>v</small>' + _tnPairName(T, P[o[x[1]]].m) + '</div>'; }); }
  }
  return h + '</div></div>';
}

function _tnWinner(T) {
  var order = tourOrder(T);
  if (!order) return "";
  var P = tourPairs(T);
  function pl(k, cls, lab) { var p = P[order[k]]; return '<div class="tn-pl ' + cls + '"><span class="tn-medal">' + escapeHtml(lab) + '</span><div class="tn-pnm">' + p.m.map(function (i) { return avatarHtml(T.ids[i], 36) + '<span>' + getUserName(T.ids[i]) + '</span>'; }).join('') + '</div></div>'; }
  return '<div class="tn-sec" id="tnWinner"><h3>' + escapeHtml(t("tourWinnerTitle")) + '</h3><div class="tn-pod">' + pl(1, 'p2', t("tourPlace2")) + pl(0, 'p1', t("tourPlace1")) + pl(2, 'p3', t("tourPlace3")) + '</div></div>';
}

function tourRender() {
  var body = document.getElementById("tnBody");
  if (!body) return;
  var s = _tnSession(_tnSid);
  if (!s) { tourClose(); return; }
  var T = s.tournament, org = tourCanRun(s), st = tourStage(s);
  var sub = document.getElementById("tnSub");
  if (sub) sub.textContent = fmtDate(s.date) + (s.courtName ? " · " + s.courtName : "");
  var h = "";
  if (st) h += '<button type="button" class="tn-btn big" data-act="stage"' + (st.disabled ? ' disabled' : '') + '>' + (st.icon || "") + '<span>' + escapeHtml(st.label) + '</span></button>';
  if (_tnToast) h += '<div class="tn-toast" role="status">' + escapeHtml(_tnToast) + '</div>';
  if (!T) {
    if (_tnAnim) h += _tnDrawCard(null);
    else h += '<div class="tn-sec"><h3>' + escapeHtml(t("tourHowTitle")) + '</h3><p>' + escapeHtml(t("tourHow1")) + '</p><p>' + escapeHtml(t("tourHow2")) + '</p><p>' + escapeHtml(t("tourHow3")) + '</p></div>';
    body.innerHTML = h; return;
  }
  var ph = tourPhase(T), ng = tourNext(T), played = tourAll(T).filter(tourDone).length;
  h += '<div class="tn-steps">' + ["tourStepRot", "tourStepPairs", "tourStepPlayoff", "tourStepWinner"].map(function (k, i) { return '<div class="tn-st ' + (i === ph ? 'on' : (i < ph ? 'done' : '')) + '">' + escapeHtml(t(k)) + '</div>'; }).join('') + '</div>';
  h += '<div class="tn-prog"><span>' + escapeHtml(ph === 3 ? _tnFill(t("tourLineDone"), { k: played }) : _tnFill(t("tourProgress"), { k: played + 1, m: T.n === 8 ? "11–12" : "12" })) + '</span><span>' + escapeHtml(_tnFill(t("tourPlayed"), { k: played })) + '</span></div>';
  h += '<div class="tn-bar"><i style="width:' + (ph === 3 ? 100 : Math.round(played / 12 * 100)) + '%"></i></div>';
  h += '<p class="tn-note">' + escapeHtml(t(T.n === 8 ? "tourRule8" : "tourRule6")) + '</p>';
  if (_tnAnim) h += _tnDrawCard(T);
  h += _tnBracket(T, ng);
  h += '<div class="tn-sec"><h3>' + escapeHtml(_tnFill(t("tourRotTitle"), { a: 1, b: T.games.length })) + '</h3><div class="tn-games">' + T.games.map(function (g, i) { return _tnGame(T, g, i + 1, g === ng, null, org); }).join('') + '</div></div>';
  h += _tnMeetCard(T) + _tnRestCard(T) + _tnStandCard(T, ph);
  if (ph >= 1) {
    var P = tourPairs(T);
    h += _tnPairCard(T, P);
    if (!T.drawn) h += '<div class="tn-sec"><h3>' + escapeHtml(t("tourPlayoffTitle")) + '</h3><p>' + escapeHtml(_tnFill(t("tourDrawHint"), { w: T.n === 8 ? t("tourBtnSemi") : t("tourBtnPairs") })) + '</p></div>';
    else {
      h += '<div class="tn-sec"><h3>' + escapeHtml(_tnFill(t("tourPlayoffGames"), { a: T.games.length + 1 })) + '</h3>';
      if (T.n === 8) h += '<div class="tn-how">' + escapeHtml(t("tourHow8")) + '</div>';
      else {
        var pt = tourPairTable(T);
        h += '<div class="tn-how">' + escapeHtml(t("tourHowRR")) + '</div><div class="tn-scroll"><table class="tn-tab"><tr><th>#</th><th class="l">' + escapeHtml(t("tourColPair")) + '</th><th>' + escapeHtml(t("tourColW")) + '</th><th>' + escapeHtml(t("tourColL")) + '</th><th>+/−</th></tr>' +
          pt.map(function (x, k) { return '<tr class="' + (k === 0 && x.w + x.l > 0 ? 'top' : '') + '"><td class="dim">' + (k + 1) + '</td><td>' + _tnPairName(T, P[x.i].m) + '</td><td>' + x.w + '</td><td>' + x.l + '</td><td>' + (x.d > 0 ? '+' : '') + x.d + '</td></tr>'; }).join('') + '</table></div>';
      }
      h += '<div class="tn-games">' + T.po.map(function (g, i) { return _tnGame(T, g, T.games.length + i + 1, g === ng, _tnLab(g) + ' · ' + _tnFill(t("tourGame"), { k: T.games.length + i + 1 }), org); }).join('') + '</div>';
      if (T.n === 8 && T.po.length === 2) h += '<p class="tn-note">' + escapeHtml(t("tourAfterSemis")) + '</p>';
      h += '</div>';
    }
  }
  h += _tnWinner(T);
  if (org) h += '<button type="button" class="tn-b dng" data-act="reset">' + escapeHtml(t("tourReset")) + '</button>';
  body.innerHTML = h;
}
