/* Share my stats card: a picture (canvas) of my rating, win rate, games, streak and best partner,
   drawn in the app's look or in one of the special themes, shared with the phone's share sheet or saved.
   Own card only. Numbers come from stats-core.js (one source), so the card always matches the app. */

var SC_THEMES = {
  halloween: { name: "spHalloween", bg: ["#0f0826", "#1b0f45", "#33176e"], card: "rgba(37,22,80,.82)", edge: "#7a4fd0", text: "#f6f0ff", dim: "#d3c5ee", accent: "#fdba74", pill: "#c2410c" },
  christmas: { name: "spChristmas", bg: ["#05160b", "#0c2e1b", "#14482c"], card: "rgba(20,61,38,.84)", edge: "#4aa571", text: "#f4fff6", dim: "#cfe8d6", accent: "#fde68a", pill: "#b91c1c" },
  songkran: { name: "spSongkran", bg: ["#043249", "#0a5a85", "#0e86b8"], card: "rgba(10,77,116,.82)", edge: "#4ab0dd", text: "#f0faff", dim: "#c2e6f7", accent: "#fcd34d", pill: "#0369a1" },
  arcade: { name: "spArcade", bg: ["#080314", "#160630", "#2a0b55"], card: "rgba(28,11,61,.86)", edge: "#e879f9", text: "#f7f0ff", dim: "#d6c3f2", accent: "#22d3ee", pill: "#a21caf" }
};

var _sc = { uid: null, theme: "auto", fmt: "story", canvas: null, avatar: null };

/** All numbers on the card, plain data (no HTML), for the chosen period */
function shareCardData(uid, scope) {
  var u = findUser(uid) || {}, sf = statsFor(uid, scope), st = computeStats(), p = st.players[uid];
  var bp = bestPartnerOf(uid, scope), tr = ratingTrend(uid, scope);
  var scopeKey = (STATS_SCOPES.filter(function (x) { return x[0] === scope; })[0] || STATS_SCOPES[0])[1];
  return {
    name: plainUserName(u), level: playerLevel(uid), rank: rankOf(uid, scope),
    rating: p && p.comp ? Math.round(p.rating) : null,
    winRate: sf.winRate, played: sf.played, streak: sf.streakNow,
    partner: bp ? { name: plainUserName(findUser(bp.uid)), n: bp.n, rate: Math.round(bp.rate * 100) } : null,
    trend: tr && tr.vals && tr.vals.length > 2 ? tr.vals : null,
    form: formStrip(uid, 5).map(function (g) { return !!g.won; }),
    period: t(scopeKey), group: typeof currentGroup !== "undefined" && currentGroup ? currentGroup.name : ""
  };
}

function _scPalette(id) {
  if (SC_THEMES[id]) return SC_THEMES[id];
  var cs = getComputedStyle(document.body), g = function (k, d) { return (cs.getPropertyValue(k) || "").trim() || d; };
  var bg = g("--bg", "#060d1a"), card = g("--card", "#18304f");
  return { name: "scDefault", bg: [bg, bg, card], card: card, edge: g("--border", "#2b4c74"), text: g("--text", "#edf2f8"), dim: g("--text-secondary", "#a9b7c9"),
    accent: g("--accent", "#4ade80"), pill: g("--primary", "#0f766e") };
}

function _scThemeId() {
  if (_sc.theme !== "auto") return _sc.theme;
  var dark = document.body.getAttribute("data-theme") !== "light";
  return dark && typeof currentSpecial !== "undefined" && currentSpecial ? currentSpecial : "default";
}

