/* Share my stats card: a picture (canvas) of my rating, win rate, games, streak and best partner,
   drawn in the app's look or in one of the special themes, shared with the phone's share sheet or saved.
   Own card only. Numbers come from stats-core.js (one source), so the card always matches the app. */

var SC_THEMES = {
  halloween: { name: "spHalloween", bg: ["#0f0826", "#1b0f45", "#33176e"], card: "rgba(37,22,80,.82)", edge: "#7a4fd0", text: "#f6f0ff", dim: "#d3c5ee", accent: "#fdba74", pill: "#c2410c" },
  cny: { name: "spCny", bg: ["#1c0303", "#4a0a0a", "#7a1212"], card: "rgba(79,16,16,.84)", edge: "#e0a43a", text: "#fff7e6", dim: "#f5d9b0", accent: "#fcd34d", pill: "#b91c1c" },
  orbs: { name: "spOrbs", bg: ["#0a3b3f", "#137a6c", "#25a07c"], card: "rgba(16,74,152,.82)", edge: "#fbbf24", text: "#ffffff", dim: "#dbeafe", accent: "#fbbf24", pill: "#c2410c" },
  pirate: { name: "spPirate", bg: ["#040d24", "#0a2152", "#12399a"], card: "rgba(19,53,115,.86)", edge: "#fbbf24", text: "#fff8e7", dim: "#e7ddc2", accent: "#fbbf24", pill: "#dc2626" },
  reaper: { name: "spReaper", bg: ["#050508", "#0c0c14", "#161620"], card: "rgba(27,27,36,.88)", edge: "#a1a1aa", text: "#fafafa", dim: "#d4d4d8", accent: "#fb923c", pill: "#c2410c" },
  doraemon: { name: "spDoraemon", bg: ["#061c44", "#0b4a9e", "#1d7be0"], card: "rgba(15,91,181,.84)", edge: "#fde047", text: "#ffffff", dim: "#dbeafe", accent: "#fde047", pill: "#e11d48" },
  valentine: { name: "spValentine", bg: ["#1f060d", "#4a0f20", "#7f1636"], card: "rgba(92,18,40,.86)", edge: "#fda4af", text: "#fff1f2", dim: "#fecdd3", accent: "#fda4af", pill: "#e11d48" },
  jujutsu: { name: "spJujutsu", bg: ["#04030a", "#0f0b22", "#241a52"], card: "rgba(26,20,54,.88)", edge: "#a78bfa", text: "#f5f3ff", dim: "#ddd6fe", accent: "#38bdf8", pill: "#6d28d9" },
};

var _sc = { uid: null, theme: "auto", fmt: "story", canvas: null, avatar: null, mode: "profile", arg: null, pick: "" };

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

var SC_CARD_ALPHA = 0.1;   // card panels: 90% transparent
function _scPalette(id) {
  var P = Object.assign({}, SC_THEMES[id] || { name: "scDefault", bg: ["#052e22", "#0b4f36", "#15803d"], card: "rgba(4,36,26,.82)", edge: "#86efac", text: "#ffffff", dim: "#d1fae5", accent: "#fde047", pill: "#15803d" });
  P.card = P.card.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, "rgba($1,$2,$3," + SC_CARD_ALPHA + ")");   // panels are 90% see-through (alpha .10)
  P.line = id === "default" || !SC_THEMES[id] ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.2)";
  return P;
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
  } else if (id === "cny") {
    for (i = 0; i < 40; i++) { c.fillStyle = "rgba(252,211,77," + (.25 + rnd(i) * .6) + ")"; c.beginPath(); c.arc(rnd(i + 1) * W, 200 + rnd(i + 2) * (H - 500), 1.5 + rnd(i + 3) * 3, 0, 7); c.fill(); }
    [[70, 130, .05], [215, 96, -.04], [W - 215, 104, .04], [W - 70, 136, -.05]].forEach(function (l) { fxLantern(c, l[0], 0, l[1] * 1.15, l[2], true); });
    fxDragon(c, W - 300, H - 150, 1.55, 2.1);
    fxLion(c, 190, H - 120, 230, 1.05);
  } else if (typeof FX_SCENES !== "undefined" && FX_SCENES[id] && /^(orbs|pirate|reaper|doraemon|valentine|jujutsu)$/.test(id)) {
    var k = W / 430; c.save(); c.scale(k, k); FX_SCENES[id](c, 430, H / k, 3.4); c.restore();
  } else {
    glow(W / 2, 300, 620, "rgba(255,255,255,.08)"); glow(W - 100, H - 100, 520, P.accent.charAt(0) === "#" ? P.accent + "33" : "rgba(255,255,255,.06)");
  }
}


