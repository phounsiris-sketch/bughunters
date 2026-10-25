/* ============================================================
   polls.js — Poll creation and voting system
   One plan per poll (date, time, court, duration). The creator sets the
   answers (default Join / Skip); everyone picks one, like a radio button.
   The first answer counts as joining. When at least `minPlayers` joined,
   the creator confirms and a session is created with those players.
   Depends on: firebase-config.js (fsdb),
               auth.js (currentUser),
               db.js (DB_CACHE, dbFindById, dbCreatePoll, dbUpdatePoll),
               app.js (showToast, escapeHtml, fmtDate, COLORS),
               router.js (showPage, goBack)
   ============================================================ */

var pollsUnsubscribe = null;
var lastPolls = [];
var newPoll = null; // form state while creating a poll

/** Minimum players to confirm a plan — configurable in Settings → General */
function minPlayersSetting() {
  return parseInt(appSetting("minPlayers", 4), 10) || 4;
}

/* ---------- Load polls (realtime) ---------- */
function loadPolls() {
  // One listener for the whole signed-in session
  if (!pollsUnsubscribe) {
    pollsUnsubscribe = dbGetPolls(function (polls) {
      lastPolls = polls;
      _autoConfirmPolls();
      if (currentPage === "polls") renderPolls(polls);
      if (currentPage === "home" && typeof renderHome === "function") renderHome();   // a new vote / answer shows in Moments
      if (currentPage === "dashboard" && typeof _renderDashboard === "function") _renderDashboard();
      if (typeof updateNotifications === "function") updateNotifications();
    });
  }
  // The cut-off can pass while the app is open: look again every minute
  if (!_pollTimer) _pollTimer = setInterval(_autoConfirmPolls, 60e3);
  if (currentPage === "polls") renderPolls(lastPolls);   // rendering sets the breadcrumb: only on its own page (Home / Games / Dashboard also call loadPolls)
}

var _pollTimer = null;
var _autoTried = {};
/** At the cut-off, an open poll with enough players becomes a session by itself.
    Only the organiser's device does it; not enough players: stays open for them. */
function _autoConfirmPolls() {
  if (!currentUser || typeof canManagePoll !== "function") return;
  var now = Date.now();
  lastPolls.forEach(function (p) {
    if ((p.status !== "draft" && p.status !== "open") || _autoTried[p.id] || !p.answers) return;
    if (now < pollClosesAt(p) || !canManagePoll(p)) return;
    var np = normalizePoll(p);
    if (np.date && np.date < _todayIso()) return;
    if (_pollAnswerUids(np, 0).length < (p.minPlayers || minPlayersSetting())) return;
    _autoTried[p.id] = true;
    confirmPoll(p.id, true, function () { delete _autoTried[p.id]; });   // a failed try is retried on the next tick
  });
}

function stopPolls() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = null;
  _autoTried = {};
  if (pollsUnsubscribe) pollsUnsubscribe();
  pollsUnsubscribe = null;
  lastPolls = [];
}

/* ---------- Get user display name (HTML-escaped) ---------- */
/** Plain (unescaped) display name of a user object: name → email → "Unknown player" */
function plainUserName(u) {
  if (!u) return t("unknownPlayer");
  return u.displayName || (u.email ? u.email.split("@")[0] : t("unknownPlayer"));
}

/** Join / Skip in the reader's language, whichever language the poll was made in */
function answerLabel(a) {
  if (a === "Join" || a === "ມາ") return t("answerJoin");
  if (a === "Skip" || a === "ບໍ່ມາ") return t("answerSkip");
  return a;
}

function getUserName(uid) {
  if (!uid) return "";
  var u = findUser(uid);
  if (!u && currentUser && uid === currentUser.uid) u = currentUserProfile;
  if (u && u.displayName) return escapeHtml(u.displayName);
  if (u && u.email) return escapeHtml(u.email.split("@")[0]);
  if (currentUser && uid === currentUser.uid && currentUser.email) return escapeHtml(currentUser.email.split("@")[0]);
  return t("unknownPlayer");
}

/* ---------- Render polls list (active / history) ---------- */
var pollView = "active";

function setPollView(view) {
  pollView = view;
  renderPolls(lastPolls);
  window.scrollTo(0, 0);
}

/** Finished polls go to History: cancelled, or the play date has passed */
/* ---------- Voting deadline (Bangkok time) ----------
   With a creation time: 24 hours after the poll is made, never later than the start time.
   Without one (createdMs = 0): midnight before the game day. Later weeks of a weekly
   series pass 0, so they close the day before their own game, not 24h after creation. */
var BKK_MS = 7 * 3600e3;
function defaultCloseAt(date, time, createdMs) {
  if (!date) return 0;
  var d = date.split("-").map(Number), tm = (time || "00:00").split(":").map(Number);
  var midnight = Date.UTC(d[0], d[1] - 1, d[2]) - BKK_MS;
  var start = Date.UTC(d[0], d[1] - 1, d[2], tm[0] || 0, tm[1] || 0) - BKK_MS;
  // Voting stays open one more day after the poll is made, never past the start time (0 = midnight before the game day)
  return createdMs ? Math.min(createdMs + 24 * 3600e3, start) : midnight;
}
function _msOf(x) { return !x ? 0 : typeof x === "number" ? x : x.toMillis ? x.toMillis() : x.toDate ? x.toDate().getTime() : 0; }
function pollClosesAt(p) {
  if (p.closesAt) return p.closesAt;
  var np = normalizePoll(p);
  return defaultCloseAt(np.date, np.time, _msOf(p.createdAt));
}
function pollVotingOpen(p) {
  return (p.status === 'draft' || p.status === 'open') && Date.now() < pollClosesAt(p);
}
/** "Fri 10 Oct, 00:00" in Bangkok time */
function fmtCloseTime(ms) {
  var l = new Date(ms + BKK_MS);
  return weekdayShort(l.getUTCDay()) + ' ' + l.getUTCDate() + ' ' + monthShort(l.getUTCMonth()) + ', ' +
    String(l.getUTCHours()).padStart(2, "0") + ':' + String(l.getUTCMinutes()).padStart(2, "0");
}
function fmtTimeLeft(ms) {
  var m = Math.max(1, Math.round(ms / 60e3));
  if (m < 60) return m + ' ' + t("minShort");
  var h = Math.floor(m / 60);
  if (h < 48) return h + t("hShort") + (h < 6 && m % 60 ? ' ' + (m % 60) + ' ' + t("minShort") : '');
  return Math.round(h / 24) + ' ' + t("daysWord");
}

