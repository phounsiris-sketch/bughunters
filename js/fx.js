/* Animated backgrounds for the special themes. One canvas sits BEHIND the whole app (z-index -1, never over a button or a card)
   and plays a loop like a GIF: bats and a ghost, snow and twinkling lights, a swimming dragon with a dancing lion and swaying
   lanterns, or a neon sun over a moving grid. Drawing code is plain functions of time, so the share card reuses the dragon,
   the lion and the lantern as still poses. Stops when the screen is hidden, when the live score is open, and (drawing one
   still frame only) when the phone asks for reduced motion. */

var _fx = { raf: 0, canvas: null, ctx: null, id: "", w: 0, h: 0, dpr: 1, last: 0, t0: 0, still: false };
var FX_NAV = 84;   // the bottom nav covers this much of the bottom edge

function _frnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/* ───────────── shared drawing pieces ───────────── */

/** Hanging lantern; (x, y) is where the cord is tied, swing is the angle in radians */
function fxLantern(c, x, y, h, swing, glow) {
  var w = h * .66, cy = h * .47, ry = h * .31;
  c.save(); c.translate(x, y); c.rotate(swing || 0);
  c.strokeStyle = "#fcd34d"; c.fillStyle = "#fcd34d"; c.lineWidth = Math.max(2, h / 40);
  c.beginPath(); c.moveTo(0, -h * .3); c.lineTo(0, h * .1); c.stroke(); c.fillRect(-w * .2, h * .1, w * .4, h * .06);
  if (glow) { var g = c.createRadialGradient(0, cy, 0, 0, cy, h * .9); g.addColorStop(0, "rgba(255,120,40,.35)"); g.addColorStop(1, "rgba(255,120,40,0)"); c.fillStyle = g; c.fillRect(-h, cy - h, h * 2, h * 2); }
  var lg = c.createRadialGradient(-w * .12, cy - ry * .3, 2, 0, cy, w * .6); lg.addColorStop(0, "#ff6b4a"); lg.addColorStop(.6, "#dc2626"); lg.addColorStop(1, "#991b1b");
  c.fillStyle = lg; c.beginPath(); c.ellipse(0, cy, w / 2, ry, 0, 0, 7); c.fill();
  c.strokeStyle = "rgba(127,29,29,.8)"; c.lineWidth = Math.max(1, h / 60); c.beginPath(); c.moveTo(0, cy - ry); c.lineTo(0, cy + ry); c.stroke();
  [.5, .82].forEach(function (k) { c.beginPath(); c.ellipse(0, cy, k * w / 2, ry, 0, 0, 7); c.stroke(); });
  c.fillStyle = "#fcd34d"; c.beginPath(); c.moveTo(0, cy - h * .09); c.lineTo(w * .13, cy); c.lineTo(0, cy + h * .09); c.lineTo(-w * .13, cy); c.closePath(); c.fill();
  c.fillRect(-w * .2, cy + ry - h * .01, w * .4, h * .06);
  c.strokeStyle = "#fcd34d"; c.lineWidth = Math.max(1.5, h / 45);
  var sw = Math.sin((swing || 0) * 9) * h * .03;
  [-1, 0, 1].forEach(function (k) { c.beginPath(); c.moveTo(k * w * .08, cy + ry + h * .05); c.quadraticCurveTo(k * w * .1 + sw, h * .86, k * w * .12 + sw * 1.6, h * .99); c.stroke(); });
  c.restore();
}

