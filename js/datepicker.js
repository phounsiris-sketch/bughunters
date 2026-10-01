/* ============================================================
   datepicker.js — Themed date & time pickers instead of the OS ones.
   Every <input type="date"> / <input type="time"> is upgraded
   automatically. The input stays in the DOM (visually hidden) and keeps
   its ISO value ("2026-10-01", "18:30"), so .value and onchange work as
   before. Styling follows the dropdown menu / poll option cards.
   ============================================================ */

var _dpOpen = null; // { input, trigger, pop }

function enhanceDateInputs(root) {
  var inputs = (root || document).querySelectorAll('input[type="date"]:not([data-dp]), input[type="time"]:not([data-dp])');
  for (var i = 0; i < inputs.length; i++) _dpEnhance(inputs[i]);
}

function _dpEnhance(input) {
  var kind = input.type; // "date" | "time"
  input.setAttribute("data-dp", kind);
  input.type = "text";
  input.classList.add("dp-native");
  input.tabIndex = -1;

  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "form-input dp-trigger";
  input.parentNode.insertBefore(trigger, input.nextSibling);
  input._dpTrigger = trigger;
  _dpSync(input);

  input.addEventListener("change", function () { _dpSync(input); });
  trigger.addEventListener("click", function (e) {
    e.stopPropagation();
    if (_dpOpen && _dpOpen.input === input) _dpClose();
    else _dpOpenPicker(input);
  });
}

function _dpLabel(input) {
  var v = input.value;
  if (input.getAttribute("data-dp") === "time") return v || "--:--";
  if (!v) return t("pickDate");
  var d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString(currentLang === "la" ? "lo-LA" : "en-GB", { weekday: "short" }) + ", " + fmtDate(v);
}

function _dpSync(input) {
  var trigger = input._dpTrigger;
  if (!trigger) return;
  var kind = input.getAttribute("data-dp");
  var html = icon(kind === "time" ? "clock" : "calendar", 16) + '<span>' + escapeHtml(_dpLabel(input)) + '</span>';
  if (trigger._dpHtml !== html) { trigger.innerHTML = html; trigger._dpHtml = html; } // only touch the DOM on change
  if (trigger.disabled !== input.disabled) trigger.disabled = input.disabled;
}

function _dpSet(input, value) {
  if (input.value === value) return;
  input.value = value;
  _dpSync(input);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ---------- Popover ---------- */
function _dpOpenPicker(input) {
  _dpClose();
  if (input.disabled) return;
  if (typeof _csClose === "function") _csClose();
  var pop = document.createElement("div");
  pop.className = "dp-pop";
  pop.addEventListener("click", function (e) { e.stopPropagation(); });
  document.body.appendChild(pop);
  _dpOpen = { input: input, trigger: input._dpTrigger, pop: pop };
  input._dpTrigger.classList.add("cs-active");

  if (input.getAttribute("data-dp") === "time") _dpRenderTime(input, pop);
  else {
    var base = input.value ? new Date(input.value + "T00:00:00") : new Date();
    if (isNaN(base.getTime())) base = new Date();
    _dpRenderMonth(input, pop, base.getFullYear(), base.getMonth());
  }
  _dpPosition(input._dpTrigger, pop);
}

function _dpPosition(trigger, pop) {
  var r = trigger.getBoundingClientRect();
  var width = Math.min(300, window.innerWidth - 16);
  var left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
  pop.style.width = width + "px";
  pop.style.left = left + "px";
  var h = pop.offsetHeight;
  if (window.innerHeight - r.bottom - 12 < h && r.top > h + 12) {
    pop.style.top = (r.top - h - 6) + "px";
    pop.classList.add("cs-up");
  } else {
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - h - 8) + "px";
  }
}

