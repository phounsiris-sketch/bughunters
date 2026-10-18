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