function isPollArchived(p) {
  if (p.status === "cancelled") return true;
  var np = normalizePoll(p);
  return !!(np.date && np.date < _todayIso());
}

var pollStatusFilter = "";
var pollMonthFilter = "";
function setPollStatusFilter(v) { pollStatusFilter = v; renderPolls(lastPolls); }
function setPollMonthFilter(v) { pollMonthFilter = v; renderPolls(lastPolls); }

function _pollStatusKey(p) {
  return p.status === "confirmed" ? "confirmed" : p.status === "cancelled" ? "cancelled" : "draft";
}

function renderPolls(polls) {
  var container = document.getElementById("pollsList");
  if (!container) return;
  polls = polls || [];
  var dateOf = function (p) { return (normalizePoll(p).date || "") + " " + (normalizePoll(p).time || ""); };

  var archived = polls.filter(isPollArchived);
  var active = polls.filter(function (p) { return !isPollArchived(p); });
  var inView = pollView === "history" ? archived : active;

  // Latest first, then status + month filters
  var months = monthsOf(inView, function (p) { return normalizePoll(p).date; });
  if (pollMonthFilter && months.indexOf(pollMonthFilter) < 0) pollMonthFilter = "";
  var showing = inView.filter(function (p) {
    if (pollStatusFilter && _pollStatusKey(p) !== pollStatusFilter) return false;
    if (pollMonthFilter && (normalizePoll(p).date || "").slice(0, 7) !== pollMonthFilter) return false;
    return true;
  }).sort(byLatest(dateOf));

  setBreadcrumb(pollView === "history"
    ? [{ label: t("navGames"), action: "showPage('games')" }, { label: t("navPolls"), action: "setPollView('active')" }, { label: t("history") }]
    : [{ label: t("navGames"), action: "showPage('games')" }, { label: t("navPolls") }]);

  var html = '<div class="dashboard-tabs">';
  html += '<button class="dash-tab' + (pollView === "active" ? ' active' : '') + '" onclick="setPollView(\'active\')">' + icon("vote", 15) + ' ' + t("activePolls") + ' (' + active.length + ')</button>';
  html += '<button class="dash-tab' + (pollView === "history" ? ' active' : '') + '" onclick="setPollView(\'history\')">' + icon("history", 15) + ' ' + t("history") + ' (' + archived.length + ')</button>';
  html += '</div>';
  html += filterBarHtml(
    [["", t("allStatuses")], ["draft", t("pollDraft")], ["confirmed", t("confirmed")], ["cancelled", t("cancelled")]],
    pollStatusFilter, months, pollMonthFilter, "setPollStatusFilter", "setPollMonthFilter");

  if (showing.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">' + icon("polls", 44) + '</div>' +
      '<div>' + (inView.length ? t("noMatch") : pollView === "history" ? t("noHistory") : t("noPolls")) + '</div>';
    if (pollView === "active" && !inView.length) {
      html += '<div style="margin-top:8px;font-size:13px">' + t("createFirstPoll") + '</div>' +
        '<button class="btn-primary" style="margin-top:16px" onclick="showCreatePoll()">+ ' + t("createPoll") + '</button>';
    }
    container.innerHTML = html + '</div>';
    return;
  }

  for (var p = 0; p < showing.length; p++) html += _renderPollCard(showing[p]);
  container.innerHTML = html;
}

/* ---------- Poll model (also reads polls made by the old multi-option version) ---------- */
function normalizePoll(p) {
  if (p.answers) {
    return {
      date: p.date, time: p.time, duration: p.duration, courtId: p.courtId, courtName: p.courtName,
      answers: p.answers, responses: p.responses || {}
    };
  }
  var idx = typeof p.confirmedOption === "number" ? p.confirmedOption : 0;
  var opt = (p.options || [])[idx] || {};
  var responses = {};
  ((p.votes || {})[idx] || []).forEach(function (uid) { responses[uid] = 0; });
  return {
    date: opt.date, time: opt.time, duration: opt.duration, courtId: opt.courtId, courtName: opt.courtName,
    answers: [t("answerJoin"), t("answerSkip")], responses: responses
  };
}

function _pollAnswerUids(np, idx) {
  return Object.keys(np.responses).filter(function (uid) { return np.responses[uid] === idx; });
}

function _findPoll(id) {
  for (var i = 0; i < lastPolls.length; i++) if (lastPolls[i].id === id) return lastPolls[i];
  return null;
}

