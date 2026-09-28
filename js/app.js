/* ============================================================
   app.js — Entry point for the Godsmash badminton PWA
   ============================================================ */

// Palette for player avatars / chart colours
var COLORS = [
  "#4F46E5", // indigo
  "#059669", // emerald
  "#D97706", // amber
  "#DC2626", // red
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#DB2777", // pink
  "#65A30D"  // lime
];

var currentTheme = localStorage.getItem("theme") || "dark";

/**
 * Toggle between dark and light themes
 */
function toggleTheme() {
  currentTheme = (currentTheme === "dark") ? "light" : "dark";
  document.body.setAttribute("data-theme", currentTheme);
  localStorage.setItem("theme", currentTheme);

  var themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.textContent = (currentTheme === "dark") ? "\u2600\uFE0F" : "\uD83C\uDF19";
  }
}

/**
 * Show a brief toast notification
 */
function showToast(msg) {
  var toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(function () {
    toast.classList.remove("show");
  }, 2000);
}

// ── Modal helpers ──────────────────────────────────────────

var modalCallback = null;

function openModal(message, onConfirm) {
  var overlay = document.getElementById("modal-overlay");
  var msgEl = document.getElementById("modal-message");

  if (msgEl) msgEl.textContent = message;
  if (overlay) overlay.style.display = "flex";

  modalCallback = onConfirm || null;
}

function closeModal() {
  var overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.style.display = "none";
  modalCallback = null;
}

function modalConfirm() {
  if (typeof modalCallback === "function") {
    modalCallback();
  }
  closeModal();
}

// ── Utility ────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// ── Initialisation ─────────────────────────────────────────

function initApp() {
  // Apply saved theme
  document.body.setAttribute("data-theme", currentTheme);
  var themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.textContent = (currentTheme === "dark") ? "\u2600\uFE0F" : "\uD83C\uDF19";
  }

  // Apply translations
  if (typeof applyI18n === "function") {
    applyI18n();
  }
}

// ── Service Worker ─────────────────────────────────────────

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js")
      .then(function (reg) {
        console.log("SW registered:", reg.scope);
      })
      .catch(function (err) {
        console.warn("SW registration failed:", err);
      });
  });
}

// ── Boot ───────────────────────────────────────────────────

// initAuth is defined in auth.js (loaded before app.js)
initAuth();
