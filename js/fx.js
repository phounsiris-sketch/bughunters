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

/** Classic cartoon Chinese dragon (red scales, golden belly plates, golden leaf fins and mane, antlers, long snout, clawed red legs, orange flame swirls).
    Still fierce: it glares, bares its teeth and roars fire every few seconds. Head at (hx, hy) moving right, S = size, t = seconds. */
function fxDragon(c, hx, hy, S, t) {
  var N = 40, sp = 12.5 * S, pts = [], i;
  for (i = 0; i < N; i++) { var a = (.5 + i / N * .8) * 26 * S; pts.push([hx - i * sp, hy + Math.sin(i * .44 - t * 3.6) * a]); }
  var wid = function (k) { return 26 * S * Math.pow(1 - k / N, .6) + 2.5 * S; };
  var ang = function (k) { var a = pts[Math.max(0, k - 1)], b = pts[Math.min(N - 1, k + 1)]; return Math.atan2(a[1] - b[1], a[0] - b[0]); };
  var roar = Math.pow(Math.max(0, Math.sin(t * .9)), 3), blink = (t % 5.1) < .12;
  c.save(); c.lineJoin = "round"; c.lineCap = "round";
  // orange flame swirls trailing from two bends of the body
  [11, 27].forEach(function (k, n) {
    var p = pts[k], r = wid(k) / 2; for (var q = 0; q < 3; q++) { var g = c.createLinearGradient(p[0], p[1], p[0] - 60 * S, p[1] + 20 * S); g.addColorStop(0, "#fb923c"); g.addColorStop(1, "rgba(249,115,22,0)");
      _fxStrand(c, p[0] - 6 * S, p[1] + r * .6, p[0] - 30 * S, p[1] + (r + 14 + q * 8) * S + Math.sin(t * 5 + q + n) * 6 * S, p[0] - (60 + q * 14) * S, p[1] + (r + 6 + q * 14) * S + Math.sin(t * 5 + q) * 10 * S, 9 * S, g); }
  });
  // golden leaf fins along the back
  for (i = N - 3; i > 2; i -= 1) {
    var an = ang(i), r = wid(i) / 2, nx = Math.sin(an), ny = -Math.cos(an), bx = -Math.cos(an), by = -Math.sin(an), L = (12 + 9 * (1 - i / N)) * S;
    var sx = pts[i][0] + nx * r * .85, sy = pts[i][1] + ny * r * .85, tx = sx + nx * L + bx * L * .7, ty = sy + ny * L + by * L * .7, mx = (sx + tx) / 2 + bx * 5 * S, my = (sy + ty) / 2 + by * 5 * S;
    var fg = c.createLinearGradient(sx, sy, tx, ty); fg.addColorStop(0, "#f59e0b"); fg.addColorStop(1, "#fde047");
    c.fillStyle = fg; c.strokeStyle = "#b45309"; c.lineWidth = 1.2 * S; c.beginPath(); c.moveTo(sx - bx * 5 * S, sy - by * 5 * S); c.quadraticCurveTo(mx + nx * 4 * S, my + ny * 4 * S, tx, ty); c.quadraticCurveTo(mx - nx * 2 * S, my - ny * 2 * S, sx + bx * 5 * S, sy + by * 5 * S); c.closePath(); c.fill(); c.stroke();
  }
  // legs: red with a bent knee and golden claws
  [10, 24].forEach(function (k, n) {
    var p = pts[k], r = wid(k) / 2, sw = Math.sin(t * 3.6 + n * 2.2) * 9 * S, kx = p[0] - 4 * S + sw * .5, ky = p[1] + r + 12 * S, fx = p[0] + 6 * S + sw, fy = ky + 15 * S;
    c.strokeStyle = "#7f1d1d"; c.lineWidth = 10 * S; c.beginPath(); c.moveTo(p[0], p[1] + r * .4); c.quadraticCurveTo(kx - 6 * S, ky - 2 * S, kx, ky); c.lineTo(fx, fy); c.stroke();
    c.strokeStyle = "#dc2626"; c.lineWidth = 7 * S; c.beginPath(); c.moveTo(p[0], p[1] + r * .4); c.quadraticCurveTo(kx - 6 * S, ky - 2 * S, kx, ky); c.lineTo(fx, fy); c.stroke();
    c.strokeStyle = "#fbbf24"; c.lineWidth = 3 * S; for (var q = -1.5; q <= 1.5; q++) { c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + (7 + q * 2) * S, fy + 3 * S, fx + (10 + q * 4) * S, fy + (9 + Math.abs(q) * 1.5) * S); c.stroke(); }
  });
  // body: red scales on top, broad golden belly plates underneath
  for (i = N - 1; i >= 1; i--) {
    var p2 = pts[i], r2 = wid(i) / 2, an2 = ang(i);
    c.save(); c.translate(p2[0], p2[1]); c.rotate(an2);
    c.fillStyle = "#5c0f0f"; c.beginPath(); c.arc(0, 0, r2 + 1.8 * S, 0, 7); c.fill();
    var gg = c.createLinearGradient(0, -r2, 0, r2); gg.addColorStop(0, "#c81e1e"); gg.addColorStop(.55, "#e11d28"); gg.addColorStop(1, "#b91c1c");
    c.fillStyle = gg; c.beginPath(); c.arc(0, 0, r2, 0, 7); c.fill();
    if (r2 > 3.5 * S) {
      var bg = c.createLinearGradient(0, r2 * .1, 0, r2); bg.addColorStop(0, "#fde047"); bg.addColorStop(1, "#f59e0b");
      c.fillStyle = bg; c.beginPath(); c.arc(0, 0, r2 * .98, Math.PI * .16, Math.PI * .84); c.closePath(); c.fill();
      c.strokeStyle = "rgba(146,64,14,.55)"; c.lineWidth = 1.2 * S; c.beginPath(); c.moveTo(-r2 * .55, r2 * .3); c.lineTo(r2 * .55, r2 * .3); c.stroke(); c.beginPath(); c.moveTo(0, r2 * .3); c.lineTo(0, r2 * .95); c.stroke();
      c.strokeStyle = "rgba(90,10,10,.7)"; c.lineWidth = 1.4 * S; [[-.45, -.1], [.1, -.35], [.5, -.05], [-.1, .05]].forEach(function (o) { c.beginPath(); c.arc(o[0] * r2, o[1] * r2, r2 * .42, Math.PI * .1, Math.PI * .9); c.stroke(); });
      c.strokeStyle = "rgba(255,170,120,.7)"; c.lineWidth = 1 * S; c.beginPath(); c.arc(r2 * .05, -r2 * .25, r2 * .5, Math.PI * 1.15, Math.PI * 1.8); c.stroke();
    }
    c.restore();
  }
  var tp = pts[N - 1]; for (i = -2; i <= 2; i++) { var tg = c.createLinearGradient(tp[0], tp[1], tp[0] - 50 * S, tp[1]); tg.addColorStop(0, "#fde047"); tg.addColorStop(1, "rgba(249,115,22,0)"); _fxStrand(c, tp[0], tp[1], tp[0] - 20 * S, tp[1] + i * 7 * S + Math.sin(t * 6 + i) * 5 * S, tp[0] - 48 * S, tp[1] + i * 15 * S + Math.sin(t * 6 + i) * 10 * S, 7 * S, tg); }
  // head
  c.save(); c.translate(pts[0][0], pts[0][1]); c.rotate(ang(1) * .55);
  var open = .1 + .06 * Math.sin(t * 3) + .5 * roar;
  // golden mane and cheek tufts, streaming back
  for (i = 0; i < 8; i++) {
    var m1 = Math.sin(t * 5 + i * .8) * 7 * S, gm = c.createLinearGradient(0, 0, -64 * S, 0); gm.addColorStop(0, "#fde047"); gm.addColorStop(.6, "#f59e0b"); gm.addColorStop(1, "rgba(234,88,12,0)");
    _fxStrand(c, -2 * S, (-24 + i * 6) * S, -32 * S, (-36 + i * 9) * S + m1, -66 * S, (-28 + i * 13) * S + m1 * 1.7, 9 * S, gm);
  }
  // antlered horns: grey-gold, branching
  [[0, -26], [15, -22]].forEach(function (h, n) {
    var hg = c.createLinearGradient(h[0] * S, h[1] * S, (h[0] - 38) * S, (h[1] - 40) * S); hg.addColorStop(0, "#a8a29e"); hg.addColorStop(.5, "#d6b46a"); hg.addColorStop(1, "#78716c");
    c.strokeStyle = hg; c.lineWidth = (8 - n * 2) * S; var sw = Math.sin(t * 2.4 + n) * 2 * S;
    c.beginPath(); c.moveTo((14 + h[0]) * S, (h[1] + 4) * S); c.quadraticCurveTo((h[0] - 6) * S, (h[1] - 30) * S, (h[0] - 40) * S, (h[1] - 38) * S + sw); c.stroke();
    c.lineWidth = (4 - n) * S; c.beginPath(); c.moveTo((h[0] - 4) * S, (h[1] - 22) * S); c.lineTo((h[0] + 6) * S, (h[1] - 46) * S); c.moveTo((h[0] - 20) * S, (h[1] - 33) * S); c.lineTo((h[0] - 27) * S, (h[1] - 54) * S + sw); c.stroke();
  });
  // lower jaw (golden chin beard, fangs, tongue)
  c.save(); c.translate(8 * S, 8 * S); c.rotate(open);
  c.fillStyle = "#450a0a"; c.beginPath(); c.moveTo(0, -6 * S); c.lineTo(78 * S, -6 * S); c.quadraticCurveTo(84 * S, 6 * S, 62 * S, 10 * S); c.quadraticCurveTo(28 * S, 16 * S, 0, 7 * S); c.fill();
  c.fillStyle = "#fb7185"; c.beginPath(); c.moveTo(6 * S, -2 * S); c.quadraticCurveTo(38 * S, -10 * S + Math.sin(t * 9) * 3 * S, 74 * S, -3 * S); c.quadraticCurveTo(40 * S, 5 * S, 6 * S, 3 * S); c.fill();
  var jg = c.createLinearGradient(0, -6 * S, 0, 14 * S); jg.addColorStop(0, "#dc2626"); jg.addColorStop(1, "#991b1b"); c.fillStyle = jg; c.beginPath(); c.moveTo(0, 2 * S); c.quadraticCurveTo(40 * S, 16 * S, 82 * S, 6 * S); c.lineTo(78 * S, 0); c.quadraticCurveTo(40 * S, 8 * S, 0, -3 * S); c.fill();
  c.fillStyle = "#fffbe8"; [[64, -4, 14], [30, -4, 9]].forEach(function (f) { c.beginPath(); c.moveTo((f[0] - 4) * S, f[1] * S); c.lineTo(f[0] * S + 1 * S, (f[1] - f[2]) * S); c.lineTo((f[0] + 4) * S, f[1] * S); c.fill(); });
  for (i = 0; i < 7; i++) { c.beginPath(); c.moveTo((14 + i * 8) * S, -3 * S); c.lineTo((17 + i * 8) * S, -8 * S); c.lineTo((20 + i * 8) * S, -3 * S); c.fill(); }
  for (i = 0; i < 4; i++) _fxStrand(c, (8 + i * 8) * S, 9 * S, (6 + i * 8) * S, (20 + Math.sin(t * 4 + i) * 3) * S, (2 + i * 8) * S, (32 + Math.sin(t * 4 + i) * 5) * S, 7 * S, "#fde047");
  c.restore();
  if (roar > .12) { c.save(); c.translate(82 * S, 6 * S); c.rotate(open * .5); _fxFire(c, 180 * S * roar, S, roar, t); c.restore(); }
  // skull: long tapered horse-like snout, upturned nose
  var hg2 = c.createLinearGradient(0, -34 * S, 0, 12 * S); hg2.addColorStop(0, "#e11d28"); hg2.addColorStop(.6, "#dc2626"); hg2.addColorStop(1, "#b91c1c");
  c.fillStyle = hg2; c.strokeStyle = "#450a0a"; c.lineWidth = 2 * S; c.beginPath();
  c.moveTo(-8 * S, 8 * S); c.quadraticCurveTo(-12 * S, -26 * S, 18 * S, -30 * S); c.quadraticCurveTo(44 * S, -32 * S, 62 * S, -22 * S); c.quadraticCurveTo(84 * S, -22 * S, 92 * S, -14 * S);
  c.quadraticCurveTo(96 * S, -6 * S, 86 * S, -2 * S); c.quadraticCurveTo(54 * S, -4 * S, 32 * S, 4 * S); c.quadraticCurveTo(10 * S, 12 * S, -8 * S, 8 * S); c.fill(); c.stroke();
  c.fillStyle = "#fffbe8"; [[78, -1, 13], [58, -2, 9]].forEach(function (f) { c.beginPath(); c.moveTo((f[0] - 3.5) * S, f[1] * S); c.lineTo(f[0] * S, (f[1] + f[2] + open * 6) * S); c.lineTo((f[0] + 3.5) * S, f[1] * S); c.fill(); });
  for (i = 0; i < 5; i++) { c.beginPath(); c.moveTo((30 + i * 6) * S, 0); c.lineTo((32.5 + i * 6) * S, (5 + open * 4) * S); c.lineTo((35 + i * 6) * S, -1 * S); c.fill(); }
  c.fillStyle = "#1c0505"; c.beginPath(); c.ellipse(86 * S, -11 * S, 3.4 * S, 2.4 * S, -.4, 0, 7); c.fill();
  if (roar < .2) for (i = 0; i < 3; i++) { var sk = (t * .8 + i / 3) % 1; c.fillStyle = "rgba(190,180,180," + (.35 * (1 - sk)) + ")"; c.beginPath(); c.arc((90 + sk * 22) * S, (-12 - sk * 26) * S, (3 + sk * 8) * S, 0, 7); c.fill(); }
  // golden cheek fur and brow
  c.fillStyle = "#fde047"; for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo((6 + i * 7) * S, -8 * S); c.lineTo((-2 + i * 7) * S, (8 + i * 3) * S); c.lineTo((14 + i * 7) * S, -2 * S); c.fill(); }
  c.fillStyle = "#fbbf24"; c.beginPath(); c.moveTo(12 * S, -27 * S); c.lineTo(52 * S, -17 * S); c.lineTo(50 * S, -23 * S); c.lineTo(18 * S, -34 * S); c.closePath(); c.fill();
  // big round eye with a white, a dark pupil and a glint, under an angry lid
  c.fillStyle = "#fff"; c.strokeStyle = "#450a0a"; c.lineWidth = 2 * S; c.beginPath(); c.ellipse(32 * S, -14 * S, 10 * S, blink ? 1 * S : 9 * S, -.15, 0, 7); c.fill(); c.stroke();
  if (!blink) { c.fillStyle = "#1c0505"; c.beginPath(); c.arc(35 * S, -14 * S, 5 * S, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(36.6 * S, -16 * S, 1.8 * S, 0, 7); c.fill(); }
  c.fillStyle = "#b91c1c"; c.beginPath(); c.moveTo(20 * S, -24 * S); c.lineTo(46 * S, -12 * S); c.lineTo(46 * S, -26 * S); c.closePath(); c.fill(); c.strokeStyle = "#450a0a"; c.beginPath(); c.moveTo(20 * S, -24 * S); c.lineTo(46 * S, -12 * S); c.stroke();
  // long golden whiskers with a curl
  c.strokeStyle = "#fde047"; c.lineWidth = 2.4 * S;
  [0, 1].forEach(function (k) { c.beginPath(); c.moveTo(80 * S, (-6 + k * 4) * S); c.bezierCurveTo(104 * S, (-28 + k * 44) * S + Math.sin(t * 5 + k) * 7 * S, 118 * S, (-6 + k * 48) * S, 140 * S + Math.sin(t * 4 + k) * 8 * S, (14 + k * 40) * S + Math.sin(t * 5 + k * 2) * 10 * S); c.stroke(); });
  c.restore();
  var px = pts[0][0] + 150 * S + roar * 70 * S, py = hy - 6 * S + Math.sin(t * 2.2) * 8 * S;
  var pg = c.createRadialGradient(px, py, 1, px, py, 22 * S); pg.addColorStop(0, "rgba(255,244,180,1)"); pg.addColorStop(.35, "rgba(252,211,77,.85)"); pg.addColorStop(1, "rgba(252,211,77,0)");
  c.fillStyle = pg; c.beginPath(); c.arc(px, py, 22 * S, 0, 7); c.fill(); c.fillStyle = "#fff7c2"; c.beginPath(); c.arc(px, py, 6.5 * S, 0, 7); c.fill();
  c.restore();
  return { x: px, y: py, tail: tp[0] };
}

