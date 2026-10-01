/* ============================================================
   select.js — Themed dropdown that replaces the OS <select> menu.
   Every <select class="form-select"> is upgraded automatically
   (including ones rendered later). The native select stays in the
   DOM, visually hidden, so .value, onchange and forms keep working.
   Styling follows the poll option cards (see .cs-* in styles.css).
   ============================================================ */

var _csOpen = null; // { select, trigger, menu }

function enhanceSelects(root) {
  var selects = (root || document).querySelectorAll("select.form-select:not([data-cs])");
  for (var i = 0; i < selects.length; i++) _enhanceSelect(selects[i]);
}

function _enhanceSelect(select) {
  select.setAttribute("data-cs", "1");
  select.classList.add("cs-native");
  select.tabIndex = -1;

  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "form-select cs-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  select.parentNode.insertBefore(trigger, select.nextSibling);
  select._csTrigger = trigger;

  _csSyncLabel(select);
  select.addEventListener("change", function () { _csSyncLabel(select); });
  trigger.addEventListener("click", function (e) {
    e.stopPropagation();
    if (_csOpen && _csOpen.select === select) _csClose();
    else _csOpenMenu(select);
  });
  trigger.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      _csOpenMenu(select);
    }
  });
}

function _csSyncLabel(select) {
  var trigger = select._csTrigger;
  if (!trigger) return;
  var opt = select.options[select.selectedIndex];
  var label = opt ? opt.textContent : "";
  // Only touch the DOM when something changed (the MutationObserver watches it)
  if (trigger.textContent !== label) trigger.textContent = label;
  var placeholder = !opt || opt.value === "";
  if (trigger.classList.contains("cs-placeholder") !== placeholder) trigger.classList.toggle("cs-placeholder", placeholder);
  if (trigger.disabled !== select.disabled) trigger.disabled = select.disabled;
}

function _csOpenMenu(select) {
  _csClose();
  if (select.disabled) return;
  var trigger = select._csTrigger;

  var menu = document.createElement("div");
  menu.className = "cs-menu";
  menu.setAttribute("role", "listbox");

  for (var i = 0; i < select.options.length; i++) {
    var opt = select.options[i];
    var item = document.createElement("div");
    item.className = "cs-option" +
      (i === select.selectedIndex ? " selected" : "") +
      (opt.value === "" ? " cs-placeholder" : "") +
      (opt.disabled ? " disabled" : "");
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "-1");
    item.setAttribute("data-index", i);
    item.textContent = opt.textContent;
    menu.appendChild(item);
  }

  menu.addEventListener("click", function (e) {
    var item = e.target.closest(".cs-option");
    if (!item || item.classList.contains("disabled")) return;
    _csChoose(select, parseInt(item.getAttribute("data-index"), 10));
  });
  menu.addEventListener("keydown", function (e) { _csMenuKey(e, select, menu); });

  document.body.appendChild(menu);
  _csPosition(trigger, menu);
  trigger.setAttribute("aria-expanded", "true");
  trigger.classList.add("cs-active");
  _csOpen = { select: select, trigger: trigger, menu: menu };

  var current = menu.querySelector(".cs-option.selected") || menu.querySelector(".cs-option:not(.disabled)");
  if (current) {
    current.focus({ preventScroll: true });
    current.scrollIntoView({ block: "nearest" });
  }
}

function _csPosition(trigger, menu) {
  var r = trigger.getBoundingClientRect();
  var gap = 6;
  var below = window.innerHeight - r.bottom - gap - 12;
  var above = r.top - gap - 12;
  var openUp = below < 200 && above > below;
  var maxH = Math.max(140, Math.min(320, openUp ? above : below));

  menu.style.left = Math.max(8, r.left) + "px";
  menu.style.width = r.width + "px";
  menu.style.maxHeight = maxH + "px";
  if (openUp) {
    menu.style.bottom = (window.innerHeight - r.top + gap) + "px";
    menu.classList.add("cs-up");
  } else {
    menu.style.top = (r.bottom + gap) + "px";
  }
}

function _csChoose(select, index) {
  var changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  _csSyncLabel(select);
  var trigger = select._csTrigger;
  _csClose();
  if (trigger) trigger.focus();
  if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
}

function _csMenuKey(e, select, menu) {
  var items = Array.prototype.slice.call(menu.querySelectorAll(".cs-option:not(.disabled)"));
  var idx = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (document.activeElement && document.activeElement.classList.contains("cs-option")) {
      _csChoose(select, parseInt(document.activeElement.getAttribute("data-index"), 10));
    }
  } else if (e.key === "Escape" || e.key === "Tab") {
    var trigger = select._csTrigger;
    _csClose();
    if (e.key === "Escape" && trigger) trigger.focus();
  }
}

function _csClose() {
  if (!_csOpen) return;
  _csOpen.trigger.setAttribute("aria-expanded", "false");
  _csOpen.trigger.classList.remove("cs-active");
  if (_csOpen.menu.parentNode) _csOpen.menu.parentNode.removeChild(_csOpen.menu);
  _csOpen = null;
}

// Close when tapping elsewhere, scrolling the page, or resizing
document.addEventListener("click", function (e) {
  if (_csOpen && !_csOpen.menu.contains(e.target)) _csClose();
});
window.addEventListener("resize", _csClose);
window.addEventListener("scroll", function (e) {
  if (_csOpen && !_csOpen.menu.contains(e.target)) _csClose();
}, true);

// Upgrade selects rendered at any time (pages are built with innerHTML)
(function () {
  var pending = false;
  function run() {
    pending = false;
    enhanceSelects(document);
    // A re-render may have replaced the select the menu belongs to
    if (_csOpen && !document.body.contains(_csOpen.select)) _csClose();
    // Labels of selects whose value was set by code
    var all = document.querySelectorAll("select[data-cs]");
    for (var i = 0; i < all.length; i++) _csSyncLabel(all[i]);
  }
  new MutationObserver(function () {
    if (!pending) { pending = true; requestAnimationFrame(run); }
  }).observe(document.body, { childList: true, subtree: true });
  run();
})();
