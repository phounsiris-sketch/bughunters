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
  var more = _gameMoreBtn(it);
  return '<div class="gcard-wrap">' + '<button type="button" class="game-card2" onclick="' + onclick + '">' +
    '<div class="gc-top">' + dateBlockHtml(it.date) +
    '<div class="gc-main"><div class="gc-court">' + escapeHtml(it.court || "–") + '</div><div class="gc-stats">' + stats + '</div></div>' + pillHtml(pillKind, pillText) + '</div>' +
    seg + people + '<div class="gc-cta">' + cta + ' ' + icon("chevron", 16) + '</div></button>' + more + '</div>';
}

/* v260: ⋯ on a card, shown only to people who may act on it; opens a small action sheet (Edit / Bill / Delete) */
function _gameCanMore(it) {
  if (it.kind === "poll") return canManagePoll(it.poll);
  return canDeleteSession(it.s) || canEditSessionDetails(it.s) || canEditBill(it.s);
}
function _gameMoreBtn(it) {
  if (!_gameCanMore(it)) return "";
  return '<button type="button" class="gc-more" data-overlay aria-label="' + escapeHtml(t("cmMore")) + '" aria-haspopup="dialog" onclick="event.stopPropagation();openCardMenu(\'' + it.kind + '\',\'' + jsq(it.id) + '\',this)">\u22ef</button>';
}

/** The actions of a card as [{ key, label, danger, run }], what the viewer may do (separator = { sep: true }) */
function cardMenuItems(kind, id) {
  var out = [];
  if (kind === "poll") {
    var p = typeof _findPoll === "function" ? _findPoll(id) : null;
    if (!p || !canManagePoll(p)) return out;
    out.push({ key: "editVote", label: t("cmEditVote"), run: function () { showEditPoll(id); } });
    out.push({ sep: true });
    out.push({ key: "deleteVote", label: t("cmDeleteVote"), danger: true, run: function () { deletePoll(id); } });
    return out;
  }
  var s = null;
  lastSessions.forEach(function (x) { if (x.id === id) s = x; });
  if (!s) return out;
  if (canEditSessionDetails(s)) out.push({ key: "editDetails", label: t("cmEditDetails"), run: function () { showSessionDetailsModal(id); } });
  if (canEditBill(s)) out.push({ key: "bill", label: t("cmBill"), run: function () { openSessionBill(id); } });
  if (canDeleteSession(s)) {
    if (out.length) out.push({ sep: true });
    out.push({ key: "deleteSession", label: t("cmDeleteSession"), danger: true, run: function () { deleteSessionById(id); } });
  }
  return out;
}

var _cardMenuOpener = null;
function openCardMenu(kind, id, opener) {
  var items = cardMenuItems(kind, id);
  if (!items.length) return;
  closeCardMenu(true);
  _cardMenuOpener = opener || document.activeElement;
  var el = document.createElement("div");
  el.id = "cardSheet"; el.className = "sheet-wrap";
  var ico = { editVote: "pen", editDetails: "pen", bill: "bill", deleteVote: "trash", deleteSession: "trash" };
  el.innerHTML = '<div class="sheet cardmenu" role="dialog" aria-modal="true" aria-label="' + escapeHtml(t("cmMore")) + '"><div class="sheet-grab"></div><div class="cm-list">' +
    items.map(function (it, i) {
      return it.sep ? '<div class="cm-sep" role="separator"></div>' :
        '<button type="button" class="cm-item' + (it.danger ? ' danger' : '') + '" data-cm="' + i + '"><span class="cm-ico" aria-hidden="true">' + icon(ico[it.key] || "pen", 18) + '</span><span>' + escapeHtml(it.label) + '</span></button>';
    }).join("") + '</div></div>';
  el.onclick = function (e) {
    if (e.target === el) { closeCardMenu(); return; }
    var b = e.target.closest ? e.target.closest("[data-cm]") : null;
    if (!b) return;
    var run = items[+b.getAttribute("data-cm")].run;
    closeCardMenu();              // focus goes back to the ⋯ button, so the next sheet's Cancel / Esc returns there
    run();
  };
  document.addEventListener("keydown", _cardMenuKey, true);
  document.body.appendChild(el);
  var f = el.querySelector(".cm-item"); if (f) f.focus();
}
function _cardMenuKey(e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCardMenu(); return; }
  if (e.key === "Tab") {
    var el = document.getElementById("cardSheet"); if (!el) return;
    var f = [].slice.call(el.querySelectorAll(".cm-item")), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
function closeCardMenu(quiet) {
  document.removeEventListener("keydown", _cardMenuKey, true);
  var el = document.getElementById("cardSheet"); if (el) el.remove();
  var o = _cardMenuOpener; _cardMenuOpener = null;
  if (!quiet && o && o.focus && document.contains(o)) { try { o.focus(); } catch (e) {} }
}

function renderGames() {
  var el = document.getElementById("gamesContent");
  if (!el || !currentUser) return;
  var all = gameItems();
  var up = all.filter(_gameUpcoming).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  var past = all.filter(function (x) { return !_gameUpcoming(x); }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
  var shown = gamesFilter === "upcoming" ? up : gamesFilter === "past" ? past : up.concat(past);
  var tabs = [["upcoming", "gamesUpcoming"], ["past", "gamesPast"], ["all", "gamesAll"]];
  var html = menuTitleHtml("sessions", "navGames") + '<div class="dashboard-tabs">' + tabs.map(function (x) {
    return '<button class="dash-tab' + (gamesFilter === x[0] ? ' active' : '') + '" onclick="setGamesFilter(\'' + x[0] + '\')">' + t(x[1]) + '</button>';
  }).join("") + '</div>';
  html += '<div class="games-links"><button class="btn-secondary" onclick="showPage(\'polls\')">' + icon("vote", 16) + ' ' + t("gamesAllVotes") + '</button>' +
    '<button class="btn-secondary" onclick="showPage(\'sessions\')">' + icon("sessions", 16) + ' ' + t("gamesAllSessions") + '</button></div>';
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
  var html = '<div class="home-news two-up">' +
    tile("vote", t("homeVote"), t("csVoteSub"), "showCreatePoll()", "n1") +
    tile("court", t("homeShortPlay"), t("csGameSub"), "createAdHocSession()", "n2") + '</div>' +
    '<div class="home-news two-up" style="margin-top:10px">' +
    '<button type="button" class="home-new row" onclick="closeModal();homeAddScore()"><span class="home-new-ico n3">' + icon("add", 22) + '</span>' + t("homeAddScore") + '</button>' +
    '<button type="button" class="home-new row" onclick="closeModal();showLiveScore()"><span class="home-new-ico n4">' + icon("scoreboard", 22) + '</span>' + t("lsTitle") + '</button></div>';
  document.getElementById("modalTitle").textContent = t("homeCreate");
  document.getElementById("modalBody").innerHTML = html;
  var ok = document.getElementById("modalConfirmBtn"); if (ok) ok.style.display = "none";
  modalCallback = null;
  openModal();
}