/** Classic lion-dance head: white fur fringe, red crown with twin horns and a gold flower, huge ringed eyes, a golden nose, a big white
    moustache over a laughing, fanged mouth, and a row of swinging tassels. It bobs, rolls its eyes, flaps its ears and roars. (x, y) = ground, S = size. */
function fxLion(c, x, y, S, t) {
  var ph = t * 2.6, hop = Math.abs(Math.sin(ph)), R = S * .5, roar = Math.pow(Math.max(0, Math.sin(t * 1.1)), 2.2), blink = (t % 3.4) < .13;
  var shake = roar * Math.sin(t * 50) * 1.6, tilt = Math.sin(ph) * .08 + Math.sin(t * 38) * .02 * roar, open = .14 + roar * .86;
  c.save(); c.translate(x, y); c.lineJoin = "round"; c.lineCap = "round";
  // body: wavy colour bands with a white fur hem, hopping legs
  var bx = R * .5, by = -R * .9 - hop * R * .16, len = S * 1.3, hh = S * .62, bands = ["#dc2626", "#f97316", "#facc15", "#f472b6", "#dc2626"];
  c.save(); c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + len * .5, by - 12 + Math.sin(t * 4) * 6, bx + len, by + 2); c.lineTo(bx + len, by + hh * .8);
  for (var k = 10; k >= 0; k--) c.lineTo(bx + len * k / 10, by + hh + Math.sin(k * 1.4 + t * 5) * 6 - k * 1.2); c.closePath(); c.clip();
  for (var b = 0; b < 5; b++) { c.fillStyle = bands[b]; c.beginPath(); c.moveTo(bx - 4, by + hh * b / 5 - 14); for (var q = 0; q <= 12; q++) c.lineTo(bx + len * q / 12, by + hh * b / 5 - 14 + Math.sin(q * .9 + t * 3 + b) * 9); c.lineTo(bx + len, by + hh); c.lineTo(bx, by + hh); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = "#fffbf5"; c.strokeStyle = "#475569"; c.lineWidth = 1.6; for (k = 0; k < 9; k++) { c.beginPath(); c.arc(bx + len * (k + .5) / 9, by + hh + Math.sin((k + .5) * 1.4 * 10 / 9 + t * 5) * 6 - (k + .5) * 1.2, 11, 0, Math.PI); c.fill(); c.stroke(); }
  [[R * .1, 0], [R * .75, 1], [len * .62, 0], [len * .95, 1]].forEach(function (L) { var up = Math.max(0, Math.sin(ph + L[1] * Math.PI)) * 13; c.fillStyle = "#111827"; c.fillRect(L[0] - 6.5, -R * .38 - up, 13, R * .38 + up - 2); c.fillStyle = "#dc2626"; c.beginPath(); c.ellipse(L[0] + 3, -3 - up, 12, 6.5, 0, 0, 7); c.fill(); c.strokeStyle = "#facc15"; c.lineWidth = 1.8; c.stroke(); });
  // head
  c.translate(shake, -R * 1.18 - hop * R * .26); c.rotate(tilt);
  // twin red crest horns behind the head
  [-1, 1].forEach(function (k) {
    var wig = Math.sin(t * 6 + k) * 2;
    c.fillStyle = "#dc2626"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 3; c.beginPath(); c.moveTo(k * R * .3, -R * .7); c.quadraticCurveTo(k * R * .5, -R * 1.1, k * R * 1.0 + wig, -R * 1.12); c.quadraticCurveTo(k * R * .86, -R * .86, k * R * .96, -R * .64); c.quadraticCurveTo(k * R * .8, -R * .62, k * R * .62, -R * .5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#fca5a5"; c.beginPath(); c.moveTo(k * R * .46, -R * .74); c.quadraticCurveTo(k * R * .62, -R * .96, k * R * .86 + wig * .6, -R * .98); c.quadraticCurveTo(k * R * .72, -R * .8, k * R * .78, -R * .68); c.closePath(); c.fill();
  });
  // white fur fringe around the face: scalloped lobes that ruffle a little
  var lobes = 22; c.fillStyle = "#fffbf5"; c.strokeStyle = "#475569"; c.lineWidth = 2.2;
  for (var i = 0; i < lobes; i++) { var a = Math.PI * .1 + (i / (lobes - 1)) * (Math.PI * 1.8) + Math.PI / 2 * 0; var aa = a + Math.PI * .5, rr = R * (.82 + Math.sin(t * 4 + i * 1.3) * .015); c.beginPath(); c.arc(Math.cos(aa) * rr * 1.02, Math.sin(aa) * rr * .98, R * .2, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = "#fffbf5"; c.beginPath(); c.ellipse(0, 0, R * .84, R * .8, 0, 0, 7); c.fill();
  // red face
  var fg = c.createRadialGradient(-R * .2, -R * .35, 2, 0, 0, R * .9); fg.addColorStop(0, "#f04438"); fg.addColorStop(.7, "#d71f1f"); fg.addColorStop(1, "#a31616");
  c.fillStyle = fg; c.strokeStyle = "#7f1d1d"; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -R * .06, R * .74, R * .7, 0, 0, 7); c.fill(); c.stroke();
  // spiral horn with a pom-pom, and the golden flower on the forehead
  var hx = Math.sin(t * 4) * 6;
  c.save(); c.translate(hx * .4, 0); c.fillStyle = "#fff"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-R * .12, -R * .62); c.lineTo(hx, -R * 1.02); c.lineTo(R * .12, -R * .62); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = "#dc2626"; c.lineWidth = 3.5; for (var s = 0; s < 3; s++) { c.beginPath(); c.moveTo(-R * .1 + s * .01, -R * (.7 + s * .1)); c.lineTo(R * .1, -R * (.76 + s * .1)); c.stroke(); }
  c.fillStyle = "#fffbf5"; c.strokeStyle = "#dc2626"; c.lineWidth = 3; c.beginPath(); c.arc(hx, -R * 1.1, R * .14 + Math.sin(t * 8) * 1.2, 0, 7); c.fill(); c.stroke(); c.restore();
  c.fillStyle = "#f59e0b"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 2; for (i = 0; i < 8; i++) { var pa = i / 8 * Math.PI * 2; c.beginPath(); c.ellipse(Math.cos(pa) * R * .15, -R * .42 + Math.sin(pa) * R * .15, R * .08, R * .08, 0, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = "#facc15"; c.beginPath(); c.arc(0, -R * .42, R * .13, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#e0f2fe"; c.beginPath(); c.arc(0, -R * .42, R * .06, 0, 7); c.fill(); c.fillStyle = "#2563eb"; c.beginPath(); c.arc(0, -R * .42, R * .03, 0, 7); c.fill();
  // eyes: black rim, white, yellow ring, red ring, pupil that rolls; angry lid and brows
  [-1, 1].forEach(function (k) {
    var ex = k * R * .36, ey = -R * .1, er = R * (.27 + roar * .02), lx = Math.cos(t * 1.7) * R * .04 * k, ly = Math.sin(t * 2.3) * R * .03;
    c.fillStyle = "#111827"; c.beginPath(); c.arc(ex, ey, er + 3, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
    if (!blink) { c.fillStyle = "#facc15"; c.beginPath(); c.arc(ex + lx, ey + ly, er * .72, 0, 7); c.fill(); c.fillStyle = "#dc2626"; c.beginPath(); c.arc(ex + lx, ey + ly, er * .5, 0, 7); c.fill(); c.fillStyle = "#0b0b0b"; c.beginPath(); c.arc(ex + lx, ey + ly, er * .3, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.arc(ex + lx + er * .14, ey + ly - er * .16, er * .1, 0, 7); c.fill(); }
    c.fillStyle = "#d71f1f"; c.strokeStyle = "#111827"; c.lineWidth = 3; c.beginPath(); c.moveTo(ex - k * er * 1.1, ey - er * 1.1); c.lineTo(ex + k * er * 1.1, ey - er * .1 + (blink ? er * 1.1 : 0)); c.lineTo(ex + k * er * 1.1, ey - er * 1.3); c.closePath(); c.fill();
    if (blink) { c.beginPath(); c.moveTo(ex - er, ey); c.lineTo(ex + er, ey); c.stroke(); }
    // fluffy white brow, tilted inward when it roars
    c.fillStyle = "#fffbf5"; c.strokeStyle = "#475569"; c.lineWidth = 2; for (var bb = 0; bb < 4; bb++) { var bxx = ex + k * (bb - 1.5) * er * .5, byy = ey - er * 1.35 + (k * (bb - 1.5)) * er * .12 * (1 + roar * 1.4); c.beginPath(); c.arc(bxx, byy, er * .3, 0, 7); c.fill(); c.stroke(); }
  });
  c.fillStyle = "#3b82f6"; c.beginPath(); c.arc(0, R * .02, R * .05, 0, 7); c.fill();
  // golden nose, white moustache lobes, laughing mouth
  c.fillStyle = "#facc15"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, R * .08); c.quadraticCurveTo(R * .2, R * .14, R * .12, R * .28); c.quadraticCurveTo(0, R * .34, -R * .12, R * .28); c.quadraticCurveTo(-R * .2, R * .14, 0, R * .08); c.fill(); c.stroke();
  var mouthY = R * .4, drop = R * (.04 + open * .34);
  c.fillStyle = "#3b0a0a"; c.beginPath(); c.moveTo(-R * .5, mouthY); c.quadraticCurveTo(0, mouthY - R * .06, R * .5, mouthY); c.quadraticCurveTo(R * .42, mouthY + drop * 1.6 + R * .1, 0, mouthY + drop * 1.7 + R * .12); c.quadraticCurveTo(-R * .42, mouthY + drop * 1.6 + R * .1, -R * .5, mouthY); c.fill(); c.strokeStyle = "#7f1d1d"; c.lineWidth = 3; c.stroke();
  c.fillStyle = "#fb7185"; c.beginPath(); c.ellipse(0, mouthY + drop * 1.15 + R * .1, R * .22, drop * .45 + 2, 0, 0, 7); c.fill();
  c.fillStyle = "#fffdf5"; [[-.36, .17], [-.17, .1], [.17, .1], [.36, .17]].forEach(function (f) { c.beginPath(); c.moveTo(f[0] * R - R * .06, mouthY - 1); c.lineTo(f[0] * R, mouthY + R * f[1] + drop * .45); c.lineTo(f[0] * R + R * .06, mouthY - 1); c.fill(); });
  c.fillStyle = "#fffbf5"; c.strokeStyle = "#475569"; c.lineWidth = 2; [-1, 1].forEach(function (k) { for (var m = 0; m < 3; m++) { c.beginPath(); c.ellipse(k * (R * .26 + m * R * .17), R * .27 + m * R * .035 + Math.sin(t * 6 + m + k) * 1.2 - roar * R * .05, R * .17, R * .12, k * -.35, 0, 7); c.fill(); c.stroke(); } });
  // swinging tassels under the chin
  for (i = -3; i <= 3; i++) { var sw = Math.sin(t * 4 + i * .7) * .12, tl = R * (.3 + (3 - Math.abs(i)) * .07), tx = i * R * .2; c.save(); c.translate(tx, mouthY + drop * 1.7 + R * .12); c.rotate(sw); c.fillStyle = "#facc15"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 1.6; c.fillRect(-R * .03, 0, R * .06, tl); c.strokeRect(-R * .03, 0, R * .06, tl); c.fillStyle = "#dc2626"; c.beginPath(); c.arc(0, tl + R * .05, R * .08, 0, 7); c.fill(); c.stroke(); c.restore(); }
  // ears flapping at the sides
  [-1, 1].forEach(function (k) { c.fillStyle = "#dc2626"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 2.4; c.save(); c.translate(k * R * .86, -R * .22); c.rotate(k * (.4 + Math.sin(t * 6 + k) * .18)); c.beginPath(); c.ellipse(0, 0, R * .13, R * .24, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#facc15"; c.beginPath(); c.ellipse(0, 0, R * .06, R * .13, 0, 0, 7); c.fill(); c.restore(); });
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
  halloween: function (c, w, h, t, top) {
    top = top || 0; var i, my = top + 38, g = c.createRadialGradient(w - 50, my, 0, w - 50, my, 96 + Math.sin(t * 1.4) * 8); g.addColorStop(0, "rgba(253,186,116,.3)"); g.addColorStop(1, "rgba(253,186,116,0)"); c.fillStyle = g; c.fillRect(w - 160, top, 160, 140);
    for (i = 0; i < 16; i++) { var p = (t * (.02 + _frnd(i) * .03) + _frnd(i + 9)) % 1, ex = _frnd(i + 3) * w + Math.sin(t + i) * 14, ey = h - FX_NAV - p * (h - FX_NAV); c.fillStyle = "rgba(251,146,60," + (.25 + .5 * Math.abs(Math.sin(t * 2 + i))) * (1 - p) + ")"; c.beginPath(); c.arc(ex, ey, 1.6 + _frnd(i + 5) * 1.6, 0, 7); c.fill(); }
    fxGhost(c, w * (.12 + .76 * ((t / 34) % 1)), h * .46 + Math.sin(t * 1.1) * 30, 1.1, t);
    for (i = 0; i < 3; i++) { var sp = 52 + i * 14, bx = ((t * sp + i * 210) % (w + 200)) - 100, by = top + 50 + i * 70 + Math.sin(t * 1.7 + i * 2) * 26; fxBat(c, bx, by, .8 - i * .12, Math.sin(t * 14 + i * 1.3) * .9); }
  },
  christmas: function (c, w, h, t, top) {
    top = top || 0; var i, cols = ["#ef4444", "#fde68a", "#4ade80", "#60a5fa"];
    c.strokeStyle = "rgba(2,20,10,.9)"; c.lineWidth = 2; c.beginPath(); for (var x = 0; x <= w; x += 6) { var y = top + 10 + Math.abs(Math.sin(x / 110 * Math.PI / 1)) * 14; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    for (i = 0, x = 16; x < w; x += 34, i++) { var by = top + 10 + Math.abs(Math.sin(x / 110 * Math.PI)) * 14 + 6, tw = .45 + .55 * Math.max(0, Math.sin(t * 2.6 + i * 1.3)); c.fillStyle = cols[i % 4]; c.globalAlpha = .45 + tw * .55; c.beginPath(); c.ellipse(x, by, 4.2, 6.2, 0, 0, 7); c.fill(); var g = c.createRadialGradient(x, by, 0, x, by, 20); g.addColorStop(0, cols[i % 4]); g.addColorStop(1, "rgba(0,0,0,0)"); c.globalAlpha = tw * .35; c.fillStyle = g; c.fillRect(x - 20, by - 20, 40, 40); c.globalAlpha = 1; }
    for (i = 0; i < 46; i++) { var z = .4 + _frnd(i) * .9, sx = ((_frnd(i + 7) * (w + 60)) + Math.sin(t * .8 + i) * 22 * z - 30), sy = ((t * (22 + z * 34) + _frnd(i + 2) * h) % (h + 20)) - 10; c.fillStyle = "rgba(255,255,255," + (.45 + z * .4) + ")"; c.beginPath(); c.arc(sx, sy, 1.4 + z * 2.2, 0, 7); c.fill(); }
  },
  cny: function (c, w, h, t, top) {
    top = top || 0; var i, ground = h - FX_NAV;
    [[34, 64], [98, 48], [w - 98, 52], [w - 34, 68]].forEach(function (l, k) { fxLantern(c, l[0], top, l[1] * 1.15, Math.sin(t * 1.25 + k * 1.7) * .1, true); });
    for (i = 0; i < 26; i++) { var sx = _frnd(i) * w + Math.sin(t + i) * 10, sy = ((t * (14 + _frnd(i + 3) * 18) + _frnd(i + 8) * h) % (h + 10)); c.fillStyle = "rgba(252,211,77," + (.25 + .6 * Math.abs(Math.sin(t * 3 + i))) + ")"; c.beginPath(); c.arc(sx, sy, 1.2 + _frnd(i + 4) * 1.8, 0, 7); c.fill(); }
    var S = Math.min(1.45, w / 300), L = 38 * 13 * S + 260, hx = ((t * 46) % (w + L + 140)) - 60;
    fxDragon(c, hx, ground - 100 - 34 * S, S, t);
    fxLion(c, Math.min(120, w * .27), ground - 4, Math.min(112, w * .27), t);
  },
  arcade: function (c, w, h, t, top) {
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
    var ss = (t % 9) / 1.4; if (ss < 1) { var qx = w * (.2 + ss * .6), qy = (top || 0) + 30 + ss * 120; c.strokeStyle = "rgba(255,255,255," + (1 - ss) + ")"; c.lineWidth = 2; c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx - 50, qy - 24); c.stroke(); }
  }
};


/* ───────────── anime-inspired scenes (original art, no characters or logos) ───────────── */

function fxShuriken(c, x, y, r, rot, col) {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = Math.max(1, r / 14);
  c.beginPath(); for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a + Math.PI / 4) * r * .28, Math.sin(a + Math.PI / 4) * r * .28); } c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "rgba(0,0,0,.55)"; c.beginPath(); c.arc(0, 0, r * .13, 0, 7); c.fill(); c.restore();
}
function fxButterfly(c, x, y, s, flap, col) {
  c.save(); c.translate(x, y); c.scale(s, s);
  var gl = c.createRadialGradient(0, 0, 0, 0, 0, 40); gl.addColorStop(0, "rgba(249,115,22,.35)"); gl.addColorStop(1, "rgba(249,115,22,0)"); c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fill();
  c.fillStyle = col; c.strokeStyle = "rgba(249,115,22,.9)"; c.lineWidth = 1.4;
  [-1, 1].forEach(function (k) { c.save(); c.scale(k * Math.max(.25, Math.abs(Math.sin(flap))), 1); c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(16, -22, 34, -18, 30, -2); c.bezierCurveTo(34, 12, 14, 18, 0, 4); c.closePath(); c.fill(); c.stroke(); c.restore(); });
  c.fillStyle = "#f97316"; c.beginPath(); c.ellipse(0, 0, 2, 8, 0, 0, 7); c.fill(); c.restore();
}
function fxOrb(c, x, y, r, stars, t) {
  var g = c.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r); g.addColorStop(0, "#fff3b0"); g.addColorStop(.35, "#fbbf24"); g.addColorStop(1, "#d97706");
  var hg = c.createRadialGradient(x, y, r * .8, x, y, r * 2); hg.addColorStop(0, "rgba(251,191,36,.45)"); hg.addColorStop(1, "rgba(251,191,36,0)"); c.fillStyle = hg; c.beginPath(); c.arc(x, y, r * 2, 0, 7); c.fill();
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.strokeStyle = "rgba(146,64,14,.7)"; c.lineWidth = Math.max(1, r / 12); c.stroke();
  c.fillStyle = "#dc2626"; var sr = r * (stars > 4 ? .17 : .22);
  for (var i = 0; i < stars; i++) { var a = stars === 1 ? 0 : i / stars * Math.PI * 2 + t * .3, d = stars === 1 ? 0 : r * .42; var sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d; c.beginPath(); for (var k = 0; k < 10; k++) { var rr = k % 2 ? sr * .45 : sr, aa = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); } c.closePath(); c.fill(); }
}
function _fxCloud(c, x, y, s, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 14 * s, 0, 7); c.arc(x + 16 * s, y - 6 * s, 18 * s, 0, 7); c.arc(x + 36 * s, y, 15 * s, 0, 7); c.arc(x + 18 * s, y + 6 * s, 16 * s, 0, 7); c.fill(); }

/** A flat cartoon golden cloud that leaves a jet-like vapour trail: the trail is the cloud's own past path (trail = list of [dx, dy]
    offsets of earlier positions, newest first), drawn as a tapering ribbon plus fading puffs, so it curves and bobs exactly where the cloud has been.
    (x, y) = centre of the body, s = size. */
function _fxGoldCloud(c, x, y, s, t, trail) {
  var k = s * .78, n = trail ? trail.length : 0, i;
  if (n > 1) {
    // soft vapour puffs along the path
    for (i = n - 1; i >= 0; i--) { var f = i / n, r = (18 * (1 - f) + 3) * s, a = .55 * (1 - f), px = x + trail[i][0] - 20 * s, py = y + trail[i][1] + 6 * s + Math.sin(t * 6 + i * .8) * 1.5 * s;
      c.fillStyle = "rgba(255,243,168," + a + ")"; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); }
    // tapering golden ribbon down the middle of the trail
    c.lineCap = "round"; c.lineJoin = "round";
    for (i = 0; i < n - 1; i++) { var f2 = i / n; c.strokeStyle = "rgba(250,204,21," + (.9 * (1 - f2)) + ")"; c.lineWidth = Math.max(1, 12 * s * (1 - f2) * (1 - f2) + 1.5); c.beginPath(); c.moveTo(x + trail[i][0] - 20 * s, y + trail[i][1] + 6 * s); c.lineTo(x + trail[i + 1][0] - 20 * s, y + trail[i + 1][1] + 6 * s); c.stroke(); }
    // the curl at the very end, like the classic tail
    var e = trail[n - 1]; c.strokeStyle = "rgba(234,179,8,.7)"; c.lineWidth = 2.4 * s; c.beginPath(); c.arc(x + e[0] - 26 * s, y + e[1] + 2 * s, 7 * s, Math.PI * .2, Math.PI * 1.6); c.stroke();
  }
  var L = [[-40, 2, 34], [-6, -14, 38], [30, -8, 34], [58, 8, 30], [-54, 24, 26], [-12, 24, 34], [26, 28, 32], [52, 30, 24]];
  c.save(); c.translate(x, y); c.scale(-k, k); c.lineJoin = "round"; c.lineCap = "round";
  c.strokeStyle = "#c28a00"; c.lineWidth = 7; L.forEach(function (l) { c.beginPath(); c.arc(l[0], l[1], l[2], 0, 7); c.stroke(); });
  c.fillStyle = "#facc15"; L.forEach(function (l) { c.beginPath(); c.arc(l[0], l[1], l[2], 0, 7); c.fill(); });
  c.save(); c.beginPath(); L.forEach(function (l) { c.moveTo(l[0] + l[2], l[1]); c.arc(l[0], l[1], l[2], 0, 7); }); c.clip();
  c.fillStyle = "#fde668"; L.forEach(function (l) { c.beginPath(); c.arc(l[0] - 5, l[1] - 8, l[2] - 3, 0, 7); c.fill(); });
  c.fillStyle = "#fff4a8"; L.forEach(function (l) { c.beginPath(); c.arc(l[0] - 9, l[1] - 13, l[2] * .45, 0, 7); c.fill(); });
  c.strokeStyle = "#d89a00"; c.lineWidth = 4.2; [[-22, -2, 11, .95], [16, -8, 12, .85], [46, 8, 10, .95], [-28, 26, 11, .95], [10, 24, 12, .85]].forEach(function (nk) { c.beginPath(); c.arc(nk[0], nk[1], nk[2], Math.PI * nk[3], Math.PI * (nk[3] + .5)); c.stroke(); });
  c.restore(); c.restore();
}

/** Height of the rooftop line at x (same zigzag the scene draws), so the ninja runs on the roofs */
function _fxRoofAt(x, base) {
  var seg = Math.floor(x / 40), x0 = seg * 40, up = function (i) { return (i % 3 === 1) ? 38 : 18; };
  var y0 = base - up(seg) + 12, yp = base - up(seg) - 10, y1 = base - up(seg + 1) + 12, f = (x - x0) / 40;
  return f < .5 ? y0 + (yp - y0) * (f / .5) : yp + (y1 - yp) * ((f - .5) / .5);
}

/** A ninja silhouette seen from the side: forward lean, flowing headband tails and scarf, swinging arms and a run cycle.
    (x, y) = feet, s = size, ph = run phase, air = 0..1 jump factor, alpha for clones, scarf/band colours, dir = 1 right, -1 left. */
function fxNinja(c, x, y, s, t, ph, air, alpha, scarf, band, dir) {
  var lean = .28 + air * .1, hip = -17 * s - air * 8 * s; scarf = scarf || "#dc2626"; band = band || "#e2e8f0";
  c.save(); c.translate(x, y); if (dir < 0) c.scale(-1, 1); c.globalAlpha = alpha == null ? 1 : alpha; c.lineCap = "round"; c.lineJoin = "round";
  c.shadowColor = band; c.shadowBlur = 7; c.strokeStyle = "#04060b"; c.fillStyle = "#04060b";
  var leg = function (k) { var a = Math.sin(ph + k * Math.PI), kx = Math.sin(a) * 9 * s * (1 - air * .5), ky = Math.max(0, Math.cos(ph + k * Math.PI)) * 6 * s; c.lineWidth = 4.6 * s; c.beginPath(); c.moveTo(0, hip); c.lineTo(kx * .6 + 2 * s, hip + 9 * s - ky * .5 - air * 3 * s); c.lineTo(kx + (air ? 3 : 0) * s, -ky * (1 - air) - air * 4 * s); c.stroke(); };
  leg(0); leg(1);
  c.save(); c.translate(0, hip); c.rotate(lean);
  c.lineWidth = 9 * s; c.beginPath(); c.moveTo(0, 0); c.lineTo(1 * s, -13 * s); c.stroke();
  c.beginPath(); c.arc(2.5 * s, -20 * s, 6.2 * s, 0, 7); c.fill();
  c.lineWidth = 3 * s; [-1, 1].forEach(function (k) { var sw = Math.sin(ph + (k > 0 ? 0 : Math.PI)) * .9; c.beginPath(); c.moveTo(1 * s, -12 * s); c.lineTo(Math.cos(sw) * 8 * s + (k > 0 ? 4 : -2) * s, -12 * s + Math.sin(sw) * 8 * s + 4 * s); c.stroke(); });
  c.strokeStyle = band; c.lineWidth = 2.2 * s; for (var i = 0; i < 2; i++) { c.beginPath(); c.moveTo(-2 * s, (-22 + i * 2) * s); c.bezierCurveTo(-12 * s, (-24 + i * 3) * s + Math.sin(t * 9 + i) * 3 * s, -20 * s, (-22 + i * 5) * s + Math.sin(t * 9 + i * 2) * 5 * s, -30 * s, (-22 + i * 8) * s + Math.sin(t * 8 + i) * 6 * s); c.stroke(); }
  c.strokeStyle = scarf; c.lineWidth = 4 * s; c.beginPath(); c.moveTo(0, -13 * s); c.bezierCurveTo(-12 * s, -12 * s + Math.sin(t * 7) * 4 * s, -24 * s, -8 * s + Math.sin(t * 7 + 1) * 6 * s, -38 * s, -6 * s + Math.sin(t * 6) * 8 * s); c.stroke();
  c.fillStyle = "#e5e7eb"; c.fillRect(0.2 * s, -24.6 * s, 6 * s, 3.2 * s);
  c.restore(); c.restore();
}

function fxKunai(c, x, y, s, rot, trail) {
  c.save(); c.translate(x, y); c.rotate(rot);
  if (trail) { var g = c.createLinearGradient(-trail, 0, 0, 0); g.addColorStop(0, "rgba(226,232,240,0)"); g.addColorStop(1, "rgba(226,232,240,.5)"); c.fillStyle = g; c.fillRect(-trail, -1.6 * s, trail, 3.2 * s); }
  c.fillStyle = "#cbd5e1"; c.strokeStyle = "#0f172a"; c.lineWidth = 1.2 * s; c.beginPath(); c.moveTo(12 * s, 0); c.lineTo(2 * s, -4 * s); c.lineTo(-4 * s, 0); c.lineTo(2 * s, 4 * s); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = "#1e293b"; c.lineWidth = 2.2 * s; c.beginPath(); c.moveTo(-4 * s, 0); c.lineTo(-12 * s, 0); c.stroke(); c.strokeStyle = "#dc2626"; c.lineWidth = 1.6 * s; c.beginPath(); c.arc(-15 * s, 0, 3 * s, 0, 7); c.stroke(); c.restore();
}

/** Cartoon smoke puff (the "poof" of a shadow clone), p = 0..1 life */
function _fxPoof(c, x, y, r, p) {
  var a = Math.sin(Math.min(1, p) * Math.PI), rr = r * (.5 + p);
  [[0, 0, 1], [-.7, .15, .7], [.7, .1, .75], [-.3, -.55, .65], [.4, -.5, .6], [0, .6, .6]].forEach(function (b) { c.fillStyle = "rgba(241,245,249," + (.8 * a) + ")"; c.strokeStyle = "rgba(100,116,139," + (.5 * a) + ")"; c.lineWidth = 2; c.beginPath(); c.arc(x + b[0] * rr, y + b[1] * rr, rr * b[2] * .55, 0, 7); c.fill(); c.stroke(); });
}

FX_SCENES.ninja = function (c, w, h, t, top) {
  top = top || 0; var i, base = h - FX_NAV, cx = w / 2;
  // big pale moon under the app bar
  var mx = w - 70, my = top + 60, mg = c.createRadialGradient(mx, my, 0, mx, my, 150); mg.addColorStop(0, "rgba(226,232,240,.35)"); mg.addColorStop(1, "rgba(226,232,240,0)"); c.fillStyle = mg; c.fillRect(mx - 160, top, 320, 260);
  c.fillStyle = "#f1f5f9"; c.beginPath(); c.arc(mx, my, 34, 0, 7); c.fill(); c.fillStyle = "rgba(148,163,184,.45)"; c.beginPath(); c.arc(mx - 10, my - 6, 8, 0, 7); c.arc(mx + 12, my + 12, 6, 0, 7); c.fill();
  // chakra sphere: a spinning ball of light with spiral arms and orbiting sparks
  var sx0 = w * .2, sy0 = top + 190 + Math.sin(t * 1.3) * 16, sr = 26;
  var sg = c.createRadialGradient(sx0, sy0, 2, sx0, sy0, sr * 2.4); sg.addColorStop(0, "rgba(255,255,255,.9)"); sg.addColorStop(.35, "rgba(147,197,253,.5)"); sg.addColorStop(1, "rgba(59,130,246,0)"); c.fillStyle = sg; c.beginPath(); c.arc(sx0, sy0, sr * 2.4, 0, 7); c.fill();
  c.save(); c.translate(sx0, sy0); c.rotate(t * 7); c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 2.4; for (var arm = 0; arm < 3; arm++) { c.beginPath(); for (var k = 0; k < 22; k++) { var a = k * .24 + arm * 2.094, r = 2 + k * (sr / 22); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); } c.restore();
  for (i = 0; i < 7; i++) { var oa = t * 3 + i * .9, orr = sr * 1.5 + Math.sin(t * 2 + i) * 6; c.fillStyle = "rgba(191,219,254," + (.5 + .4 * Math.sin(t * 5 + i)) + ")"; c.beginPath(); c.arc(sx0 + Math.cos(oa) * orr, sy0 + Math.sin(oa) * orr * .6, 2.2, 0, 7); c.fill(); }
  // leaf vortex and drifting paper tags
  for (i = 0; i < 26; i++) { var la = t * 1.7 + i * .42, lr = 14 + ((i * 7 + t * 12) % 70), lx = w * .8 + Math.cos(la) * lr * 1.4, ly = base - 190 + Math.sin(la) * lr * .7 - ((i * 5) % 40); c.save(); c.translate(lx, ly); c.rotate(la * 2); c.fillStyle = i % 3 ? "rgba(74,222,128,.6)" : "rgba(251,146,60,.6)"; c.beginPath(); c.ellipse(0, 0, 6, 2.6, 0, 0, 7); c.fill(); c.restore(); }
  for (i = 0; i < 5; i++) { var tp = (t * (.05 + _frnd(i) * .03) + _frnd(i + 3)) % 1, tx = w * (.1 + i * .2) + Math.sin(t * 1.4 + i) * 18, ty = top + 20 + tp * (base - top); c.save(); c.translate(tx, ty); c.rotate(Math.sin(t * 2 + i) * .5); c.fillStyle = "#fef3c7"; c.strokeStyle = "#b91c1c"; c.lineWidth = 1.4; c.fillRect(-5, -13, 10, 26); c.strokeRect(-5, -13, 10, 26); c.beginPath(); c.moveTo(-3, -8); c.lineTo(3, -8); c.moveTo(0, -8); c.lineTo(0, 8); c.moveTo(-3, 0); c.lineTo(3, 3); c.stroke(); c.restore(); }
  // summoning circle with an unrolling scroll (cyan), shown for a few seconds every 14 s
  var cyc3 = t % 14; if (cyc3 > 7 && cyc3 < 11.5) { var sp2 = (cyc3 - 7) / 4.5, sa = Math.sin(sp2 * Math.PI), ccx = cx, ccy = base - 78, rr = 78;
    c.save(); c.translate(ccx, ccy); c.scale(1, .3); c.globalAlpha = sa; c.shadowColor = "#67e8f9"; c.shadowBlur = 14; c.strokeStyle = "#67e8f9"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, rr * .72, 0, 7); c.stroke();
    c.rotate(t * .9); c.lineWidth = 2.4; for (i = 0; i < 6; i++) { var ga = i / 6 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(ga) * rr * .72, Math.sin(ga) * rr * .72); c.lineTo(Math.cos(ga + 2.094) * rr * .72, Math.sin(ga + 2.094) * rr * .72); c.stroke(); c.fillStyle = "#e0f2fe"; c.fillRect(Math.cos(ga) * rr * .86 - 3, Math.sin(ga) * rr * .86 - 8, 6, 16); }
    c.restore();
    var sw2 = 150 * Math.min(1, sp2 * 2.2) * (sa > .02 ? 1 : 0); c.globalAlpha = Math.min(1, sa * 2); c.fillStyle = "#fef3c7"; c.strokeStyle = "#7f1d1d"; c.lineWidth = 2; c.fillRect(ccx - sw2 / 2, ccy - 62, sw2, 22); c.strokeRect(ccx - sw2 / 2, ccy - 62, sw2, 22);
    c.fillStyle = "#7f1d1d"; c.beginPath(); c.arc(ccx - sw2 / 2, ccy - 51, 7, 0, 7); c.arc(ccx + sw2 / 2, ccy - 51, 7, 0, 7); c.fill(); c.strokeStyle = "#1c1917"; c.lineWidth = 1.8; for (i = 0; i < 8; i++) { var gx = ccx - sw2 / 2 + 12 + i * (sw2 - 24) / 7; c.beginPath(); c.moveTo(gx - 3, ccy - 56); c.lineTo(gx + 3, ccy - 56); c.moveTo(gx, ccy - 56); c.lineTo(gx, ccy - 46); c.stroke(); } c.globalAlpha = 1; }
  // dark rooftops
  c.fillStyle = "#0a0702"; c.beginPath(); c.moveTo(0, h); for (var x = 0; x <= w + 40; x += 40) { var up = (x / 40) % 3 === 1 ? 38 : 18; c.lineTo(x, base - up + 12); c.lineTo(x + 20, base - up - 10); } c.lineTo(w, h); c.closePath(); c.fill();
  // two ninja: the hero runs right and leaps, a rival in blue runs left; where they cross, their blades clash in a spark burst
  var run = 66, S = 1.7, nx = ((t * run) % (w + 240)) - 120, jp = (t * run / 150) % 1, air = jp > .62 ? Math.sin((jp - .62) / .38 * Math.PI) : 0, ny = _fxRoofAt(nx, base) - air * 60;
  var rx = w + 120 - ((t * 58) % (w + 240)), ry = _fxRoofAt(rx, base);
  fxNinja(c, rx, ry, S * .95, t, -t * 12 + 2, 0, 1, "#3b82f6", "#93c5fd", -1);
  var cyc = t % 9, clones = cyc > 5.5 && cyc < 7.4 ? Math.sin((cyc - 5.5) / 1.9 * Math.PI) : 0, ph = t * 12;
  if (clones > 0) { [[-90], [86]].forEach(function (o, n) { var cxn = nx + o[0], cyn = _fxRoofAt(cxn, base); fxNinja(c, cxn, cyn, S * .95, t, ph + n * 1.4, 0, .85 * clones); if (cyc < 5.9 || cyc > 7.0) _fxPoof(c, cxn, cyn - 22, 26, cyc < 5.9 ? (cyc - 5.5) / .4 : (cyc - 7.0) / .4); }); }
  fxNinja(c, nx, ny, S, t, ph, air, 1);
  var dd = Math.abs(nx - rx); if (dd < 44) { var ci = 1 - dd / 44, ccx2 = (nx + rx) / 2, ccy2 = Math.min(ny, ry) - 34; c.save(); c.translate(ccx2, ccy2); c.strokeStyle = "rgba(255,255,255," + ci + ")"; c.lineWidth = 2.6; c.lineCap = "round"; for (i = 0; i < 10; i++) { var ra = i / 10 * Math.PI * 2 + t * 9, r1 = 6 + (1 - ci) * 6, r2 = r1 + 14 + (i % 2) * 10; c.beginPath(); c.moveTo(Math.cos(ra) * r1, Math.sin(ra) * r1); c.lineTo(Math.cos(ra) * r2, Math.sin(ra) * r2); c.stroke(); }
    c.strokeStyle = "rgba(147,197,253," + ci + ")"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 10 + (1 - ci) * 26, 0, 7); c.stroke(); c.fillStyle = "rgba(255,255,255," + ci + ")"; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill(); c.restore(); }
  // kunai thrown every four seconds
  var kp = ((t - 1.2) % 4) / 1.5; if (kp > 0 && kp < 1) { var kx = nx + 10 + kp * (w - nx + 80), ky = ny - 40 - Math.sin(kp * Math.PI) * 90; fxKunai(c, kx, ky, 1.5, -.12 + kp * .5, 46); }
  // fire-style jutsu: every ten seconds the hero spits a big fireball that streaks right, trailing flames
  var fl = ((t - 4) % 10) / 1.9; if (fl > 0 && fl < 1) {
    var lt = t - fl * 1.9, ox = ((lt * run) % (w + 240)) - 120 + 22, oy = _fxRoofAt(ox, base) - 34 * S, fx = ox + fl * (w + 160 - ox), fy = oy - Math.sin(fl * Math.PI) * 40, fr = 10 + fl * 30;
    for (i = 0; i < 7; i++) { var tl = i / 7, tx2 = fx - tl * fr * 3.2, ty2 = fy + Math.sin(t * 20 + i * 2) * fr * .25 * tl, tr = fr * (1 - tl * .7); var tg = c.createRadialGradient(tx2, ty2, 0, tx2, ty2, tr); tg.addColorStop(0, "rgba(251,146,60," + (.8 * (1 - tl)) + ")"); tg.addColorStop(1, "rgba(220,38,38,0)"); c.fillStyle = tg; c.beginPath(); c.arc(tx2, ty2, tr, 0, 7); c.fill(); }
    var bg = c.createRadialGradient(fx - fr * .2, fy - fr * .2, 0, fx, fy, fr); bg.addColorStop(0, "#fff7ae"); bg.addColorStop(.4, "#fb923c"); bg.addColorStop(1, "rgba(220,38,38,.9)"); c.fillStyle = bg; c.beginPath(); c.arc(fx, fy, fr, 0, 7); c.fill();
    c.strokeStyle = "rgba(255,237,160,.9)"; c.lineWidth = 2.4; for (i = 0; i < 6; i++) { var fa = i / 6 * Math.PI * 2 + t * 6; c.beginPath(); c.moveTo(fx + Math.cos(fa) * fr * .9, fy + Math.sin(fa) * fr * .9); c.lineTo(fx + Math.cos(fa) * fr * 1.35, fy + Math.sin(fa) * fr * 1.35); c.stroke(); } }
};

