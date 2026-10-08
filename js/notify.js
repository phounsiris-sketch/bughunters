/* ============================================================
   notify.js — In-app notifications (no server needed).
   Events are derived from data the app already listens to.
   Two categories, coloured differently in the list:
     Notifications (blue)  — newPoll, confirmed, billReady, paidToYou
     Reminders (amber)     — payReminder (daily from 9:00 until paid),
                             gameSoon (from 1 hour before a game)
   The bell shows events newer than the last time you opened it; the
   list keeps history (scroll), and items can be deleted one by one or
   all at once (stored per device). Tab badges show what is waiting.
   ============================================================ */

function _seenKey() { return "notifSeen_" + (currentUser ? currentUser.uid : ""); }

function _lastSeen() {
  try { return parseInt(localStorage.getItem(_seenKey()), 10) || 0; } catch (e) { return 0; }
}

function _tsOf(x) {
  if (!x) return 0;
  if (typeof x === "number") return x;
  if (typeof x.toDate === "function") return x.toDate().getTime();
  return 0;
}

/* ---------- Deleted items (per device) ---------- */
function _hideKey() { return "notifHidden_" + (currentUser ? currentUser.uid : ""); }
function _hidden() {
  try { return JSON.parse(localStorage.getItem(_hideKey())) || { ids: [], before: 0 }; } catch (e) { return { ids: [], before: 0 }; }
}
function _saveHidden(h) {
  h.ids = h.ids.slice(-300);
  try { localStorage.setItem(_hideKey(), JSON.stringify(h)); } catch (e) {}
}
function _isHidden(ev, h) { return ev.time <= h.before || h.ids.indexOf(ev.id) >= 0; }

/* Bangkok / Vientiane time (UTC+7) helpers */
var _TZ_MS = 7 * 3600e3;
/** Today 9:00 Bangkok time, in ms */
function _today9() {
  var local = new Date(Date.now() + _TZ_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 9) - _TZ_MS;
}
/** Session start in ms (date + time are Bangkok time) */
function sessionStartMs(s) {
  if (!s || !s.date || !s.time) return 0;
  var d = s.date.split("-").map(Number), tm = s.time.split(":").map(Number);
  if (!d[0] || isNaN(tm[0])) return 0;
  return Date.UTC(d[0], d[1] - 1, d[2], tm[0], tm[1] || 0) - _TZ_MS;
}

