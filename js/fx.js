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

/** Tapered flame/hair strand from (x0,y0) curving out through the control point to (x1,y1), width w at the root */
function _fxStrand(c, x0, y0, cx, cy, x1, y1, w, grad) {
  var dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
  c.fillStyle = grad; c.beginPath(); c.moveTo(x0 + nx, y0 + ny); c.quadraticCurveTo(cx + nx * .5, cy + ny * .5, x1, y1); c.quadraticCurveTo(cx - nx * .5, cy - ny * .5, x0 - nx, y0 - ny); c.closePath(); c.fill();
}

/** Fire breath: a flickering plume of glowing puffs from (0,0) along +x, strength 0..1 */
function _fxFire(c, len, S, strength, t) {
  var n = 16;
  for (var i = n - 1; i >= 0; i--) {
    var k = i / n, x = k * len, r = (6 + k * 34) * S * (.6 + strength * .6), y = Math.sin(t * 22 + i * 1.7) * (3 + k * 10) * S - k * 8 * S;
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,250,200," + (.95 * strength * (1 - k * .5)) + ")"); g.addColorStop(.35, "rgba(255,170,40," + (.8 * strength * (1 - k)) + ")"); g.addColorStop(1, "rgba(220,38,38,0)");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
}

/** A fierce dragon: scaled body in a travelling wave with spiked ridge, clawed legs, a roaring head that breathes fire, glaring slit eyes,
    antlered horns, a whipping flame mane and long whiskers. Head at (hx, hy) moving right, S = size, t = seconds. */
