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
    ["nav-public", "nav-stats"].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = ""; });   // v256: 5-slot bottom bar
    currentGroup = { id: "g1", name: "Godsmash Club", type: "private", ownerId: "me", currency: "LAK", city: "Vientiane" };
    myMemberships = { g1: { id: "g1_me", gid: "g1", uid: "me", role: "owner", status: "active", perms: {} } };
    groupMembers = ids.map(function (u, i) { return { id: "g1_" + u, gid: "g1", uid: u, role: i ? "member" : "owner", status: "active" }; });
    var courts = [{ id: "c1", name: "Lao Badminton Hall", price: 80000, groupId: "g1", location: "Vientiane" }, { id: "c2", name: "Sports Center", price: 60000, groupId: "g1" }];
    DB_CACHE.courts = DB_CACHE.allCourts = DB_CACHE.groupCourts = courts;
    var d = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); };
    lastSessions = [{ id: "s1", groupId: "g1", date: d(2), time: "18:00", duration: 2, courtId: "c1", courtName: "Lao Badminton Hall", pricePerHour: 80000, players: ids, status: "upcoming", mode: "competition", createdBy: "me", payers: {} },
      { id: "s2", groupId: "g1", date: d(-3), time: "19:00", duration: 3, courtId: "c2", courtName: "Sports Center", pricePerHour: 60000, players: ids.slice(0, 4), status: "done", mode: "competition", createdBy: "me", payers: {} }];
    lastPolls = [{ id: "p1", groupId: "g1", title: "Friday game", date: d(4), time: "18:00", status: "open", options: ["Yes", "No", "Maybe"], votes: { 0: ["me", "john"], 1: ["al"], 2: [] }, createdBy: "me", courtId: "c1" }];
    // v249: a running 4-player tournament on s2 (card with progress + the i button); s1 (6 players, no tournament) shows the Start button with the estimate
    try { var T4 = tourNew(ids.slice(0, 4), function () { return 0.37; }); T4.games.slice(0, 2).forEach(function (g, i) { g.sa = 21; g.sb = 12 + i; }); lastSessions[1].tourney = T4; } catch (e) { D.errors.push("tourney fixture: " + e.message); }
    var M = [], mk = function (a, b, w, day) { return { id: "m" + M.length, groupId: "g1", date: d(day), sessionId: "s2", teamA: a, teamB: b, games: [w ? { a: 21, b: 14 } : { a: 15, b: 21 }], startAt: Date.now() - 86400000 * -day, endAt: Date.now() - 86400000 * -day + 1500000 }; };
    for (var i = 0; i < 8; i++) M.push(mk(["me", "ton"], ["al", "bo"], i % 3 !== 0, -(i % 6) - 1));
    for (var j = 0; j < 4; j++) M.push(mk(["me", "john"], ["mike", "bo"], j % 2, -j - 2));
    // v247: games with no session, a tournament game (tid) and a singles game, on other days, for the Rankings and All my matches pages
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-9), teamA: ["me", "al"], teamB: ["john", "bo"], games: [{ a: 21, b: 19 }, { a: 17, b: 21 }, { a: 21, b: 18 }] });
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-9), teamA: ["john", "mike"], teamB: ["me", "ton"], games: [{ a: 21, b: 12 }] });
    M.push({ id: "t:s2:0", groupId: "g1", date: d(-3), sessionId: "s2", tid: "s2", tstage: "rot", teamA: ["me", "mike"], teamB: ["ton", "bo"], games: [{ a: 21, b: 16 }] });
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-12), teamA: ["me"], teamB: ["al"], type: "singles", games: [{ a: 15, b: 21 }] });
    for (var k = 0; k < 6; k++) M.push({ id: "m" + M.length, groupId: "g1", date: d(-20 - k), teamA: ["ton", "mike"], teamB: ["al", "bo"], games: [{ a: 21, b: 10 + k }] });   // pairs that grow the lists past 7 rows
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-21), teamA: ["john", "al"], teamB: ["ton", "bo"], games: [{ a: 21, b: 17 }] });
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-22), teamA: ["mike", "bo"], teamB: ["me", "al"], games: [{ a: 18, b: 21 }] });
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-23), teamA: ["john", "ton"], teamB: ["mike", "al"], games: [{ a: 21, b: 19 }] });
    M.push({ id: "m" + M.length, groupId: "g1", date: d(-24), teamA: ["john", "bo"], teamB: ["ton", "al"], games: [{ a: 12, b: 21 }] });
    M.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    lastMatches = M; _matchesReal = M; _matchesUnsub = function () {};   // v247: the stub snapshot would otherwise empty the list on the first Rankings visit
    try { _statsCache = null; } catch (e) {}
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
    var ip = String(icons).split("+"); currentIconTheme = ip[0]; currentDashPack = ip[1] || "clay"; _chromeKey = "reset"; applyChromeIcons();   // "box+3d" = icon style box with the dashboard pack 3d
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
    // optional "act":"nav-stats" in the wrapper hash: show that bar slot as active (screenshots of a middle / last slot on a calm page)
    if (CONFIG.act) { document.querySelectorAll("#bottomNav .nav-item").forEach(function (b) { var on = b.id === CONFIG.act; b.classList.toggle("active", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }); if (typeof positionNavHump === "function") positionNavHump(true); }
    // v256: bottom bar contrast: glyph on the active circle >= 3, active label on the bar >= 4.5
    (function () {
      var ai = document.querySelector("#bottomNav .nav-item.active .nav-icon"), at = document.querySelector("#bottomNav .nav-item.active .nav-text"), bar = document.querySelector("#bottomNav .nb-bar");
      if (!ai || !at || !bar) return;
      var nt = document.getElementById("uim-nt"); if (!nt) { nt = document.createElement("style"); nt.id = "uim-nt"; nt.textContent = "#bottomNav *, #bottomNav *::before { transition: none !important; }"; document.head.appendChild(nt); }   // read settled colours, not mid-transition ones
      void ai.offsetWidth;
      var cv = document.createElement("canvas"); cv.width = cv.height = 1; var cx = cv.getContext("2d", { willReadFrequently: true });
      function rgba(c) { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); var d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; }   // color-mix() computes to color(srgb ..), so normalise through a canvas
      var dot = rgba(getComputedStyle(ai, "::before").backgroundColor), ic = over(rgba(getComputedStyle(ai).color), dot), r1 = cr(ic, dot);
      var bb = over(rgba(getComputedStyle(bar).backgroundColor), { r: 0, g: 0, b: 0, a: 1 }), lb = over(rgba(getComputedStyle(at).color), bb), r2 = cr(lb, bb);
      if (r1 < 3) add("nav-icon-contrast", ai, r1.toFixed(2)); if (r2 < 4.5) add("nav-label-contrast", at, r2.toFixed(2));
      D.navC = D.navC || {}; D.navC[combo] = r1.toFixed(1) + "/" + r2.toFixed(1) + " " + (document.querySelector("#bottomNav .nb-hump").style.transform || "none") + " " + document.querySelector("#bottomNav .nb-hump").getBoundingClientRect().top;
    })();
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
  var PAGES = CONFIG.pages || ["home", "dashboard", "games", "polls", "sessions", "payments", "settings", "stats", "health", "config", "group-settings", "group-members", "profile", "profile-sub", "matches", "matches-all", "public", "groups", "group-create", "trash"];
  var ICONS = CONFIG.icons || ["box", "neu", "glass", "classic", "tiles", "box+3d"];
  function run() {
    try { setup(); } catch (e) { D.errors.push("setup: " + e.message); }
    if (CONFIG.eval) { try { D.eval = String(window.eval(CONFIG.eval)); } catch (e) { D.eval = "ERR " + e.message; } finish(); return; }   // debugging: evaluate one expression in the harness page
    if (CONFIG.lang) { currentLang = CONFIG.lang; try { applyI18n(); } catch (e) {} }   // "en" | "la": the harness starts in Lao
    if (CONFIG.pre) { try { window.eval(CONFIG.pre); } catch (e) { D.errors.push("pre: " + e.message); } }   // e.g. pfTab="badminton" to open a tab before the render
    var T = themes(); if (CONFIG.themes) T = T.filter(function (x) { return CONFIG.themes.indexOf(x.n) >= 0; }); var ti = 0, ii = 0, pi = 0;
    function step() {
      var t0 = Date.now();
      while (ti < T.length && Date.now() - t0 < 600) {
        var th = T[ti], ic = ICONS[ii], combo = th.n + " | " + ic;
        try { if (pi === 0) applyTheme(th, ic); showPage(PAGES[pi]); var pg = document.getElementById("page-" + PAGES[pi]); if (pg) audit(pg, combo, PAGES[pi]); D.renders++; } catch (e) { D.errors.push(PAGES[pi] + ": " + String(e.message).slice(0, 140)); }
        if (CONFIG.shot) { ti = T.length; } else if (++pi >= PAGES.length) { pi = 0; if (++ii >= ICONS.length) { ii = 0; ti++; } }
      }
      if (CONFIG.shot) {   // "post": code run after the page is drawn (open a sheet, scroll), then a short wait for it to draw
        if (CONFIG.post) { try { window.eval(CONFIG.post); } catch (e) { D.errors.push("post: " + String(e.message).slice(0, 140)); } setTimeout(finish, 700); } else finish();
        return;
      }
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
