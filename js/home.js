/* ============================================================
   home.js — the Home page: what matters to me right now
   Order: my stat cards (swipe) · shortcuts · create · next game.
   Everything here is read from data the app already has; it only
   points to existing pages (stats, dashboard, payments, public, polls).
   Depends on: stats.js (computeStats, ratingOf, badgesFor, _myGames),
               dashboard.js (_sumSessions, _sessionDate), payments.js
               (myPaymentSummary), polls.js (lastPolls, pollVotingOpen),
               sessions.js (lastSessions), i18n.js, icons.js
   ============================================================ */

function loadHome() {
  setBreadcrumb(null);
  if (typeof loadSessions === "function") loadSessions();
  if (typeof loadPolls === "function") loadPolls();
  if (typeof GROUPS_ON !== "undefined" && GROUPS_ON && typeof loadMatches === "function") loadMatches();
  renderHome();
}

function _hsCard(cls, iconName, title, onclick, inner) {
  return '<button type="button" class="hs-card ' + cls + '" onclick="' + onclick + '">' +
    '<div class="hs-title">' + icon(iconName, 16) + ' ' + title + '</div>' + inner + '</button>';
}

/** Play: games this month, my last results as dots, rating and win rate */
function _homePlayCard(me) {
  var st = computeStats(), p = st.players[me];
  var games = formStrip(me, 5);
  var dots = games.map(function (g) {
    return '<span class="hs-dot' + (g.won ? ' w' : ' l') + '">' + (g.won ? t("winShort") : t("lossShort")) + '</span>';
  }).join("") || '<span class="hs-muted">' + t("gamesEmpty") + '</span>';
  var sm = statsFor(me, "month");                 // this card is "this month": games and win rate both
  var played = sm.played;
  var wr = sm.winRate;
  var delta = p && p.monthStart != null ? Math.round(p.rating - p.monthStart) : 0;
  return _hsCard("hs-play", "court", t("homePlay"), "showPage('stats')",
    '<div class="hs-big">' + played + ' <small>' + t("homeGamesMonth") + '</small></div>' +
    '<div class="hs-dots">' + dots + '</div>' +
    '<div class="hs-row"><span>' + icon("chart", 18) + ' ' + ratingOf(me) + (delta ? ' ' + (delta > 0 ? '+' : '') + delta : '') + '</span>' +
    (wr != null ? '<span>' + icon("medal", 18) + ' ' + wr + '% ' + t("homeWinRate") + '</span>' : '') + '</div>');
}

/** Spending: this year's total, a small bar per month, my share */
function _homeSpendCard() {
  var now = new Date(), y = now.getFullYear(), byMonth = [];
  for (var m = 0; m <= now.getMonth(); m++) byMonth.push([]);
  lastSessions.forEach(function (s) {
    var d = typeof _sessionDate === "function" ? _sessionDate(s) : null;
    if (d && !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() <= now.getMonth()) byMonth[d.getMonth()].push(s);
  });
  var sums = byMonth.map(function (list) { return _sumSessions(list); });
  var total = 0, mine = 0, max = 0;
  sums.forEach(function (s) { total += s.grand; mine += s.mine; max = Math.max(max, s.grand); });
  var shown = sums.slice(-4), firstIdx = sums.length - shown.length;
  var bars = shown.map(function (s, i) {
    var h = max ? Math.max(4, Math.round(s.grand / max * 100)) : 4;
    return '<div class="hs-bar"><div class="hs-bar-plot"><i style="height:' + h + '%"></i></div><span>' + monthShort(firstIdx + i) + '</span></div>';
  }).join("");
  return _hsCard("hs-spend", "bill", t("homeSpending"), "dashTab='spending';showPage('dashboard')",
    '<div class="hs-big">' + fmtShort(total) + ' <small>' + y + '</small></div>' +
    '<div class="hs-muted">' + t("homeShare") + ' ' + fmtShort(mine) + '</div><div class="hs-bars">' + bars + '</div>');
}

