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
function showPage(page, pushHistory) {
  if (typeof pushHistory === "undefined") pushHistory = true;

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
  var activeNav = document.getElementById("nav-" + (page === "config" ? "settings" : page));
  if (activeNav) activeNav.classList.add("active");

  // FAB visibility — only show on polls page
  var fab = document.getElementById("fab");
  if (fab) {
    fab.style.display = page === "polls" ? "" : "none"; // everyone can create a poll
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