/** One dragon: head at (hx, hy), moving right, body trailing to the left in a travelling wave; S = size, t = seconds. Returns the pearl position. */
function fxDragon(c, hx, hy, S, t) {
  var N = 38, sp = 13 * S, pts = [], i;
  for (i = 0; i < N; i++) { var a = (.55 + i / N * .7) * 24 * S; pts.push([hx - i * sp, hy + Math.sin(i * .46 - t * 3.4) * a]); }
  var wid = function (k) { return 21 * S * Math.pow(1 - k / N, .65) + 2.4 * S; };
  var ang = function (k) { var a = pts[Math.max(0, k - 1)], b = pts[Math.min(N - 1, k + 1)]; return Math.atan2(a[1] - b[1], a[0] - b[0]); };
  c.save(); c.lineJoin = "round"; c.lineCap = "round";
  // dorsal fins and legs first (behind the body)
  for (i = N - 2; i > 3; i -= 2) { var an = ang(i), r = wid(i) / 2, fx = pts[i][0] + Math.sin(an) * r, fy = pts[i][1] - Math.cos(an) * r, fl = (9 + 6 * (1 - i / N)) * S; c.fillStyle = "#fcd34d"; c.beginPath(); c.moveTo(fx - 4 * S, fy + 1); c.quadraticCurveTo(fx + Math.sin(an) * fl * .6 - 5 * S, fy - Math.cos(an) * fl, fx + 5 * S, fy - Math.cos(an) * fl * .2); c.lineTo(fx + 4 * S, fy + 1); c.fill(); }
  [9, 22].forEach(function (k, n) {
    var p = pts[k], r = wid(k) / 2, sw = Math.sin(t * 3.4 + n * 2) * 8 * S, lx = p[0] + sw, ly = p[1] + r + 17 * S;
    c.strokeStyle = "#991b1b"; c.lineWidth = 5.5 * S; c.beginPath(); c.moveTo(p[0], p[1] + r * .5); c.quadraticCurveTo(p[0] - 5 * S, p[1] + r + 6 * S, lx, ly); c.stroke();
    c.strokeStyle = "#fcd34d"; c.lineWidth = 1.8 * S; for (var q = -1; q <= 1; q++) { c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 8 * S + q * 3 * S, ly + 6 * S + q * 2 * S); c.stroke(); }
  });
  // body from tail to neck
  for (i = N - 1; i >= 1; i--) {
    var p2 = pts[i], r2 = wid(i) / 2;
    c.fillStyle = "#7f1d1d"; c.beginPath(); c.arc(p2[0], p2[1], r2 + 1.6 * S, 0, 7); c.fill();
    var gg = c.createLinearGradient(0, p2[1] - r2, 0, p2[1] + r2); gg.addColorStop(0, "#f87171"); gg.addColorStop(.45, "#dc2626"); gg.addColorStop(1, "#b45309");
    c.fillStyle = gg; c.beginPath(); c.arc(p2[0], p2[1], r2, 0, 7); c.fill();
    if (i % 2 === 0 && r2 > 4 * S) { c.strokeStyle = "rgba(252,211,77,.9)"; c.lineWidth = 1.5 * S; c.beginPath(); c.arc(p2[0] + r2 * .1, p2[1] - r2 * .05, r2 * .5, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  }
  // tail tuft
  var tp = pts[N - 1]; c.strokeStyle = "#fcd34d"; c.lineWidth = 3 * S;
  for (i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(tp[0], tp[1]); c.quadraticCurveTo(tp[0] - 16 * S, tp[1] + i * 10 * S + Math.sin(t * 5 + i) * 5 * S, tp[0] - 30 * S, tp[1] + i * 16 * S + Math.sin(t * 5 + i) * 8 * S); c.stroke(); }
  // head
  c.save(); c.translate(pts[0][0], pts[0][1]); c.rotate(ang(1) * .6);
  var open = .16 + .14 * Math.sin(t * 2.5), blink = (t % 4.2) < .16;
  // mane
  for (i = 0; i < 6; i++) { var mo = Math.sin(t * 4 + i) * 5 * S; c.strokeStyle = i % 2 ? "#fb923c" : "#fcd34d"; c.lineWidth = 3.4 * S; c.beginPath(); c.moveTo(-4 * S, (-12 + i * 3) * S); c.quadraticCurveTo(-26 * S, (-22 + i * 5) * S + mo, -52 * S, (-14 + i * 9) * S + mo * 1.6); c.stroke(); }
  // horns
  c.strokeStyle = "#fcd34d"; c.lineWidth = 3.6 * S; [[0, 0], [8, -3]].forEach(function (o, n) { c.beginPath(); c.moveTo((12 + o[0]) * S, -15 * S); c.quadraticCurveTo((4 + o[0]) * S, -(34 + n * 4) * S, (-14 + o[0]) * S, -(36 + n * 6) * S + Math.sin(t * 3 + n) * 2 * S); c.stroke(); });
  // lower jaw
  c.save(); c.translate(6 * S, 6 * S); c.rotate(open); c.fillStyle = "#991b1b"; c.beginPath(); c.moveTo(0, -3 * S); c.quadraticCurveTo(26 * S, 12 * S, 54 * S, 3 * S); c.quadraticCurveTo(30 * S, 0, 0, -3 * S); c.fill();
  c.fillStyle = "#fff"; for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo((20 + i * 9) * S, 2 * S); c.lineTo((23 + i * 9) * S, -4 * S); c.lineTo((26 + i * 9) * S, 2 * S); c.fill(); } c.restore();
  // upper head and snout
  var hg = c.createLinearGradient(0, -22 * S, 0, 10 * S); hg.addColorStop(0, "#f87171"); hg.addColorStop(1, "#b91c1c");
  c.fillStyle = hg; c.strokeStyle = "#7f1d1d"; c.lineWidth = 1.6 * S; c.beginPath(); c.moveTo(-6 * S, 4 * S); c.quadraticCurveTo(-2 * S, -24 * S, 24 * S, -20 * S); c.quadraticCurveTo(52 * S, -22 * S, 66 * S, -9 * S); c.quadraticCurveTo(50 * S, -2 * S, 30 * S, 2 * S); c.quadraticCurveTo(10 * S, 8 * S, -6 * S, 4 * S); c.fill(); c.stroke();
  c.fillStyle = "#fff"; for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo((34 + i * 8) * S, -2 * S); c.lineTo((37 + i * 8) * S, 5 * S + open * 8 * S); c.lineTo((40 + i * 8) * S, -2 * S); c.fill(); }
  c.fillStyle = "#7f1d1d"; c.beginPath(); c.arc(62 * S, -12 * S, 2.2 * S, 0, 7); c.fill();
  // eye and brow
  c.fillStyle = "#fffbe6"; c.beginPath(); c.ellipse(26 * S, -10 * S, 6 * S, blink ? .8 * S : 5 * S, -.2, 0, 7); c.fill();
  if (!blink) { c.fillStyle = "#111"; c.beginPath(); c.arc(28 * S, -10 * S, 2.6 * S, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(29 * S, -11.4 * S, .9 * S, 0, 7); c.fill(); }
  c.strokeStyle = "#fcd34d"; c.lineWidth = 2.6 * S; c.beginPath(); c.moveTo(16 * S, -18 * S); c.quadraticCurveTo(26 * S, -22 * S, 36 * S, -16 * S); c.stroke();
  // whiskers
  c.strokeStyle = "#fde68a"; c.lineWidth = 2 * S;
  [0, 1].forEach(function (k) { c.beginPath(); c.moveTo(60 * S, (-6 + k * 5) * S); c.bezierCurveTo(84 * S, (-22 + k * 30) * S + Math.sin(t * 5 + k) * 6 * S, 96 * S, (-8 + k * 36) * S, 112 * S + Math.sin(t * 4 + k) * 6 * S, (10 + k * 34) * S + Math.sin(t * 5 + k * 2) * 8 * S); c.stroke(); });
  c.restore();
  // the pearl it chases
  var px = pts[0][0] + 118 * S, py = hy - 6 * S + Math.sin(t * 2.2) * 8 * S;
  var pg = c.createRadialGradient(px, py, 1, px, py, 22 * S); pg.addColorStop(0, "rgba(255,244,180,1)"); pg.addColorStop(.35, "rgba(252,211,77,.85)"); pg.addColorStop(1, "rgba(252,211,77,0)");
  c.fillStyle = pg; c.beginPath(); c.arc(px, py, 22 * S, 0, 7); c.fill(); c.fillStyle = "#fff7c2"; c.beginPath(); c.arc(px, py, 6.5 * S, 0, 7); c.fill();
  c.restore();
  return { x: px, y: py, tail: tp[0] };
}

