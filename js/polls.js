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
      if (currentPage === "polls") renderPolls(polls);
      if (currentPage === "dashboard" && typeof _renderDashboard === "function") _renderDashboard();
      if (typeof updateNotifications === "function") updateNotifications();
    });
  }
  renderPolls(lastPolls);
}

function stopPolls() {
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
  var u = dbFindById(DB_CACHE.users, uid);
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
    ? [{ label: t("navPolls"), action: "setPollView('active')" }, { label: t("history") }]
    : null);

  var html = '<div class="view-switch">';
  html += '<button class="view-btn' + (pollView === "active" ? ' active' : '') + '" onclick="setPollView(\'active\')">' + icon("polls", 16) + ' ' + t("activePolls") + ' (' + active.length + ')</button>';
  html += '<button class="view-btn' + (pollView === "history" ? ' active' : '') + '" onclick="setPollView(\'history\')">' + icon("history", 16) + ' ' + t("history") + ' (' + archived.length + ')</button>';
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
  var isVotable = (poll.status === 'draft' || poll.status === 'open');
  var isCreator = canManagePoll(poll); // creator, or anyone allowed to run polls
  var statusClass = poll.status === 'confirmed' ? 'confirmed' : poll.status === 'cancelled' ? 'cancelled' : 'open';
  var statusLabel = poll.status === 'confirmed' ? t('confirmed') : poll.status === 'cancelled' ? t('cancelled') : t('pollDraft');
  var minPlayers = poll.minPlayers || minPlayersSetting();
  var court = dbFindById(DB_CACHE.courts, np.courtId);
  var myAnswer = currentUser && np.responses.hasOwnProperty(currentUser.uid) ? np.responses[currentUser.uid] : -1;
  var joined = _pollAnswerUids(np, 0);
  var enough = joined.length >= minPlayers;

  var html = '<div class="card poll-card">';
  html += '<div class="poll-header">';
  html += '<span class="poll-author" role="button" onclick="showUserProfile(\'' + poll.createdBy + '\',event)">' + avatarHtml(poll.createdBy, 28) + '<span><span class="poll-author-by">' + t('createdBy') + '</span> <b>' + getUserName(poll.createdBy) + '</b></span></span>';
  html += '<span class="poll-status ' + statusClass + '">' + statusLabel + '</span>';
  html += '</div>';

  // The plan
  html += '<div class="poll-plan">';
  html += '<div style="font-size:15px;font-weight:700">' + icon('calendar', 16) + ' ' + fmtDate(np.date) + ' • ' + escapeHtml(np.time || '') + (np.duration ? ' (' + fmtHours(np.duration) + ')' : '') + '</div>';
  html += '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px">' + icon('court', 14) + ' ' + escapeHtml(np.courtName || '') +
    (court && court.location ? ' — ' + escapeHtml(court.location) : '') + '</div>';
  if (poll.note) html += '<div style="font-size:13px;margin-top:6px">' + escapeHtml(poll.note) + '</div>';
  html += '</div>';

  // Answers (radio)
  if (isVotable) {
    html += '<div style="font-size:11px;color:var(--text-muted);margin:10px 0 8px">' + t('chooseAnswer') + '</div>';
  }
  html += '<div class="poll-options"' + (isVotable ? '' : ' style="margin-top:10px"') + '>';
  for (var ai = 0; ai < np.answers.length; ai++) {
    var uids = _pollAnswerUids(np, ai);
    var mine = myAnswer === ai;
    html += '<div class="poll-option poll-answer' + (mine ? ' voted' : '') + '"' +
      (isVotable ? ' role="radio" aria-checked="' + mine + '" onclick="respondPoll(\'' + poll.id + '\',' + ai + ')"' : ' style="cursor:default"') + '>';
    html += '<span class="radio-dot' + (mine ? ' on' : '') + '"></span>';
    html += '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">' + escapeHtml(answerLabel(np.answers[ai])) +
      (ai === 0 ? ' <span style="font-size:10px;color:var(--text-muted);font-weight:500">' + t('countsAsJoining') + '</span>' : '') + '</div>';
    if (uids.length) html += '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">' + uids.map(getUserName).join(', ') + '</div>';
    html += '</div>';
    html += '<div class="vote-count" style="font-weight:700;color:' + (ai === 0 && enough ? 'var(--accent)' : 'var(--text-secondary)') + '">' +
      uids.length + (ai === 0 ? '/' + minPlayers : '') + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Joined players
  if (joined.length) {
    html += '<div class="joined-box"><div class="card-title" style="margin-bottom:6px">' + icon("users", 14) + ' ' + t('joinedPlayers') + ' (' + joined.length + ')</div><div class="chips" style="margin-bottom:0">';
    joined.forEach(function (uid) { html += '<div class="chip active avatar-chip">' + avatarHtml(uid, 22) + getUserName(uid) + '</div>'; });
    html += '</div></div>';
  }

  if (isVotable && isCreator) {
    html += '<button class="edit-btn" style="margin-top:10px" onclick="showVoteForOthers(\'' + poll.id + '\')">+ ' + t('addVotesForOthers') + '</button>';
    if (enough) {
      html += '<button class="btn-primary" style="margin-top:10px" onclick="confirmPoll(\'' + poll.id + '\')">' + icon("check", 16) + ' ' +
        t('confirmPlan') + ' (' + joined.length + ' ' + t('playersWord') + ')</button>';
    } else {
      html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + t('needMinPlayers').replace('{n}', minPlayers) + '</div>';
    }
  }

  if (poll.status === 'confirmed' && poll.sessionId) {
    html += '<button class="btn-secondary" style="margin-top:10px" onclick="showSessionDetail(\'' + poll.sessionId + '\')">' + t('openSession') + ' →</button>';
  }

  if (isVotable && isCreator) {
    html += '<button class="btn-danger" style="margin-top:10px;padding:8px;font-size:12px" onclick="cancelPoll(\'' + poll.id + '\')">' + t('cancelPoll') + '</button>';
  }

  html += '</div>';
  return html;
}