/** Payments: what I owe and what others owe me */
function _homePayCard() {
  var sum = typeof myPaymentSummary === "function" ? myPaymentSummary() : { oweTotal: 0, owedTotal: 0 };
  var inner = sum.oweTotal
    ? '<div class="hs-big">' + fmtShort(sum.oweTotal) + ' <small>' + t("homeYouOwe") + '</small></div>'
    : '<div class="hs-big">' + icon("check", 26) + ' <small>' + t("homeAllPaid") + '</small></div>';
  inner += '<div class="hs-row"><span>' + icon("users", 18) + ' ' + t("homeOwedToYou") + ' ' + fmtShort(sum.owedTotal) + '</span></div>';
  return _hsCard("hs-pay", "wallet", t("homePayments"), "showMyPayments()", inner);
}

/** Badges: how many I have, and which */
function _homeBadgeCard(me) {
  var list = badgesFor(me), got = list.filter(function (b) { return b.earned; }).length;
  var icons = list.slice(0, 5).map(function (b) {
    return '<span class="hs-badge' + (b.earned ? ' on' : '') + '">' + icon(b.icon, 22) + '</span>';
  }).join("");
  var pct = list.length ? Math.round(got / list.length * 100) : 0;
  return _hsCard("hs-badges", "medal", t("homeBadges"), "showPage('profile')",
    '<div class="hs-big">' + got + ' <small>' + t("homeEarned").replace("{m}", list.length) + '</small></div>' +
    '<div class="hs-badge-row">' + icons + '</div><div class="hs-track"><i style="width:' + pct + '%"></i></div>');
}

/** Rating: my number and how it moved */
function _homeRatingCard(me) {
  var p = computeStats().players[me];
  var vals = p && p.history ? p.history.slice(-12).map(function (h) { return h.r; }) : [];
  var chart = "";
  if (vals.length > 1) {
    // Area under the line, a dot per game, the last one ringed, and a dashed line at the starting rating
    var w = 220, h = 64, lo = Math.min.apply(null, vals.concat([RATING_START])) - 6, hi = Math.max.apply(null, vals.concat([RATING_START])) + 6;
    var X = function (i) { return (i * w / (vals.length - 1)); }, Y = function (v) { return h - (v - lo) / (hi - lo) * h; };
    var pts = vals.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
    var last = vals.length - 1;
    chart = '<svg class="hs-spark" viewBox="-6 -6 ' + (w + 12) + ' ' + (h + 12) + '" aria-hidden="true">' +
      '<line class="base" x1="0" x2="' + w + '" y1="' + Y(RATING_START).toFixed(1) + '" y2="' + Y(RATING_START).toFixed(1) + '"/>' +
      '<polygon class="area" points="0,' + h + ' ' + pts.join(" ") + ' ' + w + ',' + h + '"/>' +
      '<polyline points="' + pts.join(" ") + '"/>' +
      vals.map(function (v, i) { return i === last ? '' : '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.4"/>'; }).join("") +
      '<circle class="ring" cx="' + X(last).toFixed(1) + '" cy="' + Y(vals[last]).toFixed(1) + '" r="6"/><circle class="now" cx="' + X(last).toFixed(1) + '" cy="' + Y(vals[last]).toFixed(1) + '" r="3.4"/></svg>';
  }
  var delta = p && p.monthStart != null ? Math.round(p.rating - p.monthStart) : 0;
  var best = p && p.history && p.history.length ? Math.max.apply(null, p.history.map(function (h) { return h.r; })) : ratingOf(me);   // real peak, not only the last 12
  return _hsCard("hs-rating", "ranking", t("homeRating"), "progressUser=currentUser.uid;statsTab='progress';showPage('stats')",
    '<div class="hs-big">' + ratingOf(me) + (delta ? ' <small>' + (delta > 0 ? '\u25B2 +' : '\u25BC ') + delta + '</small>' : '') + '</div>' + chart +
    '<div class="hs-pills"><span>' + icon("crown", 14) + ' ' + t("homeBest") + ' ' + Math.round(best) + '</span><span>' + icon("court", 14) + ' ' + statsFor(me, "all").played + ' ' + t("gamesWord") + '</span>' +
    '</div>');
}

