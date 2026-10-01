/* ============================================================
   polls.js — Poll creation and voting system
   Firebase Firestore COMPAT SDK (global `firebase` object)
   Depends on: firebase-config.js (fsdb),
               auth.js (currentUser),
               db.js (dbGetCourts, dbGetUsers, dbCreatePoll, dbUpdatePoll),
               app.js (showToast, showPage, goBack, COLORS)
   ============================================================ */

var allCourts = [];
var allUsers = [];
var pollsUnsubscribe = null;
var newPollOptions = [];

/* ---------- Load polls (realtime) ---------- */
function loadPolls() {
  if (pollsUnsubscribe) {
    pollsUnsubscribe();
    pollsUnsubscribe = null;
  }

  dbGetCourts(function (courts) {
    allCourts = courts;
  });

  dbGetUsers(function (users) {
    allUsers = users;
  });

  try {
    pollsUnsubscribe = fsdb.collection("polls")
      .orderBy("createdAt", "desc")
      .onSnapshot(function (snapshot) {
        var polls = [];
        snapshot.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          polls.push(data);
        });
        renderPolls(polls);
      }, function (error) {
        console.error('Polls snapshot error:', error);
        showToast('DB: ' + error.message);
        renderPolls([]);
      });
  } catch (e) {
    console.error('Polls load error:', e);
    showToast('Load error: ' + e.message);
    renderPolls([]);
  }
}

/* ---------- Render polls list ---------- */
function renderPolls(polls) {
  var container = document.getElementById("pollsList");
  if (!container) return;

  if (!polls || polls.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>' +
            '<line x1="16" y1="2" x2="16" y2="6"></line>' +
            '<line x1="8" y1="2" x2="8" y2="6"></line>' +
            '<line x1="3" y1="10" x2="21" y2="10"></line>' +
          '</svg>' +
        '</div>' +
        '<div data-i18n="noPolls">No polls yet</div>' +
        '<div style="margin-top:8px;font-size:13px" data-i18n="createFirstPoll">Create your first poll!</div>' +
      '</div>';
    return;
  }

  var html = '';
  for (var p = 0; p < polls.length; p++) {
    var poll = polls[p];
    var statusClass = poll.status === 'confirmed' ? 'confirmed' : poll.status === 'cancelled' ? 'cancelled' : 'open';
    var statusLabel = poll.status === 'confirmed' ? 'Confirmed' : poll.status === 'cancelled' ? 'Cancelled' : t('pollDraft');
    var isVotable = (poll.status === 'draft' || poll.status === 'open');
    var creatorName = getUserName(poll.createdBy);

    html += '<div class="card poll-card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    html += '<span style="font-size:13px;color:var(--text-secondary)">' + creatorName + '</span>';
    html += '<span class="poll-status-badge poll-status-' + statusClass + '">' + statusLabel + '</span>';
    html += '</div>';

    // Options
    var options = poll.options || [];
    var votes = poll.votes || {};
    for (var oi = 0; oi < options.length; oi++) {
      var opt = options[oi];
      var optionVotes = votes[oi] || [];
      var votedByMe = currentUser && optionVotes.indexOf(currentUser.uid) >= 0;
      var isWinner = poll.status === 'confirmed' && poll.confirmedOption === oi;

      var optClasses = 'poll-option';
      if (votedByMe) optClasses += ' voted';
      if (isWinner) optClasses += ' winner';

      var courtName = opt.courtName || 'No court';

      html += '<div class="' + optClasses + '"';
      if (isVotable) {
        html += ' onclick="toggleVote(\'' + poll.id + '\',' + oi + ')"';
      }
      html += '>';

      html += '<div style="flex:1">';
      html += '<div style="font-size:14px;font-weight:600">' + (opt.date || '') + '</div>';
      html += '<div style="font-size:12px;color:var(--text-muted)">' + (opt.time || '') + (opt.duration ? ' (' + opt.duration + 'h)' : '') + ' &middot; ' + courtName + '</div>';
      html += '</div>';

      // Voter avatars (up to 5)
      html += '<div style="display:flex;align-items:center;gap:6px">';
      html += '<div style="display:flex;margin-right:4px">';
      var maxAvatars = Math.min(optionVotes.length, 5);
      for (var vi = 0; vi < maxAvatars; vi++) {
        var voterName = getUserName(optionVotes[vi]);
        var avatarColor = COLORS[vi % COLORS.length];
        var overlap = vi > 0 ? 'margin-left:-8px;' : '';
        html += '<div style="width:24px;height:24px;border-radius:50%;background:' + avatarColor + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;border:2px solid var(--card);' + overlap + 'position:relative;z-index:' + (5 - vi) + '">' + voterName.charAt(0).toUpperCase() + '</div>';
      }
      html += '</div>';

      // Vote count
      var minPlayers = poll.minPlayers || 4;
      html += '<span style="font-size:12px;color:var(--text-muted)">' + optionVotes.length + '/' + minPlayers + '</span>';
      html += '</div>';

      html += '</div>'; // close poll-option

      if (isVotable && currentUser && poll.createdBy === currentUser.uid && optionVotes.length >= minPlayers) {
        html += '<button class="btn-primary" style="margin:-4px 0 8px;padding:8px;font-size:12px" onclick="confirmPoll(\'' + poll.id + '\',' + oi + ')">\u2714 ' + t('confirmPlan') + ' (' + optionVotes.length + ' ' + t('playersWord') + ')</button>';
      }
    }

    // Cancel button (only for creator, only if open)
    if (isVotable && currentUser && poll.createdBy === currentUser.uid) {
      html += '<button class="btn-danger" style="margin-top:8px;padding:8px;font-size:12px" onclick="cancelPoll(\'' + poll.id + '\')">Cancel Poll</button>';
    }

    html += '</div>'; // close poll-card
  }

  container.innerHTML = html;
}