/* ---------- Answer a poll (radio: one answer per person; tap again to clear) ---------- */
function respondPoll(pollId, answerIdx) {
  if (!currentUser) return;
  var uid = currentUser.uid;
  var pollRef = fsdb.collection("polls").doc(pollId);

  fsdb.runTransaction(function (transaction) {
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
        // Who voted what, and when (for the notification list)
        var log = data.voteLog || {};
        log[uid] = { a: responses.hasOwnProperty(uid) ? responses[uid] : -1, at: Date.now(), by: uid };
        update.voteLog = log;
        _markReached(data, responses, update);
      } else {
        // Old multi-option poll: answer 0 = vote for its first option
        var votes = data.votes || {};
        var list = (votes[0] || []).filter(function (u) { return u !== uid; });
        if (answerIdx === 0 && (votes[0] || []).indexOf(uid) < 0) list.push(uid);
        votes[0] = list;
        update.votes = votes;
      }
      transaction.update(pollRef, update);
    });
  }).catch(function (error) { showToast(error.message); });
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
        if (data.answers) {
          var before = data.responses || {}, log = data.voteLog || {}, now = Date.now();
          var upd = { responses: chosen };
          var uids = Object.keys(before).concat(Object.keys(chosen));
          uids.forEach(function (u) {
            var a = chosen.hasOwnProperty(u) ? chosen[u] : -1, was = before.hasOwnProperty(u) ? before[u] : -1;
            if (a !== was) log[u] = { a: a, at: now, by: currentUser.uid };
          });
          upd.voteLog = log;
          _markReached(data, chosen, upd);
          transaction.update(pollRef, upd);
        } else {
          var votes = data.votes || {};
          votes[0] = Object.keys(chosen).filter(function (u) { return chosen[u] === 0; });
          transaction.update(pollRef, { votes: votes });
        }
      });
    })
      .then(function () { closeModal(); })
      .catch(function (error) { showToast(error.message); });
  };
  openModal();
}

function _proxyPick(btn, idx) {
  var row = btn.closest(".proxy-row");
  row.setAttribute("data-answer", idx);
  var pills = row.querySelectorAll(".proxy-pill");
  for (var i = 0; i < pills.length; i++) pills[i].classList.toggle("active", pills[i] === btn);
}

/* ---------- Confirm poll (creator only, needs >= minPlayers joining) ---------- */
function confirmPoll(pollId) {
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

      var court = dbFindById(DB_CACHE.courts, np.courtId);
      var sessionRef = fsdb.collection("sessions").doc();
      newSessionId = sessionRef.id;
      transaction.set(sessionRef, {
        pollId: pollId,
        date: np.date || null,
        time: np.time || null,
        duration: np.duration || 2,
        courtId: np.courtId || null,
        courtName: np.courtName || null,
        courtLocation: court ? (court.location || null) : null,
        pricePerHour: court ? (court.pricePerHour || 0) : 0,
        status: 'active',
        players: players,
        calculated: false,
        createdBy: pollData.createdBy || currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(pollRef, { status: 'confirmed', confirmedPlayers: players, sessionId: sessionRef.id, confirmedAt: Date.now() });
    });
  })
    .then(function () {
      showToast(t("planConfirmed") + " ✔");
      if (newSessionId) showSessionDetail(newSessionId);
    })
    .catch(function (error) { showToast(error.message); });
}

