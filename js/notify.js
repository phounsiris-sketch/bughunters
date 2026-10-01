/* ============================================================
   notify.js — In-app notifications (no server needed).
   Events are derived from data the app already listens to:
     newPoll    — a poll you haven't answered yet
     confirmed  — a plan you joined was confirmed
     billReady  — the bill of a session you played is ready
     paidToYou  — someone's payment to you was marked paid
   The bell shows events newer than the last time you opened it;
   tab badges show what is waiting for you (unanswered polls,
   payments you still owe).
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

/** All events for the signed-in user, newest first */
function computeNotifications() {
  var me = currentUser ? currentUser.uid : null;
  if (!me) return [];
  var events = [];

  (typeof lastPolls !== "undefined" ? lastPolls : []).forEach(function (p) {
    var np = normalizePoll(p);
    var answered = np.responses.hasOwnProperty(me);
    if ((p.status === "draft" || p.status === "open") && !isPollArchived(p) && !answered) {
      events.push({ type: "newPoll", time: _tsOf(p.createdAt), icon: "polls",
        text: t("nNewPoll").replace("{name}", getUserName(p.createdBy)).replace("{date}", fmtDate(np.date)),
        action: "showPage('polls')" });
    }
    if (p.status === "confirmed" && np.responses[me] === 0) {
      events.push({ type: "confirmed", time: _tsOf(p.confirmedAt) || _tsOf(p.createdAt), icon: "check",
        text: t("nConfirmed").replace("{date}", fmtDate(np.date)).replace("{court}", escapeHtml(np.courtName || "")),
        action: p.sessionId ? "showSessionDetail('" + p.sessionId + "')" : "showPage('polls')" });
    }
  });

  (typeof lastSessions !== "undefined" ? lastSessions : []).forEach(function (s) {
    if (!s.calculated) return;
    var L = computeLedger(s);
    var involved = (s.players || []).indexOf(me) >= 0 || L.shares[me];
    if (involved && s.billAt) {
      var mine = L.transfers.filter(function (tr) { return tr.from === me; }).reduce(function (a, tr) { return a + tr.amount; }, 0);
      events.push({ type: "billReady", time: _tsOf(s.billAt), icon: "sessions",
        text: (mine ? t("nBillOwe").replace("{amount}", fmtLAK(mine)) : t("nBillNothing")) + " • " + fmtDate(s.date),
        action: "showSessionDetail('" + s.id + "')" });
    }
    var at = s.settledAt || {};
    L.transfers.forEach(function (tr) {
      if (tr.to === me && (s.settled || {})[tr.key] && at[tr.key]) {
        events.push({ type: "paidToYou", time: _tsOf(at[tr.key]), icon: "wallet",
          text: t("nPaidToYou").replace("{name}", getUserName(tr.from)).replace("{amount}", fmtLAK(tr.amount)),
          action: "showSessionDetail('" + s.id + "')" });
      }
    });
  });

  events.sort(function (a, b) { return b.time - a.time; });
  return events.slice(0, 40);
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

function _renderNotifPanel(events, seen) {
  var panel = document.getElementById("notifPanel");
  var html = '<div class="notif-head">' + t("notifications") + '</div>';
  if (!events.length) html += '<div class="notif-empty">' + t("noNotifications") + '</div>';
  events.forEach(function (ev) {
    html += '<button class="notif-item' + (ev.time > seen ? ' unread' : '') + '" onclick="document.getElementById(\'notifPanel\').classList.remove(\'open\');' + ev.action.replace(/"/g, "&quot;") + '">' +
      '<span class="notif-icon n-' + ev.type + '">' + icon(ev.icon, 18) + '</span>' +
      '<span class="notif-text">' + ev.text + '<span class="notif-time">' + _timeAgo(ev.time) + '</span></span></button>';
  });
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
