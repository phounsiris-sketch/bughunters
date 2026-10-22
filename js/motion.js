/* Motion helpers shared by Dashboard, Rankings and the Public page.
   uiMotion(container, key): plays the entrance effects (CSS class .dash-anim) once per view,
   never on a plain data refresh. uiMotionReset(): called when a page is shown, so every visit plays again. */
var _uiMotionKeys = {};

function uiMotionReset() { _uiMotionKeys = {}; }

function uiMotion(container, key) {
  if (!container) return;
  var id = container.id || "x";
  if (_uiMotionKeys[id] === key) return;
  _uiMotionKeys[id] = key;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  container.classList.remove("dash-anim");
  void container.offsetWidth;
  var kids = container.children;
  for (var i = 0; i < kids.length; i++) kids[i].style.setProperty("--i", Math.min(i, 8));
  var rows = container.querySelectorAll(".leader-row, .stat-tile, .pod, .spend-row, .rank-row, .game-card, .hl-row, .ins-row");
  for (var r = 0; r < rows.length; r++) rows[r].style.setProperty("--j", Math.min(r, 14));
  container.classList.add("dash-anim");
  var nums = container.querySelectorAll(".pod-value, .leader-value, .stat-value, .rank-text small");
  for (var n = 0; n < nums.length; n++) _countUp(nums[n]);
}

function _countUp(el) {
  if (el.children.length) return;                       // tiles with <small> keep their markup
  var m = /^(\d[\d,]*)(\.\d+)?(.*)$/.exec(el.textContent.trim());
  if (!m) return;
  var target = parseFloat(m[1].replace(/,/g, "") + (m[2] || ""));
  if (!isFinite(target) || target < 3) return;
  var dec = m[2] ? m[2].length - 1 : 0, comma = m[1].indexOf(",") >= 0, suffix = m[3] || "";
  var t0 = null, dur = 800;
  function show(v) {
    var txt = dec ? v.toFixed(dec) : String(Math.round(v));
    if (comma) txt = txt.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    el.textContent = txt + suffix;
  }
  show(0);
  function step(ts) {
    if (t0 === null) t0 = ts;
    var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    show(target * e);
    if (k < 1) requestAnimationFrame(step); else show(target);
  }
  requestAnimationFrame(step);
}


/* Bottom-sheet confirm (replaces the browser's confirm() popup).
   askConfirm({ title, big, body, yes, danger }, onYes): every text is escaped here, pass plain text */
function askConfirm(o, onYes) {
  var old = document.getElementById("askSheet"); if (old) old.remove();
  var el = document.createElement("div");
  el.id = "askSheet"; el.className = "sheet-wrap";
  el.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' +
    '<div class="sheet-grab"></div>' +
    (o.title ? '<div class="sheet-title">' + escapeHtml(o.title) + '</div>' : '') +
    (o.big ? '<div class="sheet-big">' + escapeHtml(o.big) + '</div>' : '') +
    (o.body ? '<div class="sheet-body">' + escapeHtml(o.body) + '</div>' : '') +
    '<div class="sheet-btns"><button type="button" class="btn-secondary" data-no>' + (o.no || t("cancel")) + '</button>' +
    '<button type="button" class="' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-yes>' + (o.yes || t("confirm")) + '</button></div></div>';
  var close = function () { el.remove(); };
  el.onclick = function (e) { if (e.target === el || e.target.hasAttribute("data-no")) close(); };
  el.querySelector("[data-yes]").onclick = function () { close(); if (onYes) onYes(); };
  document.body.appendChild(el);
  var y = el.querySelector("[data-yes]"); if (y && y.focus) y.focus();
}