/** Seasonal: inside a special theme's date window, offer it once (until tried or hidden) */
function _hwCard() {
  var d = new Date(), md = ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  var sp = SPECIALS.filter(function (x) {
    if (!x[6]) return false;
    var a = x[6][0], b = x[6][1];
    return a <= b ? (md >= a && md <= b) : (md >= a || md <= b);
  })[0];
  if (!sp) return "";
  var hidden = false; try { hidden = localStorage.getItem("spHidden_" + sp[0]) === "1"; } catch (e) {}
  if (hidden || (currentSpecial === sp[0] && currentTheme === "dark")) return "";
  var mark = { halloween: "\uD83C\uDF83", christmas: "\uD83C\uDF84", cny: "\uD83C\uDFEE", ninja: "\uD83E\uDD77", orbs: "\uD83D\uDD2E", pirate: "\uD83C\uDFF4\u200D\u2620\uFE0F", reaper: "\uD83E\uDD8B" }[sp[0]] || "\u2728";
  var hide = "try{localStorage.setItem('spHidden_" + sp[0] + "','1')}catch(e){};";
  return '<div class="hw-card"><span class="hw-pk" aria-hidden="true">' + mark + '</span><span><b>' + t(sp[1] + "Title") + '</b><small>' + t(sp[1] + "Sub") + '</small></span>' +
    '<button type="button" class="hw-go" onclick="' + hide + 'setSpecial(\'' + sp[0] + '\');renderHome()">' + t("hwGo") + '</button>' +
    '<button type="button" class="hw-x" aria-label="' + t("cancel") + '" onclick="' + hide + 'renderHome()">×</button></div>';
}

/** First-open helper: shown until the first game exists, or until hidden */
function _homeStartCard() {
  var hidden = false; try { hidden = localStorage.getItem("onbHidden") === "1"; } catch (e) {}
  var played = typeof lastMatches !== "undefined" && lastMatches && lastMatches.length;
  if (hidden || played) return "";
  var row = function (n, label, click) { return '<button type="button" class="onb-row" onclick="' + click + '"><i>' + n + '</i><span>' + label + '</span>' + icon("chevron", 16) + '</button>'; };
  return '<div class="onb-card"><div class="onb-title">' + t("onbTitle") + '</div>' +
    row(1, t("onbS1"), "publicTab='games';showPage('public')") +
    row(2, t("onbS2"), "publicTab='buddies';showPage('public')") +
    row(3, t("onbS3"), "showPage('groups')") +
    '<button type="button" class="onb-hide" onclick="try{localStorage.setItem(\'onbHidden\',\'1\')}catch(e){};renderHome()">' + t("onbHide") + '</button></div>';
}

/** Add a score to my most recent running session */
function homeAddScore() {
  var today = _todayIso(), best = null;
  lastSessions.forEach(function (s) {
    if (s.status === "cancelled" || (s.date || "") > today) return;
    if (!best || (s.date || "") > (best.date || "")) best = s;
  });
  if (!best) { showToast(t("homeNoSession")); return; }
  showSessionDetail(best.id, "games");
}

/** When a session starts / ends (ms). No time set: the whole day counts as "upcoming". Bangkok time, like the poll deadlines. */
function _sesWindow(s) {
  if (!s.date) return null;
  var d = s.date.split("-").map(Number), tm = (s.time || "").split(":").map(Number), has = !!s.time;
  var start = Date.UTC(d[0], d[1] - 1, d[2], has ? tm[0] || 0 : 0, has ? tm[1] || 0 : 0) - BKK_MS;
  return { start: start, end: has ? start + (s.duration || 2) * 3600e3 : start + 24 * 3600e3, timed: has };
}
/** "live" while the slot runs (or a score is being counted), "soon" before it, "over" after it */
function _sesPhase(s) {
  if (s.status === "cancelled" || s.status === "completed") return "over";
  var w = _sesWindow(s), now = Date.now();
  if (!w) return "over";
  if (_liveBoardFor(s.id)) return "live";
  if (!w.timed) return now < w.end ? "soon" : "over";
  return now < w.start ? "soon" : now < w.end ? "live" : "over";
}
/** The score being counted for this session: mine on this phone, or someone else's in the group */
function _liveBoardFor(sid) {
  var mine = typeof lsInProgress === "function" ? lsInProgress() : null;
  if (mine && mine.sid === sid) return { mine: true, sa: mine.sa, sb: mine.sb, a: mine.a || [], b: mine.b || [], sid: sid };
  var g = (typeof liveNow !== "undefined" ? liveNow : []).filter(function (x) { return x.sid === sid && !x.test && !(typeof _liveEnded === "function" && _liveEnded(x)); })[0];
  return g ? { mine: false, id: g.id, sa: g.sa, sb: g.sb, a: g.a || [], b: g.b || [], sid: sid } : null;
}
function _elapsedText(ms) {
  var m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? m + " " + t("minShort") : Math.floor(m / 60) + t("hShort") + " " + String(m % 60).padStart(2, "0");
}

