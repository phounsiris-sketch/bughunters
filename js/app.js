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

/* Dark styles: [id, name key, swatch colours, header colour] */
var PALETTES = [
  ["navy", "palNavy", ["#060d1a", "#18304f", "#0d9488", "#4ade80"], "#0d9488"],
  ["violet", "palViolet", ["#110e1a", "#201a31", "#7c4dff", "#5eead4"], "#7c4dff"],
  ["court", "palCourt", ["#0a1220", "#14233d", "#1d5fd1", "#7dd3fc"], "#1d5fd1"],
  ["clean", "palClean", ["#121212", "#1f1f1f", "#3b74d9", "#6ee7b7"], "#3b74d9"],
  ["midnight", "palMidnight", ["#0c0e1c", "#1a1e38", "#5b4dff", "#1d6fe0"], "#5b4dff"]
];
var currentPalette = (function () {
  var v = null;
  try { v = localStorage.getItem("palette"); } catch (e) {}
  return PALETTES.some(function (p) { return p[0] === v; }) ? v : "navy";
})();

/** Apply theme + dark style to the page and the phone's status bar */
function applyTheme() {
  document.body.setAttribute("data-theme", currentTheme);
  document.body.setAttribute("data-palette", currentPalette);
  var pal = PALETTES.filter(function (p) { return p[0] === currentPalette; })[0] || PALETTES[0];
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", currentTheme === "light" ? "#0d9488" : pal[3]);
  var themeBtn = document.getElementById("themeBtn");
  if (themeBtn) themeBtn.innerHTML = icon(currentTheme === "dark" ? "sun" : "moon", 18);
}

/** Pick a dark style (also switches to dark mode) */
function setPalette(id) {
  currentPalette = id;
  currentTheme = "dark";
  try { localStorage.setItem("palette", id); localStorage.setItem("theme", "dark"); } catch (e) {}
  applyTheme();
  if (typeof renderSettings === "function") renderSettings();
  if (typeof _renderDashboard === "function" && typeof currentPage !== "undefined" && currentPage === "dashboard") _renderDashboard();
}

/**
 * Toggle between dark and light themes
 */
function toggleTheme() {
  currentTheme = (currentTheme === "dark") ? "light" : "dark";
  localStorage.setItem("theme", currentTheme);
  applyTheme();
  if (typeof currentPage !== "undefined" && (currentPage === "settings" || currentPage === "profile") && typeof renderSettings === "function") renderSettings();
}

/**
 * Show a brief toast notification
 */
function showToast(msg) {
  var toast = document.getElementById("toast");
  if (!toast) return;

  // A trailing ✔ becomes the Solar check icon
  var ok = /\s*\u2714\uFE0F?$/.test(msg);
  toast.innerHTML = escapeHtml(String(msg).replace(/\s*\u2714\uFE0F?$/, "")) + (ok ? " " + icon("check", 16) : "");
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

/* ---------- Dates in the current language (browsers often lack Lao) ---------- */
var _MONTHS = {
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  la: ["ມັງກອນ","ກຸມພາ","ມີນາ","ເມສາ","ພຶດສະພາ","ມິຖຸນາ","ກໍລະກົດ","ສິງຫາ","ກັນຍາ","ຕຸລາ","ພະຈິກ","ທັນວາ"]
};
var _WEEKDAYS = {   // Sunday first, like Date.getDay()
  en: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
  la: ["ອາທິດ","ຈັນ","ອັງຄານ","ພຸດ","ພະຫັດ","ສຸກ","ເສົາ"]
};
var _WEEKDAYS_NARROW = { en: ["S","M","T","W","T","F","S"], la: ["ອາ","ຈ","ອ","ພ","ພຫ","ສຸ","ສ"] };
function _dl() { return currentLang === "la" ? "la" : "en"; }
/** Short month: "Oct" / "ຕຸລາ" */
function monthShort(m) { return _dl() === "la" ? _MONTHS.la[m] : _MONTHS.en[m].slice(0, 3); }
/** "October 2026" / "ຕຸລາ 2026" */
function monthYear(y, m) { return _MONTHS[_dl()][m] + " " + y; }
function weekdayShort(wd) { return _WEEKDAYS[_dl()][wd]; }
function weekdayNarrow(wd) { return _WEEKDAYS_NARROW[_dl()][wd]; }
/** Hours: "2h" / "2 ຊມ" */
function fmtHours(n) { return n + t("hShort"); }

/** "2026-10-01" → "1 Oct 2026" / "1 ຕຸລາ 2026" */
function fmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.getDate() + " " + monthShort(d.getMonth()) + " " + d.getFullYear();
}