/* ---------- Cancel poll ---------- */
function cancelPoll(pollId) {
  if (!confirm(t("cancelPoll") + "?")) return;
  dbUpdatePoll(pollId, { status: 'cancelled' })
    .then(function () { showToast(t("cancelled")); })
    .catch(function (error) { showToast(error.message); });
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
    answers: [t('answerJoin'), t('answerSkip')]
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

  setBreadcrumb([{ label: t("navPolls"), action: "showPage('polls')" }, { label: t("createPoll") }]);
  var html = '<div class="card"><div class="card-title">' + icon("calendar", 14) + ' ' + t('plan') + '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group"><label class="form-label">' + t('date') + '</label>';
  html += '<input type="date" class="form-input" value="' + newPoll.date + '" onchange="newPoll.date=this.value"></div>';
  html += '<div class="form-group"><label class="form-label">' + t('startTime') + '</label>';
  html += '<input type="time" class="form-input" value="' + newPoll.time + '" onchange="newPoll.time=this.value"></div>';
  html += '</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group" style="flex:2"><label class="form-label">' + t('court') + '</label>';
  html += '<select class="form-select" data-cs-type="court" data-cs-onpick="pollPickCourt" onchange="newPoll.courtId=this.value">';
  for (var c = 0; c < courts.length; c++) {
    html += '<option value="' + courts[c].id + '"' + (courts[c].id === newPoll.courtId ? ' selected' : '') + '>' +
      escapeHtml(courts[c].name) + (courts[c].location ? ' — ' + escapeHtml(courts[c].location) : '') + '</option>';
  }
  html += '</select></div>';
  html += '<div class="form-group" style="flex:1"><label class="form-label">' + t('duration') + ' (h)</label>';
  html += '<input type="number" class="form-input" min="0.5" step="0.5" value="' + newPoll.duration + '" onchange="newPoll.duration=parseFloat(this.value)||2"></div>';
  html += '</div>';
  html += '<div class="form-group" style="margin-bottom:0"><label class="form-label">' + t('pollNote') + '</label>';
  html += '<input class="form-input" value="' + escapeHtml(newPoll.note) + '" placeholder="' + t('pollNotePlaceholder') + '" oninput="newPoll.note=this.value"></div>';
  html += '</div>';

  // Answers
  html += '<div class="card"><div class="card-title">' + icon("vote", 14) + ' ' + t('answers') + '</div>';
  for (var i = 0; i < newPoll.answers.length; i++) {
    html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">';
    html += '<span class="radio-dot"></span>';
    html += '<input class="form-input" value="' + escapeHtml(newPoll.answers[i]) + '" oninput="newPoll.answers[' + i + ']=this.value">';
    if (i >= 2) html += '<button class="remove-btn" onclick="newPoll.answers.splice(' + i + ',1);renderPollCreateForm()">&times;</button>';
    html += '</div>';
  }
  html += '<div style="font-size:11px;color:var(--text-muted)">' + t('firstAnswerJoins').replace('{n}', minPlayersSetting()) + '</div>';
  if (newPoll.answers.length < 4) {
    html += '<button class="add-btn-dashed" onclick="newPoll.answers.push(\'\');renderPollCreateForm()">+ ' + t('addAnswer') + '</button>';
  }
  html += '</div>';

  html += '<button class="btn-primary" onclick="submitPoll()">' + t('createPoll') + '</button>';
  container.innerHTML = html;
}

function pollPickCourt(id) {
  if (newPoll) newPoll.courtId = id;
  setTimeout(renderPollCreateForm, 300); // let the court list refresh first
}

function submitPoll() {
  var answers = newPoll.answers.map(function (a) { return (a || '').trim(); });
  if (!newPoll.courtId || !newPoll.date || !newPoll.time) { showToast(t('fillAllOptions')); return; }
  if (answers.length < 2 || answers.some(function (a) { return !a; })) { showToast(t('fillAllFields')); return; }
  var court = dbFindById(DB_CACHE.courts, newPoll.courtId);

  dbCreatePoll({
    createdBy: currentUser.uid,
    status: 'draft',
    note: newPoll.note.trim() || null,
    date: newPoll.date,
    time: newPoll.time,
    duration: newPoll.duration || 2,
    courtId: newPoll.courtId,
    courtName: court ? court.name : '',
    answers: answers,
    responses: {},
    minPlayers: minPlayersSetting(),
    sessionId: null
  })
    .then(function () {
      showToast(t("draftCreated"));
      newPoll = null;
      showPage('polls', false);
      pageHistory = [];
    })
    .catch(function (error) { showToast(error.message); });
}