/** A round white-and-teal dome house with windows, a door and a tiny glowing antenna (x = centre, y = ground, r = radius) */
function fxNamekDome(c, x, y, r, t, seed) {
  var g = c.createLinearGradient(0, y - r * 1.1, 0, y); g.addColorStop(0, "#f0fdfa"); g.addColorStop(.5, "#a7e8dc"); g.addColorStop(1, "#4fb8a6");
  c.fillStyle = "#0b5e55"; c.beginPath(); c.arc(x, y, r + 2.4, Math.PI, 0); c.lineTo(x + r + 2.4, y); c.lineTo(x - r - 2.4, y); c.fill();
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.lineTo(x + r, y); c.lineTo(x - r, y); c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.ellipse(x - r * .35, y - r * .62, r * .22, r * .1, -.5, 0, 7); c.fill();
  c.strokeStyle = "rgba(11,94,85,.45)"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * .55, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  for (var i = 0; i < 3; i++) { var wa = Math.PI * (1.28 + i * .22), wx = x + Math.cos(wa) * r * .74, wy = y + Math.sin(wa) * r * .74, lit = .55 + .45 * Math.max(0, Math.sin(t * 1.6 + seed + i * 1.7)); c.fillStyle = "rgba(16,92,120,.95)"; c.beginPath(); c.ellipse(wx, wy, r * .1, r * .13, 0, 0, 7); c.fill(); c.fillStyle = "rgba(190,242,255," + lit + ")"; c.beginPath(); c.ellipse(wx, wy, r * .06, r * .09, 0, 0, 7); c.fill(); }
  c.fillStyle = "#0e5a6e"; c.beginPath(); c.moveTo(x - r * .16, y); c.lineTo(x - r * .16, y - r * .24); c.arc(x, y - r * .24, r * .16, Math.PI, 0); c.lineTo(x + r * .16, y); c.fill();
  c.strokeStyle = "#0b5e55"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x + r * .1, y - r * .98); c.lineTo(x + r * .1, y - r * 1.3); c.stroke();
  var pl = .5 + .5 * Math.sin(t * 3 + seed), gl = c.createRadialGradient(x + r * .1, y - r * 1.32, 0, x + r * .1, y - r * 1.32, 12 + pl * 8); gl.addColorStop(0, "rgba(255,200,120,.95)"); gl.addColorStop(1, "rgba(255,160,60,0)"); c.fillStyle = gl; c.beginPath(); c.arc(x + r * .1, y - r * 1.32, 12 + pl * 8, 0, 7); c.fill();
}
/** A tall banded tower with a domed head and a ring around it */
function fxNamekTower(c, x, y, hgt, t) {
  var w2 = hgt * .13, g = c.createLinearGradient(x - w2, 0, x + w2, 0); g.addColorStop(0, "#7fd3c4"); g.addColorStop(.45, "#e6fffa"); g.addColorStop(1, "#4fb8a6");
  c.fillStyle = "#0b5e55"; c.fillRect(x - w2 - 2, y - hgt, w2 * 2 + 4, hgt); c.fillStyle = g; c.fillRect(x - w2, y - hgt, w2 * 2, hgt);
  c.strokeStyle = "rgba(11,94,85,.4)"; c.lineWidth = 2; for (var i = 1; i < 6; i++) { c.beginPath(); c.moveTo(x - w2, y - hgt * i / 6); c.lineTo(x + w2, y - hgt * i / 6); c.stroke(); }
  c.fillStyle = "#0b5e55"; c.beginPath(); c.arc(x, y - hgt, w2 * 1.5 + 2, Math.PI, 0); c.fill(); c.fillStyle = "#c7f5ec"; c.beginPath(); c.arc(x, y - hgt, w2 * 1.5, Math.PI, 0); c.fill();
  c.strokeStyle = "#0e7490"; c.lineWidth = 4; c.beginPath(); c.ellipse(x, y - hgt * .72, w2 * 2.4, w2 * .8, 0, 0, 7); c.stroke();
  var pl = .5 + .5 * Math.sin(t * 2.4), gl = c.createRadialGradient(x, y - hgt - w2 * 1.9, 0, x, y - hgt - w2 * 1.9, 18 + pl * 8); gl.addColorStop(0, "rgba(254,240,138,.95)"); gl.addColorStop(1, "rgba(254,240,138,0)"); c.fillStyle = gl; c.beginPath(); c.arc(x, y - hgt - w2 * 1.9, 18 + pl * 8, 0, 7); c.fill();
  c.strokeStyle = "#0b5e55"; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - hgt - w2 * 1.4); c.lineTo(x, y - hgt - w2 * 1.9); c.stroke();
}

