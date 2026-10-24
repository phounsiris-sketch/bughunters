/* Runs inside the harness page: for every theme x icon style x page, draws the real page with fake data and records layout problems.
   Result goes to <pre id="res"> as JSON ({issues, errors, renders}). Phone width comes from the Chrome window size. */
(function () {
  var D = { issues: [], errors: [], renders: 0, audited: 0 };
  window.addEventListener("error", function (e) { D.errors.push(String(e.message).slice(0, 200)); });
  var CONFIG = {}; try { CONFIG = JSON.parse(decodeURIComponent(location.hash.slice(1)) || "{}"); } catch (e) {}
  function setup() {
    var names = ["Me", "John", "Ton", "Mike", "Al", "Bo"], ids = ["me", "john", "ton", "mike", "al", "bo"];
    DB_CACHE.users = DB_CACHE.allUsers = ids.map(function (u, i) { return { id: u, uid: u, displayName: names[i], name: names[i], level: ["A", "B", "C", "B", "A", "C"][i], role: i ? "member" : "admin", status: "active", groupId: "g1" }; });
    currentUser = { uid: "me", emailVerified: true, displayName: "Me", email: "me@example.com" };
    currentUserProfile = DB_CACHE.users[0];
    GROUPS_ON = true; currentGroupId = "g1";
    currentGroup = { id: "g1", name: "Godsmash Club", type: "private", ownerId: "me", currency: "LAK", city: "Vientiane" };
    myMemberships = { g1: { id: "g1_me", gid: "g1", uid: "me", role: "owner", status: "active", perms: {} } };
    groupMembers = ids.map(function (u, i) { return { id: "g1_" + u, gid: "g1", uid: u, role: i ? "member" : "owner", status: "active" }; });
    var courts = [{ id: "c1", name: "Lao Badminton Hall", price: 80000, groupId: "g1", location: "Vientiane" }, { id: "c2", name: "Sports Center", price: 60000, groupId: "g1" }];
    DB_CACHE.courts = DB_CACHE.allCourts = DB_CACHE.groupCourts = courts;
    var d = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); };
    lastSessions = [{ id: "s1", groupId: "g1", date: d(2), time: "18:00", duration: 2, courtId: "c1", courtName: "Lao Badminton Hall", pricePerHour: 80000, players: ids, status: "upcoming", mode: "competition", createdBy: "me", payers: {} },
      { id: "s2", groupId: "g1", date: d(-3), time: "19:00", duration: 3, courtId: "c2", courtName: "Sports Center", pricePerHour: 60000, players: ids.slice(0, 4), status: "done", mode: "competition", createdBy: "me", payers: {} }];
    lastPolls = [{ id: "p1", groupId: "g1", title: "Friday game", date: d(4), time: "18:00", status: "open", options: ["Yes", "No", "Maybe"], votes: { 0: ["me", "john"], 1: ["al"], 2: [] }, createdBy: "me", courtId: "c1" }];
    var M = [], mk = function (a, b, w, day) { return { id: "m" + M.length, groupId: "g1", date: d(day), sessionId: "s2", teamA: a, teamB: b, games: [w ? { a: 21, b: 14 } : { a: 15, b: 21 }], startAt: Date.now() - 86400000 * -day, endAt: Date.now() - 86400000 * -day + 1500000 }; };
    for (var i = 0; i < 8; i++) M.push(mk(["me", "ton"], ["al", "bo"], i % 3 !== 0, -(i % 6) - 1));
    for (var j = 0; j < 4; j++) M.push(mk(["me", "john"], ["mike", "bo"], j % 2, -j - 2));
    lastMatches = M; try { _statsCache = null; } catch (e) {}
    window.fxStart = function () {}; window.fxStop = function () {};
    var ac = document.getElementById("auth-container"), ap = document.getElementById("app-container"); if (ac) ac.style.display = "none"; if (ap) ap.style.display = "";
    try { hideSplash(); } catch (e) {}
  }
  var THEMES = [], DARK = ["navy", "violet", "court", "clean", "midnight"], LIGHT = ["mint", "lilac", "sky", "paper", "sunrise"];
  function themes() {
    var out = []; PALETTES.forEach(function (p) { out.push({ n: "dark/" + p[0], mode: "dark", pal: p[0], sp: "" }); });
    LIGHT_PALETTES.forEach(function (p) { out.push({ n: "light/" + p[0], mode: "light", lpal: p[0], sp: "" }); });
    SPECIALS.forEach(function (s) { out.push({ n: "special/" + s[0], mode: "dark", pal: "navy", sp: s[0] }); });
    return out;
  }
  function applyTheme(th, icons) {
    try { localStorage.setItem("special", th.sp); localStorage.setItem("theme", th.mode); } catch (e) {}
    currentSpecial = th.sp; currentTheme = th.mode;
    if (th.pal) currentPalette = th.pal; if (th.lpal) currentLightPalette = th.lpal;
    try { if (typeof applyAppearance === "function") applyAppearance(); else if (typeof applyTheme_ === "function") applyTheme_(); } catch (e) {}
    var b = document.body;
    b.setAttribute("data-theme", th.mode); if (th.sp) b.setAttribute("data-special", th.sp); else b.removeAttribute("data-special");
    b.setAttribute("data-palette", currentPalette); b.setAttribute("data-lpalette", currentLightPalette);
    currentIconTheme = icons; _chromeKey = "reset"; applyChromeIcons();
  }
  function sel(el) {
    var s = el.tagName.toLowerCase(), c = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(function (x) { return x && !/^(active|on|open|sel)$/.test(x); }).slice(0, 2).join(".") : "";
    return s + (c ? "." + c : "");
  }
  function visible(el) { var r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; var cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05; }
  function inScroller(el, root) { for (var e = el.parentElement; e && e !== root; e = e.parentElement) { var o = getComputedStyle(e).overflowX; if ((o === "auto" || o === "scroll") && e.scrollWidth > e.clientWidth) return true; } return false; }
  function parse(c) { var m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; }
  function over(f, b) { return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 }; }
  function lum(c) { function f(v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); } return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); }
  function cr(a, b) { var x = lum(a), y = lum(b); if (x < y) { var t = x; x = y; y = t; } return (x + .05) / (y + .05); }
  /** solid background behind el; null when a gradient / image sits anywhere above it */
  function bgOf(el) {
    var stack = []; for (var e = el; e; e = e.parentElement) { var cs = getComputedStyle(e); if (cs.backgroundImage !== "none") return null; stack.push(cs.backgroundColor); }
    var c = { r: 255, g: 255, b: 255, a: 1 }; for (var i = stack.length - 1; i >= 0; i--) c = over(parse(stack[i]), c); return c;
  }
  var PLATES = ".ico-bx, .ico-neu, .ico-gl, .ico-tile";
  function audit(pageEl, combo, page) {
    var W = window.innerWidth, add = function (type, el, extra) { D.issues.push({ type: type, sel: sel(el), combo: combo, page: page, extra: extra || "" }); };
    if (document.documentElement.scrollWidth > W + 1) D.issues.push({ type: "page-h-scroll", sel: "html", combo: combo, page: page, extra: document.documentElement.scrollWidth + ">" + W });
    pageEl.querySelectorAll("details").forEach(function (d) { d.open = true; });   // check folded content too
    var all = pageEl.querySelectorAll("*"), seen = {}; D.audited += all.length;
    for (var i = 0; i < all.length; i++) {
      var el = all[i]; if (!visible(el) || el.closest("svg") && el.tagName !== "svg") continue;
      var cd = el.closest("details:not([open])"); if (cd && !el.closest("summary")) continue;   // folded content is not on screen
      if (el.closest(".is-opt, .sp-opt, .palette-opt")) continue;   // previews of a style show that style on purpose
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.position !== "fixed" && !inScroller(el, pageEl) && (r.right > W + 2 || r.left < -2) && !seen["o" + sel(el)]) { seen["o" + sel(el)] = 1; add("off-screen", el, Math.round(r.left) + ".." + Math.round(r.right)); }
      if ((cs.overflow === "hidden" || cs.overflowX === "hidden") && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0 && el.textContent.trim() && el.children.length < 6 && !seen["c" + sel(el)]) { seen["c" + sel(el)] = 1; add("clipped-text", el, el.scrollWidth + ">" + el.clientWidth); }
      if (el.matches(PLATES)) {
        var par = el.parentElement, depth = 0;
        for (var p = par; p && p !== pageEl && depth < 3; p = p.parentElement, depth++) if (p.matches("button, .chip, .tag, .pill, .badge, .seg-btn, summary, a, .nav-row-ico, .nav-card-icon, .hl-ico, .btn-primary, .btn-secondary, .empty-icon")) { var plated = getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" || getComputedStyle(el).boxShadow !== "none"; if (plated && !p.matches(".hg-tile, .hv-row")) add("plate-in-control", el, sel(p)); break; }
        for (var q = el.parentElement, dd = 0; q && q !== pageEl && dd < 3; q = q.parentElement, dd++) { var qs = getComputedStyle(q), qr = q.getBoundingClientRect(), rad = parseFloat(qs.borderTopLeftRadius) || 0; if (qr.width > 0 && qr.width < 90 && rad >= qr.width * .4 && getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)") { add("plate-in-circle", el, sel(q)); break; } }
        if (r.width > 72) add("icon-too-big", el, Math.round(r.width));
      }
      if (el.tagName === "svg" && el.classList.contains("si")) {
        var sib = el.parentElement && el.parentElement.children; if (!sib) continue;
        if (r.width < 8) add("icon-tiny", el, Math.round(r.width));
      }
      if (el.matches("button, .chip, .btn-primary, .btn-secondary, .seg-btn") && el.scrollWidth > el.clientWidth + 3 && cs.overflow !== "visible" && !seen["b" + sel(el)]) { seen["b" + sel(el)] = 1; add("control-overflow", el, el.scrollWidth + ">" + el.clientWidth); }
      if (el.childNodes.length && Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 1; }) && !seen["t" + sel(el)]) {
        var bg = bgOf(el); if (bg) { var fg = over(parse(cs.color), bg), ratio = cr(fg, bg); if (ratio < 3 && +cs.opacity > .5 && parseFloat(cs.fontSize) >= 11) { seen["t" + sel(el)] = 1; add("low-contrast", el, ratio.toFixed(2)); } }
      }
    }
    // controls that overlap each other
    var ctl = Array.prototype.filter.call(pageEl.querySelectorAll("button, a.nav-row, .chip, input, select"), function (e) { return visible(e) && !(e.closest("details:not([open])") && !e.closest("summary")); });
    for (var a = 0; a < ctl.length && a < 160; a++) for (var b = a + 1; b < ctl.length && b < 160; b++) {
      if (ctl[a].contains(ctl[b]) || ctl[b].contains(ctl[a])) continue;
      var A = ctl[a].getBoundingClientRect(), B = ctl[b].getBoundingClientRect(), ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ix > 6 && iy > 6 && ix * iy > .25 * Math.min(A.width * A.height, B.width * B.height) && !seen["x" + sel(ctl[a]) + sel(ctl[b])]) { seen["x" + sel(ctl[a]) + sel(ctl[b])] = 1; add("overlap", ctl[a], sel(ctl[b])); }
    }
  }
  var PAGES = CONFIG.pages || ["home", "dashboard", "games", "polls", "sessions", "payments", "settings", "stats", "health", "config", "group-settings", "group-members", "matches", "public", "groups", "group-create", "trash"];
  var ICONS = CONFIG.icons || ["box", "neu", "glass", "classic", "tiles"];
  function run() {
    try { setup(); } catch (e) { D.errors.push("setup: " + e.message); }
    if (CONFIG.eval) { try { D.eval = String(window.eval(CONFIG.eval)); } catch (e) { D.eval = "ERR " + e.message; } finish(); return; }   // debugging: evaluate one expression in the harness page
    var T = themes(); if (CONFIG.themes) T = T.filter(function (x) { return CONFIG.themes.indexOf(x.n) >= 0; }); var ti = 0, ii = 0, pi = 0;
    function step() {
      var t0 = Date.now();
      while (ti < T.length && Date.now() - t0 < 600) {
        var th = T[ti], ic = ICONS[ii], combo = th.n + " | " + ic;
        try { if (pi === 0) applyTheme(th, ic); showPage(PAGES[pi]); var pg = document.getElementById("page-" + PAGES[pi]); if (pg) audit(pg, combo, PAGES[pi]); D.renders++; } catch (e) { D.errors.push(PAGES[pi] + ": " + String(e.message).slice(0, 140)); }
        if (CONFIG.shot) { ti = T.length; } else if (++pi >= PAGES.length) { pi = 0; if (++ii >= ICONS.length) { ii = 0; ti++; } }
      }
      if (CONFIG.shot) { finish(); return; }
      if (ti < T.length) setTimeout(step, 0); else finish();
    }
    step();
  }
  function finish() {
    if (window.parent !== window) { window.parent.postMessage({ uimRes: JSON.stringify(D) }, "*"); return; }
    var pre = document.createElement("pre"); pre.id = "res"; pre.textContent = JSON.stringify(D); document.body.appendChild(pre); document.title = "DONE";
  }
  window.addEventListener("load", function () { setTimeout(run, 300); });
})();