/** Soonest game I can still act on: a game being played now, an open vote or a session coming up. A finished session is not "next". */
function _homeNextGame() {
  var today = _todayIso(), list = [];
  lastPolls.forEach(function (p) {
    var np = normalizePoll(p);
    if (!np.date || np.date < today || !pollVotingOpen(p)) return;
    list.push({ kind: "poll", id: p.id, date: np.date, time: np.time || "", court: np.courtName || "", np: np });
  });
  lastSessions.forEach(function (s) {
    if (!s.date) return;
    var ph = _sesPhase(s);
    if (ph === "over") return;
    list.push({ kind: "session", id: s.id, date: s.date, time: s.time || "", court: s.courtName || "", s: s, phase: ph, win: _sesWindow(s) });
  });
  list.sort(function (a, b) {
    var la = a.phase === "live" ? 0 : 1, lb = b.phase === "live" ? 0 : 1;
    return la - lb || (a.date + a.time).localeCompare(b.date + b.time);
  });
  return list[0] || null;
}
var _homeNextKey = "";

function _homeNextCard() {
  var g = _homeNextGame();
  _homeNextKey = g ? g.kind + g.id + (g.phase || "") : "";
  if (!g) {
    return '<div class="home-next empty"><div class="hs-title">' + icon("sessions", 16) + ' ' + t("homeNextGame") + '</div>' +
      '<div class="hs-muted" style="margin:6px 0 12px">' + t("homeNoNext") + '</div>' +
      '<button class="btn-next" onclick="showCreatePoll()">' + icon("vote", 18) + ' ' + t("homeVote") + '</button></div>';
  }
  var d = new Date(g.date + "T00:00:00"), live = g.phase === "live";
  var tag = live
    ? '<span class="home-live-tag"><i class="live-dot"></i>' + t("momLive") + (g.win && g.win.timed ? ' \u00B7 <span id="homeElapsed" data-start="' + g.win.start + '">' + _elapsedText(Date.now() - g.win.start) + '</span>' : '') + '</span>'
    : '<span class="home-next-tag">' + icon(g.kind === "poll" ? "vote" : "court", 14) + ' ' + (g.kind === "poll" ? t("homeVote") : t("homeGame")) + '</span>';
  var inner = '<div class="home-next-top"><div class="hs-title">' + icon("sessions", 16) + ' ' + t(live ? "momPlayingNow" : "homeNextGame") + '</div>' + tag + '</div>' +
    '<div class="home-next-body"><div class="home-next-date"><span>' + weekdayShort(d.getDay()) + '</span><b>' + d.getDate() + '</b></div>' +
    '<div class="home-next-info"><div>' + icon("clock", 18) + ' ' + escapeHtml(g.time || "–") + '</div><div>' + icon("pin", 18) + ' ' + escapeHtml(g.court || "–") + '</div></div></div>';
  if (g.kind === "poll") {
    var inN = _pollAnswerUids(g.np, 0).length, all = Object.keys(g.np.responses).length;
    var inUids = _pollAnswerUids(g.np, 0), maybe = 0, out = all - inN;
    inner += '<div class="home-next-vote">' + voteBarHtml(inN, maybe, out, 0) + '</div>' +
      '<div class="home-next-people">' + peopleHtml(inUids, 24, 6) + '</div>' +
      '<button class="btn-next" onclick="showPage(\'polls\')">' + t("homeVoteNow") + '</button>';
  } else if (live) {
    var pl = g.s.players || [], bd = _liveBoardFor(g.id);
    if (bd) inner += '<div class="home-next-score"><b>' + bd.sa + '</b><span>\u2013</span><b>' + bd.sb + '</b></div>' +
      '<div class="home-next-teams">' + (bd.a || []).map(getUserName).join(" & ") + '  <i>vs</i>  ' + (bd.b || []).map(getUserName).join(" & ") + '</div>';
    else inner += '<div class="home-next-people">' + iconStatHtml("users", pl.length) + peopleHtml(pl, 24, 6) + '</div>';
    inner += '<div class="home-next-btns">' +
      (bd ? '<button class="btn-next" onclick="' + (bd.mine ? "showLiveScore(\'" + g.id + "\')" : "lsWatch(\'" + bd.id + "\')") + '">' + icon("scoreboard", 16) + ' ' + t(bd.mine ? "lsContinue" : "lsWatch") + '</button>'
          : '<button class="btn-next" onclick="showLiveScore(\'' + jsq(g.id) + '\')">' + icon("scoreboard", 16) + ' ' + t("lsTitle") + '</button>') +
      '<button class="btn-next alt" onclick="showSessionDetail(\'' + jsq(g.id) + '\',\'games\')">' + icon("add", 16) + ' ' + t("homeAddScore") + '</button></div>';
  } else {
    var pl2 = g.s.players || [];
    inner += '<div class="home-next-people">' + iconStatHtml("users", pl2.length) + peopleHtml(pl2, 24, 6) + '</div>' +
      '<button class="btn-next" onclick="showSessionDetail(\'' + jsq(g.id) + '\')">' + t("homeOpen") + '</button>';
  }
  return '<div class="home-next' + (live ? ' live' : '') + '">' + inner + '</div>';
}