function fxDragon(c, hx, hy, S, t) {
  var N = 40, sp = 12.5 * S, pts = [], i;
  for (i = 0; i < N; i++) { var a = (.5 + i / N * .8) * 26 * S; pts.push([hx - i * sp, hy + Math.sin(i * .44 - t * 3.6) * a]); }
  var wid = function (k) { return 25 * S * Math.pow(1 - k / N, .6) + 2.5 * S; };
  var ang = function (k) { var a = pts[Math.max(0, k - 1)], b = pts[Math.min(N - 1, k + 1)]; return Math.atan2(a[1] - b[1], a[0] - b[0]); };
  var roar = Math.pow(Math.max(0, Math.sin(t * .9)), 3), blink = (t % 5.1) < .12;
  c.save(); c.lineJoin = "round"; c.lineCap = "round";
  // ridge spikes behind the body: sharp, swept back, dark root to gold tip
  for (i = N - 2; i > 2; i--) {
    var an = ang(i), r = wid(i) / 2, nx = Math.sin(an), ny = -Math.cos(an), bx = -Math.cos(an), by = -Math.sin(an), L = (10 + 10 * (1 - i / N)) * S;
    var sx = pts[i][0] + nx * r * .9, sy = pts[i][1] + ny * r * .9, tx = sx + nx * L + bx * L * .9, ty = sy + ny * L + by * L * .9;
    var sg = c.createLinearGradient(sx, sy, tx, ty); sg.addColorStop(0, "#7f1d1d"); sg.addColorStop(1, "#fcd34d");
    c.fillStyle = sg; c.beginPath(); c.moveTo(sx - bx * 4 * S, sy - by * 4 * S); c.lineTo(tx, ty); c.lineTo(sx + bx * 4 * S, sy + by * 4 * S); c.closePath(); c.fill();
  }
  // legs with a knee, a muscle and four sharp claws
  [10, 24].forEach(function (k, n) {
    var p = pts[k], r = wid(k) / 2, sw = Math.sin(t * 3.6 + n * 2.2) * 9 * S, kx = p[0] - 4 * S + sw * .5, ky = p[1] + r + 12 * S, fx = p[0] + 6 * S + sw, fy = ky + 16 * S;
    c.strokeStyle = "#7f1d1d"; c.lineWidth = 9 * S; c.beginPath(); c.moveTo(p[0], p[1] + r * .4); c.quadraticCurveTo(kx - 6 * S, ky - 2 * S, kx, ky); c.lineTo(fx, fy); c.stroke();
    c.strokeStyle = "#dc2626"; c.lineWidth = 6 * S; c.beginPath(); c.moveTo(p[0], p[1] + r * .4); c.quadraticCurveTo(kx - 6 * S, ky - 2 * S, kx, ky); c.lineTo(fx, fy); c.stroke();
    c.strokeStyle = "#fff7e0"; c.lineWidth = 2.2 * S; for (var q = -1.5; q <= 1.5; q++) { c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + (7 + q * 2) * S, fy + 3 * S, fx + (10 + q * 4) * S, fy + (9 + Math.abs(q) * 1.5) * S); c.stroke(); }
  });
  // body from tail to neck: shaded cylinder, ochre belly, overlapping scales
  for (i = N - 1; i >= 1; i--) {
    var p2 = pts[i], r2 = wid(i) / 2;
    c.fillStyle = "#5c0f0f"; c.beginPath(); c.arc(p2[0], p2[1], r2 + 1.8 * S, 0, 7); c.fill();
    var gg = c.createLinearGradient(0, p2[1] - r2, 0, p2[1] + r2); gg.addColorStop(0, "#9b1c1c"); gg.addColorStop(.4, "#e11d28"); gg.addColorStop(.7, "#ea580c"); gg.addColorStop(1, "#fbbf24");
    c.fillStyle = gg; c.beginPath(); c.arc(p2[0], p2[1], r2, 0, 7); c.fill();
    if (r2 > 4 * S) {
      c.strokeStyle = "rgba(70,8,8,.55)"; c.lineWidth = 1.3 * S; c.beginPath(); c.arc(p2[0] - r2 * .15, p2[1] - r2 * .2, r2 * .55, Math.PI * .15, Math.PI * .85); c.stroke(); c.beginPath(); c.arc(p2[0] + r2 * .25, p2[1] + r2 * .05, r2 * .4, Math.PI * .15, Math.PI * .85); c.stroke();
      c.strokeStyle = "rgba(255,226,140,.8)"; c.lineWidth = 1.1 * S; c.beginPath(); c.arc(p2[0] + r2 * .05, p2[1] - r2 * .3, r2 * .52, Math.PI * 1.2, Math.PI * 1.75); c.stroke();
      c.strokeStyle = "rgba(120,53,15,.5)"; c.beginPath(); c.moveTo(p2[0], p2[1] + r2 * .45); c.lineTo(p2[0], p2[1] + r2 * .95); c.stroke();
    }
  }
  var tp = pts[N - 1]; for (i = -2; i <= 2; i++) _fxStrand(c, tp[0], tp[1], tp[0] - 18 * S, tp[1] + i * 7 * S + Math.sin(t * 6 + i) * 5 * S, tp[0] - 40 * S, tp[1] + i * 14 * S + Math.sin(t * 6 + i) * 9 * S, 5 * S, i % 2 ? "#fb923c" : "#fcd34d");
  // head
  c.save(); c.translate(pts[0][0], pts[0][1]); c.rotate(ang(1) * .55);
  var open = .1 + .08 * Math.sin(t * 3) + .5 * roar;
  // flame mane streaming back from the nape and the chin
  for (i = 0; i < 9; i++) {
    var m1 = Math.sin(t * 5 + i * .8) * 8 * S, gm = c.createLinearGradient(0, 0, -70 * S, 0); gm.addColorStop(0, "#fcd34d"); gm.addColorStop(.5, "#f97316"); gm.addColorStop(1, "rgba(185,28,28,0)");
    _fxStrand(c, -2 * S, (-22 + i * 5.5) * S, -34 * S, (-34 + i * 8) * S + m1, -72 * S, (-26 + i * 12) * S + m1 * 1.8, 8 * S, gm);
  }
  // antlered horns: a sweeping beam with two tines each
  [[0, -26, 1], [14, -22, .8]].forEach(function (h, n) {
    var hg = c.createLinearGradient(h[0] * S, h[1] * S, (h[0] - 38) * S, (h[1] - 40) * S); hg.addColorStop(0, "#fff1b8"); hg.addColorStop(1, "#b45309");
    c.strokeStyle = hg; c.lineCap = "round"; c.lineWidth = (7 - n * 2) * S; var sw = Math.sin(t * 2.4 + n) * 2 * S;
    c.beginPath(); c.moveTo((14 + h[0]) * S, (h[1] + 4) * S); c.quadraticCurveTo((h[0] - 6) * S, (h[1] - 30) * S, (h[0] - 40) * S, (h[1] - 38) * S + sw); c.stroke();
    c.lineWidth = (3.4 - n) * S; c.beginPath(); c.moveTo((h[0] - 4) * S, (h[1] - 22) * S); c.lineTo((h[0] + 4) * S, (h[1] - 44) * S); c.moveTo((h[0] - 20) * S, (h[1] - 33) * S); c.lineTo((h[0] - 26) * S, (h[1] - 52) * S + sw); c.stroke();
  });
  // lower jaw: dropping open, fangs and a flickering tongue
  c.save(); c.translate(8 * S, 8 * S); c.rotate(open);
  c.fillStyle = "#450a0a"; c.beginPath(); c.moveTo(0, -6 * S); c.lineTo(66 * S, -6 * S); c.quadraticCurveTo(70 * S, 6 * S, 52 * S, 10 * S); c.quadraticCurveTo(24 * S, 16 * S, 0, 7 * S); c.fill();
  c.fillStyle = "#e11d48"; c.beginPath(); c.moveTo(6 * S, -2 * S); c.quadraticCurveTo(34 * S, -10 * S + Math.sin(t * 9) * 3 * S, 62 * S, -3 * S); c.quadraticCurveTo(36 * S, 5 * S, 6 * S, 3 * S); c.fill();
  var jg = c.createLinearGradient(0, -6 * S, 0, 14 * S); jg.addColorStop(0, "#b91c1c"); jg.addColorStop(1, "#7f1d1d"); c.fillStyle = jg; c.beginPath(); c.moveTo(0, 2 * S); c.quadraticCurveTo(34 * S, 16 * S, 70 * S, 6 * S); c.lineTo(66 * S, 0); c.quadraticCurveTo(34 * S, 8 * S, 0, -3 * S); c.fill();
  c.fillStyle = "#fffbe8"; [[56, -4, 14], [26, -4, 9]].forEach(function (f) { c.beginPath(); c.moveTo((f[0] - 4) * S, f[1] * S); c.lineTo(f[0] * S + 1 * S, (f[1] - f[2]) * S); c.lineTo((f[0] + 4) * S, f[1] * S); c.fill(); });
  for (i = 0; i < 6; i++) { c.beginPath(); c.moveTo((14 + i * 8) * S, -3 * S); c.lineTo((17 + i * 8) * S, -8 * S); c.lineTo((20 + i * 8) * S, -3 * S); c.fill(); }
  c.restore();
  // fire from the open mouth
  if (roar > .12) { c.save(); c.translate(70 * S, 6 * S); c.rotate(open * .5); _fxFire(c, 190 * S * roar, S, roar, t); c.restore(); }
  // skull: heavy brow, long snout with flared nostril and upper fangs
  var hg2 = c.createLinearGradient(0, -34 * S, 0, 12 * S); hg2.addColorStop(0, "#c81e1e"); hg2.addColorStop(.6, "#dc2626"); hg2.addColorStop(1, "#7f1d1d");
  c.fillStyle = hg2; c.strokeStyle = "#450a0a"; c.lineWidth = 2 * S; c.beginPath();
  c.moveTo(-8 * S, 8 * S); c.quadraticCurveTo(-12 * S, -26 * S, 18 * S, -30 * S); c.quadraticCurveTo(42 * S, -34 * S, 56 * S, -22 * S); c.quadraticCurveTo(72 * S, -22 * S, 82 * S, -12 * S);
  c.quadraticCurveTo(84 * S, -4 * S, 74 * S, -2 * S); c.quadraticCurveTo(46 * S, -4 * S, 30 * S, 4 * S); c.quadraticCurveTo(10 * S, 12 * S, -8 * S, 8 * S); c.fill(); c.stroke();
  c.fillStyle = "#fffbe8"; [[70, -1, 13], [52, -2, 9]].forEach(function (f) { c.beginPath(); c.moveTo((f[0] - 3.5) * S, f[1] * S); c.lineTo(f[0] * S, (f[1] + f[2] + open * 6) * S); c.lineTo((f[0] + 3.5) * S, f[1] * S); c.fill(); });
  for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo((30 + i * 6) * S, 0); c.lineTo((32.5 + i * 6) * S, (5 + open * 4) * S); c.lineTo((35 + i * 6) * S, -1 * S); c.fill(); }
  c.fillStyle = "#1c0505"; c.beginPath(); c.ellipse(76 * S, -11 * S, 3.4 * S, 2.4 * S, -.4, 0, 7); c.fill();
  if (roar < .2) for (i = 0; i < 3; i++) { var sk = (t * .8 + i / 3) % 1; c.fillStyle = "rgba(180,170,170," + (.35 * (1 - sk)) + ")"; c.beginPath(); c.arc((80 + sk * 22) * S, (-12 - sk * 26) * S, (3 + sk * 8) * S, 0, 7); c.fill(); }
  // spiked cheek and brow ridge, then the glaring eye
  c.fillStyle = "#fcd34d"; for (i = 0; i < 3; i++) { c.beginPath(); c.moveTo((8 + i * 7) * S, -6 * S); c.lineTo((2 + i * 7) * S, (6 + i * 3) * S); c.lineTo((14 + i * 7) * S, -2 * S); c.fill(); }
  c.fillStyle = "#450a0a"; c.beginPath(); c.moveTo(14 * S, -26 * S); c.lineTo(52 * S, -16 * S); c.lineTo(48 * S, -22 * S); c.lineTo(20 * S, -33 * S); c.closePath(); c.fill();
  var eg = c.createRadialGradient(32 * S, -17 * S, 0, 32 * S, -17 * S, 10 * S); eg.addColorStop(0, "#fff7a8"); eg.addColorStop(.6, "#f59e0b"); eg.addColorStop(1, "#b91c1c");
  c.save(); c.shadowColor = "#ffb020"; c.shadowBlur = 10 * S; c.fillStyle = eg; c.beginPath(); c.moveTo(18 * S, -18 * S); c.quadraticCurveTo(34 * S, -26 * S, 48 * S, -14 * S); c.quadraticCurveTo(32 * S, -10 * S, 18 * S, -18 * S); c.fill(); c.restore();
  if (!blink) { c.fillStyle = "#0b0505"; c.beginPath(); c.ellipse(36 * S, -16.5 * S, 1.8 * S, 4.2 * S, .5, 0, 7); c.fill(); }
  c.fillStyle = "#450a0a"; c.beginPath(); c.moveTo(16 * S, -22 * S); c.quadraticCurveTo(34 * S, -30 * S, 50 * S, -12 * S); c.lineTo(50 * S, -15 * S); c.quadraticCurveTo(34 * S, -24 * S, 18 * S, -18 * S); c.fill();
  // whiskers
  c.strokeStyle = "#fde68a"; c.lineWidth = 2.2 * S;
  [0, 1].forEach(function (k) { c.beginPath(); c.moveTo(70 * S, (-6 + k * 4) * S); c.bezierCurveTo(96 * S, (-26 + k * 40) * S + Math.sin(t * 5 + k) * 7 * S, 110 * S, (-6 + k * 44) * S, 132 * S + Math.sin(t * 4 + k) * 8 * S, (14 + k * 38) * S + Math.sin(t * 5 + k * 2) * 10 * S); c.stroke(); });
  c.restore();
  // the pearl it hunts
  var px = pts[0][0] + 132 * S + roar * 70 * S, py = hy - 6 * S + Math.sin(t * 2.2) * 8 * S;
  var pg = c.createRadialGradient(px, py, 1, px, py, 22 * S); pg.addColorStop(0, "rgba(255,244,180,1)"); pg.addColorStop(.35, "rgba(252,211,77,.85)"); pg.addColorStop(1, "rgba(252,211,77,0)");
  c.fillStyle = pg; c.beginPath(); c.arc(px, py, 22 * S, 0, 7); c.fill(); c.fillStyle = "#fff7c2"; c.beginPath(); c.arc(px, py, 6.5 * S, 0, 7); c.fill();
  c.restore();
  return { x: px, y: py, tail: tp[0] };
}