/** Badminton court seen from above: outer lines, singles sidelines, service lines, centre line and the net */
function _scCourt(c, W, H, P) {
  var x0 = 70, x1 = W - 70, y0 = 250, y1 = H - 130, w = x1 - x0, h = y1 - y0, mid = y0 + h / 2;
  c.save(); c.strokeStyle = P.line; c.lineWidth = 7; c.lineJoin = "round";
  c.strokeRect(x0, y0, w, h);
  var side = w * 0.075; c.beginPath(); c.moveTo(x0 + side, y0); c.lineTo(x0 + side, y1); c.moveTo(x1 - side, y0); c.lineTo(x1 - side, y1); c.stroke();
  var sv = h * 0.215, lg = h * 0.058;                      // short service line 1.98 m from the net, doubles long line 0.76 m from the back
  [[mid - sv, mid - sv], [mid + sv, mid + sv], [y0 + lg, y0 + lg], [y1 - lg, y1 - lg]].forEach(function (l, i) { c.beginPath(); c.moveTo(i < 2 ? x0 : x0 + side, l[0]); c.lineTo(i < 2 ? x1 : x1 - side, l[1]); c.stroke(); });
  c.beginPath(); c.moveTo(W / 2, y0); c.lineTo(W / 2, mid - sv); c.moveTo(W / 2, mid + sv); c.lineTo(W / 2, y1); c.stroke();
  // net: a band with a mesh
  c.globalAlpha = .55; c.lineWidth = 3; c.beginPath(); c.moveTo(x0 - 24, mid); c.lineTo(x1 + 24, mid); c.stroke();
  c.lineWidth = 2; c.globalAlpha = .28;
  for (var k = x0 - 24; k <= x1 + 24; k += 22) { c.beginPath(); c.moveTo(k, mid - 14); c.lineTo(k, mid + 14); c.stroke(); }
  c.beginPath(); c.moveTo(x0 - 24, mid - 14); c.lineTo(x1 + 24, mid - 14); c.moveTo(x0 - 24, mid + 14); c.lineTo(x1 + 24, mid + 14); c.stroke();
  c.restore();
}

/** Shuttlecock pointing up: cork head, feather skirt with ribs and a rim band */
function _scShuttle(c, x, y, size, rot, fill, alpha) {
  c.save(); c.translate(x, y); c.rotate(rot * Math.PI / 180); c.globalAlpha = alpha == null ? 1 : alpha;
  var s = size;
  c.fillStyle = fill; c.strokeStyle = "rgba(0,0,0,.28)"; c.lineWidth = Math.max(2, s / 40);
  c.beginPath(); c.moveTo(-s * .2, s * .12); c.lineTo(-s * .62, -s * .78); c.quadraticCurveTo(0, -s * 1.02, s * .62, -s * .78); c.lineTo(s * .2, s * .12); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); for (var i = -3; i <= 3; i++) { c.moveTo(i * s * .06, s * .1); c.lineTo(i * s * .205, -s * .86 + Math.abs(i) * s * .035); } c.stroke();
  c.lineWidth = Math.max(3, s / 22); c.beginPath(); c.moveTo(-s * .58, -s * .76); c.quadraticCurveTo(0, -s * .98, s * .58, -s * .76); c.stroke();
  c.fillStyle = "#f5deb3"; c.beginPath(); c.arc(0, s * .24, s * .24, 0, 7); c.fill(); c.strokeStyle = "rgba(0,0,0,.3)"; c.stroke();
  c.restore();
}

/** Racket: oval head with a string grid, throat and grip; (x, y) is the centre of the head */
function _scRacket(c, x, y, len, rot, col, alpha) {
  c.save(); c.translate(x, y); c.rotate(rot * Math.PI / 180); c.globalAlpha = alpha == null ? 1 : alpha;
  var rx = len * .13, ry = len * .17;
  c.strokeStyle = col; c.fillStyle = col; c.lineCap = "round";
  c.lineWidth = len * .028; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.stroke();
  c.save(); c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.clip(); c.lineWidth = 2;
  for (var i = -rx; i <= rx; i += len * .028) { c.beginPath(); c.moveTo(i, -ry); c.lineTo(i, ry); c.stroke(); }
  for (var j = -ry; j <= ry; j += len * .028) { c.beginPath(); c.moveTo(-rx, j); c.lineTo(rx, j); c.stroke(); }
  c.restore();
  c.lineWidth = len * .02; c.beginPath(); c.moveTo(-rx * .5, ry * .92); c.lineTo(0, ry + len * .16); c.lineTo(rx * .5, ry * .92); c.stroke();
  c.lineWidth = len * .026; c.beginPath(); c.moveTo(0, ry + len * .14); c.lineTo(0, ry + len * .52); c.stroke();
  c.lineWidth = len * .05; c.beginPath(); c.moveTo(0, ry + len * .3); c.lineTo(0, ry + len * .52); c.stroke();
  c.restore();
}

