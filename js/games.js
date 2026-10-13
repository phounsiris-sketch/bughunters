/* ============================================================
   games.js — one list for votes and sessions ("Games")
   A vote that is still open and a session (playing, to pay, done) are
   shown as the same kind of card, with a Plan · Play · Pay · Done bar.
   A confirmed vote is shown as its session (not twice).
   Data is unchanged: polls and sessions stay separate documents.
   Depends on: polls.js (lastPolls, normalizePoll, pollVotingOpen,
               _pollAnswerUids, isPollArchived), sessions.js (lastSessions,
               openTransfers, showSessionDetail), ui.js, i18n.js
   ============================================================ */

var gamesFilter = "upcoming"; // upcoming | past | all

function loadGames() {
  setBreadcrumb(null);
  if (typeof loadSessions === "function") loadSessions();
  if (typeof loadPolls === "function") loadPolls();
  renderGames();
}

function setGamesFilter(f) { gamesFilter = f; renderGames(); }

/** 0 plan (vote) · 1 play · 2 pay · 3 done */
function sessionStep(s) {
  if (s.status === "completed") return 3;
  if (!s.calculated) return 1;
  return openTransfers(s).length ? 2 : 3;
}

/** What I still owe for a session (open transfers I pay) */
function myOweOn(s) {
  var me = currentUser ? currentUser.uid : null;
  return openTransfers(s).filter(function (tr) { return tr.from === me; }).reduce(function (a, tr) { return a + tr.amount; }, 0);
}

/** All game items, newest-first inside each filter */
function gameItems() {
  var today = _todayIso(), items = [];
  lastPolls.forEach(function (p) {
    if (p.status !== "draft" && p.status !== "open") return;   // confirmed → its session; cancelled → hidden
    var np = normalizePoll(p);
    if (!np.date) return;
    var open = pollVotingOpen(p) || np.date >= today;
    if (!open || isPollArchived(p)) return;
    items.push({ kind: "poll", id: p.id, step: 0, date: np.date, time: np.time || "", court: np.courtName || "", np: np, poll: p });
  });
  lastSessions.forEach(function (s) {
    if (s.status === "cancelled" || !s.date) return;
    items.push({ kind: "session", id: s.id, step: sessionStep(s), date: s.date, time: s.time || "", court: s.courtName || "", s: s });
  });
  return items;
}

function _gameUpcoming(it) { return it.step <= 1; }

function _gameCard(it) {
  var me = currentUser.uid, step = it.step;
  var pillKind = ["blue", "teal", "orange", "green"][step];
  var pillText = [t("homeVote"), t("pillPlaying"), t("pillToPay"), t("pillDone")][step];
  var stats = '', people = '', cta = '', onclick;
  if (it.kind === "poll") {
    var inUids = _pollAnswerUids(it.np, 0), all = Object.keys(it.np.responses).length;
    var mine = it.np.responses.hasOwnProperty(me);
    stats = iconStatHtml("vote", inUids.length + "/" + (it.poll.minPlayers || "–")) + iconStatHtml("clock", escapeHtml(it.time || "–"));
    people = voteBarHtml(inUids.length, 0, Math.max(0, all - inUids.length), it.poll.minPlayers || 0) + '<div class="gc-people">' + peopleHtml(inUids, 22, 6) + '</div>';
    cta = mine ? t("gcOpen") : t("homeVoteNow");
    onclick = "showPage('polls')";
  } else {
    var pl = it.s.players || [], owe = step === 2 ? myOweOn(it.s) : 0;
    stats = iconStatHtml("users", pl.length) + iconStatHtml("clock", escapeHtml(it.time || "–")) +
      (owe ? '<span class="icon-stat owe">' + icon("wallet", 16) + ' ' + fmtShort(owe) + '</span>' : '');
    people = '<div class="gc-people">' + peopleHtml(pl, 22, 6) + '</div>';
    cta = step === 1 ? t("homeAddScore") : step === 2 && owe ? t("homePay") : t("gcOpen");
    onclick = "showSessionDetail('" + it.id + "')";
  }
  var seg = '<div class="gseg">' + [0, 1, 2, 3].map(function (i) { return '<i' + (i <= step ? ' class="on"' : '') + '></i>'; }).join("") + '</div>';
  return '<button type="button" class="game-card2" onclick="' + onclick + '">' +
    '<div class="gc-top">' + dateBlockHtml(it.date) +
    '<div class="gc-main"><div class="gc-court">' + escapeHtml(it.court || "–") + '</div><div class="gc-stats">' + stats + '</div></div>' + pillHtml(pillKind, pillText) + '</div>' +
    seg + people + '<div class="gc-cta">' + cta + ' ' + icon("chevron", 16) + '</div></button>';
}

function renderGames() {
  var el = document.getElementById("gamesContent");
  if (!el || !currentUser) return;
  var all = gameItems();
  var up = all.filter(_gameUpcoming).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  var past = all.filter(function (x) { return !_gameUpcoming(x); }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
  var shown = gamesFilter === "upcoming" ? up : gamesFilter === "past" ? past : up.concat(past);
  var tabs = [["upcoming", "gamesUpcoming"], ["past", "gamesPast"], ["all", "gamesAll"]];
  var html = '<div class="dashboard-tabs">' + tabs.map(function (x) {
    return '<button class="dash-tab' + (gamesFilter === x[0] ? ' active' : '') + '" onclick="setGamesFilter(\'' + x[0] + '\')">' + t(x[1]) + '</button>';
  }).join("") + '</div>';
  html += '<div class="games-links"><button class="link-btn" onclick="showPage(\'polls\')">' + icon("vote", 14) + ' ' + t("gamesAllVotes") + '</button>' +
    '<button class="link-btn" onclick="showPage(\'sessions\')">' + icon("sessions", 14) + ' ' + t("gamesAllSessions") + '</button></div>';
    if (!shown.length) {
    html += '<div class="card"><div class="empty-state" style="padding:16px"><div class="empty-icon">' + icon("sessions", 40) + '</div><div>' + t("gamesNone") + '</div></div>' +
      '<button class="btn-primary" onclick="showCreateSheet()">' + icon("add", 16) + ' ' + t("homeCreate") + '</button></div>';
  } else {
    shown.forEach(function (it) { html += _gameCard(it); });
  }
el.innerHTML = html;
}

/** The + sheet: what do you want to start? */
function showCreateSheet() {
  var tile = function (iconName, label, sub, onclick, cls) {
    return '<button type="button" class="home-new big" onclick="closeModal();' + onclick + '"><span class="home-new-ico ' + cls + '">' + icon(iconName, 28) + '</span><b>' + label + '</b><small>' + sub + '</small></button>';
  };
  var html = '<div class="home-news three">' +
    tile("vote", t("homeVote"), t("csVoteSub"), "showCreatePoll()", "n1") +
    tile("court", t("homeGame"), t("csGameSub"), "createAdHocSession()", "n2") +
    tile("shuttle", t("lsTitle"), t("csLiveSub"), "showLiveScore()", "n3") + '</div>' +
    '<div class="home-news two"><button type="button" class="home-new row" onclick="closeModal();homeAddScore()"><span class="home-new-ico n4">' + icon("add", 22) + '</span>' + t("homeAddScore") + '</button></div>';
  document.getElementById("modalTitle").textContent = t("homeCreate");
  document.getElementById("modalBody").innerHTML = html;
  var ok = document.getElementById("modalConfirmBtn"); if (ok) ok.style.display = "none";
  modalCallback = null;
  openModal();
}
