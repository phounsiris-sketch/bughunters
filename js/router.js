/* ============================================================
   router.js — Page navigation system
   ============================================================ */

var currentPage = "";  // set by the first showPage()
var pageHistory = [];

/**
 * Show a page by id and update navigation state
 * @param {string} page  — page element id (without the '-page' suffix handled by convention)
 * @param {boolean} pushHistory — whether to record in history stack (default true)
 */
// Private pages need a current group (after the move to groups)
var GROUP_PAGES = /^(home|games|polls|sessions|dashboard|payments|config|session-detail|session-create|poll-create|group-settings|group-members|stats|matches|matches-all|match-record|reports|health|workout)$/;
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
  if (typeof uiMotionReset === "function" && page !== currentPage) uiMotionReset();
  if (typeof pushHistory === "undefined") pushHistory = true;
  if (typeof GROUPS_ON !== "undefined" && GROUPS_ON && !currentGroupId && GROUP_PAGES.test(page)) page = "groups";

  // Push current page to history before switching
  if (pushHistory && currentPage && currentPage !== page) {
    pageHistory.push(currentPage);
    // One browser history entry per step, so the browser's back button goes back one step
    try { history.pushState({ n: pageHistory.length }, ""); } catch (e) {}
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
    navItems[j].removeAttribute("aria-current");
  }
  var navOf = { "home": "dashboard", "health": "dashboard", "workout": "dashboard", "polls": "games", "sessions": "games", "session-detail": "games", "session-create": "games", "poll-create": "games", "settings": "settings", "config": "settings", "trash": "settings", "group-settings": "settings", "group-members": "settings", "groups": "settings", "reports": "settings", "game-create": "public", "game-detail": "public", "matches": "games", "match-record": "games" };
  var activeNav = document.getElementById("nav-" + (navOf[page] || page));
  if (activeNav) { activeNav.classList.add("active"); activeNav.setAttribute("aria-current", "page"); }
  positionNavHump(false);
  if (typeof applyChromeIcons === "function") applyChromeIcons();   // nav bar + app bar icons follow the chosen icon style
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
    var fabGames = page === "games";
    fab.style.display = (page === "polls" || page === "dashboard" || fabSession || fabGame || fabGames) ? "" : "none"; // everyone can create
    var fabLabel = fabGame ? "newPublicGame" : fabSession ? "newSession" : "createPoll";
    fab.setAttribute("aria-label", t(fabLabel));
    fab.title = t(fabLabel);
    fab.onclick = fabGames ? function () { showCreateSheet(); } : fabGame ? function () { showPage("game-create"); } : fabSession ? function () { createAdHocSession(); } : function () { showCreatePoll(); };
  }

  // Each page sets its breadcrumb when it renders; start from the top level
  setBreadcrumb(_defaultCrumbs(page));

  // Trigger page-specific load callbacks (guard with typeof)
  if (page === "polls" && typeof loadPolls === "function") {
    loadPolls();
  } else if (page === "sessions" && typeof loadSessions === "function") {
    loadSessions();
  } else if (page === "home" && typeof loadHome === "function") {
    loadHome();
  } else if (page === "games" && typeof loadGames === "function") {
    loadGames();
  } else if (page === "dashboard" && typeof loadDashboard === "function") {
    loadDashboard();
  } else if (page === "payments" && typeof loadPayments === "function") {
    loadPayments();
  } else if ((page === "settings" || page === "profile" || page === "profile-sub") && typeof loadSettings === "function") {
    loadSettings();
  } else if (page === "config" && typeof loadConfig === "function") {
    loadConfig();
  } else if (page === "reports" && typeof loadReportsPage === "function") {
    loadReportsPage();
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
  } else if (page === "health" && typeof loadHealthPage === "function") {
    loadHealthPage();
  } else if (page === "workout" && typeof loadWorkoutPage === "function") {
    loadWorkoutPage();
  } else if (page === "stats" && typeof loadStats === "function") {
    loadStats();
  } else if (page === "matches-all" && typeof loadMatchesAll === "function") {
    loadMatchesAll();
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
  // Through the browser history, so the back button and the in-app back stay in step
  if (pageHistory.length > 0 && history.state && history.state.n > 0) { history.back(); return; }
  if (pageHistory.length > 0) showPage(pageHistory.pop(), false);
  else showPage("home", false);
}