/* ---------- Poll card ---------- */
function _renderPollCard(poll) {
  var np = normalizePoll(poll);
  var isOpen = (poll.status === 'draft' || poll.status === 'open');   // not confirmed / cancelled
  var isVotable = isOpen && pollVotingOpen(poll);                     // before the voting deadline
  var closesAt = pollClosesAt(poll);
  var isCreator = canManagePoll(poll); // creator, or anyone allowed to run polls
  var statusClass = poll.status === 'confirmed' ? 'confirmed' : poll.status === 'cancelled' ? 'cancelled' : 'open';
  var statusLabel = poll.status === 'confirmed' ? t('confirmed') : poll.status === 'cancelled' ? t('cancelled') : t('pollDraft');
  var minPlayers = poll.minPlayers || minPlayersSetting();
  var court = findCourt(np.courtId);
  var myAnswer = currentUser && np.responses.hasOwnProperty(currentUser.uid) ? np.responses[currentUser.uid] : -1;
  var joined = _pollAnswerUids(np, 0);
  var enough = joined.length >= minPlayers;

  var kind = poll.status === 'confirmed' ? 'green' : poll.status === 'cancelled' ? 'red' : 'blue';
  var inN = joined.length, outN = Math.max(0, Object.keys(np.responses).length - inN);
  var html = '<div class="card poll-card">';
  html += '<div class="poll-top">' + dateBlockHtml(np.date) +
    '<div class="poll-top-main"><div class="poll-court">' + escapeHtml(np.courtName || '') + (court ? ' ' + courtMapLink(court) : '') + '</div>' +
    '<div class="poll-stats">' + iconStatHtml("clock", escapeHtml(np.time || '') + (np.duration ? ' (' + fmtHours(np.duration) + ')' : '')) +
    iconStatHtml("users", inN + '/' + minPlayers) + '</div></div>' + pillHtml(kind, statusLabel) + '</div>';
  // Edit and delete sit in the card itself (small round buttons next to "created by"); rarer actions are in "Manage" below
  html += '<div class="poll-by"><span class="poll-by-who">' + t('createdBy') + ' ' + personHtml(poll.createdBy, 22) + '</span>' + (isCreator ?
    '<span class="poll-quick"><button type="button" class="poll-q" aria-label="' + t('editPoll') + '" title="' + t('editPoll') + '" onclick="showEditPoll(\'' + jsq(poll.id) + '\')">' + icon("pen", 16) + '</button>' +
    '<button type="button" class="poll-q danger" aria-label="' + t('deletePoll') + '" title="' + t('deletePoll') + '" onclick="deletePoll(\'' + jsq(poll.id) + '\')">' + icon("trash", 16) + '</button></span>' : '') + '</div>';

  // The plan: mode tags and a note (the date, time and court are above)
  if ((typeof GROUPS_ON !== "undefined" && GROUPS_ON && poll.mode) || poll.note) {
    html += '<div class="poll-plan">';
    if (typeof GROUPS_ON !== "undefined" && GROUPS_ON && poll.mode) html += '<div class="game-tags" style="margin-top:0"><span class="tag mode-' + cssId(poll.mode) + '">' + t("mode_" + poll.mode) + '</span>' +
      (poll.gameType ? '<span class="tag">' + t("gameType_" + poll.gameType) + '</span>' : '') + '</div>';
    if (poll.note) html += '<div style="font-size:13px;margin-top:6px">' + escapeHtml(poll.note) + '</div>';
    html += '</div>';
  }

  // Who is coming, as one bar
  html += '<div class="poll-vote">' + voteBarHtml(inN, 0, outN, enough ? 0 : minPlayers) + '</div>';

  // Voting deadline
  if (isOpen && closesAt) {
    var left = closesAt - Date.now();
    html += '<div class="poll-deadline' + (isVotable ? (left < 3 * 3600e3 ? ' soon' : '') : ' closed') + '">' +
      icon(isVotable ? "clock" : "lock", 14) + ' ' + (isVotable
        ? t("votingClosesIn").replace("{left}", fmtTimeLeft(left)).replace("{when}", fmtCloseTime(closesAt))
        : (isCreator ? t("votingClosedCreator") : t("votingClosedWait").replace("{name}", getUserName(poll.createdBy)))) + '</div>';
  }

  // Answers: one big choice row to vote; who voted folds underneath
  var whoHtml = '';
  for (var ai = 0; ai < np.answers.length; ai++) {
    var vu = _pollAnswerUids(np, ai);
    whoHtml += '<div class="poll-who-row"><b>' + escapeHtml(answerLabel(np.answers[ai])) + '</b> <span class="vote-count">' + vu.length + (ai === 0 ? '/' + minPlayers : '') + '</span>' +
      (vu.length ? '<div class="poll-voters">' + peopleHtml(vu, 22, 8) + '</div>' : '') + '</div>';
  }
  if (isVotable) {
    if (myAnswer == null || myAnswer < 0) html += '<div class="vote-hint">' + t('voteTapHint') + '</div>';
    html += '<div class="vote-seg" role="radiogroup" aria-label="' + escapeHtml(t('chooseAnswer')) + '">';
    for (var bi = 0; bi < np.answers.length; bi++) {
      var mineB = myAnswer === bi, cnt = _pollAnswerUids(np, bi).length;
      html += '<button type="button" class="vote-seg-btn' + (mineB ? ' on' : '') + ' a' + bi + '" role="radio" aria-checked="' + mineB + '" onclick="respondPoll(\'' + jsq(poll.id) + '\',' + bi + ')">' +
        (mineB ? icon("check", 16) + ' ' : '') + '<span>' + escapeHtml(answerLabel(np.answers[bi])) + '</span><em>' + cnt + (bi === 0 ? '/' + minPlayers : '') + '</em></button>';
    }
    html += '</div>';
    html += '<details class="poll-who"><summary>' + t('pollWho') + '</summary>' + whoHtml + '</details>';
  } else {
    html += '<div class="poll-who-static">' + whoHtml + '</div>';
  }

  if (isOpen && isCreator && enough) {
    html += '<button class="btn-primary" style="margin-top:10px" onclick="askConfirmPoll(\'' + jsq(poll.id) + '\')">' + icon("check", 16) + ' ' +
      t('confirmPlan') + ' (' + joined.length + ' ' + t('playersWord') + ')</button>';
  } else if (isOpen && isCreator) {
    html += '<div style="font-size:13px;color:var(--text-muted);margin-top:8px">' + t('needMinPlayers').replace('{n}', minPlayers) + '</div>';
  }

  if (poll.status === 'confirmed' && poll.sessionId) {
    html += '<button class="btn-secondary" style="margin-top:10px" onclick="showSessionDetail(\'' + jsq(poll.sessionId) + '\')">' + t('openSession') + ' →</button>';
  }

  // Edit / delete are in the card header (any state). "Manage" holds the rarer actions and is folded.
  var extra = (isOpen ? '<button class="edit-btn" onclick="showVoteForOthers(\'' + jsq(poll.id) + '\')">+ ' + t('addVotesForOthers') + '</button>' : '') +
    (poll.status === 'confirmed' ? '<button class="edit-btn danger" onclick="deleteSessionAndPoll(\'' + jsq(poll.id) + '\')">' + icon("history", 14) + ' ' + t('unconfirmPoll') + '</button>' : '') +
    (isOpen ? '<button class="edit-btn danger" onclick="cancelPoll(\'' + jsq(poll.id) + '\')">' + t('cancelPoll') + '</button>' : '');
  if (isCreator && extra) html += '<details class="poll-manage"><summary>' + icon("settings", 14) + ' ' + t('pollManage') + '</summary><div class="poll-manage-btns">' + extra + '</div></details>';

  html += '</div>';
  return html;
}

