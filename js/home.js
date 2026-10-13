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

/** First name to greet (the display name, plain text) */
function _homeName() {
  var u = typeof findUser === "function" && currentUser ? findUser(currentUser.uid) : null;
  return escapeHtml(plainUserName(u || currentUserProfile || {}) || "");
}

function _hsCard(cls, iconName, title, onclick, inner) {
  return '<button type="button" class="hs-card ' + cls + '" onclick="' + onclick + '">' +
    '<div class="hs-title">' + icon(iconName, 16) + ' ' + title + '</div>' + inner + '</button>';
}

/** Play: games this month, my last results as dots, rating and win rate */
function _homePlayCard(me) {
  var st = computeStats(), p = st.players[me];
  var games = typeof _myGames === "function" ? _myGames(me).slice(-8) : [];
  var dots = games.map(function (g) {
    return '<span class="hs-dot' + (g.won ? ' w' : ' l') + '">' + (g.won ? t("winShort") : t("lossShort")) + '</span>';
  }).join("") || '<span class="hs-muted">' + t("gamesEmpty") + '</span>';
  var played = p ? p.monthPlayed : 0;
  var wr = p && p.wins + p.losses ? Math.round(p.wins / (p.wins + p.losses) * 100) : null;
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
  return _hsCard("hs-badges", "medal", t("homeBadges"), "showPage('stats')",
    '<div class="hs-big">' + got + ' <small>' + t("homeEarned").replace("{m}", list.length) + '</small></div>' +
    '<div class="hs-badge-row">' + icons + '</div><div class="hs-track"><i style="width:' + pct + '%"></i></div>');
}

/** Rating: my number and how it moved */
function _homeRatingCard(me) {
  var p = computeStats().players[me];
  var vals = p && p.history ? p.history.slice(-12).map(function (h) { return h.r; }) : [];
  var line = "";
  if (vals.length > 1) {
    var w = 220, h = 60, lo = Math.min.apply(null, vals) - 8, hi = Math.max.apply(null, vals) + 8;
    var pts = vals.map(function (v, i) { return (i * w / (vals.length - 1)).toFixed(1) + "," + (h - (v - lo) / (hi - lo) * h).toFixed(1); }).join(" ");
    line = '<svg class="hs-spark" viewBox="-4 -4 ' + (w + 8) + ' ' + (h + 8) + '" preserveAspectRatio="none"><polyline points="' + pts + '"/></svg>';
  }
  var delta = p && p.monthStart != null ? Math.round(p.rating - p.monthStart) : 0;
  return _hsCard("hs-rating", "ranking", t("homeRating"), "showPage('stats')",
    '<div class="hs-big">' + ratingOf(me) + (delta ? ' <small>' + (delta > 0 ? '+' : '') + delta + '</small>' : '') + '</div>' + line +
    '<div class="hs-row"><span>' + t("homeStartR") + ' ' + RATING_START + '</span><span>' + (p ? p.played : 0) + ' ' + t("gamesWord") + '</span></div>');
}

function _homeShortcut(iconName, label, sub, onclick, cls) {
  return '<button type="button" class="home-sc" onclick="' + onclick + '"><span class="home-sc-ico ' + cls + '">' + icon(iconName, 26) + '</span>' +
    '<b>' + label + '</b><small>' + sub + '</small></button>';
}