function _scRound(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Theme backdrop: sky / lights / water / neon, drawn from simple shapes */
function _scBackdrop(c, W, H, id, P) {
  var gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P.bg[0]); gr.addColorStop(.55, P.bg[1]); gr.addColorStop(1, P.bg[2]);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  var rnd = function (i) { var x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  var glow = function (x, y, r, col) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
  var i, x, y;
  if (id === "halloween") {
    for (i = 0; i < 70; i++) { c.fillStyle = "rgba(255,255,255," + (.3 + rnd(i) * .6) + ")"; c.beginPath(); c.arc(rnd(i + 1) * W, rnd(i + 2) * H * .6, 1 + rnd(i + 3) * 2.2, 0, 7); c.fill(); }
    glow(W - 190, 210, 330, "rgba(253,186,116,.35)");
    var mg = c.createRadialGradient(W - 210, 190, 10, W - 190, 210, 120); mg.addColorStop(0, "#ffe9b8"); mg.addColorStop(.7, "#f9c06b"); mg.addColorStop(1, "#e8893a");
    c.fillStyle = mg; c.beginPath(); c.arc(W - 190, 210, 120, 0, 7); c.fill();
    c.fillStyle = "rgba(176,92,30,.4)"; [[-30, -30, 18], [30, 20, 14], [-10, 50, 11], [45, -40, 9]].forEach(function (k) { c.beginPath(); c.arc(W - 190 + k[0], 210 + k[1], k[2], 0, 7); c.fill(); });
    c.strokeStyle = "rgba(233,213,255,.5)"; c.lineWidth = 2;
    for (i = 1; i <= 6; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(i * 55, 330); c.stroke(); }
    for (i = 1; i <= 5; i++) { c.beginPath(); c.arc(0, 0, i * 62, 0, Math.PI / 2); c.stroke(); }
    c.fillStyle = "#0a0420"; c.beginPath(); c.moveTo(0, H); c.lineTo(0, H - 150); c.quadraticCurveTo(300, H - 190, 560, H - 130); c.quadraticCurveTo(820, H - 170, W, H - 140); c.lineTo(W, H); c.fill();
    c.fillRect(W - 330, H - 330, 250, 200); c.fillRect(W - 270, H - 410, 60, 90); c.beginPath(); c.moveTo(W - 280, H - 410); c.lineTo(W - 240, H - 470); c.lineTo(W - 200, H - 410); c.fill();
    c.fillStyle = "#fdba74"; [[W - 300, H - 290], [W - 240, H - 290], [W - 180, H - 250], [W - 250, H - 380]].forEach(function (k) { c.fillRect(k[0], k[1], 24, 32); });
    c.fillStyle = "#0a0420"; for (i = 0; i < 4; i++) { var bx = 120 + i * 210, by = 460 + (i % 2) * 90; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + 30, by - 36, bx + 66, by); c.quadraticCurveTo(bx + 33, by - 10, bx, by); c.fill(); c.beginPath(); c.moveTo(bx + 66, by); c.quadraticCurveTo(bx + 100, by - 36, bx + 132, by); c.quadraticCurveTo(bx + 100, by - 10, bx + 66, by); c.fill(); }
  } else if (id === "christmas") {
    for (i = 0; i < 90; i++) { c.fillStyle = "rgba(255,255,255," + (.4 + rnd(i) * .55) + ")"; c.beginPath(); c.arc(rnd(i + 1) * W, rnd(i + 2) * H, 2 + rnd(i + 3) * 5, 0, 7); c.fill(); }
    var cols = ["#ef4444", "#fde68a", "#4ade80", "#60a5fa"];
    for (x = 20, i = 0; x < W; x += 54, i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.arc(x, 26 + Math.sin(i) * 6, 9, 0, 7); c.fill(); glow(x, 26, 30, "rgba(255,255,255,.18)"); }
    c.fillStyle = "#03120b";
    [[120, 320, 1], [330, 230, .7], [W - 150, 380, 1.1], [W - 360, 250, .75]].forEach(function (t) {
      var bx = t[0], h = t[1] * t[2], w = 150 * t[2]; c.beginPath(); c.moveTo(bx, H - h); c.lineTo(bx + w / 2, H - h * .45); c.lineTo(bx + w / 4, H - h * .45); c.lineTo(bx + w * .6, H - h * .12); c.lineTo(bx - w * .6, H - h * .12); c.lineTo(bx - w / 4, H - h * .45); c.lineTo(bx - w / 2, H - h * .45); c.closePath(); c.fill(); c.fillRect(bx - 14, H - h * .12, 28, h * .12 + 10);
    });
  } else if (id === "songkran") {
    glow(W - 170, 200, 360, "rgba(252,211,77,.4)"); var sg = c.createRadialGradient(W - 170, 200, 4, W - 170, 200, 110); sg.addColorStop(0, "#fff3b0"); sg.addColorStop(1, "#fcd34d"); c.fillStyle = sg; c.beginPath(); c.arc(W - 170, 200, 110, 0, 7); c.fill();
    c.strokeStyle = "rgba(186,230,253,.7)"; c.lineWidth = 4;
    for (i = 0; i < 18; i++) { x = rnd(i) * W; y = H * .25 + rnd(i + 5) * H * .6; var r = 10 + rnd(i + 9) * 30; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); c.fillStyle = "rgba(255,255,255,.08)"; c.fill(); }
    [[.55, .3], [.7, .5]].forEach(function (w, k) { c.fillStyle = "rgba(" + (k ? "14,165,233" : "56,189,248") + "," + w[1] + ")"; c.beginPath(); c.moveTo(0, H); c.lineTo(0, H - 170 - k * 60);
      for (x = 0; x <= W; x += 20) c.lineTo(x, H - 170 - k * 60 + Math.sin(x / 70 + k * 2) * 24); c.lineTo(W, H); c.fill(); });
  } else if (id === "arcade") {
    glow(W / 2, H - 520, 520, "rgba(232,121,249,.35)");
    var ag = c.createLinearGradient(0, H - 640, 0, H - 400); ag.addColorStop(0, "#fde047"); ag.addColorStop(.6, "#fb7185"); ag.addColorStop(1, "#c026d3");
    c.fillStyle = ag; c.beginPath(); c.arc(W / 2, H - 520, 170, Math.PI, 0); c.fill();
    c.strokeStyle = "rgba(34,211,238,.6)"; c.lineWidth = 2;
    for (i = 0; i <= 14; i++) { c.beginPath(); c.moveTo(W / 2 + (i - 7) * 20, H - 400); c.lineTo(W / 2 + (i - 7) * 160, H); c.stroke(); }
    for (i = 0; i < 9; i++) { y = H - 400 + Math.pow(i / 8, 2) * 400; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = "rgba(255,255,255,.04)"; for (y = 0; y < H; y += 6) c.fillRect(0, y, W, 2);
  } else {
    glow(W / 2, 300, 620, "rgba(255,255,255,.08)"); glow(W - 100, H - 100, 520, P.accent.charAt(0) === "#" ? P.accent + "33" : "rgba(255,255,255,.06)");
  }
}