/* ---------- Answer a poll (radio: one answer per person; tap again to clear) ---------- */
/** Tap an answer. Saved as a field update (not a transaction), so Firebase
    shows it on screen instantly and syncs in the background; fast repeat
    taps simply end on the last one. */
function respondPoll(pollId, answerIdx) {
  if (!currentUser) return;
  var poll = _findPoll(pollId);
  if (!poll) return;
  if (poll.status !== 'draft' && poll.status !== 'open') { showToast(t("pollClosed")); return; }
  if (!pollVotingOpen(poll)) { showToast(t("votingClosed")); return; }
  if (!poll.answers) { // old multi-option poll
    _saveVote(pollId, answerIdx, false).catch(function (e) { showToast(e.message); });
    return;
  }
  var uid = currentUser.uid;
  var FV = firebase.firestore.FieldValue;
  var responses = Object.assign({}, poll.responses || {});
  var next = responses[uid] === answerIdx ? -1 : answerIdx;
  if (next === -1) delete responses[uid]; else responses[uid] = next;

  var basic = {};
  basic["responses." + uid] = next === -1 ? FV.delete() : next;
  var full = Object.assign({}, basic);
  full["voteLog." + uid] = { a: next, at: Date.now(), by: uid };   // who / what / when
  _markReached(poll, responses, full);

  var ref = fsdb.collection("polls").doc(pollId);
  ref.update(full).catch(function (error) {
    // Older Firestore rules don't allow the vote log yet: save just the vote
    if (error && error.code === "permission-denied") return ref.update(basic);
    throw error;
  }).catch(function (error) {
    showToast(error && error.code === "permission-denied" ? t("noPermission") : error.message);
  });
}

/** v231: an old multi-option poll keeps its answers in `votes`. The rules no longer accept new writes to it, so the first change by someone who
 *  manages the poll moves the poll to the current shape (answers + responses, the date and court of the chosen option, `votes` deleted).
 *  Returns { fields, responses } for the update. Reading (normalizePoll) still understands `votes`. */
function legacyPollMigration(data) {
  var idx = typeof data.confirmedOption === "number" ? data.confirmedOption : 0, opt = (data.options || [])[idx] || {}, responses = {};
  ((data.votes || {})[idx] || []).forEach(function (u) { responses[u] = 0; });
  var fields = { answers: [t("answerJoin"), t("answerSkip")], votes: firebase.firestore.FieldValue.delete() };
  ["date", "time", "duration", "courtId", "courtName"].forEach(function (k) { if (opt[k] != null && data[k] == null) fields[k] = opt[k]; });
  fields.responses = responses;
  return { fields: fields, responses: responses };
}

/** Toggle my answer in a transaction; withLog also records who/when (voteLog) */
function _saveVote(pollId, answerIdx, withLog) {
  var uid = currentUser.uid;
  var pollRef = fsdb.collection("polls").doc(pollId);
  return fsdb.runTransaction(function (transaction) {
    return transaction.get(pollRef).then(function (pollDoc) {
      if (!pollDoc.exists) throw new Error("Poll not found");
      var data = pollDoc.data();
      if (data.status !== 'draft' && data.status !== 'open') throw new Error(t("pollClosed"));

      var update = {};
      if (data.answers) {
        var responses = data.responses || {};
        if (responses[uid] === answerIdx) delete responses[uid];
        else responses[uid] = answerIdx;
        update.responses = responses;
        if (withLog) {
          // Who voted what, and when (for the notification list)
          var log = data.voteLog || {};
          log[uid] = { a: responses.hasOwnProperty(uid) ? responses[uid] : -1, at: Date.now(), by: uid };
          update.voteLog = log;
          _markReached(data, responses, update);
        }
      } else {
        // Old multi-option poll: no new writes to `votes`. Whoever manages it moves it to the current shape; a plain member cannot change it
        if (!canManagePoll(data)) throw new Error(t("pollLegacyReadOnly"));
        var mig = legacyPollMigration(data);
        if (mig.responses[uid] === answerIdx) delete mig.responses[uid]; else mig.responses[uid] = answerIdx;
        update = mig.fields;
        update.responses = mig.responses;
      }
      transaction.update(pollRef, update);
    });
  });
}