/** Same colour for the same person everywhere */
function colorFor(uid) {
  var h = 0;
  uid = String(uid || "");
  for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Profile photo if the player has one, otherwise a coloured initial */
function avatarHtml(uid, size) {
  size = size || 32;
  var u = typeof dbFindById === "function" ? dbFindById(DB_CACHE.users, uid) : null;
  var style = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px';
  if (u && u.avatarUrl) {
    return '<img class="person-avatar" src="' + u.avatarUrl + '" alt="" style="' + style + '">';
  }
  var name = typeof plainUserName === "function" ? plainUserName(u) : (u && u.displayName) || "?";
  return '<div class="person-avatar" style="background:' + colorFor(uid) + ';' + style + '">' + escapeHtml(name.charAt(0).toUpperCase()) + '</div>';
}

/* ---------- Phone numbers: Lao mobile, +856 20 + 8 digits ---------- */
var PHONE_PREFIX = "+856 20";

/** The 8 local digits of a stored number ("+8562055551234", "020 5555 1234" → "55551234") */
function phoneDigits(v) {
  var d = String(v || "").replace(/\D/g, "");
  if (d.indexOf("856") === 0) d = d.slice(3);
  if (d.charAt(0) === "0") d = d.slice(1);
  if (d.indexOf("20") === 0 && d.length > 8) d = d.slice(2);
  return d.slice(-8);
}

/** "+856 20 5555 1234" for display */
function fmtPhone(v) {
  var d = phoneDigits(v);
  return d ? PHONE_PREFIX + " " + d.slice(0, 4) + " " + d.slice(4) : "";
}

/** Input with the fixed +856 20 prefix that only takes 8 digits */
function phoneInputHtml(id, value) {
  return '<div class="phone-field"><span class="phone-prefix">' + PHONE_PREFIX + '</span>' +
    '<input class="form-input" id="' + id + '" type="tel" inputmode="numeric" maxlength="8" autocomplete="tel-local" placeholder="xxxxxxxx"' +
    ' value="' + phoneDigits(value) + '" oninput="this.value=this.value.replace(/\\D/g,\'\').slice(0,8)"></div>';
}

/** Read a phone input: { ok, value } — value is "+85620xxxxxxxx" or null when empty */
function readPhone(id) {
  var el = document.getElementById(id);
  var d = el ? el.value.replace(/\D/g, "") : "";
  if (!d) return { ok: true, value: null };
  if (d.length !== 8) return { ok: false, value: null };
  return { ok: true, value: "+85620" + d };
}

/** Avatar that opens the full photo when tapped (if the person has one) */
function avatarZoomHtml(uid, size) {
  var u = typeof dbFindById === "function" ? dbFindById(DB_CACHE.users, uid) : null;
  if (!u || !u.avatarUrl) return avatarHtml(uid, size);
  return '<span class="avatar-zoom" role="button" aria-label="' + t("viewPhoto") + '" onclick="openImage(dbFindById(DB_CACHE.users,\'' + uid + '\').avatarUrl)">' + avatarHtml(uid, size) + '</span>';
}

/** Latest first: by play date + time, then by creation time */
function byLatest(getDate) {
  return function (a, b) {
    var da = getDate(a), db = getDate(b);
    if (da !== db) return db.localeCompare(da);
    var ca = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
    var cb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
    return cb - ca;
  };
}

/** Status + month filter row. statusOpts: [[value, label]], months: ["2026-10", …] */
function filterBarHtml(statusOpts, statusVal, months, monthVal, onStatus, onMonth) {
  var html = '<div class="filter-bar"><div class="form-group"><select class="form-select" onchange="' + onStatus + '(this.value)">';
  statusOpts.forEach(function (o) {
    html += '<option value="' + o[0] + '"' + (o[0] === statusVal ? ' selected' : '') + '>' + o[1] + '</option>';
  });
  html += '</select></div><div class="form-group"><select class="form-select" onchange="' + onMonth + '(this.value)">';
  html += '<option value="">' + t("allDates") + '</option>';
  months.forEach(function (m) {
    html += '<option value="' + m + '"' + (m === monthVal ? ' selected' : '') + '>' + _monthName(m) + '</option>';
  });
  return html + '</select></div></div>';
}

function _monthName(ym) {
  var p = ym.split("-");
  return monthYear(parseInt(p[0], 10), parseInt(p[1], 10) - 1);
}

/** Distinct "YYYY-MM" values, newest first */
function monthsOf(items, getDate) {
  var seen = {};
  items.forEach(function (x) { var d = getDate(x); if (d) seen[d.slice(0, 7)] = true; });
  return Object.keys(seen).sort().reverse();
}

/** Re-render whatever page is showing (after data or language changes) */
function refreshCurrentPage(reason) {
  if (!currentUser) return;
  if (typeof updateNotifications === "function") updateNotifications();
  if ((currentPage === "settings" || currentPage === "profile" || currentPage === "config") && typeof renderSettings === "function") {
    renderSettings();
  } else if (currentPage === "user" && typeof loadUserProfile === "function") {
    loadUserProfile();
  } else if (currentPage === "polls" && typeof renderPolls === "function") {
    renderPolls(lastPolls);
  } else if (currentPage === "poll-create" && reason === "courts" && typeof renderPollCreateForm === "function") {
    renderPollCreateForm();
  } else if (currentPage === "session-create" && (reason === "courts" || reason === "users") && typeof renderSessionCreateForm === "function") {
    renderSessionCreateForm();
  } else if (currentPage === "sessions" && typeof renderSessionsList === "function") {
    renderSessionsList(lastSessions);
  } else if (currentPage === "payments" && typeof renderPayments === "function") {
    renderPayments();
  } else if (currentPage === "dashboard" && typeof _renderDashboard === "function") {
    _renderDashboard();
  } else if (currentPage === "session-detail" && reason !== "form" && typeof refreshSessionDetail === "function") {
    // New / edited courts, brands or players show up in an open cost form too
    if (typeof sessionEditing !== "undefined" && sessionEditing && edit && /^(courts|shuttlecocks|users)$/.test(reason)) {
      var court = dbFindById(DB_CACHE.courts, edit.courtId);
      if (court) edit.pricePerHour = court.pricePerHour || 0;
      renderEditForm();
    } else {
      refreshSessionDetail();
    }
  }
}

// ── Initialisation ─────────────────────────────────────────

function initApp() {
  // Apply saved theme
  applyTheme();

  // Apply translations
  if (typeof applyI18n === "function") {
    applyI18n();
  }

  // One shared listener per reference collection
  dbStartCache(function (key) {
    if (key === "users") syncMyPerms();
    refreshCurrentPage(key);
  });
}

// ── Service Worker ─────────────────────────────────────────

var APP_VERSION = "v35"; // keep in step with CACHE_NAME in sw.js

// A new version took over: reload once so the page runs the new code too
if ("serviceWorker" in navigator) {
  var _swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (_swReloaded) return;
    _swReloaded = true;
    window.location.reload();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js")
      .then(function (reg) {
        // Always look for a newer version (home-screen apps rarely do on their own)
        reg.update();
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update();
        });
      })
      .catch(function (err) {
        console.warn("SW registration failed:", err);
      });
  });
}

// ── Boot ───────────────────────────────────────────────────

// Static icons in the page shell (nav, back button)
function fillStaticIcons(root) {
  var els = (root || document).querySelectorAll("[data-icon]");
  for (var i = 0; i < els.length; i++) {
    els[i].innerHTML = icon(els[i].getAttribute("data-icon"), parseInt(els[i].getAttribute("data-size"), 10) || 18);
  }
}
fillStaticIcons();

// Theme + language on the sign-in screen too
applyTheme();
if (typeof applyI18n === "function") applyI18n();

// Splash follows the saved theme / language
var _splashSub = document.getElementById("splashSub");
if (_splashSub && typeof t === "function") _splashSub.textContent = t("headerSub");
// Never leave someone stuck on the splash (e.g. offline at first start)
setTimeout(function () { if (typeof hideSplash === "function") hideSplash(); }, 8000);

// initAuth is defined in auth.js (loaded before app.js)
initAuth();