/** The whole card. fmt: "story" 1080x1920 or "square" 1080x1350 */
function drawShareCard(canvas, d, id, fmt) {
  var W = 1080, H = fmt === "square" ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  var font = function (px, w) { return (w || 700) + " " + px + "px Montserrat, 'Noto Sans Lao', 'Noto Sans', sans-serif"; };
  _scBackdrop(c, W, H, id, P);
  var sq = fmt === "square", top = sq ? 70 : 150;
  // brand
  c.textAlign = "center"; c.fillStyle = P.accent; c.font = font(34, 800); c.fillText("GODSMASH", W / 2, top);
  c.fillStyle = P.dim; c.font = font(28, 600); c.fillText(d.period + (d.group ? "  ·  " + d.group : ""), W / 2, top + 46);
  // avatar
  var ay = top + (sq ? 190 : 270), ar = sq ? 110 : 140;
  c.save(); c.shadowColor = P.accent; c.shadowBlur = 40; c.strokeStyle = P.accent; c.lineWidth = 8; c.beginPath(); c.arc(W / 2, ay, ar + 8, 0, 7); c.stroke(); c.restore();
  c.save(); c.beginPath(); c.arc(W / 2, ay, ar, 0, 7); c.clip();
  if (_sc.avatar) { var s = Math.min(_sc.avatar.width, _sc.avatar.height); c.drawImage(_sc.avatar, (_sc.avatar.width - s) / 2, (_sc.avatar.height - s) / 2, s, s, W / 2 - ar, ay - ar, ar * 2, ar * 2); }
  else { c.fillStyle = P.pill; c.fillRect(W / 2 - ar, ay - ar, ar * 2, ar * 2); c.fillStyle = "#fff"; c.font = font(ar, 800); c.textBaseline = "middle"; c.fillText((d.name || "?").charAt(0).toUpperCase(), W / 2, ay + 6); c.textBaseline = "alphabetic"; }
  c.restore();
  // name, level, rank
  var ny = ay + ar + (sq ? 80 : 100); c.fillStyle = P.text; c.font = font(sq ? 60 : 68, 800);
  var nm = d.name; while (c.measureText(nm).width > W - 160 && nm.length > 3) nm = nm.slice(0, -2); if (nm !== d.name) nm += "…";
  c.fillText(nm, W / 2, ny);
  var chips = []; if (d.level) chips.push(d.level); if (d.rank) chips.push("#" + d.rank);
  if (chips.length) { var cx = W / 2 - (chips.length * 150 + (chips.length - 1) * 16) / 2; chips.forEach(function (tx) { c.fillStyle = P.pill; _scRound(c, cx, ny + 26, 150, 56, 28); c.fill(); c.fillStyle = "#fff"; c.font = font(30, 800); c.fillText(tx, cx + 75, ny + 65); cx += 166; }); }
  // rating
  var ry = ny + (sq ? 272 : 335);
  c.fillStyle = P.dim; c.font = font(30, 700); c.fillText(t("homeRating").toUpperCase(), W / 2, ry - (sq ? 150 : 210));
  c.save(); c.shadowColor = P.accent; c.shadowBlur = 36; c.fillStyle = P.text; c.font = font(sq ? 190 : 250, 800); c.fillText(d.rating == null ? "–" : String(d.rating), W / 2, ry); c.restore();
  // three facts
  var fy = ry + (sq ? 50 : 80), bw = 300, gap = 30, fx = (W - (bw * 3 + gap * 2)) / 2;
  var streak = d.streak > 0 ? d.streak + t("winShort") : d.streak < 0 ? (-d.streak) + t("lossShort") : "–";
  [[d.winRate == null ? "–" : d.winRate + "%", t("winRate")], [String(d.played), t("gamesWord")], [streak, t("streak")]].forEach(function (f, k) {
    var x0 = fx + k * (bw + gap); c.fillStyle = P.card; _scRound(c, x0, fy, bw, 190, 36); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    c.fillStyle = P.text; c.font = font(76, 800); c.fillText(f[0], x0 + bw / 2, fy + 100); c.fillStyle = P.dim; c.font = font(26, 600); c.fillText(f[1], x0 + bw / 2, fy + 150);
  });
  var y = fy + 190 + (sq ? 50 : 58);
  // best partner
  if (d.partner) {
    c.fillStyle = P.card; _scRound(c, 90, y, W - 180, 130, 36); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    c.textAlign = "left"; c.fillStyle = P.dim; c.font = font(26, 700); c.fillText(t("bestPartner").toUpperCase(), 130, y + 48);
    c.fillStyle = P.text; c.font = font(44, 800); var pn = d.partner.name; while (c.measureText(pn).width > 560 && pn.length > 3) pn = pn.slice(0, -2);
    c.fillText(pn, 130, y + 100); c.textAlign = "right"; c.fillStyle = P.accent; c.font = font(60, 800); c.fillText(d.partner.rate + "%", W - 130, y + 90);
    c.fillStyle = P.dim; c.font = font(24, 600); c.fillText(d.partner.n + " " + t("gamesWord"), W - 130, y + 118); c.textAlign = "center"; y += 130 + (sq ? 36 : 40);
  }
  // trend + form
  if (!sq && d.trend) {
    var lo = Math.min.apply(null, d.trend), hi = Math.max.apply(null, d.trend), x1 = 130, x2 = W - 130, yy = y, hh = 120;
    c.strokeStyle = P.accent; c.lineWidth = 8; c.lineJoin = "round"; c.beginPath();
    d.trend.forEach(function (v, k) { var px = x1 + (x2 - x1) * k / (d.trend.length - 1), py = yy + hh - (hi === lo ? hh / 2 : (v - lo) / (hi - lo) * hh); if (k) c.lineTo(px, py); else c.moveTo(px, py); }); c.stroke();
    y += hh + 50;
  }
  if (d.form.length) {
    var fxs = W / 2 - (d.form.length * 84 - 20) / 2; d.form.forEach(function (w, k) { c.fillStyle = w ? "#16a34a" : "#dc2626"; _scRound(c, fxs + k * 84, y, 64, 64, 18); c.fill(); c.fillStyle = "#fff"; c.font = font(32, 800); c.fillText(w ? t("winShort") : t("lossShort"), fxs + k * 84 + 32, y + 44); });
  }
  c.fillStyle = P.dim; c.font = font(26, 600); c.fillText("phounsiris-sketch.github.io/bughunters", W / 2, H - (sq ? 40 : 70));
}