/** First time Join answers reach the minimum players: remember when */
function _markReached(data, responses, update) {
  if (data.reachedAt) return;
  var min = parseInt(data.minPlayers, 10) || minPlayersSetting();
  var joins = Object.keys(responses).filter(function (u) { return responses[u] === 0; }).length;
  if (joins >= min) update.reachedAt = Date.now();
}

/* ---------- Creator answers for players who replied in chat / have no account ---------- */
function showVoteForOthers(pollId) {
  var poll = _findPoll(pollId);
  if (!poll) return;
  var np = normalizePoll(poll);
  var initial = Object.assign({}, np.responses);   // what the sheet showed: only rows the organiser changed are written

  var rows = '';
  DB_CACHE.users.forEach(function (u) {
    var cur = np.responses.hasOwnProperty(u.id) ? np.responses[u.id] : -1;
    rows += '<div class="proxy-row" data-uid="' + u.id + '" data-answer="' + cur + '">';
    rows += '<div class="proxy-name">' + escapeHtml(plainUserName(u)) + (u.manual ? ' ' + icon("manual", 12) : '') + '</div><div class="proxy-pills">';
    for (var ai = 0; ai < np.answers.length; ai++) {
      rows += '<button type="button" class="proxy-pill' + (cur === ai ? ' active' : '') + '" onclick="_proxyPick(this,' + ai + ')">' + escapeHtml(answerLabel(np.answers[ai])) + '</button>';
    }
    rows += '<button type="button" class="proxy-pill' + (cur === -1 ? ' active' : '') + '" onclick="_proxyPick(this,-1)">—</button>';
    rows += '</div></div>';
  });

  document.getElementById("modalTitle").textContent = t("addVotesForOthers");
  document.getElementById("modalBody").innerHTML =
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + t("voteForOthersHint") + '</div>' +
    '<div id="proxyRows">' + rows + '</div>';

  modalCallback = function () {
    var chosen = {};
    var els = document.querySelectorAll("#proxyRows .proxy-row");
    for (var k = 0; k < els.length; k++) {
      var v = parseInt(els[k].getAttribute("data-answer"), 10);
      if (v >= 0) chosen[els[k].getAttribute("data-uid")] = v;
    }
    var pollRef = fsdb.collection("polls").doc(pollId);
    fsdb.runTransaction(function (transaction) {
      return transaction.get(pollRef).then(function (doc) {
        if (!doc.exists) throw new Error("Poll not found");
        var data = doc.data();
        if (!canManagePoll(data)) throw new Error(t("noPermission"));
        if (data.status !== 'draft' && data.status !== 'open') throw new Error(t("pollClosed"));
        var changed = pollVoteChanges(initial, chosen);
        if (data.answers) {
          var before = data.responses || {}, now = Date.now(), merged = Object.assign({}, before), upd = {};
          Object.keys(changed).forEach(function (u) {
            var a = changed[u], was = before.hasOwnProperty(u) ? before[u] : -1;
            if (a === was) return;
            if (a < 0) { upd["responses." + u] = firebase.firestore.FieldValue.delete(); delete merged[u]; }
            else { upd["responses." + u] = a; merged[u] = a; }
            upd["voteLog." + u] = { a: a, at: now, by: currentUser.uid };
          });
          _markReached(data, merged, upd);
          if (Object.keys(upd).length) transaction.update(pollRef, upd);
        } else {
          // Old multi-option poll (see legacyPollMigration): moved to the current shape together with the change
          var mig = legacyPollMigration(data);
          Object.keys(changed).forEach(function (u) {
            if (changed[u] < 0) delete mig.responses[u]; else mig.responses[u] = changed[u];
          });
          mig.fields.responses = mig.responses;
          transaction.update(pollRef, mig.fields);
        }
      });
    })
      .then(function () { closeModal(); })
      .catch(function (error) { showToast(error.message); });
  };
  openModal();
}

/** Rows the organiser changed in the sheet: { uid: newAnswer (-1 = no answer) }, compared with what the sheet showed */
function pollVoteChanges(initial, chosen) {
  var out = {};
  Object.keys(initial).concat(Object.keys(chosen)).forEach(function (u) {
    var was = initial.hasOwnProperty(u) ? initial[u] : -1, now = chosen.hasOwnProperty(u) ? chosen[u] : -1;
    if (was !== now) out[u] = now;
  });
  return out;
}

function _proxyPick(btn, idx) {
  var row = btn.closest(".proxy-row");
  row.setAttribute("data-answer", idx);
  var pills = row.querySelectorAll(".proxy-pill");
  for (var i = 0; i < pills.length; i++) pills[i].classList.toggle("active", pills[i] === btn);
}

/* ---------- Confirm poll (creator only, needs >= minPlayers joining) ---------- */
/** A tap on "Confirm plan" asks first (it creates a real session and tells the players); the deadline auto-confirm calls confirmPoll directly */
function askConfirmPoll(pollId) {
  var poll = _findPoll(pollId); if (!poll) return;
  var np = normalizePoll(poll), n = _pollAnswerUids(np, 0).length;
  var when = fmtDate(np.date) + (np.time ? " " + np.time : "") + (np.courtName ? " \u00b7 " + np.courtName : "");
  askConfirm({ title: t("confirmPlanAsk").replace("{n}", n).replace("{when}", when), kind: "ask", yes: t("confirmPlan") }, function () { confirmPoll(pollId); });
}