/** The whole card. fmt: "story" 1080x1920 or "square" 1080x1350 */
function drawShareCard(canvas, d, id, fmt) {
  var W = 1080, H = fmt === "square" ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  var font = function (px, w) { return (w || 700) + " " + px + "px Montserrat, 'Noto Sans Lao', 'Noto Sans', sans-serif"; };
  _scBackdrop(c, W, H, id, P);
  var sq = fmt === "square", top = sq ? 70 : 150;
  _scCourt(c, W, H, P);
  // brand
  c.textAlign = "center"; c.fillStyle = P.accent; c.font = font(36, 800); c.fillText("GODSMASH  BADMINTON", W / 2, top);
  _scShuttle(c, 150, top - 12, 46, -35, P.text, .95); _scShuttle(c, W - 150, top - 12, 46, 35, P.text, .95);
  c.fillStyle = P.dim; c.font = font(28, 600); c.fillText(d.period + (d.group ? "  ·  " + d.group : ""), W / 2, top + 46);
  // avatar
  var ay = top + (sq ? 190 : 270), ar = sq ? 110 : 140;
  _scRacket(c, W / 2 - ar * 1.2, ay - ar * 1.05, ar * 3.1, -38, P.text, .55); _scRacket(c, W / 2 + ar * 1.2, ay - ar * 1.05, ar * 3.1, 38, P.accent, .6);
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
  _scShuttle(c, 150, ry - (sq ? 80 : 120), sq ? 110 : 140, -28, P.text, .96); _scShuttle(c, W - 150, ry - (sq ? 100 : 150), sq ? 80 : 100, 24, P.accent, .96);
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
  // trend + form, in panels drawn from the theme (card, edge, accent, pill)
  if (!sq && d.trend && d.trend.length > 1) {
    var lo = Math.min.apply(null, d.trend), hi = Math.max.apply(null, d.trend), ph = 160, px0 = 130, px1 = W - 130, gy0 = y + 50, gh = ph - 90;
    c.fillStyle = P.card; _scRound(c, 90, y, W - 180, ph, 36); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    c.textAlign = "left"; c.fillStyle = P.dim; c.font = font(24, 700); c.fillText(t("homeRating").toUpperCase(), 130, y + 40);
    var X = function (k) { return px0 + (px1 - px0) * k / (d.trend.length - 1); }, Y = function (v) { return gy0 + gh - (hi === lo ? gh / 2 : (v - lo) / (hi - lo) * gh); };
    var lg = c.createLinearGradient(0, gy0, 0, gy0 + gh + 20); lg.addColorStop(0, P.accent); lg.addColorStop(1, "rgba(0,0,0,0)"); c.save(); c.globalAlpha = .28; c.fillStyle = lg;
    c.beginPath(); c.moveTo(X(0), gy0 + gh + 20); d.trend.forEach(function (v, k) { c.lineTo(X(k), Y(v)); }); c.lineTo(X(d.trend.length - 1), gy0 + gh + 20); c.closePath(); c.fill(); c.restore();
    var sg = c.createLinearGradient(px0, 0, px1, 0); sg.addColorStop(0, P.pill); sg.addColorStop(1, P.accent);
    c.save(); c.shadowColor = P.accent; c.shadowBlur = 16; c.strokeStyle = sg; c.lineWidth = 8; c.lineJoin = "round"; c.lineCap = "round"; c.beginPath();
    d.trend.forEach(function (v, k) { if (k) c.lineTo(X(k), Y(v)); else c.moveTo(X(k), Y(v)); }); c.stroke(); c.restore();
    var lx = X(d.trend.length - 1), ly = Y(d.trend[d.trend.length - 1]); c.fillStyle = P.text; c.beginPath(); c.arc(lx, ly, 11, 0, 7); c.fill(); c.strokeStyle = P.accent; c.lineWidth = 5; c.stroke();
    c.textAlign = "right"; c.fillStyle = P.text; c.font = font(26, 800); c.fillText(String(Math.round(d.trend[d.trend.length - 1])), W - 130, y + 40); c.textAlign = "center";
    y += ph + 24;
  }
  if (d.form.length) {
    var fw = 84, fgap = 18, fh = 100, fpw = Math.min(W - 180, d.form.length * fw + (d.form.length - 1) * fgap + 80);
    c.fillStyle = P.card; _scRound(c, (W - fpw) / 2, y, fpw, fh, 36); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke();
    var fxs = W / 2 - (d.form.length * fw + (d.form.length - 1) * fgap) / 2;
    d.form.forEach(function (w, k) {
      var bx = fxs + k * (fw + fgap), by = y + (fh - 64) / 2;
      if (w) { c.fillStyle = P.pill; _scRound(c, bx, by, fw, 64, 20); c.fill(); c.strokeStyle = P.accent; c.lineWidth = 3; c.stroke(); c.fillStyle = "#fff"; }
      else { c.strokeStyle = P.dim; c.lineWidth = 3; c.setLineDash([8, 7]); _scRound(c, bx, by, fw, 64, 20); c.stroke(); c.setLineDash([]); c.fillStyle = P.dim; }
      c.font = font(32, 800); c.fillText(w ? t("winShort") : t("lossShort"), bx + fw / 2, by + 44);
    });
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

/** openShareCard() = my profile card; openShareCard("", "workout", sessionId) = one workout (that day); openShareCard("", "overview") = the week / month / year shown on the Health page */
function openShareCard(uid, mode, arg) {
  uid = uid || (currentUser && currentUser.uid); if (!uid) return;
  _sc.uid = uid; _sc.theme = "auto"; _sc.fmt = "story"; _sc.avatar = null; _sc.mode = mode || "profile"; _sc.arg = arg || null; _sc.pick = "";
  var ttl = _sc.mode === "workout" ? "shareWorkoutTitle" : _sc.mode === "overview" ? "shareOverviewTitle" : "shareCardTitle";
  var old = document.getElementById("shareSheet"); if (old) old.remove();
  var el = document.createElement("div"); el.id = "shareSheet"; el.className = "sheet-wrap";
  el.innerHTML = '<div class="sheet sc-sheet" role="dialog" aria-modal="true" aria-label="' + escapeHtml(t(ttl)) + '"><div class="sheet-grab"></div>' +
    '<div class="sheet-title">' + escapeHtml(t(ttl)) + '</div><div class="sc-prev"><canvas id="scCanvas"></canvas></div>' +
    (_sc.mode === "overview" ? '<div class="sc-row" id="scPick"></div>' : '') + '<div class="sc-row" id="scThemes"></div><div class="sc-row" id="scFmt"></div>' +
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
  var go = function () { if (_sc.mode !== "profile") { _scRedraw(); return; } _scLoadAvatar(uid).then(function (im) { _sc.avatar = im; _scRedraw(); }); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  _scRedraw();
}

function _scControls() {
  var pk = document.getElementById("scPick");
  if (pk && typeof shareOverviewNow === "function") {
    var lst = shareOverviewNow().list || [];
    pk.innerHTML = lst.length ? [["", t("scPickAll")]].concat(lst.map(function (i) { return [i.sid, i.label]; })).map(function (o) {
      return '<button type="button" class="chip' + (_sc.pick === o[0] ? ' active' : '') + '" onclick="_scSet(\'pick\',\'' + jsq(o[0]) + '\')">' + escapeHtml(o[1]) + '</button>'; }).join("") : "";
  }
  var ids = ["auto", "default", "halloween", "cny", "orbs", "pirate", "reaper", "doraemon", "valentine", "jujutsu"], cur = _sc.theme;
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
  if (_sc.mode === "workout" && typeof shareWorkoutNow === "function") { var wd = shareWorkoutNow(_sc.arg); if (wd) drawWorkoutCard(cv, wd, _scThemeId(), _sc.fmt); }
  else if (_sc.mode === "overview" && typeof shareOverviewNow === "function") {
    var ov = shareOverviewNow(), pi = -1; ov.list.forEach(function (i, k) { if (i.sid === _sc.pick) pi = k; });
    if (pi >= 0) drawWeekSessionCard(cv, ov.list[pi].data, ov, pi, _scThemeId(), _sc.fmt); else drawOverviewCard(cv, ov, _scThemeId(), _sc.fmt);
  }
  else drawShareCard(cv, shareCardData(_sc.uid, statsScope), _scThemeId(), _sc.fmt);
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
