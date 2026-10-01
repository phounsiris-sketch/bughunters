/* ============================================================
   polls.js — Poll creation and voting system
   Lifecycle: draft (everyone can vote) → confirmed by the creator
   once an option has at least `minPlayers` votes → session created.
   Depends on: firebase-config.js (fsdb),
               auth.js (currentUser),
               db.js (DB_CACHE, dbFindById, dbCreatePoll, dbUpdatePoll),
               app.js (showToast, escapeHtml, fmtDate, COLORS),
               router.js (showPage, goBack)
   ============================================================ */

var pollsUnsubscribe = null;
var lastPolls = [];
var newPollOptions = [];
var newPollNote = "";
var MIN_PLAYERS = 4;

/* ---------- Load polls (realtime) ---------- */
function loadPolls() {
  // One listener for the whole signed-in session
  if (!pollsUnsubscribe) {
    pollsUnsubscribe = dbGetPolls(function (polls) {
      lastPolls = polls;
      if (currentPage === "polls") renderPolls(polls);
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
function getUserName(uid) {
  if (!uid) return "";
  var u = dbFindById(DB_CACHE.users, uid);
  if (u && u.displayName) return escapeHtml(u.displayName);
  if (currentUser && uid === currentUser.uid && currentUserProfile && currentUserProfile.displayName) {
    return escapeHtml(currentUserProfile.displayName);
  }
  return "?";
}

/* ---------- Render polls list ---------- */
function renderPolls(polls) {
  var container = document.getElementById("pollsList");
  if (!container) return;

  if (!polls || polls.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">📅</div>' +
        '<div>' + t("noPolls") + '</div>' +
        '<div style="margin-top:8px;font-size:13px">' + t("createFirstPoll") + '</div>' +
        '<button class="btn-primary" style="margin-top:16px" onclick="showCreatePoll()">+ ' + t("createPoll") + '</button>' +
      '</div>';
    return;
  }

  var html = '';
  for (var p = 0; p < polls.length; p++) {
    html += _renderPollCard(polls[p]);
  }
  container.innerHTML = html;
}

function _renderPollCard(poll) {
  var isVotable = (poll.status === 'draft' || poll.status === 'open');
  var isCreator = currentUser && poll.createdBy === currentUser.uid;
  var statusClass = poll.status === 'confirmed' ? 'confirmed' : poll.status === 'cancelled' ? 'cancelled' : 'open';
  var statusLabel = poll.status === 'confirmed' ? t('confirmed') : poll.status === 'cancelled' ? t('cancelled') : t('pollDraft');
  var minPlayers = poll.minPlayers || MIN_PLAYERS;

  var html = '<div class="card poll-card">';
  html += '<div class="poll-header">';
  html += '<span style="font-size:13px;color:var(--text-secondary)">' + t('createdBy') + ' ' + getUserName(poll.createdBy) + '</span>';
  html += '<span class="poll-status ' + statusClass + '">' + statusLabel + '</span>';
  html += '</div>';

  if (poll.note) {
    html += '<div style="font-size:13px;margin-bottom:10px">' + escapeHtml(poll.note) + '</div>';
  }
  if (isVotable) {
    html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">' + t('tapToVote').replace('{n}', minPlayers) + '</div>';
  }

  html += '<div class="poll-options">';
  var options = poll.options || [];
  var votes = poll.votes || {};
  for (var oi = 0; oi < options.length; oi++) {
    var opt = options[oi];
    var optionVotes = votes[oi] || [];
    var votedByMe = currentUser && optionVotes.indexOf(currentUser.uid) >= 0;
    var isWinner = poll.status === 'confirmed' && poll.confirmedOption === oi;
    var court = dbFindById(DB_CACHE.courts, opt.courtId);

    var optClasses = 'poll-option';
    if (votedByMe) optClasses += ' voted';
    if (isWinner) optClasses += ' winner';

    html += '<div class="' + optClasses + '"' + (isVotable ? ' onclick="toggleVote(\'' + poll.id + '\',' + oi + ')"' : ' style="cursor:default"') + '>';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="font-size:14px;font-weight:600">' + (votedByMe ? '✔ ' : '') + fmtDate(opt.date) + ' • ' + escapeHtml(opt.time || '') + (opt.duration ? ' (' + opt.duration + 'h)' : '') + '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted)">📍 ' + escapeHtml(opt.courtName || '') +
      (court && court.location ? ' — ' + escapeHtml(court.location) : '') + '</div>';
    if (optionVotes.length > 0) {
      var names = [];
      for (var vi = 0; vi < optionVotes.length; vi++) names.push(getUserName(optionVotes[vi]));
      html += '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">' + names.join(', ') + '</div>';
    }
    html += '</div>';

    var enough = optionVotes.length >= minPlayers;
    html += '<div class="vote-count" style="font-weight:700;color:' + (enough ? 'var(--accent)' : 'var(--text-secondary)') + '">' +
      optionVotes.length + '/' + minPlayers + '</div>';
    html += '</div>'; // close poll-option

    if (isVotable && isCreator && enough) {
      html += '<button class="btn-primary" style="padding:8px;font-size:12px" onclick="confirmPoll(\'' + poll.id + '\',' + oi + ')">✔ ' +
        t('confirmPlan') + ' (' + optionVotes.length + ' ' + t('playersWord') + ')</button>';
    }
  }
  html += '</div>';

  if (poll.status === 'confirmed' && poll.sessionId) {
    html += '<button class="btn-secondary" style="margin-top:10px" onclick="showSessionDetail(\'' + poll.sessionId + '\')">' + t('openSession') + ' →</button>';
  }

  if (isVotable && isCreator) {
    html += '<button class="btn-danger" style="margin-top:10px;padding:8px;font-size:12px" onclick="cancelPoll(\'' + poll.id + '\')">' + t('cancelPoll') + '</button>';
  }

  html += '</div>';
  return html;
}

/* ---------- Toggle vote (Firestore transaction) ---------- */
function toggleVote(pollId, optionIdx) {
  if (!currentUser) return;
  var uid = currentUser.uid;
  var pollRef = fsdb.collection("polls").doc(pollId);

  fsdb.runTransaction(function (transaction) {
    return transaction.get(pollRef).then(function (pollDoc) {
      if (!pollDoc.exists) throw new Error("Poll not found");

      var pollData = pollDoc.data();
      if (pollData.status !== 'draft' && pollData.status !== 'open') throw new Error(t("pollClosed"));

      var votes = pollData.votes || {};
      var optionVotes = votes[optionIdx] ? votes[optionIdx].slice() : [];
      var uidIndex = optionVotes.indexOf(uid);
      if (uidIndex < 0) optionVotes.push(uid);
      else optionVotes.splice(uidIndex, 1);
      votes[optionIdx] = optionVotes;

      transaction.update(pollRef, { votes: votes });
    });
  }).catch(function (error) {
    showToast(error.message);
  });
}

/* ---------- Confirm poll (creator only, needs >= minPlayers) ---------- */
function confirmPoll(pollId, optionIdx) {
  if (!currentUser) return;
  var pollRef = fsdb.collection("polls").doc(pollId);
  var newSessionId = null;

  fsdb.runTransaction(function (transaction) {
    return transaction.get(pollRef).then(function (pollDoc) {
      if (!pollDoc.exists) throw new Error("Poll not found");
      var pollData = pollDoc.data();
      if (pollData.createdBy !== currentUser.uid) throw new Error(t("onlyCreatorConfirm"));
      if (pollData.status !== 'draft' && pollData.status !== 'open') throw new Error(t("pollClosed"));

      var minPlayers = pollData.minPlayers || MIN_PLAYERS;
      var optionVotes = ((pollData.votes || {})[optionIdx] || []).slice();
      if (optionVotes.length < minPlayers) throw new Error(t("needMinPlayers").replace("{n}", minPlayers));

      var opt = pollData.options[optionIdx];
      var court = dbFindById(DB_CACHE.courts, opt.courtId);

      var sessionRef = fsdb.collection("sessions").doc();
      newSessionId = sessionRef.id;
      transaction.set(sessionRef, {
        pollId: pollId,
        date: opt.date || null,
        time: opt.time || null,
        duration: opt.duration || 2,
        courtId: opt.courtId || null,
        courtName: opt.courtName || null,
        courtLocation: court ? (court.location || null) : null,
        pricePerHour: court ? (court.pricePerHour || 0) : 0,
        status: 'active',
        players: optionVotes,
        calculated: false,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(pollRef, {
        status: 'confirmed',
        confirmedOption: optionIdx,
        sessionId: sessionRef.id
      });
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

/* ---------- Show create poll page ---------- */
function _todayIso() {
  var d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // local date, not UTC
  return d.toISOString().split('T')[0];
}

function _newPollOption() {
  var first = DB_CACHE.courts[0];
  return {
    date: _todayIso(),
    time: '18:00',
    duration: 2,
    courtId: first ? first.id : '',
    courtName: first ? first.name : ''
  };
}

function showCreatePoll() {
  newPollOptions = [_newPollOption()];
  newPollNote = "";
  showPage('poll-create');
  renderPollCreateForm();
}

/* ---------- Render poll creation form ---------- */
function renderPollCreateForm() {
  var container = document.getElementById("pollCreateContent");
  if (!container) return;

  var courts = DB_CACHE.courts;
  if (courts.length === 0) {
    container.innerHTML = '<div class="card"><div class="card-title">' + t('createPoll') + '</div>' +
      '<div class="empty-state" style="padding:20px"><div>' + t('noCourtsYet') + '</div>' +
      '<button class="btn-secondary" style="margin-top:12px" onclick="settingsTab=\'courts\';showPage(\'settings\')">' + t('navSettings') + ' → ' + t('tabCourts') + '</button></div></div>';
    return;
  }

  // Fill in a court for options created before courts finished loading
  for (var f = 0; f < newPollOptions.length; f++) {
    if (!newPollOptions[f].courtId) {
      newPollOptions[f].courtId = courts[0].id;
      newPollOptions[f].courtName = courts[0].name;
    }
  }

  var html = '<div class="card"><div class="form-group" style="margin-bottom:0">' +
    '<label class="form-label">' + t('pollNote') + '</label>' +
    '<input class="form-input" value="' + escapeHtml(newPollNote) + '" placeholder="' + t('pollNotePlaceholder') + '" oninput="newPollNote=this.value"></div></div>';

  for (var i = 0; i < newPollOptions.length; i++) {
    var opt = newPollOptions[i];
    html += '<div class="card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div class="card-title" style="margin-bottom:0">' + t('option') + ' ' + (i + 1) + '</div>';
    if (newPollOptions.length > 1) {
      html += '<button class="remove-btn" onclick="removePollOption(' + i + ')">&times;</button>';
    }
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">' + t('date') + '</label>';
    html += '<input type="date" class="form-input" value="' + (opt.date || '') + '" onchange="newPollOptions[' + i + '].date=this.value"></div>';
    html += '<div class="form-group"><label class="form-label">' + t('startTime') + '</label>';
    html += '<input type="time" class="form-input" value="' + (opt.time || '') + '" onchange="newPollOptions[' + i + '].time=this.value"></div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group" style="flex:2"><label class="form-label">' + t('court') + '</label>';
    html += '<select class="form-select" onchange="updatePollOptionCourt(' + i + ',this)">';
    for (var c = 0; c < courts.length; c++) {
      var ct = courts[c];
      html += '<option value="' + ct.id + '"' + (ct.id === opt.courtId ? ' selected' : '') + '>' +
        escapeHtml(ct.name) + (ct.location ? ' — ' + escapeHtml(ct.location) : '') + '</option>';
    }
    html += '</select></div>';
    html += '<div class="form-group" style="flex:1"><label class="form-label">' + t('duration') + ' (h)</label>';
    html += '<input type="number" class="form-input" min="0.5" step="0.5" value="' + (opt.duration || 2) + '" onchange="newPollOptions[' + i + '].duration=parseFloat(this.value)||2"></div>';
    html += '</div>';

    html += '</div>'; // close card
  }

  if (newPollOptions.length < 5) {
    html += '<button class="add-btn-dashed" onclick="addPollOption()">+ ' + t('addOption') + '</button>';
  }

  html += '<button class="btn-primary" style="margin-top:12px" onclick="submitPoll()">' + t('createPoll') + '</button>';
  container.innerHTML = html;
}

function addPollOption() {
  if (newPollOptions.length >= 5) return;
  var last = newPollOptions[newPollOptions.length - 1];
  var opt = _newPollOption();
  if (last) { opt.time = last.time; opt.duration = last.duration; opt.courtId = last.courtId; opt.courtName = last.courtName; }
  newPollOptions.push(opt);
  renderPollCreateForm();
}

function removePollOption(idx) {
  newPollOptions.splice(idx, 1);
  renderPollCreateForm();
}

function updatePollOptionCourt(idx, selectEl) {
  var court = dbFindById(DB_CACHE.courts, selectEl.value);
  newPollOptions[idx].courtId = selectEl.value;
  newPollOptions[idx].courtName = court ? court.name : '';
}

/* ---------- Submit poll ---------- */
function submitPoll() {
  var options = [];
  for (var j = 0; j < newPollOptions.length; j++) {
    var o = newPollOptions[j];
    if (!o.courtId || !o.date || !o.time) {
      showToast(t('fillAllOptions'));
      return;
    }
    options.push({
      date: o.date,
      time: o.time,
      duration: o.duration || 2,
      courtId: o.courtId,
      courtName: o.courtName
    });
  }

  var votes = {};
  for (var k = 0; k < options.length; k++) votes[k] = [];

  dbCreatePoll({
    createdBy: currentUser.uid,
    status: 'draft',
    note: newPollNote.trim() || null,
    options: options,
    minPlayers: MIN_PLAYERS,
    votes: votes,
    confirmedOption: null,
    sessionId: null
  })
    .then(function () {
      showToast(t("draftCreated"));
      showPage('polls', false);
      pageHistory = [];
    })
    .catch(function (error) { showToast(error.message); });
}