function confirmPoll(pollId, auto, onFail) {
  if (!currentUser) return;
  var pollRef = fsdb.collection("polls").doc(pollId);
  var newSessionId = null;

  fsdb.runTransaction(function (transaction) {
    return transaction.get(pollRef).then(function (pollDoc) {
      if (!pollDoc.exists) throw new Error("Poll not found");
      var pollData = pollDoc.data();
      pollData.id = pollId;
      if (!canManagePoll(pollData)) throw new Error(t("noPermission"));
      if (pollData.status !== 'draft' && pollData.status !== 'open') throw new Error(t("pollClosed"));

      var np = normalizePoll(pollData);
      var minPlayers = pollData.minPlayers || minPlayersSetting();
      var players = _pollAnswerUids(np, 0);
      if (players.length < minPlayers) throw new Error(t("needMinPlayers").replace("{n}", minPlayers));

      var court = findCourt(np.courtId);
      var sessionRef = fsdb.collection("sessions").doc();
      newSessionId = sessionRef.id;
      // The session belongs to the poll's group (the rules refuse a session without one)
      transaction.set(sessionRef, withGroup({
        pollId: pollId,
        date: np.date || null,
        time: np.time || null,
        duration: np.duration || 2,
        courtId: np.courtId || null,
        courtName: np.courtName || null,
        courtLocation: court ? (court.location || null) : null,
        pricePerHour: courtPrice(court),
        status: 'active',
        players: players,
        mode: pollData.mode || "competition",
        gameType: pollData.gameType || "md",
        calculated: false,
        createdBy: pollData.createdBy || currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, pollData.groupId));

      transaction.update(pollRef, { status: 'confirmed', confirmedPlayers: players, sessionId: sessionRef.id, confirmedAt: Date.now() });
    });
  })
    .then(function () {
      showToast(t("planConfirmed") + " ✔");
      if (newSessionId && !auto) showSessionDetail(newSessionId);
    })
    .catch(function (error) { if (typeof onFail === "function") onFail(error); if (!auto) showToast(error.message); });
}

/* ---------- Edit poll (organiser; also after the cut-off, while it is not confirmed) ---------- */
function showEditPoll(pollId) {
  var poll = _findPoll(pollId);
  if (!poll || !canManagePoll(poll)) return;
  var np = normalizePoll(poll);
  var linked = null;   // a confirmed poll's session follows the new date / time / court
  if (poll.status === "confirmed" && poll.sessionId) lastSessions.forEach(function (x) { if (x.id === poll.sessionId) linked = x; });
  var opts = '';
  DB_CACHE.courts.forEach(function (c) {
    opts += '<option value="' + c.id + '"' + (c.id === np.courtId ? ' selected' : '') + '>' + escapeHtml(c.name) + ' (' + fmtLAK(courtPrice(c)) + '/h)</option>';
  });
  document.getElementById("modalTitle").textContent = t("editPoll");
  document.getElementById("modalBody").innerHTML =
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">' + t("date") + '</label><input type="date" class="form-input" id="mPolDate" value="' + (np.date || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">' + t("startTime") + '</label><input type="time" class="form-input" id="mPolTime" value="' + (np.time || '') + '"></div>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-group" style="flex:2"><label class="form-label">' + t("court") + '</label><select class="form-select" id="mPolCourt" data-cs-type="court">' + opts + '</select></div>' +
      '<div class="form-group" style="flex:1"><label class="form-label">' + t("duration") + ' (h)</label><input type="number" class="form-input" id="mPolDur" min="0.5" step="0.5" value="' + (np.duration || 2) + '"></div>' +
    '</div>' +
    '<div class="form-row"><div class="form-group" style="flex:1"><label class="form-label">' + t("minPlayersLabel") + '</label><input type="number" class="form-input" id="mPolMin" min="2" max="40" step="1" value="' + (poll.minPlayers || minPlayersSetting()) + '"></div></div>' +
    '<div class="form-group"><label class="form-label">' + t("note") + '</label><textarea class="form-input" id="mPolNote" rows="2">' + escapeHtml(poll.note || '') + '</textarea></div>';
  modalCallback = function () {
    var court = dbFindById(DB_CACHE.courts, document.getElementById("mPolCourt").value);
    var duration = parseFloat(document.getElementById("mPolDur").value) || 0;
    var date = document.getElementById("mPolDate").value;
    var time = document.getElementById("mPolTime").value;
    if (!date || duration <= 0 || !court) { showToast(t("fillAllFields")); return; }
    delete _autoTried[pollId];
    var upd = {
      date: date, time: time, duration: duration, courtId: court.id, courtName: court.name,
      minPlayers: Math.max(2, parseInt(document.getElementById("mPolMin").value, 10) || minPlayersSetting()),
      note: (document.getElementById("mPolNote").value || "").trim() || null
    };
    if (poll.status === "draft" || poll.status === "open") upd.closesAt = defaultCloseAt(date, time, Date.now());   // the cut-off only matters while voting is open
    var write;
    if (linked) {
      var sUpd = pollSessionChanges(linked, upd, court);
      var batch = fsdb.batch();
      batch.update(fsdb.collection("polls").doc(pollId), upd);
      if (Object.keys(sUpd).length) batch.update(fsdb.collection("sessions").doc(linked.id), sUpd);
      write = batch.commit();
    } else write = dbUpdatePoll(pollId, upd);
    write.then(function () { closeModal(); showToast(t("save") + " ✔"); })
      .catch(function (error) { showToast(error && error.code === "permission-denied" ? t("noPermission") : error.message); });
  };
  openModal();
}

/** Plan fields of an edited confirmed poll that its session must follow (only fields the session has; price only while unsettled) */
function pollSessionChanges(ses, upd, court) {
  var out = {};
  ["date", "time", "duration", "courtId", "courtName"].forEach(function (k) {
    if (ses.hasOwnProperty(k) && ses[k] !== upd[k]) out[k] = upd[k];
  });
  if (ses.hasOwnProperty("courtLocation") && court) out.courtLocation = court.location || null;
  if (!ses.calculated && ses.hasOwnProperty("pricePerHour") && court && upd.courtId !== ses.courtId) out.pricePerHour = courtPrice(court);
  return out;
}

/* ---------- Cancel poll ---------- */
/** Delete a poll in any state: it goes to Recently deleted for 30 days with Undo. A session made from it stays. */
function deletePoll(pollId) {
  var poll = _findPoll(pollId);
  if (!poll || !canManagePoll(poll)) { showToast(t("noPermission")); return; }
  var label = (poll.title ? poll.title + " \u00b7 " : "") + fmtDate(poll.date) + (poll.time ? " " + poll.time : "");
  askConfirm({ title: t("deletePollConfirm").replace("{name}", label), kind: "danger", yes: t("delete") }, function () {
    trashDoc("poll", "polls", pollId, label).catch(function (e) { showToast(typeof _permError === "function" ? _permError(e) : e.message); });
  });
}

/** A confirmed poll and the session made from it go together: both move to Recently deleted (30 days, Undo). Deleting only the poll (Delete poll) leaves the session alone. */
function deleteSessionAndPoll(pollId) {
  var poll = _findPoll(pollId);
  if (!poll || !canManagePoll(poll)) { showToast(t("noPermission")); return; }
  var sid = poll.sessionId, ses = null;
  lastSessions.forEach(function (x) { if (x.id === sid) ses = x; });
  var label = ses && typeof trashLabelSession === "function" ? trashLabelSession(ses) : fmtDate(poll.date);
  askConfirm({ title: t("unconfirmPollAsk").replace("{name}", label), kind: "danger", yes: t("unconfirmPollYes") }, function () {
    // One Undo restores both: the session first, then the poll
    var go = sid && ses
      ? trashDoc("session", "sessions", sid, label, true).then(function (sTrash) {
          return trashDoc("poll", "polls", pollId, label, true).then(function (pTrash) {
            showUndoToast(t("movedToTrash").replace("{name}", label), sTrash + "," + pTrash);
          });
        })
      : trashDoc("poll", "polls", pollId, label);
    go.catch(function (e) { showToast(typeof _permError === "function" ? _permError(e) : e.message); });
  });
}

function cancelPoll(pollId) {
  askYes(t("cancelPoll") + "?", function () {
    dbUpdatePoll(pollId, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: currentUser.uid })
      .then(function () { showToast(t("cancelled")); })
      .catch(function (error) { showToast(error.message); });
  }, { danger: true, yes: t("confirm") });
}