/* ---------- Moments: what just happened in the group ---------- */
var _momentsOpen = false, _momSeen = {}, _momInit = false;
function _agoText(ms) {
  var m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return t("momNow");
  if (m < 60) return t("momMin").replace("{n}", m);
  if (m < 1440) return t("momHour").replace("{n}", Math.floor(m / 60));
  return t("momDay").replace("{n}", Math.floor(m / 1440));
}
function _momNames(uids) { return (uids || []).map(getUserName).join(" & "); }

/** The latest events of the last 7 days from data the app already has, newest first */
function _moments() {
  var ev = [], cutoff = Date.now() - 7 * 864e5;
  (typeof lastMatches !== "undefined" ? lastMatches : []).forEach(function (m) {
    var at = m.createdAt;
    if (!at || at < cutoff || !m.teamA || !m.teamB || !matchWinner(m)) return;
    var w = matchWinner(m), win = w === "A" ? m.teamA : m.teamB, lose = w === "A" ? m.teamB : m.teamA;
    var score = (m.games || []).filter(function (g) { return g && (g.a != null || g.b != null); })
      .map(function (g) { return w === "A" ? (g.a || 0) + "\u2013" + (g.b || 0) : (g.b || 0) + "\u2013" + (g.a || 0); }).join(", ");
    ev.push({ id: "m" + m.id, at: at, kind: "game", icon: "scoreboard", text: t("momGame").replace("{w}", _momNames(win)).replace("{l}", _momNames(lose)).replace("{score}", score) });
  });
  lastSessions.forEach(function (s) {
    if (s.billAt && s.billAt >= cutoff && s.calculated) ev.push({ id: "b" + s.id, at: s.billAt, kind: "bill", icon: "bill", text: t("momBill").replace("{court}", escapeHtml(s.courtName || "")) });
    var st = s.settled || {}, sat = s.settledAt || {}, L = null;
    Object.keys(st).forEach(function (k) {
      var ms = sat[k];
      if (!st[k] || !ms || ms < cutoff) return;
      var parts = k.split("__"); L = L || computeLedger(s);
      var tr = L.transfers.filter(function (x) { return x.key === k; })[0];
      ev.push({ id: "p" + s.id + k, at: ms, kind: "pay", icon: "wallet", text: t("momPay").replace("{from}", getUserName(parts[0])).replace("{to}", getUserName(parts[1])).replace("{amount}", tr ? fmtShort(tr.amount) : "") });
    });
  });
  lastPolls.forEach(function (p) {
    var np = normalizePoll(p), date = np.date ? fmtDate(np.date) : "";
    var made = typeof _msOf === "function" ? _msOf(p.createdAt) : 0;
    if (made && made >= cutoff) ev.push({ id: "c" + p.id, at: made, kind: "poll", icon: "vote", text: t("momPoll").replace("{name}", getUserName(p.createdBy)).replace("{date}", date) });
    var log = p.voteLog || {};
    Object.keys(log).forEach(function (u) {
      var x = log[u];
      if (x && x.a === 0 && x.at && x.at >= cutoff) ev.push({ id: "v" + p.id + u + x.at, at: x.at, kind: "join", icon: "check", text: t("momJoin").replace("{name}", getUserName(u)).replace("{date}", date) });
    });
  });
  ev.sort(function (a, b) { return b.at - a.at; });
  return ev.slice(0, 10);
}