FX_SCENES.orbs = function (c, w, h, t, top) {
  top = top || 0; var i, base = h - FX_NAV;
  for (i = 0; i < 3; i++) _fxCloud(c, ((t * (5 + i * 2) + i * 170) % (w + 220)) - 90, top + 20 + i * 150, .9 + i * .12, "rgba(255,255,255,.12)");
  // three small suns in the green sky
  [[.2, .1, 14], [.52, .06, 10], [.8, .13, 18]].forEach(function (u, n) { var sx = w * u[0], sy = top + 30 + u[1] * h * .3 + Math.sin(t * .6 + n) * 3, g = c.createRadialGradient(sx, sy, 0, sx, sy, u[2] * 3); g.addColorStop(0, "rgba(255,255,230,.7)"); g.addColorStop(1, "rgba(255,255,230,0)"); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, u[2] * 3, 0, 7); c.fill(); c.fillStyle = "#fffbe0"; c.beginPath(); c.arc(sx, sy, u[2] * .55, 0, 7); c.fill(); });
  // blue grass hills and the domed houses of a quiet village
  c.fillStyle = "#1d5fb5"; c.beginPath(); c.moveTo(0, h); for (var x = 0; x <= w + 10; x += 10) c.lineTo(x, base - 24 + Math.sin(x / 60) * 8); c.lineTo(w, h); c.closePath(); c.fill();
  c.fillStyle = "#2a78d6"; c.beginPath(); c.moveTo(0, h); for (x = 0; x <= w + 10; x += 10) c.lineTo(x, base - 6 + Math.sin(x / 45 + 1) * 6); c.lineTo(w, h); c.closePath(); c.fill();
  fxNamekTower(c, w * .36, base - 6, 150, t); fxNamekDome(c, w * .16, base - 6, 58, t, 0); fxNamekDome(c, w * .56, base - 6, 40, t, 2); fxNamekDome(c, w * .84, base - 6, 66, t, 4);
  // seven orbs drifting, each with its stars
  for (i = 0; i < 7; i++) { var ph = t * .25 + i * .9, ox = w * (.1 + i * .13) + Math.sin(ph) * 10, oy = top + 70 + (i % 4) * 118 + Math.sin(t * 1.4 + i) * 14; fxOrb(c, ox, oy, 15, i + 1, t + i); }
  // two golden clouds, each dragging a vapour trail along its own path like a jet
  [{ s: 1.05, spd: 75, off: 0, yf: .52 }, { s: .6, spd: 41, off: 210, yf: .3 }].forEach(function (L, n) {
    var pos = function (tau) { var xx = ((tau * L.spd + L.off) % (w + 320)) - 140; return [xx, Math.max(top + 70, h * L.yf) + Math.sin(tau * 1.3 + n) * 12 + Math.sin(tau * 2.2) * 3 * L.s]; };
    var cur = pos(t), trail = []; for (var k = 0; k < 30; k++) { var pp = pos(t - k * .075); if (pp[0] > cur[0] + 4) break; trail.push([pp[0] - cur[0], pp[1] - cur[1]]); }
    _fxGoldCloud(c, cur[0], cur[1], L.s, t, trail);
  });
  for (i = 0; i < 18; i++) { var tw = Math.max(0, Math.sin(t * 2 + i * 1.9)); c.fillStyle = "rgba(255,255,255," + tw * .8 + ")"; c.fillRect(_frnd(i + 1) * w, top + 10 + _frnd(i + 6) * (h * .45), 2.4, 2.4); }
};