/** All events for the signed-in user (not deleted), newest first */
function computeNotifications() {
  var me = currentUser ? currentUser.uid : null;
  if (!me) return [];
  var events = [];
  var now = Date.now();

  (typeof lastPolls !== "undefined" ? lastPolls : []).forEach(function (p) {
    var np = normalizePoll(p);
    var answered = np.responses.hasOwnProperty(me);
    if ((p.status === "draft" || p.status === "open") && !isPollArchived(p) && !answered) {
      events.push({ id: "poll_" + p.id, cat: "notif", type: "newPoll", time: _tsOf(p.createdAt), icon: "polls",
        text: t("nNewPoll").replace("{name}", getUserName(p.createdBy)).replace("{date}", fmtDate(np.date)),
        action: "showPage('polls')" });
    }
    // Votes: who answered what — everyone sees it, always the latest answer
    var open = (p.status === "draft" || p.status === "open") && !isPollArchived(p);
    var min = parseInt(p.minPlayers, 10) || minPlayersSetting();
    var joins = Object.keys(np.responses).filter(function (u) { return np.responses[u] === 0; }).length;
    if (p.voteLog) {      // everyone sees vote activity (engagement period)
      Object.keys(p.voteLog).forEach(function (voter) {
        var v = p.voteLog[voter];
        if (!v || voter === me || v.by === me || !v.at) return;
        var what = v.a === 0 ? t("nVotedJoin") : v.a === -1 ? t("nVoteCleared") : t("nVotedSkip").replace("{answer}", answerLabel(np.answers[v.a] || ""));
        var text = (v.by && v.by !== voter
          ? t("nVotedFor").replace("{by}", getUserName(v.by)).replace("{name}", getUserName(voter)).replace("{what}", what)
          : t("nVoted").replace("{name}", getUserName(voter)).replace("{what}", what)) +
          ' · ' + fmtDate(np.date) + (open ? ' · ' + joins + '/' + min : '');
        events.push({ id: "vote_" + p.id + "_" + voter + "_" + v.at, cat: "notif", type: v.a === 0 ? "voteJoin" : "voteOther",
          time: v.at, icon: "vote", text: text, action: "showPage('polls')" });
      });
    }
    // Result: enough players joined
    if (p.reachedAt) {
      events.push({ id: "full_" + p.id, cat: "notif", type: "pollFull", time: p.reachedAt, icon: "users",
        text: (p.createdBy === me && open ? t("nPollFullCreator") : t("nPollFull"))
          .replace("{date}", fmtDate(np.date)).replace("{n}", joins).replace("{min}", min),
        action: "showPage('polls')" });
    }
    // Voting deadline: reminder 3 h before (if I haven't answered) and "closed"
    var closesAt = pollClosesAt(p);
    if (open && closesAt) {
      if (!np.responses.hasOwnProperty(me) && now >= closesAt - 3 * 3600e3 && now < closesAt) {
        events.push({ id: "closing_" + p.id, cat: "remind", type: "closeSoon", time: closesAt - 3 * 3600e3, icon: "clock",
          text: t("nCloseSoon").replace("{left}", fmtTimeLeft(closesAt - now)).replace("{date}", fmtDate(np.date)).replace("{court}", escapeHtml(np.courtName || "")),
          action: "showPage('polls')" });
      }
      if (now >= closesAt && (p.createdBy === me || np.responses.hasOwnProperty(me))) {
        events.push({ id: "closed_" + p.id, cat: "notif", type: "closed", time: closesAt, icon: "lock",
          text: (p.createdBy === me ? t("nClosedCreator") : t("nClosed")).replace("{date}", fmtDate(np.date)).replace("{n}", joins).replace("{min}", min),
          action: "showPage('polls')" });
      }
    }
    if (p.status === "confirmed" && np.responses[me] === 0) {
      events.push({ id: "conf_" + p.id, cat: "notif", type: "confirmed", time: _tsOf(p.confirmedAt) || _tsOf(p.createdAt), icon: "check",
        text: t("nConfirmed").replace("{date}", fmtDate(np.date)).replace("{court}", escapeHtml(np.courtName || "")),
        action: p.sessionId ? "showSessionDetail('" + p.sessionId + "')" : "showPage('polls')" });
    }
    // Plan cancelled (voting closed early) — everyone who answered
    if (p.status === "cancelled" && p.cancelledAt && np.responses.hasOwnProperty(me) && (p.cancelledBy || p.createdBy) !== me) {
      events.push({ id: "cancel_" + p.id, cat: "notif", type: "cancelled", time: p.cancelledAt, icon: "close",
        text: t("nCancelled").replace("{name}", getUserName(p.cancelledBy || p.createdBy)).replace("{date}", fmtDate(np.date)).replace("{court}", escapeHtml(np.courtName || "")),
        action: "showPage('polls')" });
    }
  });

  // Join requests waiting for me (group admins)
  if (typeof GROUPS_ON !== "undefined" && GROUPS_ON && currentGroup && isGroupAdminMe()) {
    groupMembers.forEach(function (m) {
      if (m.status !== "pending") return;
      events.push({ id: "req_" + m.id, cat: "notif", type: "joinRequest", time: m.joinedAt || now, icon: "users",
        text: t("nJoinRequest").replace("{name}", getUserName(m.uid)).replace("{group}", escapeHtml(currentGroup.name)),
        action: "showPage('group-members')" });
    });
  }

  var owe = {}, oweLatest = 0; // to -> amount still unpaid
  (typeof lastSessions !== "undefined" ? lastSessions : []).forEach(function (s) {
    // Reminder: my game starts within the hour
    var start = sessionStartMs(s);
    if (start && (s.players || []).indexOf(me) >= 0 && now >= start - 3600e3 && now < start) {
      events.push({ id: "soon_" + s.id, cat: "remind", type: "gameSoon", time: start - 3600e3, icon: "clock",
        text: t("nGameSoon").replace("{time}", escapeHtml(s.time || "")).replace("{court}", escapeHtml(s.courtName || "")),
        action: "showSessionDetail('" + s.id + "')" });
    }
    if (!s.calculated) return;
    var L = computeLedger(s);
    var involved = (s.players || []).indexOf(me) >= 0 || L.shares[me];
    if (involved && s.billAt) {
      var mine = L.transfers.filter(function (tr) { return tr.from === me; }).reduce(function (a, tr) { return a + tr.amount; }, 0);
      events.push({ id: "bill_" + s.id, cat: "notif", type: "billReady", time: _tsOf(s.billAt), icon: "sessions",
        text: (mine ? t("nBillOwe").replace("{amount}", fmtLAK(mine)) : t("nBillNothing")) + " • " + fmtDate(s.date),
        action: "showSessionDetail('" + s.id + "')" });
    }
    var at = s.settledAt || {}, settled = s.settled || {};
    L.transfers.forEach(function (tr) {
      if (tr.to === me && settled[tr.key] && at[tr.key]) {
        events.push({ id: "paid_" + s.id + "_" + tr.key, cat: "notif", type: "paidToYou", time: _tsOf(at[tr.key]), icon: "wallet",
          text: t("nPaidToYou").replace("{name}", getUserName(tr.from)).replace("{amount}", fmtLAK(tr.amount)),
          action: "showSessionDetail('" + s.id + "')" });
      }
      if (tr.from === me && !settled[tr.key]) {
        owe[tr.to] = (owe[tr.to] || 0) + tr.amount;
        oweLatest = Math.max(oweLatest, _tsOf(s.billAt));
      }
    });
  });

  // Reminder: what I still owe, renewed every morning at 9:00 until paid
  var nine = _today9(), day = new Date(nine + _TZ_MS).toISOString().slice(0, 10);
  var remindAt = now >= nine ? nine : nine - 86400e3;
  Object.keys(owe).forEach(function (to) {
    events.push({ id: "owe_" + to + "_" + day, cat: "remind", type: "payReminder", time: Math.max(remindAt, oweLatest), icon: "wallet",
      text: t("nOweReminder").replace("{name}", getUserName(to)).replace("{amount}", fmtLAK(owe[to])),
      action: "showPage('payments')" });
  });

  var h = _hidden();
  events = events.filter(function (ev) { return !_isHidden(ev, h); });
  events.sort(function (a, b) { return b.time - a.time; });
  return events.slice(0, 100);
}

