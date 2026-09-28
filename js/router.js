/* ============================================================
   router.js — Page navigation system
   ============================================================ */

var currentPage = "polls";
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
    pages[i].style.display = "none";
  }

  // Show target page
  var target = document.getElementById(page + "-page");
  if (target) {
    target.classList.add("active");
    target.style.display = "";
  }

  // Update bottom nav active state
  var navBtns = document.querySelectorAll(".nav-btn");
  for (var j = 0; j < navBtns.length; j++) {
    navBtns[j].classList.remove("active");
    var navPage = navBtns[j].getAttribute("data-page");
    if (navPage === page) {
      navBtns[j].classList.add("active");
    }
  }

  // FAB visibility — only show on polls page
  var fab = document.getElementById("fab");
  if (fab) {
    fab.style.display = (page === "polls") ? "" : "none";
  }

  // Back button visibility — show on detail / create pages
  var backBtn = document.getElementById("backBtn");
  if (backBtn) {
    var showBack = (page === "session-detail" || page === "poll-create");
    backBtn.style.display = showBack ? "" : "none";
  }

  // Trigger page-specific load callbacks (guard with typeof)
  if (page === "polls" && typeof loadPolls === "function") {
    loadPolls();
  } else if (page === "sessions" && typeof loadSessions === "function") {
    loadSessions();
  } else if (page === "dashboard" && typeof loadDashboard === "function") {
    loadDashboard();
  } else if (page === "settings" && typeof loadSettings === "function") {
    loadSettings();
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
    showPage("polls", false);
  }
}

/**
 * Show the authentication container, hide the app
 */
function showAuthPage() {
  var authC = document.getElementById("auth-container");
  var appC = document.getElementById("app-container");

  if (authC) authC.style.display = "";
  if (appC) appC.style.display = "none";
}

/**
 * Show the app container, hide auth, and navigate to polls
 */
function showAppPage() {
  var authC = document.getElementById("auth-container");
  var appC = document.getElementById("app-container");

  if (authC) authC.style.display = "none";
  if (appC) appC.style.display = "";

  showPage("polls");
}