/* ---------- Get user display name ---------- */
function getUserName(uid) {
  for (var i = 0; i < allUsers.length; i++) {
    if (allUsers[i].uid === uid) {
      return allUsers[i].displayName;
    }
  }
  return uid ? uid.substring(0, 6) : 'Unknown';
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
      if (pollData.status !== 'draft' && pollData.status !== 'open') throw new Error("Poll is no longer open");

      var votes = pollData.votes || {};
      var optionVotes = votes[optionIdx] ? votes[optionIdx].slice() : [];
      var uidIndex = optionVotes.indexOf(uid);
      var isAdding = uidIndex < 0;

      if (isAdding) {
        optionVotes.push(uid);
      } else {
        optionVotes.splice(uidIndex, 1);
      }

      votes[optionIdx] = optionVotes;

      var updateData = { votes: votes };

      transaction.update(pollRef, updateData);
    });
  })
    .then(function () {
      // Success — snapshot listener will update the UI
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ---------- Confirm poll (creator only, needs >= minPlayers) ---------- */
function confirmPoll(pollId, optionIdx) {
  if (!currentUser) return;
  var pollRef = fsdb.collection("polls").doc(pollId);

  fsdb.runTransaction(function (transaction) {
    return transaction.get(pollRef).then(function (pollDoc) {
      if (!pollDoc.exists) throw new Error("Poll not found");
      var pollData = pollDoc.data();
      if (pollData.createdBy !== currentUser.uid) throw new Error(t("onlyCreatorConfirm"));
      if (pollData.status !== 'draft' && pollData.status !== 'open') throw new Error("Poll is no longer open");

      var minPlayers = pollData.minPlayers || 4;
      var optionVotes = ((pollData.votes || {})[optionIdx] || []).slice();
      if (optionVotes.length < minPlayers) throw new Error(t("needMinPlayers").replace("{n}", minPlayers));

      var opt = pollData.options[optionIdx];
      var court = null;
      for (var i = 0; i < allCourts.length; i++) {
        if (allCourts[i].id === opt.courtId) court = allCourts[i];
      }

      var sessionRef = fsdb.collection("sessions").doc();
      transaction.set(sessionRef, {
        pollId: pollId,
        date: opt.date || null,
        time: opt.time || null,
        duration: opt.duration || null,
        courtId: opt.courtId || null,
        courtName: opt.courtName || null,
        courtLocation: court ? (court.location || null) : null,
        status: 'active',
        players: optionVotes,
        payers: null,
        shuttlecocks: [],
        otherCosts: [],
        splits: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(pollRef, {
        status: 'confirmed',
        confirmedOption: optionIdx,
        sessionId: sessionRef.id
      });
    });
  })
    .then(function () { showToast(t("planConfirmed") + " \u2714"); })
    .catch(function (error) { showToast(error.message); });
}

/* ---------- Cancel poll ---------- */
function cancelPoll(pollId) {
  if (!confirm("Cancel this poll?")) return;

  dbUpdatePoll(pollId, { status: 'cancelled' })
    .then(function () {
      showToast("Poll cancelled");
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ---------- Show create poll page ---------- */
function showCreatePoll() {
  var today = new Date().toISOString().split('T')[0];
  newPollOptions = [
    { date: today, time: '18:00', duration: 2, courtId: '', courtName: '' }
  ];
  showPage('poll-create');
  renderPollCreateForm();
}

/* ---------- Render poll creation form ---------- */
function renderPollCreateForm() {
  var container = document.getElementById("pollCreateContent");
  if (!container) return;

  if (allCourts.length === 0) {
    container.innerHTML = '<div class="card"><div class="card-title">' + t('createPoll') + '</div>' +
      '<div class="empty-state" style="padding:20px"><div>' + t('courts') + ' empty</div>' +
      '<div style="font-size:13px;margin-top:8px;color:var(--text-muted)">Add courts in Settings first</div>' +
      '<button class="btn-secondary" style="margin-top:12px" onclick="showPage(\'settings\')">' + t('navSettings') + '</button></div></div>';
    return;
  }

  // Build court select options
  var courtOptionsHtml = '<option value="">Select court...</option>';
  for (var c = 0; c < allCourts.length; c++) {
    var court = allCourts[c];
    var courtId = court.id || court.uid || '';
    var courtLabel = court.name || 'Court';
    courtOptionsHtml += '<option value="' + courtId + '" data-name="' + courtLabel + '">' + courtLabel + '</option>';
  }

  var html = '';
  for (var i = 0; i < newPollOptions.length; i++) {
    var opt = newPollOptions[i];
    html += '<div class="card" style="margin-bottom:10px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div class="card-title" style="margin-bottom:0">Option ' + (i + 1) + '</div>';
    if (newPollOptions.length > 1) {
      html += '<button class="remove-btn" onclick="removePollOption(' + i + ')" style="font-size:14px">&times;</button>';
    }
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group"><label class="form-label">Date</label>';
    html += '<input type="date" class="form-input" value="' + (opt.date || '') + '" onchange="newPollOptions[' + i + '].date=this.value"></div>';
    html += '<div class="form-group"><label class="form-label">Time</label>';
    html += '<input type="time" class="form-input" value="' + (opt.time || '') + '" onchange="newPollOptions[' + i + '].time=this.value"></div>';
    html += '<div class="form-group"><label class="form-label">' + t('duration') + ' (h)</label>';
    html += '<input type="number" class="form-input" min="0.5" step="0.5" value="' + (opt.duration || 2) + '" onchange="newPollOptions[' + i + '].duration=parseFloat(this.value)||2"></div>';
    html += '</div>';

    html += '<div class="form-group"><label class="form-label">Court</label>';
    html += '<select class="form-select" onchange="updatePollOptionCourt(' + i + ',this)">';
    // Insert court options with correct selected state
    html += '<option value="">Select court...</option>';
    for (var c2 = 0; c2 < allCourts.length; c2++) {
      var ct = allCourts[c2];
      var ctId = ct.id || ct.uid || '';
      var ctName = ct.name || 'Court';
      var selected = ctId === opt.courtId ? ' selected' : '';
      html += '<option value="' + ctId + '" data-name="' + ctName + '"' + selected + '>' + ctName + '</option>';
    }
    html += '</select></div>';

    html += '</div>'; // close card
  }

  // Add option button (max 5)
  if (newPollOptions.length < 5) {
    html += '<button class="add-btn-dashed" onclick="addPollOption()">+ Add Option</button>';
  }

  // Submit
  html += '<button class="btn-primary" style="margin-top:12px" onclick="submitPoll()">Create Poll</button>';

  container.innerHTML = html;
}

/* ---------- Add poll option ---------- */
function addPollOption() {
  if (newPollOptions.length >= 5) return;
  var today = new Date().toISOString().split('T')[0];
  newPollOptions.push({ date: today, time: '18:00', duration: 2, courtId: '', courtName: '' });
  renderPollCreateForm();
}

/* ---------- Remove poll option ---------- */
function removePollOption(idx) {
  newPollOptions.splice(idx, 1);
  renderPollCreateForm();
}

/* ---------- Update court selection for a poll option ---------- */
function updatePollOptionCourt(idx, selectEl) {
  var selectedOption = selectEl.options[selectEl.selectedIndex];
  newPollOptions[idx].courtId = selectEl.value;
  newPollOptions[idx].courtName = selectedOption ? (selectedOption.getAttribute('data-name') || '') : '';
}

/* ---------- Submit poll ---------- */
function submitPoll() {
  // Validate all options have a court selected
  for (var i = 0; i < newPollOptions.length; i++) {
    if (!newPollOptions[i].courtId) {
      showToast("Please select a court for all options");
      return;
    }
  }

  var options = [];
  for (var j = 0; j < newPollOptions.length; j++) {
    options.push({
      date: newPollOptions[j].date,
      time: newPollOptions[j].time,
      duration: newPollOptions[j].duration || 2,
      courtId: newPollOptions[j].courtId,
      courtName: newPollOptions[j].courtName
    });
  }

  // Build initial empty votes object (one empty array per option)
  var votes = {};
  for (var k = 0; k < options.length; k++) {
    votes[k] = [];
  }

  var pollData = {
    createdBy: currentUser.uid,
    status: 'draft',
    options: options,
    minPlayers: 4,
    votes: votes,
    confirmedOption: null,
    sessionId: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  dbCreatePoll(pollData)
    .then(function () {
      showToast(t("draftCreated"));
      goBack();
    })
    .catch(function (error) {
      showToast(error.message);
    });
}