/** Refresh the bell and the tab badges */
function updateNotifications() {
  if (!currentUser) return;
  var seen = _lastSeen();
  var events = computeNotifications();
  var unread = events.filter(function (e) { return e.time > seen; }).length;
  _setBadge("bellBadge", unread);

  // Tab badges: things waiting for you
  var me = currentUser.uid;
  var toAnswer = (typeof lastPolls !== "undefined" ? lastPolls : []).filter(function (p) {
    return (p.status === "draft" || p.status === "open") && !isPollArchived(p) && !normalizePoll(p).responses.hasOwnProperty(me);
  }).length;
  var toPay = 0;
  (typeof lastSessions !== "undefined" ? lastSessions : []).forEach(function (s) {
    toPay += openTransfers(s).filter(function (tr) { return tr.from === me; }).length;
  });
  _setBadge("navBadge-polls", toAnswer);
  _setBadge("navBadge-sessions", toPay);

  var panel = document.getElementById("notifPanel");
  if (panel && panel.classList.contains("open")) _renderNotifPanel(events, seen);
}

function _setBadge(id, n) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = n > 9 ? "9+" : String(n);
  el.style.display = n > 0 ? "" : "none";
}

var notifFilter = "all"; // all | remind | notif

function toggleNotifications(e) {
  if (e) e.stopPropagation();
  var panel = document.getElementById("notifPanel");
  if (!panel) return;
  if (panel.classList.contains("open")) { panel.classList.remove("open"); return; }
  var seen = _lastSeen();
  _renderNotifPanel(computeNotifications(), seen);
  panel.classList.add("open");
  try { localStorage.setItem(_seenKey(), String(Date.now())); } catch (err) {}
  _setBadge("bellBadge", 0);
}

