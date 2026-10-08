/* ============================================================
   router.js — Page navigation system
   ============================================================ */

var currentPage = "dashboard";
var pageHistory = [];

/**
 * Show a page by id and update navigation state
 * @param {string} page  — page element id (without the '-page' suffix handled by convention)
 * @param {boolean} pushHistory — whether to record in history stack (default true)
 */
// Private pages need a current group (after the move to groups)
var GROUP_PAGES = /^(polls|sessions|dashboard|payments|config|session-detail|session-create|poll-create|group-settings|group-members|stats|matches|match-record)$/;
var PUBLIC_PAGES = /^(public|game-create|game-detail)$/;

/** Header button with my picture (opens My profile) */
function updateMeBtn() {
  var b = document.getElementById("meBtn");
  if (!b) return;
  if (typeof currentUser === "undefined" || !currentUser) { b.style.display = "none"; return; }
  b.style.display = "";
  b.innerHTML = avatarHtml(currentUser.uid, 30);
}

function showPage(page, pushHistory) {
  if (typeof pushHistory === "undefined") pushHistory = true;
  if (typeof GROUPS_ON !== "undefined" && GROUPS_ON && !currentGroupId && GROUP_PAGES.test(page)) page = "groups";

  // Push current page to history before switching
  if (pushHistory && currentPage && currentPage !== page) {
    pageHistory.push(currentPage);
  }

  currentPage = page;

  // Hide all page sections
  var pages = document.querySelectorAll(".page");
  for (var i = 0; i < pages.length; i++) {
    pages[i].classList.remove("active");
  }

  // Show target page
  var target = document.getElementById("page-" + page);
  if (target) {
    target.classList.add("active");
  }

  // Update bottom nav active state
  var navItems = document.querySelectorAll(".nav-item");
  for (var j = 0; j < navItems.length; j++) {
    navItems[j].classList.remove("active");
  }
  var navOf = { "session-create": "sessions", "poll-create": "polls", "game-create": "public", "game-detail": "public", "matches": "sessions", "match-record": "sessions" };
  var activeNav = document.getElementById("nav-" + (navOf[page] || page));
  if (activeNav) activeNav.classList.add("active");
  // Settings lives behind the gear in the header
  var gear = document.getElementById("gearBtn");
  if (gear) gear.classList.toggle("on", /^(settings|config|trash|group-settings|group-members)$/.test(page));
  // My profile: my own picture, right next to the bell
  updateMeBtn();
  var meBtn = document.getElementById("meBtn");
  if (meBtn) meBtn.classList.toggle("on", page === "profile");
  // Public zone: its own header colour and a reminder that everyone can see it
  document.body.classList.toggle("zone-public", PUBLIC_PAGES.test(page));

  // Floating + button: new poll (Polls, Dashboard) or new session (Sessions)
  var fab = document.getElementById("fab");
  if (fab) {
    var fabSession = page === "sessions";
    var fabGame = page === "public" && typeof publicTab !== "undefined" && publicTab === "games";
    fab.style.display = (page === "polls" || page === "dashboard" || fabSession || fabGame) ? "" : "none"; // everyone can create
    var fabLabel = fabGame ? "newPublicGame" : fabSession ? "newSession" : "createPoll";
    fab.setAttribute("aria-label", t(fabLabel));
    fab.title = t(fabLabel);
    fab.onclick = fabGame ? function () { showPage("game-create"); } : fabSession ? function () { createAdHocSession(); } : function () { showCreatePoll(); };
  }

  // Each page sets its breadcrumb when it renders; start from the top level
  setBreadcrumb(null);

  // Trigger page-specific load callbacks (guard with typeof)
  if (page === "polls" && typeof loadPolls === "function") {
    loadPolls();
  } else if (page === "sessions" && typeof loadSessions === "function") {
    loadSessions();
  } else if (page === "dashboard" && typeof loadDashboard === "function") {
    loadDashboard();
  } else if (page === "payments" && typeof loadPayments === "function") {
    loadPayments();
  } else if ((page === "settings" || page === "profile") && typeof loadSettings === "function") {
    loadSettings();
  } else if (page === "config" && typeof loadConfig === "function") {
    loadConfig();
  } else if (page === "trash" && typeof loadTrash === "function") {
    loadTrash();
  } else if (page === "user" && typeof loadUserProfile === "function") {
    loadUserProfile();
  } else if (page === "groups") {
    loadGroupsPage();
  } else if (page === "group-create") {
    loadGroupCreate();
  } else if (page === "group-settings") {
    loadGroupSettings();
  } else if (page === "group-members") {
    loadGroupMembers();
  } else if (page === "public" && typeof loadPublic === "function") {
    loadPublic();
  } else if (page === "game-create" && typeof loadGameCreate === "function") {
    loadGameCreate();
  } else if (page === "stats" && typeof loadStats === "function") {
    loadStats();
  } else if (page === "matches" && typeof loadMatchesPage === "function") {
    loadMatchesPage();
  } else if (page === "match-record" && typeof loadMatchRecord === "function") {
    loadMatchRecord();
  }
}

