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


/* Our own confirm sheet (never the browser's confirm()/prompt()).
   askConfirm({ title, body, big, detail, kind, yes, no, danger, type }, onYes)
     kind   "danger" (trash, red) | "warn" | "ask" (default)   danger:true = kind "danger"
     detail a name/label shown in a chip under the title (e.g. what is being deleted)
     type   a word the user must type before the button unlocks (e.g. the group name)
   Every text is escaped here, pass plain text. Esc / tap outside / Cancel close it.
   Cancel has the focus for danger, so a stray Enter never deletes anything. */
var _askOpener = null;
function askConfirm(o, onYes) {
  var old = document.getElementById("askSheet"); if (old) old.remove();
  var kind = o.kind || (o.danger ? "danger" : "ask");
  var ico = { danger: "trash", warn: "warning", ask: "question" }[kind] || "question";
  _askOpener = document.activeElement;
  var el = document.createElement("div");
  el.id = "askSheet"; el.className = "sheet-wrap";
  el.innerHTML = '<div class="sheet ask ask-' + kind + '" role="alertdialog" aria-modal="true" aria-labelledby="askT"' + (o.body ? ' aria-describedby="askB"' : '') + '>' +
    '<div class="sheet-grab"></div>' +
    '<div class="ask-ico">' + icon(ico, 28) + '</div>' +
    (o.title ? '<div class="sheet-title" id="askT">' + escapeHtml(o.title) + '</div>' : '') +
    (o.detail ? '<div class="ask-detail">' + escapeHtml(o.detail) + '</div>' : '') +
    (o.big ? '<div class="sheet-big">' + escapeHtml(o.big) + '</div>' : '') +
    (o.body ? '<div class="sheet-body" id="askB">' + escapeHtml(o.body) + '</div>' : '') +
    (o.type ? '<input type="text" class="form-input ask-type" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="' + escapeHtml(o.type) + '" placeholder="' + escapeHtml(o.type) + '">' : '') +
    (o.input ? '<input type="' + escapeHtml(o.inputType || "text") + '" class="form-input ask-type" autocomplete="' + (o.inputType === "email" ? "email" : "off") + '" autocapitalize="off" spellcheck="false" aria-label="' + escapeHtml(o.input) + '" placeholder="' + escapeHtml(o.input) + '">' : '') +
    '<div class="ask-btns"><button type="button" class="' + (kind === "danger" ? 'btn-danger ask-yes' : 'btn-primary ask-yes') + '" data-yes' + (o.type || o.input ? ' disabled' : '') + '>' + escapeHtml(o.yes || t("confirm")) + '</button>' +
    '<button type="button" class="ask-no" data-no>' + escapeHtml(o.no || t("cancel")) + '</button></div></div>';
  var close = function () {
    el.classList.add("out");
    el.style.pointerEvents = "none";   // the fading sheet takes no more taps
    document.removeEventListener("keydown", onKey, true);
    setTimeout(function () { el.remove(); }, 160);
    if (_askOpener && _askOpener.focus && document.contains(_askOpener)) { try { _askOpener.focus(); } catch (e) {} }
  };
  var yes = el.querySelector("[data-yes]"), no = el.querySelector("[data-no]"), inp = el.querySelector(".ask-type");
  var done = false;   // a double tap must run onYes once
  var go = function () { if (done || yes.disabled) return; done = true; close(); if (onYes) onYes(o.input && inp ? inp.value.trim() : undefined); };
  var onKey = function (e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); if (o.onNo) o.onNo(); return; }
    if (e.key === "Enter" && inp && document.activeElement === inp) { e.preventDefault(); go(); return; }
    if (e.key === "Tab") {
      var f = [].slice.call(el.querySelectorAll("button:not([disabled]), input")), first = f[0], last = f[f.length - 1];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  el.onclick = function (e) { if (e.target === el || e.target.hasAttribute("data-no")) { close(); if (o.onNo) o.onNo(); } };
  yes.onclick = go;
  if (inp) inp.oninput = function () { yes.disabled = o.input ? !inp.value.trim() : inp.value.trim().toLowerCase() !== String(o.type).trim().toLowerCase(); };   // type: must match the word; input: anything non-empty
  document.body.appendChild(el);
  var first = inp || (kind === "danger" ? no : yes); if (first && first.focus) first.focus();
}

/** Short form for the common case: askYes("Delete this?", function () { ... }, { kind: "danger", yes: t("delete") }) */
function askYes(msg, onYes, o) {
  o = o || {};
  askConfirm({ title: msg, body: o.body, detail: o.detail, kind: o.kind || (o.danger ? "danger" : "ask"), yes: o.yes, no: o.no, type: o.type }, onYes);
}

/** Show text the user can copy by hand (the fallback when the clipboard is blocked) */
function askCopy(title, text) {
  askConfirm({ title: title, kind: "ask", yes: t("close") || "OK", no: t("cancel") }, function () {});
  var sh = document.querySelector("#askSheet .sheet-title");
  if (sh) { var ta = document.createElement("textarea"); ta.className = "form-input ask-copy"; ta.readOnly = true; ta.value = text; ta.rows = 3; sh.insertAdjacentElement("afterend", ta); ta.focus(); ta.select(); }
}