/** Lion dance: bouncing head with a rippling mane, blinking eyes, a chewing mouth, and a cloth body on hopping legs. (x, y) = ground under the head. */
function fxLion(c, x, y, S, t) {
  var ph = t * 2.6, hop = Math.abs(Math.sin(ph)), tilt = Math.sin(ph) * .1, R = S * .5, open = Math.max(0, Math.sin(t * 3.1)), blink = (t % 3.3) < .14;
  c.save(); c.translate(x, y); c.lineJoin = "round";
  // cloth body behind the head, wavy hem
  var bx = R * .6, by = -R * .9 - hop * R * .18, len = S * 1.25, hh = S * .58;
  var cg = c.createLinearGradient(bx, by, bx + len, by + hh); cg.addColorStop(0, "#b91c1c"); cg.addColorStop(.5, "#dc2626"); cg.addColorStop(1, "#f59e0b");
  c.fillStyle = cg; c.beginPath(); c.moveTo(bx, by);
  c.quadraticCurveTo(bx + len * .5, by - 8 + Math.sin(t * 4) * 5, bx + len, by + 4);
  c.lineTo(bx + len, by + hh * .8); for (var k = 10; k >= 0; k--) c.lineTo(bx + len * k / 10, by + hh + Math.sin(k * 1.4 + t * 5) * 5 - k * 1.2);
  c.closePath(); c.fill(); c.strokeStyle = "#fcd34d"; c.lineWidth = 3; c.beginPath(); for (k = 0; k <= 10; k++) c.lineTo(bx + len * k / 10, by + hh + Math.sin((10 - k) * 1.4 + t * 5) * 5 - (10 - k) * 1.2); c.stroke();
  c.strokeStyle = "rgba(252,211,77,.5)"; c.lineWidth = 2; for (k = 1; k < 4; k++) { c.beginPath(); c.moveTo(bx + len * k / 4, by + 6); c.quadraticCurveTo(bx + len * k / 4 + 6, by + hh * .5, bx + len * k / 4, by + hh * .85); c.stroke(); }
  // legs: two hopping at the front, two at the back, the pairs alternate
  [[R * .1, 0], [R * .75, 1], [len * .65, 0], [len * .95, 1]].forEach(function (L) { var up = Math.max(0, Math.sin(ph + L[1] * Math.PI)) * 12; c.fillStyle = "#1f2937"; c.fillRect(L[0] - 6, -R * .35 - up, 12, R * .35 + up - 2); c.fillStyle = "#dc2626"; c.beginPath(); c.ellipse(L[0] + 3, -3 - up, 11, 6, 0, 0, 7); c.fill(); });
  // head
  c.translate(0, -R * 1.05 - hop * R * .28); c.rotate(tilt);
  for (var i = 0; i < 18; i++) { var a = i / 18 * Math.PI * 2, rr = R * (1.02 + Math.sin(t * 5 + i * 1.7) * .06); c.fillStyle = ["#fcd34d", "#f59e0b", "#fb923c"][i % 3]; c.beginPath(); c.ellipse(Math.cos(a) * rr * .9, Math.sin(a) * rr * .9, R * .2, R * .26, a, 0, 7); c.fill(); }
  c.fillStyle = "#f59e0b"; c.beginPath(); c.arc(0, 0, R * .98, 0, 7); c.fill();
  [-1, 1].forEach(function (k) { c.fillStyle = "#b91c1c"; c.beginPath(); c.ellipse(k * R * .78, -R * .62 + Math.sin(t * 6 + k) * 2, R * .2, R * .26, k * .5, 0, 7); c.fill(); });
  var fg = c.createRadialGradient(-R * .2, -R * .3, 2, 0, 0, R * .8); fg.addColorStop(0, "#ff5a4a"); fg.addColorStop(1, "#c81e1e"); c.fillStyle = fg; c.beginPath(); c.arc(0, R * .04, R * .74, 0, 7); c.fill();
  // horn with pom-pom
  c.strokeStyle = "#fcd34d"; c.lineWidth = R * .13; c.beginPath(); c.moveTo(0, -R * .66); c.quadraticCurveTo(Math.sin(t * 4) * 6, -R * .88, Math.sin(t * 4) * 9, -R * 1.0); c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.arc(Math.sin(t * 4) * 9, -R * 1.02, R * .13, 0, 7); c.fill();
  // eyes, lids, brows
  [-1, 1].forEach(function (k) {
    c.fillStyle = "#fff"; c.beginPath(); c.ellipse(k * R * .3, -R * .1, R * .21, blink ? R * .03 : R * .23, 0, 0, 7); c.fill();
    if (!blink) { c.fillStyle = "#111"; c.beginPath(); c.arc(k * R * .3 + Math.sin(t * 1.3) * R * .05, -R * .08, R * .11, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(k * R * .3 + R * .04, -R * .13, R * .04, 0, 7); c.fill(); }
    c.strokeStyle = "#fff"; c.lineWidth = R * .1; c.lineCap = "round"; c.beginPath(); c.arc(k * R * .3, -R * .1, R * .3, Math.PI * 1.12 + Math.sin(t * 3 + k) * .08, Math.PI * 1.88 + Math.sin(t * 3 + k) * .08); c.stroke();
    c.fillStyle = "rgba(244,114,182,.75)"; c.beginPath(); c.arc(k * R * .55, R * .26, R * .12, 0, 7); c.fill();
  });
  c.fillStyle = "#fcd34d"; c.beginPath(); c.ellipse(0, R * .2, R * .13, R * .09, 0, 0, 7); c.fill();
  // mouth chewing, teeth, tongue
  var mo = R * (.08 + open * .26); c.fillStyle = "#450a0a"; c.beginPath(); c.moveTo(-R * .42, R * .38); c.quadraticCurveTo(0, R * .38 + mo * 2.6, R * .42, R * .38); c.quadraticCurveTo(0, R * .34, -R * .42, R * .38); c.fill();
  c.fillStyle = "#f472b6"; c.beginPath(); c.ellipse(0, R * .38 + mo * 1.3, R * .2, mo * .7, 0, 0, 7); c.fill();
  c.fillStyle = "#fff"; for (i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * R * .15 - R * .05, R * .385); c.lineTo(i * R * .15, R * .385 + R * .1); c.lineTo(i * R * .15 + R * .05, R * .385); c.fill(); }
  // beard
  c.fillStyle = "#fff7ed"; for (i = -3; i <= 3; i++) { c.beginPath(); c.ellipse(i * R * .16, R * .72 + Math.sin(t * 5 + i) * 3 + mo * .8, R * .11, R * .2, 0, 0, 7); c.fill(); }
  c.restore();
}