/* ---------- Create poll (one plan per poll) ---------- */
function _todayIso() {
  var d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // local date, not UTC
  return d.toISOString().split('T')[0];
}

function showCreatePoll() {
  var first = DB_CACHE.courts[0];
  newPoll = {
    date: _todayIso(),
    time: '18:00',
    duration: 2,
    courtId: first ? first.id : '',
    note: '',
    answers: [t('answerJoin'), t('answerSkip')],
    mode: 'competition',
    gameType: 'md',
    step: 1,
    repeat: 'none',
    repeatN: 4
  };
  showPage('poll-create');
  renderPollCreateForm();
}

function renderPollCreateForm() {
  var container = document.getElementById("pollCreateContent");
  if (!container || !newPoll) return;

  var courts = DB_CACHE.courts;
  if (courts.length === 0) {
    container.innerHTML = '<div class="card"><div class="card-title">' + t('createPoll') + '</div>' +
      '<div class="empty-state" style="padding:20px"><div>' + t('noCourtsYet') + '</div>' +
      '<button class="btn-secondary" style="margin-top:12px" onclick="settingsTab=\'courts\';showPage(\'config\')">' + t('configuration') + ' → ' + t('tabCourts') + '</button></div></div>';
    return;
  }
  if (!newPoll.courtId || !dbFindById(courts, newPoll.courtId)) newPoll.courtId = courts[0].id;

  setBreadcrumb([{ label: t("navGames"), action: "showPage('games')" }, { label: t("createPoll") }]);
  var step = newPoll.step === 2 ? 2 : 1;
  var html = wizBarHtml(step - 1, [t('wzWhenWhere'), t('wzVoteOptions')]);

  if (step === 1) {
    html += '<div class="card"><div class="card-title">' + icon("calendar", 14) + ' ' + t('plan') + '</div>';
    html += dayStripHtml(newPoll.date, 'pollPickDay');
    html += '<div class="form-row" style="margin-top:12px">';
    html += '<div class="form-group"><label class="form-label">' + t('date') + '</label>';
    html += '<input type="date" class="form-input" value="' + newPoll.date + '" onchange="newPoll.date=this.value;renderPollCreateForm()"></div>';
    html += '<div class="form-group"><label class="form-label">' + t('startTime') + '</label>';
    html += '<input type="time" class="form-input" value="' + newPoll.time + '" onchange="newPoll.time=this.value"></div>';
    html += '</div>';
    html += '<div class="form-row">';
    html += '<div class="form-group" style="flex:2;margin-bottom:0"><label class="form-label">' + t('court') + '</label>';
    html += '<select class="form-select" data-cs-type="court" data-cs-onpick="pollPickCourt" onchange="newPoll.courtId=this.value">';
    for (var c = 0; c < courts.length; c++) {
      html += '<option value="' + courts[c].id + '"' + (courts[c].id === newPoll.courtId ? ' selected' : '') + '>' +
        escapeHtml(courts[c].name) + (courts[c].location ? ' — ' + escapeHtml(courts[c].location) : '') + '</option>';
    }
    html += '</select></div>';
    html += '<div class="form-group" style="flex:1;margin-bottom:0"><label class="form-label">' + t('duration') + ' (h)</label>';
    html += '<input type="number" class="form-input" min="0.5" step="0.5" value="' + newPoll.duration + '" onchange="newPoll.duration=parseFloat(this.value)||2"></div>';
    html += '</div></div>';
    html += '<button class="btn-primary" onclick="pollStep(2)">' + t('wzNext') + ' ' + icon("chevron", 16) + '</button>';
    container.innerHTML = html;
    return;
  }

  // Step 2: how people answer, the play mode and a note
  var court = findCourt(newPoll.courtId);
  html += '<div class="card wiz-summary">' + iconStatHtml("calendar", fmtDate(newPoll.date)) + iconStatHtml("clock", escapeHtml(newPoll.time)) + iconStatHtml("pin", escapeHtml(court ? court.name : "")) + '</div>';
  if (typeof GROUPS_ON !== "undefined" && GROUPS_ON) html += playModeFieldsHtml(newPoll, "newPoll", "renderPollCreateForm");
  html += '<div class="card"><div class="form-group" style="margin-bottom:0"><label class="form-label">' + t('pollNote') + '</label>';
  html += '<input class="form-input" value="' + escapeHtml(newPoll.note) + '" placeholder="' + t('pollNotePlaceholder') + '" oninput="newPoll.note=this.value"></div></div>';

  // Answers
  html += '<div class="card"><div class="card-title">' + icon("vote", 14) + ' ' + t('answers') + '</div>';
  for (var i = 0; i < newPoll.answers.length; i++) {
    html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">';
    html += '<span class="radio-dot"></span>';
    html += '<input class="form-input" value="' + escapeHtml(newPoll.answers[i]) + '" oninput="newPoll.answers[' + i + ']=this.value">';
    if (i >= 2) html += '<button class="remove-btn" onclick="newPoll.answers.splice(' + i + ',1);renderPollCreateForm()">&times;</button>';
    html += '</div>';
  }
  html += '<div style="font-size:12px;color:var(--text-muted)">' + t('firstAnswerJoins').replace('{n}', minPlayersSetting()) + '</div>';
  if (newPoll.answers.length < 4) {
    html += '<button class="add-btn-dashed" onclick="newPoll.answers.push(\'\');renderPollCreateForm()">+ ' + t('addAnswer') + '</button>';
  }
  html += '</div>';

    html += repeatFieldHtml("newPoll", newPoll, "renderPollCreateForm");

  html += '<div class="wiz-actions"><button class="btn-secondary" onclick="pollStep(1)">' + icon("back", 16) + ' ' + t('wzBack') + '</button>' +
    '<button class="btn-primary" onclick="submitPoll()">' + t('createPoll') + '</button></div>';
  container.innerHTML = html;
}