/** The browser's back button: one step back, like the arrow in the header */
try { history.replaceState({ n: 0 }, ""); } catch (e) {}
window.addEventListener("popstate", function (e) {
  if (typeof currentUser === "undefined" || !currentUser) return;
  // An open window or the live score screen takes the back press first
  var modal = document.getElementById("modal");
  if (modal && modal.classList.contains("active")) { closeModal(); history.forward(); return; }
  var live = document.getElementById("liveScreen");
  if (live && live.classList.contains("on")) { history.forward(); if (typeof lsExit === "function") lsExit(); return; }
  var n = e.state && typeof e.state.n === "number" ? e.state.n : 0;
  if (n >= pageHistory.length) {
    if (n > pageHistory.length) { try { history.replaceState({ n: pageHistory.length }, ""); } catch (x) {} }
    return;
  }
  var prev = null;
  while (pageHistory.length > n) prev = pageHistory.pop();
  showPage(prev || "home", false);
});

/** Where a page sits, for pages that do not set their own breadcrumb */
function _defaultCrumbs(page) {
  var games = { label: t("navGames"), action: "showPage('games')" };
  var home = { label: t("navHome"), action: "showPage('home')" };
  var map = {
    polls: [games, { label: t("navPolls") }],
    sessions: [games, { label: t("navSessions") }],
    payments: [games, { label: t("myPayments") }],
    matches: [games, { label: t("sessionTabGames") }],
    "match-record": [games, { label: t("sessionTabGames") }],
    dashboard: [home, { label: t("navDashboard") }],
    "game-detail": [{ label: t("navCommunity"), action: "showPage('public')" }, { label: t("homeGame") }]
  };
  return map[page] || null;
}

/**
 * Show the authentication container, hide the app
 */
var _splashStart = Date.now();
var SPLASH_MIN_MS = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? 350 : 1150;   // the court takes about 1.1 s to draw; plus a .25 s fade

/** Fade the splash out once the smash has played (under 1 s in total). A tap skips it. */
var _splashReady = false, _splashSkipped = false, _splashTimer = null;
function hideSplash() {
  var el = document.getElementById("splash");
  if (!el || el.classList.contains("hide")) return;
  _splashReady = true;
  if (!window.spDone && !_splashSkipped) return;   // the splash scene is still playing: js/splash.js calls hideSplash again when it ends
  var wait = _splashSkipped ? 0 : Math.max(0, SPLASH_MIN_MS - (Date.now() - _splashStart));
  clearTimeout(_splashTimer);
  _splashTimer = setTimeout(function () { el.classList.add("hide"); }, wait);
}
/** Tap on the splash: skip the rest. If the app is not ready yet, it leaves as soon as it is. */
function skipSplash() {
  _splashSkipped = true;
  if (_splashReady) hideSplash();
}

function showAuthPage() {
  try { localStorage.removeItem("lastGroup"); } catch (e) {}   // signed out: nothing of the last group stays in the header
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

  showPage("home"); // land on Home after login
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
  if (c && c.action) runAction(c.action);
}

/** Header back arrow: one level up the breadcrumb, else history */
function crumbBack() {
  if (_crumbs.length > 1) crumbGo(_crumbs.length - 2);
  else goBack();
}


/* v256: bottom bar bulge. One SVG hump rises above the bar's top edge and slides under the active item (transform only).
   The x position is measured from the active element, so 3 or 5 slots and any width/orientation work.
   The centre is clamped so the hump's base stays on the flat part of the top edge, clear of the rounded corners. */
var NAV_HUMP_W = 100, NAV_HUMP_EDGE = 22;
function positionNavHump(instant) {
  var nav = document.getElementById("bottomNav");
  if (!nav || !nav.offsetWidth) return;
  var bg = nav.querySelector(".nav-bg");
  if (!bg) return;
  var w = nav.clientWidth, act = nav.querySelector(".nav-item.active");
  var half = NAV_HUMP_W / 2;
  var cx = act && act.offsetWidth ? act.offsetLeft + act.offsetWidth / 2 : w + NAV_HUMP_W + 40;   // no active item: hump parks off-screen
  if (act && act.offsetWidth) cx = Math.max(half + NAV_HUMP_EDGE, Math.min(w - half - NAV_HUMP_EDGE, cx));
  if (instant || !nav.getAttribute("data-ready")) nav.classList.add("nav-snap");
  bg.querySelector(".nb-hump").style.transform = "translateX(" + (cx - half) + "px)";
  if (nav.classList.contains("nav-snap")) {
    void nav.offsetWidth;   // commit the jump, then allow motion again
    nav.classList.remove("nav-snap");
    nav.setAttribute("data-ready", "1");
  }
}
(function () {
  if (typeof window === "undefined") return;
  var again = function () { positionNavHump(true); };
  window.addEventListener("resize", again);
  window.addEventListener("orientationchange", again);
  window.addEventListener("load", again);
  var nav = typeof document !== "undefined" && document.getElementById ? document.getElementById("bottomNav") : null;
  if (nav && typeof ResizeObserver !== "undefined") new ResizeObserver(again).observe(nav);   // also fires when the app shell is first shown
})();