/**
 * Navigate back one step in history
 */
function goBack() {
  if (pageHistory.length > 0) {
    var prev = pageHistory.pop();
    showPage(prev, false);
  } else {
    showPage("dashboard", false);
  }
}

/**
 * Show the authentication container, hide the app
 */
var _splashStart = Date.now();

/** Fade the splash out (kept at least ~0.6s so it doesn't flash) */
function hideSplash() {
  var el = document.getElementById("splash");
  if (!el || el.classList.contains("hide")) return;
  var wait = Math.max(0, 600 - (Date.now() - _splashStart));
  setTimeout(function () { el.classList.add("hide"); }, wait);
}

function showAuthPage() {
  hideSplash();
  var authC = document.getElementById("auth-container");
  var appC = document.getElementById("app-container");

  if (authC) authC.style.display = "";
  if (appC) appC.style.display = "none";
}

/**
 * Show the app container, hide auth, and navigate to polls
 */
function showAppPage() {
  hideSplash();
  var authC = document.getElementById("auth-container");
  var appC = document.getElementById("app-container");

  if (authC) authC.style.display = "none";
  if (appC) appC.style.display = "";

  showPage("dashboard"); // land on the dashboard after login
}

/* ──────────────────────────────────────────────────────────
   Breadcrumb + Back
   items: [{ label, action }] — `action` is JS run when that crumb is
   tapped; the last item is the current page. null/1 item hides it.
   ────────────────────────────────────────────────────────── */

var _crumbs = [];

function setBreadcrumb(items) {
  _crumbs = items || [];
  var bar = document.getElementById("breadcrumb");
  var backBtn = document.getElementById("backBtn");
  var show = _crumbs.length > 1;
  if (backBtn) backBtn.style.display = show ? "" : "none";
  if (!bar) return;
  bar.style.display = show ? "" : "none";
  if (!show) { bar.innerHTML = ""; return; }
  var html = "";
  for (var i = 0; i < _crumbs.length; i++) {
    var last = i === _crumbs.length - 1;
    if (i > 0) html += '<span class="crumb-sep">' + icon("chevron", 12) + '</span>';
    html += last
      ? '<span class="crumb current">' + _crumbs[i].label + '</span>'
      : '<button class="crumb" onclick="crumbGo(' + i + ')">' + _crumbs[i].label + '</button>';
  }
  bar.innerHTML = html;
}

function crumbGo(i) {
  var c = _crumbs[i];
  if (c && c.action) (new Function(c.action))();
}

/** Header back arrow: one level up the breadcrumb, else history */
function crumbBack() {
  if (_crumbs.length > 1) crumbGo(_crumbs.length - 2);
  else goBack();
}