/** An aggressive pirate galleon: raked bow with a ram spike and a snarling figurehead, ragged crimson-black sails with a skull, red pennants,
    gun ports that fire (flash, smoke, cannonball) in turn; it pitches hard and throws spray. (x, y) = waterline centre, s = scale, facing right. */
function fxShip(c, x, y, s, t) {
  var rock = Math.sin(t * 2.2) * .07, fire = function (n) { var p = (t * .55 + n * .21) % 1; return p < .12 ? p / .12 : -1; };
  c.save(); c.translate(x, y); c.rotate(rock); c.scale(s, s); c.lineJoin = "round";
  // sails first (behind the hull): two masts, torn hems, a skull on the main sail
  [[-34, -150, 62, 112, 1], [34, -138, 58, 98, 2]].forEach(function (m, n) {
    c.fillStyle = "#1c1917"; c.fillRect(m[0] - 2.5, m[1] - 8, 5, -m[1] + 8);
    var bulge = 12 + Math.sin(t * 2.4 + n) * 4, sg = c.createLinearGradient(0, m[1], 0, m[1] + m[3]); sg.addColorStop(0, "#7f1d1d"); sg.addColorStop(1, "#1c0a0a");
    c.fillStyle = sg; c.strokeStyle = "#0a0505"; c.lineWidth = 2; c.beginPath(); c.moveTo(m[0] - m[2] / 2, m[1]); c.quadraticCurveTo(m[0] + bulge, m[1] + 8, m[0] + m[2] / 2, m[1]); c.lineTo(m[0] + m[2] / 2 + 4, m[1] + m[3]);
    for (var k = 6; k >= 0; k--) c.lineTo(m[0] - m[2] / 2 + (m[2] + 8) * k / 6 - 4 + (k % 2 ? -5 : 5), m[1] + m[3] + (k % 2 ? 11 : -3) + Math.sin(t * 5 + k) * 3);
    c.closePath(); c.fill(); c.stroke();
    if (n === 0) { c.fillStyle = "#f5f5f4"; c.beginPath(); c.arc(m[0] + 3, m[1] + 40, 13, 0, 7); c.fill(); c.fillRect(m[0] - 6, m[1] + 48, 18, 7); c.fillStyle = "#1c0a0a"; c.beginPath(); c.arc(m[0] - 1, m[1] + 39, 3.4, 0, 7); c.arc(m[0] + 7, m[1] + 39, 3.4, 0, 7); c.fill(); c.strokeStyle = "#f5f5f4"; c.lineWidth = 4; c.beginPath(); c.moveTo(m[0] - 18, m[1] + 62); c.lineTo(m[0] + 24, m[1] + 76); c.moveTo(m[0] + 24, m[1] + 62); c.lineTo(m[0] - 18, m[1] + 76); c.stroke(); }
    c.fillStyle = "#dc2626"; c.beginPath(); c.moveTo(m[0] + 2, m[1] - 8); c.lineTo(m[0] + 44 + Math.sin(t * 8 + n) * 5, m[1] - 4 + Math.sin(t * 7) * 3); c.lineTo(m[0] + 38 + Math.sin(t * 8 + n) * 5, m[1] + 3); c.lineTo(m[0] + 2, m[1] + 4); c.closePath(); c.fill();
  });
  // hull: dark, raked, with a ram spike under the bow and a snarling figurehead
  var hg = c.createLinearGradient(0, -8, 0, 44); hg.addColorStop(0, "#292524"); hg.addColorStop(1, "#0c0a09");
  c.fillStyle = hg; c.strokeStyle = "#000"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-104, -12); c.lineTo(-96, 30); c.quadraticCurveTo(-30, 50, 70, 40); c.lineTo(122, 22); c.lineTo(150, 14); c.lineTo(118, 2); c.lineTo(108, -22); c.lineTo(70, -12); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#dc2626"; c.beginPath(); c.moveTo(-100, 4); c.lineTo(112, 4); c.lineTo(116, 12); c.lineTo(-98, 14); c.closePath(); c.fill();
  c.fillStyle = "#facc15"; for (var q = 0; q < 8; q++) c.fillRect(-84 + q * 26, 18, 14, 3);
  c.fillStyle = "#44403c"; c.beginPath(); c.moveTo(-104, -12); c.lineTo(-112, -34); c.lineTo(-82, -12); c.closePath(); c.fill();
  c.fillStyle = "#b91c1c"; c.beginPath(); c.moveTo(108, -22); c.lineTo(132, -34); c.lineTo(150, -26); c.lineTo(142, -14); c.lineTo(122, -10); c.closePath(); c.fill(); c.strokeStyle = "#000"; c.lineWidth = 1.6; c.stroke();
  c.fillStyle = "#fde047"; c.beginPath(); c.arc(137, -24, 3, 0, 7); c.fill(); c.fillStyle = "#fff"; c.beginPath(); c.moveTo(130, -16); c.lineTo(133, -9); c.lineTo(136, -16); c.moveTo(140, -15); c.lineTo(143, -8); c.lineTo(146, -15); c.fill();
  c.fillStyle = "#b91c1c"; c.beginPath(); c.moveTo(118, -30); c.lineTo(122, -50); c.lineTo(128, -32); c.fill();
  // gun ports firing in turn
  for (var n2 = 0; n2 < 4; n2++) {
    var gx = -60 + n2 * 38, f = fire(n2); c.fillStyle = "#000"; c.fillRect(gx - 7, -2, 14, 11);
    c.fillStyle = "#57534e"; c.fillRect(gx + 4 + (f >= 0 ? -3 : 0), 1, 13, 5);
    if (f >= 0) { var g = c.createRadialGradient(gx + 18, 4, 0, gx + 18, 4, 30 * (.5 + f)); g.addColorStop(0, "rgba(255,255,220," + (1 - f) + ")"); g.addColorStop(.4, "rgba(251,146,60," + (.8 * (1 - f)) + ")"); g.addColorStop(1, "rgba(220,38,38,0)"); c.fillStyle = g; c.beginPath(); c.arc(gx + 18, 4, 30 * (.5 + f), 0, 7); c.fill();
      c.fillStyle = "rgba(180,170,165," + (.5 * (1 - f)) + ")"; c.beginPath(); c.arc(gx + 30 + f * 40, 2 - f * 14, 8 + f * 22, 0, 7); c.fill();
      c.fillStyle = "#111"; c.beginPath(); c.arc(gx + 20 + f * 220, 4 - Math.sin(f * Math.PI) * 60, 4, 0, 7); c.fill(); }
  }
  // bow spray
  for (var i = 0; i < 12; i++) { var sp = (t * 1.7 + i * .09) % 1; c.fillStyle = "rgba(240,249,255," + (.7 * (1 - sp)) + ")"; c.beginPath(); c.arc(118 + sp * 40 + Math.sin(i) * 6, 30 - Math.sin(sp * Math.PI) * 38, 2 + (1 - sp) * 3, 0, 7); c.fill(); }
  c.restore();
}