function _iso(y, m, d) {
  return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function _dpRenderMonth(input, pop, year, month) {
  var loc = currentLang === "la" ? "lo-LA" : "en-GB";
  var title = new Date(year, month, 1).toLocaleDateString(loc, { month: "long", year: "numeric" });
  var today = _todayIso();
  var selected = input.value;

  // Week starts on Monday
  var first = (new Date(year, month, 1).getDay() + 6) % 7;
  var days = new Date(year, month + 1, 0).getDate();

  var html = '<div class="dp-head">' +
    '<button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month">' + icon("prev", 18) + '</button>' +
    '<div class="dp-title">' + escapeHtml(title) + '</div>' +
    '<button type="button" class="dp-nav" data-nav="1" aria-label="Next month">' + icon("next", 18) + '</button></div>';
  html += '<div class="dp-grid">';
  for (var w = 0; w < 7; w++) {
    var wd = new Date(2024, 0, 1 + w); // 1 Jan 2024 is a Monday
    html += '<div class="dp-wd">' + escapeHtml(wd.toLocaleDateString(loc, { weekday: "narrow" })) + '</div>';
  }
  for (var b = 0; b < first; b++) html += '<div></div>';
  for (var d = 1; d <= days; d++) {
    var iso = _iso(year, month, d);
    html += '<button type="button" class="dp-day' + (iso === selected ? ' selected' : '') + (iso === today ? ' today' : '') + '" data-date="' + iso + '">' + d + '</button>';
  }
  html += '</div>';
  html += '<div class="dp-foot"><button type="button" class="edit-btn" data-date="' + today + '">' + t("today") + '</button></div>';
  pop.innerHTML = html;

  pop.onclick = function (e) {
    e.stopPropagation();
    var nav = e.target.closest("[data-nav]");
    if (nav) {
      var m = month + parseInt(nav.getAttribute("data-nav"), 10);
      _dpRenderMonth(input, pop, year + Math.floor(m / 12), (m % 12 + 12) % 12);
      return;
    }
    var day = e.target.closest("[data-date]");
    if (day) {
      _dpSet(input, day.getAttribute("data-date"));
      _dpClose();
    }
  };
}

function _dpRenderTime(input, pop) {
  var parts = (input.value || "18:00").split(":");
  var hh = parseInt(parts[0], 10) || 0;
  var mm = parseInt(parts[1], 10) || 0;

  var col = function (kind, max, step, cur) {
    var h = '<div class="dp-col" data-col="' + kind + '">';
    for (var v = 0; v < max; v += step) {
      h += '<button type="button" class="dp-cell' + (v === cur ? ' selected' : '') + '" data-' + kind + '="' + v + '">' + String(v).padStart(2, "0") + '</button>';
    }
    return h + '</div>';
  };
  var mmNear = Math.round(mm / 5) * 5 % 60;
  pop.innerHTML =
    '<div class="dp-head"><div class="dp-title" style="flex:1;text-align:center">' + icon("clock", 16) + ' <span id="dpTimeLabel">' +
      String(hh).padStart(2, "0") + ':' + String(mm).padStart(2, "0") + '</span></div></div>' +
    '<div class="dp-time">' + col("h", 24, 1, hh) + '<div class="dp-colon">:</div>' + col("m", 60, 5, mm % 5 === 0 ? mm : mmNear) + '</div>' +
    '<div class="dp-foot"><button type="button" class="btn-primary dp-done">' + t("done") + '</button></div>';

  var apply = function () {
    var v = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
    var label = document.getElementById("dpTimeLabel");
    if (label) label.textContent = v;
    _dpSet(input, v);
  };
  pop.onclick = function (e) {
    e.stopPropagation();
    var h = e.target.closest("[data-h]"), m = e.target.closest("[data-m]");
    if (h) { hh = parseInt(h.getAttribute("data-h"), 10); _dpMark(pop, "h", h); apply(); }
    else if (m) { mm = parseInt(m.getAttribute("data-m"), 10); _dpMark(pop, "m", m); apply(); }
    else if (e.target.closest(".dp-done")) { apply(); _dpClose(); }
  };
  // Scroll the current values into view
  setTimeout(function () {
    Array.prototype.forEach.call(pop.querySelectorAll(".dp-col .selected"), function (el) {
      el.parentNode.scrollTop = el.offsetTop - el.parentNode.clientHeight / 2 + el.clientHeight / 2;
    });
  }, 0);
}

function _dpMark(pop, kind, el) {
  Array.prototype.forEach.call(pop.querySelectorAll('[data-col="' + kind + '"] .dp-cell'), function (c) {
    c.classList.toggle("selected", c === el);
  });
}

function _dpClose() {
  if (!_dpOpen) return;
  _dpOpen.trigger.classList.remove("cs-active");
  if (_dpOpen.pop.parentNode) _dpOpen.pop.parentNode.removeChild(_dpOpen.pop);
  _dpOpen = null;
}

document.addEventListener("click", function (e) {
  if (_dpOpen && !_dpOpen.pop.contains(e.target)) _dpClose();
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape") _dpClose(); });
window.addEventListener("resize", _dpClose);

// Upgrade inputs rendered at any time; keep labels in sync with code-set values
(function () {
  var pending = false;
  function run() {
    pending = false;
    enhanceDateInputs(document);
    if (_dpOpen && !document.body.contains(_dpOpen.input)) _dpClose();
    var all = document.querySelectorAll("input[data-dp]");
    for (var i = 0; i < all.length; i++) _dpSync(all[i]);
  }
  new MutationObserver(function () {
    if (!pending) { pending = true; requestAnimationFrame(run); }
  }).observe(document.body, { childList: true, subtree: true });
  run();
})();