function pollStep(n) { if (newPoll) { newPoll.step = n; renderPollCreateForm(); window.scrollTo(0, 0); } }
function pollPickDay(d) { if (newPoll) { newPoll.date = d; renderPollCreateForm(); } }

function pollPickCourt(id) {
  if (newPoll) newPoll.courtId = id;
  setTimeout(renderPollCreateForm, 300); // let the court list refresh first
}

var _pollSubmitting = false;
function submitPoll() {
  if (_pollSubmitting || !newPoll) return;
  var answers = newPoll.answers.map(function (a) { return (a || '').trim(); });
  if (!newPoll.courtId || !newPoll.date || !newPoll.time) { showToast(t('fillAllOptions')); return; }
  if (answers.length < 2 || answers.some(function (a) { return !a; })) { showToast(t('fillAllFields')); return; }
  var court = findCourt(newPoll.courtId);

  var weeks = newPoll.repeat === "weekly" ? Math.max(2, Math.min(12, newPoll.repeatN || 2)) : 1;
  var series = weeks > 1 ? "s" + Date.now().toString(36) : null;
  var jobs = [];
  _pollSubmitting = true;
  for (var k = 0; k < weeks; k++) {
    var day = _addDays(newPoll.date, 7 * k);
    var one = {
      createdBy: currentUser.uid,
      status: 'draft',
      note: (newPoll.note || '').trim() || null,
      date: day,
      time: newPoll.time,
      duration: newPoll.duration || 2,
      courtId: newPoll.courtId,
      courtName: court ? court.name : '',
      answers: answers.slice(),
      responses: {},
      mode: newPoll.mode || 'competition',
      gameType: newPoll.gameType || 'md',
      minPlayers: minPlayersSetting(),
      closesAt: defaultCloseAt(day, newPoll.time, k ? 0 : Date.now()),   // voting deadline; later weeks close the day before their game
      sessionId: null
    };
    if (series) one.seriesId = series;
    jobs.push(dbCreatePoll(one));
  }
  Promise.all(jobs)
    .then(function () {
      _pollSubmitting = false;
      showToast(t("draftCreated") + (weeks > 1 ? " \u00D7" + weeks : ""));
      newPoll = null;
      showPage('polls', false);
      pageHistory = [];
    })
    .catch(function (error) { _pollSubmitting = false; showToast(error.message); });
}