function toggleMoments() {
  _momentsOpen = !_momentsOpen;
  if (currentPage === "dashboard" && typeof _renderDashboard === "function") _renderDashboard();
  else renderHome();
}

/** Every 20 s on Home / Dashboard: the clock times and the elapsed minutes keep moving; a game that starts or ends changes the card */
var _homePulse = null;
function _homePulseTick() {
  if (currentPage !== "home" && currentPage !== "dashboard") return;
  if (currentPage === "home") {
    var g = _homeNextGame();
    if ((g ? g.kind + g.id + (g.phase || "") : "") !== _homeNextKey) { renderHome(); return; }
  }
  var el = document.getElementById("homeElapsed");
  if (el) el.textContent = _elapsedText(Date.now() - parseInt(el.getAttribute("data-start"), 10));
  document.querySelectorAll(".mom-ago[data-ago]").forEach(function (x) { x.textContent = _agoText(parseInt(x.getAttribute("data-ago"), 10)); });
}
function _homePulseStart() { if (!_homePulse) _homePulse = setInterval(_homePulseTick, 20000); }

/** Home and the Dashboard are the two pages that follow the chosen icon style (js/icons.js) */
function renderHome() {
  _iconCtx = true;
  try { _renderHomeInner(); } finally { _iconCtx = false; }
}