FX_SCENES.pirate = function (c, w, h, t, top) {
  top = top || 0; var i, horizon = h - 270;
  // storm: dark clouds drifting, a lightning flash now and then
  for (i = 0; i < 4; i++) _fxCloud(c, ((t * (9 + i * 3) + i * 150) % (w + 260)) - 120, top + 30 + i * 55, 2.4 + i * .3, "rgba(8,20,48,.55)");
  var lf = (t % 6.5) / .5; if (lf < 1) { c.fillStyle = "rgba(220,235,255," + (Math.sin(lf * Math.PI) * .22) + ")"; c.fillRect(0, 0, w, h); var lx = w * .35 + _frnd(Math.floor(t / 6.5)) * w * .4; c.strokeStyle = "rgba(255,255,255," + Math.sin(lf * Math.PI) + ")"; c.lineWidth = 3; c.beginPath(); c.moveTo(lx, top); for (i = 1; i < 7; i++) c.lineTo(lx + (_frnd(i + 3) - .5) * 70, top + i * ((horizon - top) / 6.5)); c.stroke(); }
  for (i = 0; i < 4; i++) { var gx = ((t * (26 + i * 9) + i * 130) % (w + 80)) - 40, gy = top + 90 + i * 50 + Math.sin(t * 2 + i) * 10; c.strokeStyle = "rgba(240,249,255,.7)"; c.lineWidth = 2.2; c.beginPath(); c.moveTo(gx - 12, gy); c.quadraticCurveTo(gx - 6, gy - 8 - Math.sin(t * 9 + i) * 5, gx, gy); c.quadraticCurveTo(gx + 6, gy - 8 - Math.sin(t * 9 + i) * 5, gx + 12, gy); c.stroke(); }
  var sx = ((t * 62) % (w + 520)) - 260, sy = horizon + 30 + Math.sin(t * 2.2) * 9; fxShip(c, sx, sy, Math.min(1, w / 430) * .9, t);
  [["rgba(15,76,129,.6)", 20, 60, 1.6, 0], ["rgba(14,90,150,.6)", 26, 52, 2.2, 40], ["rgba(8,47,87,.82)", 32, 46, 3.0, 80]].forEach(function (L, n) {
    c.fillStyle = L[0]; c.beginPath(); c.moveTo(0, h); for (var x = 0; x <= w + 10; x += 8) c.lineTo(x, horizon + 52 + n * 38 + Math.sin(x / L[2] + t * L[3] + L[4]) * L[1] * .45); c.lineTo(w, h); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2; c.beginPath(); for (var x2 = 0; x2 <= w + 10; x2 += 8) { var yy = horizon + 52 + n * 38 + Math.sin(x2 / L[2] + t * L[3] + L[4]) * L[1] * .45; if (x2) c.lineTo(x2, yy); else c.moveTo(x2, yy); } c.stroke(); });
  for (i = 0; i < 14; i++) { var tw = Math.max(0, Math.sin(t * 3 + i * 1.3)); c.fillStyle = "rgba(255,255,255," + tw * .6 + ")"; c.fillRect(_frnd(i + 3) * w, horizon + 70 + _frnd(i + 9) * 150, 2.6, 2.6); }
};