/** A fierce lion-dance lion: whipping spiked mane, thick furrowed brows, glowing glaring eyes, flared nose, and a roar that opens a fanged mouth
    and shakes the head. (x, y) = ground under the head, S = size, t = seconds. */
function fxLion(c, x, y, S, t) {
  var ph = t * 2.6, hop = Math.abs(Math.sin(ph)), R = S * .5, roar = Math.pow(Math.max(0, Math.sin(t * 1.1)), 2.2), blink = (t % 3.7) < .12;
  var shake = roar * Math.sin(t * 52) * 1.8, tilt = Math.sin(ph) * .08 + Math.sin(t * 40) * .02 * roar, open = .12 + roar * .88;
  c.save(); c.translate(x, y); c.lineJoin = "round";
  // cloth body with a gold pattern, wavy hem, hopping legs
  var bx = R * .55, by = -R * .95 - hop * R * .16, len = S * 1.25, hh = S * .6;
  var cg = c.createLinearGradient(bx, by, bx + len, by + hh); cg.addColorStop(0, "#991b1b"); cg.addColorStop(.55, "#dc2626"); cg.addColorStop(1, "#d97706");
  c.fillStyle = cg; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + len * .5, by - 10 + Math.sin(t * 4) * 6, bx + len, by + 2); c.lineTo(bx + len, by + hh * .78);
  for (var k = 10; k >= 0; k--) c.lineTo(bx + len * k / 10, by + hh + Math.sin(k * 1.4 + t * 5) * 6 - k * 1.2); c.closePath(); c.fill();
  c.strokeStyle = "rgba(252,211,77,.85)"; c.lineWidth = 2.2;
  for (k = 0; k < 5; k++) for (var q = 0; q < 3; q++) { var sx = bx + len * (.12 + k * .19), sy = by + hh * (.22 + q * .26); c.beginPath(); c.arc(sx, sy, 9, Math.PI * .1, Math.PI * .9); c.stroke(); c.beginPath(); c.arc(sx + 9, sy + 5, 9, Math.PI * .1, Math.PI * .9); c.stroke(); }
  c.strokeStyle = "#fcd34d"; c.lineWidth = 4; c.beginPath(); for (k = 0; k <= 10; k++) c.lineTo(bx + len * k / 10, by + hh + Math.sin((10 - k) * 1.4 + t * 5) * 6 - (10 - k) * 1.2); c.stroke();
  [[R * .1, 0], [R * .75, 1], [len * .65, 0], [len * .95, 1]].forEach(function (L) { var up = Math.max(0, Math.sin(ph + L[1] * Math.PI)) * 13; c.fillStyle = "#111827"; c.fillRect(L[0] - 6.5, -R * .38 - up, 13, R * .38 + up - 2); c.fillStyle = "#dc2626"; c.beginPath(); c.ellipse(L[0] + 3, -3 - up, 12, 6.5, 0, 0, 7); c.fill(); c.strokeStyle = "#fcd34d"; c.lineWidth = 1.6; c.stroke(); });
  // head
  c.translate(shake, -R * 1.05 - hop * R * .26); c.rotate(tilt);
  // mane: three layers of spiked flames whipping in the wind
  [[34, 1.38, "#7f1d1d", .17], [30, 1.22, "#f97316", .15], [26, 1.04, "#fcd34d", .12]].forEach(function (L, li) {
    for (var i = 0; i < L[0]; i++) {
      var a = i / L[0] * Math.PI * 2 + li * .1, whip = Math.sin(t * 6 + i * .9 + li) * .1 + roar * Math.sin(t * 30 + i) * .06, rr = R * L[1] * (1 + Math.sin(t * 4.3 + i * 1.3) * .05 + roar * .1);
      var a0 = a - L[3], a1 = a + L[3];
      c.fillStyle = L[2]; c.beginPath(); c.moveTo(Math.cos(a0) * R * .75, Math.sin(a0) * R * .75); c.quadraticCurveTo(Math.cos(a - .04 + whip) * rr * .95, Math.sin(a - .04 + whip) * rr * .95, Math.cos(a + whip * 1.6) * rr, Math.sin(a + whip * 1.6) * rr);
      c.quadraticCurveTo(Math.cos(a + .04 + whip) * rr * .95, Math.sin(a + .04 + whip) * rr * .95, Math.cos(a1) * R * .75, Math.sin(a1) * R * .75); c.closePath(); c.fill();
    }
  });
  c.fillStyle = "#b91c1c"; [-1, 1].forEach(function (k) { c.beginPath(); c.moveTo(k * R * .56, -R * .56); c.lineTo(k * R * .96 + Math.sin(t * 7 + k) * 2, -R * 1.02); c.lineTo(k * R * .24, -R * .76); c.closePath(); c.fill(); c.strokeStyle = "#fcd34d"; c.lineWidth = 3; c.stroke(); });
  // face
  var fg = c.createRadialGradient(-R * .2, -R * .3, 2, 0, 0, R * .9); fg.addColorStop(0, "#ff6b4a"); fg.addColorStop(.6, "#d71f1f"); fg.addColorStop(1, "#8f1313");
  c.fillStyle = fg; c.strokeStyle = "#450a0a"; c.lineWidth = 3; c.beginPath(); c.ellipse(0, R * .04, R * .8, R * .76, 0, 0, 7); c.fill(); c.stroke();
  // horn
  var hg = c.createLinearGradient(0, -R * .7, 0, -R * 1.15); hg.addColorStop(0, "#b45309"); hg.addColorStop(1, "#fff1b8"); c.strokeStyle = hg; c.lineWidth = R * .16; c.lineCap = "round";
  c.beginPath(); c.moveTo(0, -R * .66); c.quadraticCurveTo(Math.sin(t * 4) * 5, -R * .92, Math.sin(t * 4) * 9, -R * 1.12); c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.arc(Math.sin(t * 4) * 9, -R * 1.16, R * .13, 0, 7); c.fill(); c.strokeStyle = "#f87171"; c.lineWidth = 2; c.stroke();
  // forehead wrinkles and heavy angry brows
  c.strokeStyle = "rgba(69,10,10,.65)"; c.lineWidth = 2.4; c.lineCap = "round"; for (var w = 0; w < 3; w++) { c.beginPath(); c.moveTo(-R * .18, -R * (.5 - w * .08)); c.quadraticCurveTo(0, -R * (.56 - w * .08) - roar * 4, R * .18, -R * (.5 - w * .08)); c.stroke(); }
  [-1, 1].forEach(function (k) {
    var f = roar * R * .06; c.fillStyle = "#3b0a0a"; c.beginPath(); c.moveTo(k * R * .66, -R * .38); c.lineTo(k * R * .1, -R * .06 + f); c.lineTo(k * R * .08, -R * .22 + f); c.lineTo(k * R * .56, -R * .56); c.closePath(); c.fill();
    c.strokeStyle = "#fcd34d"; c.lineWidth = 2; c.beginPath(); c.moveTo(k * R * .66, -R * .38); c.lineTo(k * R * .1, -R * .06 + f); c.stroke();
    // glowing glaring eye under a half-lowered lid
    var ex = k * R * .34, ey = -R * .02;
    c.save(); c.shadowColor = "#ff7a18"; c.shadowBlur = 8 + roar * 14; var eg = c.createRadialGradient(ex, ey, 0, ex, ey, R * .22); eg.addColorStop(0, "#fff3a0"); eg.addColorStop(.55, "#fb923c"); eg.addColorStop(1, "#b91c1c"); c.fillStyle = eg; c.beginPath(); c.ellipse(ex, ey, R * .21, R * .17, 0, 0, 7); c.fill(); c.restore();
    if (!blink) { c.fillStyle = "#0b0505"; c.beginPath(); c.ellipse(ex - k * R * .01, ey, R * .06, R * .12, 0, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(ex + R * .04, ey - R * .05, R * .03, 0, 7); c.fill(); }
    c.fillStyle = "#8f1313"; c.beginPath(); c.moveTo(ex - k * R * .26, ey - R * .26); c.lineTo(ex + k * R * .26, ey + R * .02 - roar * R * .02); c.lineTo(ex + k * R * .26, ey - R * .26); c.closePath(); c.fill();
    if (blink) { c.strokeStyle = "#3b0a0a"; c.lineWidth = 3; c.beginPath(); c.moveTo(ex - R * .2, ey); c.lineTo(ex + R * .2, ey); c.stroke(); }
  });
  // broad nose with flared nostrils
  c.fillStyle = "#b45309"; c.beginPath(); c.moveTo(-R * .2, R * .2); c.quadraticCurveTo(0, R * .02, R * .2, R * .2); c.quadraticCurveTo(R * .22, R * .34, 0, R * .36); c.quadraticCurveTo(-R * .22, R * .34, -R * .2, R * .2); c.fill();
  c.fillStyle = "#1c0505"; [-1, 1].forEach(function (k) { c.beginPath(); c.ellipse(k * R * .09, R * .26, R * .045, R * .06 + roar * R * .02, k * .5, 0, 7); c.fill(); });
  // mouth: upper fangs, dropping jaw, tongue, lower fangs
  var mw = R * .5, jawY = R * .36, drop = R * (.06 + open * .42);
  c.fillStyle = "#3b0a0a"; c.beginPath(); c.moveTo(-mw, jawY); c.quadraticCurveTo(0, jawY - R * .04, mw, jawY); c.quadraticCurveTo(mw * .8, jawY + drop * 1.3, 0, jawY + drop * 1.45); c.quadraticCurveTo(-mw * .8, jawY + drop * 1.3, -mw, jawY); c.fill();
  c.fillStyle = "#f43f5e"; c.beginPath(); c.ellipse(0, jawY + drop * .95, mw * .5, drop * .4 + 1, 0, 0, 7); c.fill();
  c.fillStyle = "#fffdf5"; [[-mw * .78, .26], [-mw * .4, .15], [mw * .4, .15], [mw * .78, .26]].forEach(function (f) { c.beginPath(); c.moveTo(f[0] - R * .06, jawY - 1); c.lineTo(f[0], jawY + R * f[1] + drop * .5); c.lineTo(f[0] + R * .06, jawY - 1); c.fill(); });
  [-.5, .5].forEach(function (f) { c.beginPath(); c.moveTo(f * mw - R * .05, jawY + drop * 1.4); c.lineTo(f * mw, jawY + drop * 1.4 - R * .16); c.lineTo(f * mw + R * .05, jawY + drop * 1.4); c.fill(); });
  c.strokeStyle = "#fcd34d"; c.lineWidth = 3; c.beginPath(); c.moveTo(-mw, jawY); c.quadraticCurveTo(0, jawY - R * .05, mw, jawY); c.stroke();
  // cheek fur, whiskers and a ragged white beard
  c.fillStyle = "#fff7ed"; [-1, 1].forEach(function (k) { for (var j = 0; j < 4; j++) { c.beginPath(); c.moveTo(k * R * .6, R * (.2 + j * .08)); c.lineTo(k * R * (.95 + roar * .05), R * (.22 + j * .12) + Math.sin(t * 6 + j) * 2); c.lineTo(k * R * .56, R * (.3 + j * .08)); c.fill(); } });
  for (var b = -3; b <= 3; b++) { c.beginPath(); c.moveTo(b * R * .13 - R * .06, jawY + drop * 1.35); c.lineTo(b * R * .13, jawY + drop * 1.35 + R * (.22 + Math.abs(Math.sin(t * 5 + b)) * .12)); c.lineTo(b * R * .13 + R * .06, jawY + drop * 1.35); c.fill(); }
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