function _renderHomeInner() {
  var el = document.getElementById("homeContent");
  if (!el || !currentUser) return;
  var me = currentUser.uid, groups = typeof GROUPS_ON !== "undefined" && GROUPS_ON;
  var html = '';

  // A live score still being counted on this phone
  var running = typeof lsInProgress === "function" ? lsInProgress() : null;
  if (running) html += '<div class="home-live-wrap"><button type="button" class="home-live" onclick="showLiveScore(\'' + jsq(running.sid) + '\')">' + icon("scoreboard", 22) +
    '<span><b>' + t("lsResume") + '</b><small>' + running.sa + ' \u2013 ' + running.sb + '</small></span><i>' + t("lsContinue") + '</i></button>' +
    '<button type="button" class="home-live-x" aria-label="' + t("cancel") + '" onclick="lsCancelSaved()">' + icon("close", 16) + '</button></div>';

  if (typeof liveWatchStart === "function") { liveWatchStart(); html += liveNowHtml(); }
  if (typeof payBoxHtml === "function") html += payBoxHtml();
  html += _hwCard();
  if (groups) html += _homeStartCard();
  var nextCard = _homeNextCard(), nextLive = nextCard.indexOf('home-next live') >= 0;
  if (nextLive) html += nextCard;   // a game being played goes to the top

  // 1. My stat cards, swipe sideways
  var cards = [];
  if (groups) cards.push(_homePlayCard(me));
  cards.push(_homeSpendCard(), _homePayCard());
  if (groups) cards.push(_homeRatingCard(me), typeof homeHealthCardHtml === "function" ? homeHealthCardHtml() : "", _homeBadgeCard(me));
  html += '<div class="hs-strip" id="homeStrip" onscroll="_homeStripDots()">' + cards.join("") + '</div>' +
    '<div class="hs-dots-nav" id="homeStripDots">' + cards.map(function (c, i) { return '<i class="' + (i === 0 ? 'on' : '') + '"></i>'; }).join("") + '</div>';

  // Moments: what just happened in the group

  // 2. Shortcuts and create: see-through glass tiles, one short word each (the page background shows through)
  var tile = function (iconName, bx, label, onclick) { return '<button type="button" class="hg-tile" onclick="' + onclick + '">' + icon(iconName, 24, "bx" + bx) + '<span>' + label + '</span></button>'; };
  if (groups) {
    html += '<div class="hg-grid">' +
      tile("court", 1, t("homeShortCourt"), "publicTab='games';showPage('public')") +
      tile("users", 2, t("homeShortFriends"), "publicTab='buddies';showPage('public')") +
      tile("other", 4, t("homeMarket"), "publicTab='market';showPage('public')") + '</div>';
  }
  html += '<div class="hg-head">' + icon("add", 16) + ' <span>' + t("homeCreate") + '</span></div><div class="hg-grid four">' +
    tile("vote", 3, t("homeVote"), "showCreatePoll()") +
    tile("court", 1, t("homeGame"), "createAdHocSession()") +
    tile("manual", 2, t("homeShortScore"), "homeAddScore()") +
    tile("scoreboard", 4, t("homeShortLive"), "showLiveScore()") + '</div>';

  // 4. Next game (on top instead while it is being played)
  if (!nextLive) html += nextCard;
  el.innerHTML = html;
  _homePulseStart();
  _homeSlideStart();
}

/** Highlight the dot of the card that is in view */
/** Which card is showing and how far to scroll to reach the next one (lefts = each card's left edge relative to the strip); loops back to the first */
function _homeNextSlide(lefts, atEnd) {
  if (!lefts || lefts.length < 2) return null;
  var cur = 0; lefts.forEach(function (l, i) { if (Math.abs(l) < Math.abs(lefts[cur])) cur = i; });
  var nxt = atEnd ? 0 : (cur + 1) % lefts.length;   // the strip cannot scroll further than its end: from there it goes back to the first card
  return { from: cur, to: nxt, delta: lefts[nxt] };
}

/** The swipe cards on Home slide on by themselves, 3 seconds on each card. A touch or a scroll by the user pauses it for 8 seconds; it also waits while
    the app is in the background or another page is open, and stays still when the phone asks for reduced motion. */
var _slideTimer = null, _slideHold = 0;
function _homeSlideStart() {
  if (_slideTimer) { clearInterval(_slideTimer); _slideTimer = null; }
  var strip = document.getElementById("homeStrip");
  if (!strip || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var hold = function () { _slideHold = Date.now() + 8000; };
  ["touchstart", "pointerdown", "wheel", "keydown"].forEach(function (ev) { strip.addEventListener(ev, hold, { passive: true }); });
  _slideTimer = setInterval(function () {
    var s = document.getElementById("homeStrip");
    if (!s || currentPage !== "home" || document.hidden || Date.now() < _slideHold) return;
    var box = s.getBoundingClientRect(), lefts = [].map.call(s.children, function (c) { return c.getBoundingClientRect().left - box.left; });
    var step = _homeNextSlide(lefts, s.scrollLeft + s.clientWidth >= s.scrollWidth - 4); if (!step) return;
    if (step.to === 0) s.scrollTo({ left: 0, behavior: "smooth" }); else s.scrollBy({ left: step.delta, behavior: "smooth" });
  }, 3000);
}

function _homeStripDots() {
  var s = document.getElementById("homeStrip"), d = document.getElementById("homeStripDots");
  if (!s || !d || !s.children.length) return;
  var w = s.children[0].offsetWidth + 10, i = Math.round(s.scrollLeft / w);
  for (var k = 0; k < d.children.length; k++) d.children[k].classList.toggle("on", k === i);
}