FX_SCENES.reaper = function (c, w, h, t, top) {
  top = top || 0; var i, mx = w - 80, my = top + 70, glow = c.createRadialGradient(mx, my, 0, mx, my, 200 + Math.sin(t * 1.3) * 10); glow.addColorStop(0, "rgba(255,255,255,.28)"); glow.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = glow; c.fillRect(0, top, w, 330);
  c.fillStyle = "#fafafa"; c.beginPath(); c.arc(mx, my, 62, 0, 7); c.fill(); c.fillStyle = "#0a0a0f"; c.beginPath(); c.arc(mx - 26, my - 6, 56, 0, 7); c.fill();
  for (i = 0; i < 26; i++) { var p = (t * (.03 + _frnd(i) * .04) + _frnd(i + 7)) % 1, ex = _frnd(i + 2) * w + Math.sin(t + i) * 12, ey = h - FX_NAV - p * (h - FX_NAV); c.fillStyle = "rgba(255," + (180 + (i % 3) * 25) + "," + (120 + (i % 4) * 30) + "," + (.55 * (1 - p)) + ")"; c.beginPath(); c.arc(ex, ey, 1.4 + _frnd(i + 5) * 1.8, 0, 7); c.fill(); }
  for (i = 0; i < 5; i++) { var ph = (t * .12 + i * .21) % 1, bx = -30 + ph * (w + 80), by = top + 90 + i * 110 + Math.sin(t * 1.6 + i * 2) * 36; fxButterfly(c, bx, by, 1.05 - i * .1, t * 7 + i, "#1f1f2b"); c.strokeStyle = "rgba(249,115,22,.25)"; c.lineWidth = 2; c.beginPath(); c.moveTo(bx - 4, by); c.quadraticCurveTo(bx - 40, by + 14, bx - 80, by + 4); c.stroke(); }
  var sl = (t % 6) / .5; if (sl < 1) { var a = sl < .5 ? sl * 2 : (1 - sl) * 2; c.strokeStyle = "rgba(255,255,255," + a * .9 + ")"; c.lineWidth = 3; c.beginPath(); c.moveTo(w * .1, h * .28); c.lineTo(w * .1 + w * .8 * Math.min(1, sl * 2.2), h * .28 + h * .3 * Math.min(1, sl * 2.2)); c.stroke(); }
  c.strokeStyle = "rgba(255,255,255,.1)"; c.lineWidth = 1.2; for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, h - FX_NAV - 6 - i * 6); c.lineTo(w, h - FX_NAV - 6 - i * 6); c.stroke(); }
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
  var hd = document.querySelector(".app-header"), scene = FX_SCENES[_fx.id]; if (scene) scene(c, _fx.w, _fx.h, t, hd ? hd.offsetHeight : 0);
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