function setNotifFilter(f, e) {
  if (e) e.stopPropagation();
  notifFilter = f;
  _renderNotifPanel(computeNotifications(), _lastSeen());
}

/** Delete one item from the list */
function dismissNotif(id, e) {
  if (e) e.stopPropagation();
  var h = _hidden();
  if (h.ids.indexOf(id) < 0) h.ids.push(id);
  _saveHidden(h);
  _renderNotifPanel(computeNotifications(), _lastSeen());
  updateNotifications();
}

/** Delete everything currently in the list */
function clearAllNotifs(e) {
  if (e) e.stopPropagation();
  var h = _hidden();
  h.before = Date.now();
  h.ids = [];
  _saveHidden(h);
  _renderNotifPanel(computeNotifications(), _lastSeen());
  updateNotifications();
}

function openNotif(i) {
  var ev = (_notifShown || [])[i];
  document.getElementById("notifPanel").classList.remove("open");
  if (ev) (new Function(ev.action))();
}

var _notifShown = [];
function _renderNotifPanel(events, seen) {
  var panel = document.getElementById("notifPanel");
  var counts = { all: events.length, remind: 0, notif: 0 };
  events.forEach(function (ev) { counts[ev.cat]++; });
  var list = events.filter(function (ev) { return notifFilter === "all" || ev.cat === notifFilter; });
  _notifShown = list;

  var html = '<div class="notif-head"><span>' + t("notifications") + '</span>' +
    (events.length ? '<button class="notif-clear" onclick="clearAllNotifs(event)">' + icon("trash", 14) + ' ' + t("clearAll") + '</button>' : '') + '</div>';
  html += '<div class="notif-filters">' + [["all", t("allWord")], ["remind", t("reminders")], ["notif", t("notificationsWord")]].map(function (f) {
    return '<button class="notif-chip c-' + f[0] + (notifFilter === f[0] ? ' active' : '') + '" onclick="setNotifFilter(\'' + f[0] + '\',event)">' + f[1] + ' <b>' + counts[f[0]] + '</b></button>';
  }).join('') + '</div>';
  html += '<div class="notif-list">';
  if (!list.length) html += '<div class="notif-empty">' + t("noNotifications") + '</div>';
  list.forEach(function (ev, i) {
    html += '<div class="notif-item cat-' + ev.cat + (ev.time > seen ? ' unread' : '') + '" role="button" tabindex="0" onclick="openNotif(' + i + ')">' +
      '<span class="notif-icon">' + icon(ev.icon, 18) + '</span>' +
      '<span class="notif-text"><span class="notif-tag">' + (ev.cat === "remind" ? t("reminderTag") : t("notificationTag")) + '</span>' + ev.text +
      '<span class="notif-time">' + _timeAgo(ev.time) + '</span></span>' +
      '<button class="notif-del" aria-label="' + t("delete") + '" onclick="dismissNotif(\'' + ev.id + '\',event)">' + icon("close", 18) + '</button></div>';
  });
  html += '</div>';
  panel.innerHTML = html;
}

function _timeAgo(ms) {
  if (!ms) return "";
  var s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return t("justNow");
  if (s < 3600) return Math.round(s / 60) + " " + t("minAgo");
  if (s < 86400) return Math.round(s / 3600) + " " + t("hAgo");
  return Math.round(s / 86400) + " " + t("dAgo");
}

document.addEventListener("click", function (e) {
  var panel = document.getElementById("notifPanel");
  if (panel && panel.classList.contains("open") && !panel.contains(e.target)) panel.classList.remove("open");
});