function _homeCreateTile(iconName, label, onclick, cls) {
  return '<button type="button" class="home-new" onclick="' + onclick + '"><span class="home-new-ico ' + cls + '">' + icon(iconName, 24) + '</span>' + label + '</button>';
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

/** Soonest game I can still act on: an open vote or a session coming up */
function _homeNextGame() {
  var today = _todayIso(), list = [];
  lastPolls.forEach(function (p) {
    var np = normalizePoll(p);
    if (!np.date || np.date < today || !pollVotingOpen(p)) return;
    list.push({ kind: "poll", id: p.id, date: np.date, time: np.time || "", court: np.courtName || "", np: np });
  });
  lastSessions.forEach(function (s) {
    if (s.status === "cancelled" || !s.date || s.date < today) return;
    list.push({ kind: "session", id: s.id, date: s.date, time: s.time || "", court: s.courtName || "", s: s });
  });
  list.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  return list[0] || null;
}

function _homeNextCard() {
  var g = _homeNextGame();
  if (!g) {
    return '<div class="home-next empty"><div class="hs-title">' + icon("sessions", 16) + ' ' + t("homeNextGame") + '</div>' +
      '<div class="hs-muted" style="margin:6px 0 12px">' + t("homeNoNext") + '</div>' +
      '<button class="btn-next" onclick="showCreatePoll()">' + icon("vote", 18) + ' ' + t("homeVote") + '</button></div>';
  }
  var d = new Date(g.date + "T00:00:00");
  var inner = '<div class="home-next-top"><div class="hs-title">' + icon("sessions", 16) + ' ' + t("homeNextGame") + '</div>' +
    '<span class="home-next-tag">' + icon(g.kind === "poll" ? "vote" : "court", 14) + ' ' + (g.kind === "poll" ? t("homeVote") : t("homeGame")) + '</span></div>' +
    '<div class="home-next-body"><div class="home-next-date"><span>' + weekdayShort(d.getDay()) + '</span><b>' + d.getDate() + '</b></div>' +
    '<div class="home-next-info"><div>' + icon("clock", 18) + ' ' + escapeHtml(g.time || "–") + '</div><div>' + icon("pin", 18) + ' ' + escapeHtml(g.court || "–") + '</div></div></div>';
  if (g.kind === "poll") {
    var inN = _pollAnswerUids(g.np, 0).length, all = Object.keys(g.np.responses).length;
    inner += '<div class="home-next-bar"><i style="width:' + (all ? Math.round(inN / all * 100) : 0) + '%"></i></div>' +
      '<div class="home-next-meta"><span>' + icon("check", 16) + ' ' + inN + '</span><span>' + icon("users", 16) + ' ' + all + '</span></div>' +
      '<button class="btn-next" onclick="showPage(\'polls\')">' + t("homeVoteNow") + '</button>';
  } else {
    var n = (g.s.players || []).length;
    inner += '<div class="home-next-meta"><span>' + icon("users", 16) + ' ' + n + '</span></div>' +
      '<button class="btn-next" onclick="showSessionDetail(\'' + g.id + '\')">' + t("homeOpen") + '</button>';
  }
  return '<div class="home-next">' + inner + '</div>';
}

function renderHome() {
  var el = document.getElementById("homeContent");
  if (!el || !currentUser) return;
  var me = currentUser.uid, groups = typeof GROUPS_ON !== "undefined" && GROUPS_ON;
  var html = '<div class="home-hi">' + t("homeHi").replace("{name}", _homeName()) + '</div>';

  // 1. My stat cards, swipe sideways
  var cards = [];
  if (groups) cards.push(_homePlayCard(me));
  cards.push(_homeSpendCard(), _homePayCard());
  if (groups) cards.push(_homeBadgeCard(me), _homeRatingCard(me));
  html += '<div class="hs-strip" id="homeStrip" onscroll="_homeStripDots()">' + cards.join("") + '</div>' +
    '<div class="hs-dots-nav" id="homeStripDots">' + cards.map(function (c, i) { return '<i class="' + (i === 0 ? 'on' : '') + '"></i>'; }).join("") + '</div>';

  // 2. Shortcuts: find court, find friends, market
  if (groups) {
    html += '<div class="home-scs">' +
      _homeShortcut("court", t("homeFindCourt"), t("homeFindCourtSub"), "publicTab='games';showPage('public')", "c1") +
      _homeShortcut("users", t("homeFindFriends"), t("homeFindFriendsSub"), "publicTab='buddies';showPage('public')", "c2") +
      _homeShortcut("shuttle", t("homeMarket"), t("homeMarketSub"), "publicTab='market';showPage('public')", "c3") + '</div>';
  }

  // 3. Create
  html += '<div class="card home-create"><div class="card-title">' + icon("add", 14) + ' ' + t("homeCreate") + '</div><div class="home-news">' +
    _homeCreateTile("vote", t("homeVote"), "showCreatePoll()", "n1") +
    _homeCreateTile("court", t("homeGame"), "createAdHocSession()", "n2") +
    _homeCreateTile("add", t("homeAddScore"), "homeAddScore()", "n3") +
    _homeCreateTile("wallet", t("homePay"), "showMyPayments()", "n4") + '</div></div>';

  // 4. Next game
  html += _homeNextCard();
  el.innerHTML = html;
}

/** Highlight the dot of the card that is in view */
function _homeStripDots() {
  var s = document.getElementById("homeStrip"), d = document.getElementById("homeStripDots");
  if (!s || !d || !s.children.length) return;
  var w = s.children[0].offsetWidth + 10, i = Math.round(s.scrollLeft / w);
  for (var k = 0; k < d.children.length; k++) d.children[k].classList.toggle("on", k === i);
}
