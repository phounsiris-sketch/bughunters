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
// Callers fill #modalTitle / #modalBody, set `modalCallback`, then call
// openModal(). The callback closes the modal itself when it succeeds, so
// validation errors keep the form open.

var modalCallback = null;

function openModal() {
  var overlay = document.getElementById("modal");
  if (overlay) overlay.classList.add("active");
  var first = document.querySelector("#modalBody input, #modalBody select");
  if (first) setTimeout(function () { first.focus(); }, 50);
}

function closeModal() {
  var overlay = document.getElementById("modal");
  if (overlay) overlay.classList.remove("active");
  modalCallback = null;
}

function modalConfirm() {
  if (typeof modalCallback === "function") {
    modalCallback();
  } else {
    closeModal();
  }
}

// ── Utility ────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Money (all amounts are whole Lao kip, LAK) ─────────────

var CURRENCY = "\u20AD"; // ₭ — Lao kip

/** Exact amount with thousands separators: 206000 → "206,000 ₭" */
function fmtLAK(n) {
  return Math.round(n || 0).toLocaleString("en-US") + " " + CURRENCY;
}

/** Short form for summaries only: 930000 → "930K ₭", 1250000 → "1.25M ₭" */
function fmtShort(n) {
  var v = Math.round(n || 0);
  var a = Math.abs(v);
  var out;
  if (a >= 1e6) out = (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  else if (a >= 1e3) out = (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  else out = String(v);
  return out + " " + CURRENCY;
}

/** "200,000" → 200000 */
function parseMoney(str) {
  var n = parseFloat(String(str || "").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Text input that shows thousands separators while typing */
function moneyInput(id, value, oninput) {
  return '<input type="text" inputmode="numeric" autocomplete="off" class="form-input money-input"' +
    (id ? ' id="' + id + '"' : '') +
    ' value="' + (value ? Math.round(value).toLocaleString("en-US") : '') + '" placeholder="0"' +
    ' oninput="formatMoneyInput(this);' + (oninput || '') + '">';
}

/** Re-insert separators and keep the caret after the same digit */
function formatMoneyInput(el) {
  var caret = el.selectionStart || 0;
  var digitsBefore = el.value.slice(0, caret).replace(/[^0-9]/g, "").length;
  var digits = el.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  var formatted = digits ? Number(digits).toLocaleString("en-US") : "";
  el.value = formatted;
  var pos = 0, seen = 0;
  while (pos < formatted.length && seen < digitsBefore) {
    if (/[0-9]/.test(formatted[pos])) seen++;
    pos++;
  }
  try { el.setSelectionRange(pos, pos); } catch (e) {}
}

/** "2026-10-01" → "1 Oct 2026" */
function fmtDate(iso) {
  if (!iso) return "";
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
}

/** Re-render whatever page is showing (after data or language changes) */
function refreshCurrentPage(reason) {
  if (!currentUser) return;
  if (currentPage === "settings" && typeof renderSettings === "function") {
    renderSettings();
  } else if (currentPage === "polls" && typeof renderPolls === "function") {
    renderPolls(lastPolls);
  } else if (currentPage === "poll-create" && reason === "courts" && typeof renderPollCreateForm === "function") {
    renderPollCreateForm();
  } else if (currentPage === "sessions" && typeof renderSessionsList === "function") {
    renderSessionsList(lastSessions);
  } else if (currentPage === "dashboard" && typeof _renderDashboard === "function") {
    _renderDashboard();
  } else if (currentPage === "session-detail" && reason !== "form" && typeof refreshSessionDetail === "function") {
    refreshSessionDetail();
  }
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

  // One shared listener per reference collection
  dbStartCache(function (key) { refreshCurrentPage(key); });
}

// ── Service Worker ─────────────────────────────────────────

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js")
      .then(function (reg) {
        console.log("SW registered:", reg.scope);
      })
      .catch(function (err) {
        console.warn("SW registration failed:", err);
      });
  });
}

// ── Boot ───────────────────────────────────────────────────

// Theme + language on the sign-in screen too
document.body.setAttribute("data-theme", currentTheme);
if (typeof applyI18n === "function") applyI18n();

// initAuth is defined in auth.js (loaded before app.js)
initAuth();