function fxBat(c, x, y, s, flap) {
  c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = "#0a0420";
  c.beginPath(); c.ellipse(0, 0, 6, 9, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(-5, -6); c.lineTo(-3, -14); c.lineTo(0, -8); c.lineTo(3, -14); c.lineTo(5, -6); c.fill();
  [-1, 1].forEach(function (k) { c.save(); c.scale(k, 1); c.translate(3, 0); c.rotate(-flap * .7); c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(20, -28, 44, -10); c.quadraticCurveTo(36, -6, 32, 3); c.quadraticCurveTo(24, -2, 18, 7); c.quadraticCurveTo(10, 0, 0, 6); c.closePath(); c.fill(); c.restore(); });
  c.fillStyle = "#fdba74"; c.beginPath(); c.arc(-2.4, -2, 1.1, 0, 7); c.arc(2.4, -2, 1.1, 0, 7); c.fill(); c.restore();
}

function fxGhost(c, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha = .3;
  c.fillStyle = "#e9d5ff"; c.beginPath(); c.moveTo(-26, 34); c.lineTo(-26, -6); c.quadraticCurveTo(-26, -36, 0, -36); c.quadraticCurveTo(26, -36, 26, -6); c.lineTo(26, 34);
  for (var k = 4; k >= 0; k--) c.quadraticCurveTo(26 - (4 - k) * 10.4 - 5, 44 + Math.sin(t * 6 + k) * 5, 26 - (5 - k) * 10.4, 34); c.closePath(); c.fill();
  c.fillStyle = "#1e1b4b"; c.beginPath(); c.ellipse(-9, -8, 4, 6, 0, 0, 7); c.ellipse(9, -8, 4, 6, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(0, 8, 5, 7 + Math.sin(t * 3) * 2, 0, 0, 7); c.fill(); c.restore();
}

/* ───────────── scenes ───────────── */

var FX_SCENES = {
  halloween: function (c, w, h, t) {
    var i, g = c.createRadialGradient(w - 50, 38, 0, w - 50, 38, 96 + Math.sin(t * 1.4) * 8); g.addColorStop(0, "rgba(253,186,116,.3)"); g.addColorStop(1, "rgba(253,186,116,0)"); c.fillStyle = g; c.fillRect(w - 160, 0, 160, 140);
    for (i = 0; i < 16; i++) { var p = (t * (.02 + _frnd(i) * .03) + _frnd(i + 9)) % 1, ex = _frnd(i + 3) * w + Math.sin(t + i) * 14, ey = h - FX_NAV - p * (h - FX_NAV); c.fillStyle = "rgba(251,146,60," + (.25 + .5 * Math.abs(Math.sin(t * 2 + i))) * (1 - p) + ")"; c.beginPath(); c.arc(ex, ey, 1.6 + _frnd(i + 5) * 1.6, 0, 7); c.fill(); }
    fxGhost(c, w * (.12 + .76 * ((t / 34) % 1)), h * .46 + Math.sin(t * 1.1) * 30, 1.1, t);
    for (i = 0; i < 3; i++) { var sp = 52 + i * 14, bx = ((t * sp + i * 210) % (w + 200)) - 100, by = 86 + i * 70 + Math.sin(t * 1.7 + i * 2) * 26; fxBat(c, bx, by, .8 - i * .12, Math.sin(t * 14 + i * 1.3) * .9); }
  },
  christmas: function (c, w, h, t) {
    var i, cols = ["#ef4444", "#fde68a", "#4ade80", "#60a5fa"];
    c.strokeStyle = "rgba(2,20,10,.9)"; c.lineWidth = 2; c.beginPath(); for (var x = 0; x <= w; x += 6) { var y = 10 + Math.abs(Math.sin(x / 110 * Math.PI / 1)) * 14; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    for (i = 0, x = 16; x < w; x += 34, i++) { var by = 10 + Math.abs(Math.sin(x / 110 * Math.PI)) * 14 + 6, tw = .45 + .55 * Math.max(0, Math.sin(t * 2.6 + i * 1.3)); c.fillStyle = cols[i % 4]; c.globalAlpha = .45 + tw * .55; c.beginPath(); c.ellipse(x, by, 4.2, 6.2, 0, 0, 7); c.fill(); var g = c.createRadialGradient(x, by, 0, x, by, 20); g.addColorStop(0, cols[i % 4]); g.addColorStop(1, "rgba(0,0,0,0)"); c.globalAlpha = tw * .35; c.fillStyle = g; c.fillRect(x - 20, by - 20, 40, 40); c.globalAlpha = 1; }
    for (i = 0; i < 46; i++) { var z = .4 + _frnd(i) * .9, sx = ((_frnd(i + 7) * (w + 60)) + Math.sin(t * .8 + i) * 22 * z - 30), sy = ((t * (22 + z * 34) + _frnd(i + 2) * h) % (h + 20)) - 10; c.fillStyle = "rgba(255,255,255," + (.45 + z * .4) + ")"; c.beginPath(); c.arc(sx, sy, 1.4 + z * 2.2, 0, 7); c.fill(); }
  },
  cny: function (c, w, h, t) {
    var i, ground = h - FX_NAV;
    [[34, 64], [98, 48], [w - 98, 52], [w - 34, 68]].forEach(function (l, k) { fxLantern(c, l[0], 0, l[1] * 1.15, Math.sin(t * 1.25 + k * 1.7) * .1, true); });
    for (i = 0; i < 26; i++) { var sx = _frnd(i) * w + Math.sin(t + i) * 10, sy = ((t * (14 + _frnd(i + 3) * 18) + _frnd(i + 8) * h) % (h + 10)); c.fillStyle = "rgba(252,211,77," + (.25 + .6 * Math.abs(Math.sin(t * 3 + i))) + ")"; c.beginPath(); c.arc(sx, sy, 1.2 + _frnd(i + 4) * 1.8, 0, 7); c.fill(); }
    var S = Math.min(1.45, w / 300), L = 38 * 13 * S + 260, hx = ((t * 46) % (w + L + 140)) - 60;
    fxDragon(c, hx, ground - 100 - 34 * S, S, t);
    fxLion(c, Math.min(120, w * .27), ground - 4, Math.min(112, w * .27), t);
  },
  arcade: function (c, w, h, t) {
    var i, yH = h - 210, sx = w / 2, R = 76 + Math.sin(t * 2) * 2;
    c.save(); c.beginPath(); c.rect(0, 0, w, yH); c.clip();
    var sg = c.createLinearGradient(0, yH - R, 0, yH); sg.addColorStop(0, "#fde047"); sg.addColorStop(.55, "#fb7185"); sg.addColorStop(1, "#c026d3");
    c.fillStyle = sg; c.beginPath(); c.arc(sx, yH, R, Math.PI, 0); c.fill();
    c.globalCompositeOperation = "destination-out"; for (i = 0; i < 6; i++) c.fillRect(sx - R - 2, yH - 8 - i * 12, R * 2 + 4, 1 + i * .9);
    c.globalCompositeOperation = "destination-over"; var g = c.createRadialGradient(sx, yH, 0, sx, yH, 190 + Math.sin(t * 2) * 10); g.addColorStop(0, "rgba(232,121,249,.4)"); g.addColorStop(1, "rgba(232,121,249,0)"); c.fillStyle = g; c.fillRect(0, yH - 200, w, 200);
    c.restore();
    c.strokeStyle = "rgba(34,211,238,.55)"; c.lineWidth = 1.4;
    for (i = -9; i <= 9; i++) { c.beginPath(); c.moveTo(sx + i * 12, yH); c.lineTo(sx + i * (w / 7.5), h); c.stroke(); }
    for (i = 0; i < 9; i++) { var f = ((i + t * .45) % 9) / 9, y = yH + f * f * (h - yH); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (i = 0; i < 20; i++) { var tw = Math.max(0, Math.sin(t * (1.5 + _frnd(i) * 2) + i * 2)); c.fillStyle = "rgba(34,211,238," + tw + ")"; c.shadowColor = "#e879f9"; c.shadowBlur = 8; c.fillRect(_frnd(i + 1) * w, _frnd(i + 4) * (yH - 40), 2.4, 2.4); } c.shadowBlur = 0;
    var ss = (t % 9) / 1.4; if (ss < 1) { var qx = w * (.2 + ss * .6), qy = 60 + ss * 120; c.strokeStyle = "rgba(255,255,255," + (1 - ss) + ")"; c.lineWidth = 2; c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx - 50, qy - 24); c.stroke(); }
  }
};

/* ───────────── engine ───────────── */

function _fxSize() {
  var cv = _fx.canvas; if (!cv) return;
  _fx.dpr = Math.min(window.devicePixelRatio || 1, 1.5); _fx.w = window.innerWidth; _fx.h = window.innerHeight;
  cv.width = Math.round(_fx.w * _fx.dpr); cv.height = Math.round(_fx.h * _fx.dpr);
  cv.style.width = _fx.w + "px"; cv.style.height = _fx.h + "px";
  if (_fx.still && !_fx.raf) _fx.raf = requestAnimationFrame(_fxFrame);
}
function _fxFrame(ts) {
  _fx.raf = 0; if (!_fx.canvas) return;
  if (!_fx.still) _fx.raf = requestAnimationFrame(_fxFrame);
  if (document.hidden || document.body.classList.contains("live-on")) return;
  if (!_fx.still && ts - _fx.last < 33) return;   // about 30 pictures a second is plenty for a background
  _fx.last = ts; if (!_fx.t0) _fx.t0 = ts;
  var c = _fx.ctx, t = _fx.still ? 3.2 : (ts - _fx.t0) / 1000;
  c.setTransform(_fx.dpr, 0, 0, _fx.dpr, 0, 0); c.clearRect(0, 0, _fx.w, _fx.h);
  var scene = FX_SCENES[_fx.id]; if (scene) scene(c, _fx.w, _fx.h, t);
}
function fxStop() {
  if (_fx.raf) cancelAnimationFrame(_fx.raf);
  _fx.raf = 0; if (_fx.canvas) { _fx.canvas.remove(); window.removeEventListener("resize", _fxSize); }
  _fx.canvas = null; _fx.ctx = null; _fx.id = ""; _fx.t0 = 0; _fx.last = 0;
}
/** Start (or keep) the animated background of a special theme; it lives behind the app (z-index -1) */
function fxStart(id) {
  if (_fx.canvas && _fx.id === id) return;
  fxStop(); if (!FX_SCENES[id]) return;
  var cv = document.createElement("canvas"); cv.id = "fxCanvas"; cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;left:0;top:0;z-index:-1;pointer-events:none;";
  document.body.insertBefore(cv, document.body.firstChild);
  _fx.canvas = cv; _fx.ctx = cv.getContext("2d"); _fx.id = id;
  _fx.still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  _fxSize(); window.addEventListener("resize", _fxSize);
  _fx.raf = requestAnimationFrame(_fxFrame);
}