/** Avatar for the canvas: data URL or stored image only (a web link would taint the canvas) */
function _scLoadAvatar(uid) {
  var u = findUser(uid) || {}, v = safeUrl(u.avatarUrl || "");
  if (!v || (!isImgRef(v) && v.indexOf("data:") !== 0)) return Promise.resolve(null);
  var toImg = function (src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); };
  if (!isImgRef(v)) return toImg(v);
  var id = v.slice(4);
  if (_imgCache[id]) return toImg(_imgCache[id]);
  return fsdb.collection("images").doc(id).get().then(function (doc) { return doc.exists ? toImg(doc.data().data) : null; }).catch(function () { return null; });
}

function openShareCard(uid) {
  uid = uid || (currentUser && currentUser.uid); if (!uid) return;
  _sc.uid = uid; _sc.theme = "auto"; _sc.fmt = "story"; _sc.avatar = null;
  var old = document.getElementById("shareSheet"); if (old) old.remove();
  var el = document.createElement("div"); el.id = "shareSheet"; el.className = "sheet-wrap";
  el.innerHTML = '<div class="sheet sc-sheet" role="dialog" aria-modal="true" aria-label="' + escapeHtml(t("shareCardTitle")) + '"><div class="sheet-grab"></div>' +
    '<div class="sheet-title">' + escapeHtml(t("shareCardTitle")) + '</div><div class="sc-prev"><canvas id="scCanvas"></canvas></div>' +
    '<div class="sc-row" id="scThemes"></div><div class="sc-row" id="scFmt"></div>' +
    '<div class="ask-btns"><button type="button" class="btn-primary" id="scShare">' + icon("share", 18) + ' ' + escapeHtml(t("shareWord")) + '</button>' +
    '<button type="button" class="btn-secondary" id="scSave">' + escapeHtml(t("saveImage")) + '</button><button type="button" class="ask-no" id="scClose">' + escapeHtml(t("close")) + '</button></div></div>';
  var close = function () { document.removeEventListener("keydown", onKey, true); el.remove(); };
  var onKey = function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.onclick = function (e) { if (e.target === el) close(); };
  document.body.appendChild(el);
  el.querySelector("#scClose").onclick = close;
  el.querySelector("#scShare").onclick = function () { _scOut(true); };
  el.querySelector("#scSave").onclick = function () { _scOut(false); };
  _scControls();
  var go = function () { _scLoadAvatar(uid).then(function (im) { _sc.avatar = im; _scRedraw(); }); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  _scRedraw();
}

function _scControls() {
  var ids = ["auto", "default", "halloween", "christmas", "songkran", "arcade"], cur = _sc.theme;
  var box = document.getElementById("scThemes"); if (!box) return;
  box.innerHTML = ids.map(function (k) {
    var label = k === "auto" ? t("scAuto") : k === "default" ? t("scDefault") : t(SC_THEMES[k].name);
    return '<button type="button" class="chip' + (cur === k ? ' active' : '') + '" onclick="_scSet(\'theme\',\'' + k + '\')">' + escapeHtml(label) + '</button>';
  }).join("");
  document.getElementById("scFmt").innerHTML = [["story", "scStory"], ["square", "scSquare"]].map(function (f) {
    return '<button type="button" class="chip' + (_sc.fmt === f[0] ? ' active' : '') + '" onclick="_scSet(\'fmt\',\'' + f[0] + '\')">' + escapeHtml(t(f[1])) + '</button>';
  }).join("");
}
function _scSet(k, v) { _sc[k] = v; _scControls(); _scRedraw(); }
function _scRedraw() {
  var cv = document.getElementById("scCanvas"); if (!cv) return;
  drawShareCard(cv, shareCardData(_sc.uid, statsScope), _scThemeId(), _sc.fmt);
  _sc.canvas = cv;
}

/** Share through the phone's share sheet when it can send a picture, else save the file */
function _scOut(share) {
  var cv = _sc.canvas; if (!cv) return;
  cv.toBlob(function (blob) {
    if (!blob) { showToast(t("errGeneric")); return; }
    var file = new File([blob], "godsmash-card.png", { type: "image/png" });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "Godsmash" }).catch(function () {}); return; }
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "godsmash-card.png"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    showToast(t("savedImage") + " ✔");
  }, "image/png");
}
