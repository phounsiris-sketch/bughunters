/* ============================================================
   splash.js — opening scene (a serious, cinematic one, one design in the colours of the chosen theme, under 1 second)
   The logo never moves. A huge armoured gauntlet (Mars, never shown in full)
   swings in from the top corner, its shadow sweeping the stone floor, and
   drives a shuttlecock into the middle of the logo. Time slows for an instant,
   a white-hot flash, a shock ring, debris and dust, the camera shakes. Fractures
   spread across the floor, the floor breaks into shards that tip towards the
   camera and fall away over a glow (red, or blue: it switches every launch).
   One canvas, one clock. Every frame is a pure function of time, so the scene
   can be paused and inspected: window.spSeek(ms).  window.spStop() ends it.
   ============================================================ */
(function () {
  var splash = document.getElementById("splash"), cv = document.getElementById("sp3fx"), logo = document.getElementById("sp3logo");
  if (!splash || !cv || !logo) return;

  /* One scene, coloured by the theme the person picked (v188). hot = the glow, hot2 = the flash, stone = the floor, deep = the dark edges.
     Same ids as the dark styles, light styles and special themes in js/app.js. */
  var PALS = {
    navy:     { hot: [20, 184, 166], hot2: [187, 247, 208], stone: [8, 18, 32], deep: [3, 8, 16] },
    violet:   { hot: [124, 77, 255], hot2: [214, 200, 255], stone: [17, 14, 26], deep: [8, 6, 14] },
    court:    { hot: [59, 130, 246], hot2: [186, 222, 255], stone: [10, 18, 32], deep: [4, 8, 16] },
    clean:    { hot: [59, 116, 217], hot2: [196, 225, 255], stone: [20, 20, 20], deep: [8, 8, 8] },
    midnight: { hot: [91, 77, 255], hot2: [200, 196, 255], stone: [12, 14, 28], deep: [5, 6, 14] },
    mint:     { hot: [13, 148, 136], hot2: [187, 247, 208], stone: [10, 24, 28], deep: [4, 12, 14] },
    lilac:    { hot: [109, 74, 255], hot2: [221, 214, 254], stone: [18, 14, 30], deep: [8, 6, 16] },
    sky:      { hot: [29, 95, 209], hot2: [186, 222, 255], stone: [10, 18, 34], deep: [4, 8, 18] },
    paper:    { hot: [47, 111, 214], hot2: [200, 225, 255], stone: [22, 22, 24], deep: [10, 10, 12] },
    sunrise:  { hot: [234, 88, 12], hot2: [254, 215, 170], stone: [30, 16, 10], deep: [14, 7, 4] },
    halloween: { hot: [251, 146, 60], hot2: [253, 224, 171], stone: [18, 10, 46], deep: [8, 4, 24] },
    christmas: { hot: [220, 38, 38], hot2: [253, 230, 138], stone: [7, 32, 15], deep: [3, 16, 8] },
    cny:      { hot: [220, 38, 38], hot2: [252, 211, 77], stone: [42, 6, 6], deep: [22, 3, 3] },
    arcade:   { hot: [232, 121, 249], hot2: [103, 232, 249], stone: [16, 6, 36], deep: [8, 3, 20] },
    ninja:    { hot: [251, 146, 60], hot2: [186, 215, 255], stone: [10, 16, 51], deep: [5, 8, 28] },
    orbs:     { hot: [251, 191, 36], hot2: [190, 242, 255], stone: [10, 59, 63], deep: [4, 28, 32] },
    pirate:   { hot: [220, 38, 38], hot2: [253, 224, 120], stone: [7, 22, 52], deep: [3, 10, 28] },
    reaper:   { hot: [251, 146, 60], hot2: [245, 245, 245], stone: [12, 12, 18], deep: [4, 4, 8] },
    kitty:    { hot: [244, 114, 182], hot2: [252, 231, 243], stone: [74, 24, 51], deep: [34, 10, 24] },
    doraemon: { hot: [253, 224, 71], hot2: [191, 219, 254], stone: [11, 74, 158], deep: [6, 34, 84] },
    valentine: { hot: [251, 113, 133], hot2: [254, 205, 211], stone: [74, 15, 32], deep: [34, 6, 14] },
    jujutsu:  { hot: [167, 139, 250], hot2: [125, 211, 252], stone: [15, 11, 34], deep: [5, 4, 12] }
  };
  function pickPal() {
    var g = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var light = g("theme") === "light", sp = g("special");
    if (!light && sp && PALS[sp]) return PALS[sp];
    return PALS[light ? g("paletteLight") : g("palette")] || (light ? PALS.mint : PALS.navy);
  }
  var P = pickPal();
  splash.style.background = "rgb(" + P.deep.join(",") + ")";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var q = (location.search || "").match(/[?&]seed=(\d+)/);
  var seed = q ? +q[1] : (Math.random() * 1e9) | 0;
  function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { return x * x * (3 - 2 * x); }

  /* timeline, real milliseconds */
  var T_LOOM = 260, T_SWING = 640, T_CONTACT = 900, T_IMPACT = 1000, SLOW_MS = 150, SLOW_K = 0.4;   // a soft hit-stop (v120: the hard 0.16 stop looked like a stutter)
  var T_BREAK = 1650, T_HOLD = 2300;
  var SPEED = 3.3;   // the scene is played this much faster than its timeline (v188): the hit lands at 0.3 s and the floor breaks at 0.5 s, so the whole thing is under 1 s on screen

  var ctx = cv.getContext("2d");
  var W = 0, H = 0, DPR = 1, C = { x: 0, y: 0 }, floor = null, vign = null;
  var rays = [], shards = [], branches = [], debris = [], puffs = [], embers = [];
  var arm = { px: 0, py: 0, L: 0, s: 1, thC: 0 }, K = { x: 0, y: 0 };

  function size() {
    W = splash.clientWidth || window.innerWidth; H = splash.clientHeight || window.innerHeight;
    // sharp on phones, but a tablet must not push 4 million pixels per frame: keep the canvas under ~1.6 megapixels
    DPR = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1.6e6 / (W * H)));
    if (DPR < 1) DPR = 1;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    var r = logo.getBoundingClientRect(), s = splash.getBoundingClientRect();
    C.x = r.left - s.left + r.width / 2; C.y = r.top - s.top + r.height / 2;
  }

  /* ---------- the stone floor (made once) ---------- */
  function makeFloor() {
    var c = document.createElement("canvas"); c.width = Math.round(W); c.height = Math.round(H);
    var g = c.getContext("2d");
    g.fillStyle = rgba(P.stone, 1); g.fillRect(0, 0, W, H);
    for (var i = 0; i < 46; i++) {                                    // slow mottling
      var x = rr(0, W), y = rr(0, H), r = rr(70, 280), light = rnd() > .5;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, light ? "rgba(255,255,255," + rr(.025, .06) + ")" : "rgba(0,0,0," + rr(.12, .3) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineWidth = 1;                                                    // slab joints
    for (var k = 0; k < 9; k++) {
      var a = rr(0, Math.PI), x0 = rr(0, W), y0 = rr(0, H), len = rr(220, 700);
      g.strokeStyle = "rgba(0,0,0," + rr(.25, .5) + ")"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.035)"; g.beginPath(); g.moveTo(x0 + 1, y0 + 1); g.lineTo(x0 + 1 + Math.cos(a) * len, y0 + 1 + Math.sin(a) * len); g.stroke();
    }
    var id = g.getImageData(0, 0, c.width, c.height), d = id.data;     // grain
    for (var p = 0; p < d.length; p += 4) { var n = (rnd() - .5) * 34; d[p] += n; d[p + 1] += n; d[p + 2] += n; }
    g.putImageData(id, 0, 0);
    return c;
  }
  function makeVignette() {
    var c = document.createElement("canvas"); c.width = Math.round(W); c.height = Math.round(H);
    var g = c.getContext("2d"), r = Math.hypot(W, H) * .62;
    var gr = g.createRadialGradient(C.x, C.y, r * .28, C.x, C.y, r);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.82)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return c;
  }

  /* ---------- fractures and shards (new every launch) ---------- */
  function build() {
    var R = Math.hypot(W, H) * 1.4, N = 7, i, j, base = [];
    var off = rr(0, 360);
    for (i = 0; i < N; i++) base.push(off + 360 * i / N + rr(-10, 10));
    rays = base.map(function (deg) {
      var a = deg * Math.PI / 180, r = 0, pts = [{ x: C.x, y: C.y }], steps = [34, 58, 52, 80, 100, 140, 220, 400, R], pr = 0;
      steps.forEach(function (s, k) {
        r += s * (W / 390); if (k === steps.length - 1) r = R;
        var jit = r < R ? rr(-.15, .15) * (r < 400 ? 1 : .4) : 0, aa = a + jit;
        pts.push({ x: C.x + r * Math.cos(aa), y: C.y + r * Math.sin(aa) });
      });
      return { a: a, pts: pts, len: plen(pts) };
    });
    shards = [];
    for (i = 0; i < N; i++) {
      var A = rays[i], B = rays[(i + 1) % N], a0 = A.a, a1 = B.a + (i === N - 1 ? Math.PI * 2 : 0);
      var arc = [1, 2, 3].map(function (k) { var aa = a0 + (a1 - a0) * k / 4; return { x: C.x + R * Math.cos(aa), y: C.y + R * Math.sin(aa) }; });
      var poly = A.pts.concat(arc, B.pts.slice().reverse());
      var mid = (a0 + a1) / 2, cx = C.x + Math.cos(mid) * Math.hypot(W, H) * .32, cy = C.y + Math.sin(mid) * Math.hypot(W, H) * .32;
      shards.push({ poly: poly, dx: Math.cos(mid), dy: Math.sin(mid), cx: cx, cy: cy, rot: (rnd() > .5 ? 1 : -1) * rr(.06, .2), t0: T_BREAK + i * 38 + rr(0, 30), dist: rr(380, 620) });
    }
    branches = [];
    rays.forEach(function (r) {
      [2, 3, 4, 5].forEach(function (j) {
        if (rnd() < .35) return;
        var p = r.pts[j], n = r.pts[j + 1], ang = Math.atan2(n.y - p.y, n.x - p.x) + (rnd() > .5 ? 1 : -1) * rr(.45, 1.0), L = rr(50, 150) * (W / 390);
        var m = { x: p.x + Math.cos(ang) * L * .5 + rr(-8, 8), y: p.y + Math.sin(ang) * L * .5 + rr(-8, 8) }, e = { x: p.x + Math.cos(ang) * L, y: p.y + Math.sin(ang) * L };
        var pts = [p, m, e]; branches.push({ pts: pts, len: plen(pts), t: rr(0, 220) });
      });
    });
    debris = [];
    for (i = 0; i < 74; i++) {
      var an = rr(0, Math.PI * 2), sp = rr(.25, 1.5) * (W / 390), big = rnd() < .25;
      debris.push({ x: C.x + rr(-14, 14), y: C.y + rr(-10, 10), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - rr(.1, .5), s: big ? rr(10, 20) : rr(3, 9), spin: rr(-.012, .012), a0: rr(0, 6.3), life: rr(700, 1250), sh: Math.floor(rr(38, 78)), tri: [rr(-1, 0), rr(-1, 1), rr(0, 1), rr(-.4, .8), rr(-.6, .2), rr(.2, 1)] });
    }
    puffs = [];
    for (i = 0; i < 16; i++) { var pa = rr(0, 6.3); puffs.push({ x: C.x + Math.cos(pa) * rr(0, 60), y: C.y + Math.sin(pa) * rr(0, 40), r: rr(50, 130) * (W / 390), vx: Math.cos(pa) * rr(.03, .1), vy: Math.sin(pa) * rr(.03, .08) - .02, life: rr(700, 1100) }); }
    embers = [];
    for (i = 0; i < 34; i++) embers.push({ x: rr(0, W), y: rr(0, H * 1.2), v: rr(.012, .05), ph: rr(0, 6.3), sw: rr(6, 22), s: rr(.8, 2.4), late: rnd() < .55 });
    // gauntlet geometry
    arm.s = W / 390;
    K.x = C.x + 70 * arm.s; K.y = C.y - 190 * arm.s;
    arm.px = -70 * arm.s; arm.py = -90 * arm.s;
    arm.L = Math.hypot(K.x - arm.px, K.y - arm.py);
    arm.thC = Math.atan2(K.y - arm.py, K.x - arm.px);
  }
  function plen(pts) { var l = 0; for (var i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; }

  /* ---------- time: slow for an instant at the hit ---------- */
  function simTime(real) {
    if (real <= T_IMPACT) return real;
    var e = real - T_IMPACT;
    if (e <= SLOW_MS) return T_IMPACT + e * SLOW_K;
    return T_IMPACT + SLOW_MS * SLOW_K + (e - SLOW_MS);
  }

  /* ---------- the gauntlet ---------- */
  function theta(t) {
    var th0 = arm.thC - 1.95;
    if (t < T_SWING) return th0;
    if (t < T_CONTACT) { var u = (t - T_SWING) / (T_CONTACT - T_SWING); return th0 + (arm.thC - th0) * u * u * u; }
    if (t < T_IMPACT + 100) { var v = (t - T_CONTACT) / (T_IMPACT + 100 - T_CONTACT); return arm.thC + .34 * (1 - (1 - v) * (1 - v)); }
    var w = clamp((t - T_IMPACT - 100) / 380, 0, 1); return arm.thC + .34 - 1.9 * ease(w);
  }
  function armAlpha(t) { return t < T_SWING - 40 ? 0 : t > 1500 ? clamp(1 - (t - 1500) / 120, 0, 1) : 1; }

  function plate(g, pts, fill) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath();
    g.fillStyle = fill; g.fill();
  }
  function drawArm(g, t, alpha, blur) {
    var th = theta(t), s = arm.s, L = arm.L;
    g.save(); g.globalAlpha = alpha; g.translate(arm.px, arm.py); g.rotate(th);
    var dark = g.createLinearGradient(0, -90 * s, 0, 90 * s);
    dark.addColorStop(0, "#1b1b26"); dark.addColorStop(.35, "#0a0a11"); dark.addColorStop(1, "#030307");
    var d0 = 40 * s, w0 = 86 * s, w1 = 62 * s, dw = L - 250 * s;
    // forearm: three overlapping plates
    for (var k = 0; k < 3; k++) {
      var a = d0 + (dw - d0) * k / 3, b = d0 + (dw - d0) * (k + 1) / 3 + 14 * s;
      var ha = w0 + (w1 - w0) * k / 3, hb = w0 + (w1 - w0) * (k + 1) / 3;
      plate(g, [[a, -ha], [b, -hb], [b + 8 * s, 0], [b, hb], [a, ha], [a - 10 * s, 0]], dark);
    }
    plate(g, [[dw, -w1 - 6 * s], [dw + 28 * s, -w1 + 6 * s], [dw + 28 * s, w1 - 6 * s], [dw, w1 + 6 * s]], dark);          // wrist guard
    plate(g, [[dw + 28 * s, -58 * s], [L - 130 * s, -70 * s], [L - 118 * s, 66 * s], [dw + 28 * s, 56 * s]], dark);          // back of the hand
    for (var f = 0; f < 4; f++) plate(g, [[L - 190 * s, (-46 + f * 25) * s], [L - 100 * s, (-46 + f * 25) * s], [L - 94 * s, (-26 + f * 25) * s], [L - 190 * s, (-24 + f * 25) * s]], dark); // fingers
    plate(g, [[L - 205 * s, -62 * s], [L - 140 * s, -66 * s], [L - 140 * s, -48 * s], [L - 205 * s, -46 * s]], dark);        // thumb
    g.lineCap = "round";
    g.strokeStyle = "#06060b"; g.lineWidth = 15 * s; g.beginPath(); g.moveTo(L - 175 * s, 0); g.lineTo(L - 40 * s, 0); g.stroke();   // handle
    g.lineWidth = 4 * s; g.beginPath(); g.moveTo(L - 60 * s, -4 * s); g.lineTo(L - 110 * s * 0.0 - 20 * s, -40 * s); g.moveTo(L - 60 * s, 4 * s); g.lineTo(L - 20 * s, 40 * s); g.stroke();
    g.beginPath(); g.ellipse(L + 38 * s, 0, 120 * s, 84 * s, 0, 0, Math.PI * 2); g.lineWidth = 17 * s; g.strokeStyle = "#07070d"; g.stroke();   // frame
    g.lineWidth = 1.2 * s; g.strokeStyle = "rgba(255,255,255,.10)";                                                            // strings
    for (var i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(L + 38 * s - 110 * s, i * 16 * s); g.lineTo(L + 38 * s + 110 * s, i * 16 * s); g.stroke(); }
    for (var j = -6; j <= 6; j++) { g.beginPath(); g.moveTo(L + 38 * s + j * 17 * s, -76 * s); g.lineTo(L + 38 * s + j * 17 * s, 76 * s); g.stroke(); }
    if (!blur) {                                                                                                               // rim light, on the edge facing the glow
      g.globalCompositeOperation = "lighter";
      var rim = g.createLinearGradient(0, -90 * s, 0, 40 * s);
      rim.addColorStop(0, rgba(P.hot2, .95)); rim.addColorStop(.5, rgba(P.hot, .35)); rim.addColorStop(1, rgba(P.hot, 0));
      g.strokeStyle = rim; g.lineWidth = 2.4 * s;
      g.beginPath(); g.moveTo(d0, -w0); g.lineTo(dw, -w1); g.lineTo(dw + 28 * s, -58 * s); g.lineTo(L - 130 * s, -70 * s); g.stroke();
      g.beginPath(); g.ellipse(L + 38 * s, 0, 120 * s, 84 * s, 0, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = 3 * s; g.stroke();
      g.strokeStyle = rgba(P.hot, .5); g.lineWidth = 1.6 * s;
      for (var f2 = 0; f2 < 4; f2++) { g.beginPath(); g.moveTo(L - 190 * s, (-46 + f2 * 25) * s); g.lineTo(L - 100 * s, (-46 + f2 * 25) * s); g.stroke(); }
    }
    g.restore();
  }
  function drawShadow(g, t) {
    var a;
    if (t < T_SWING) a = ease(clamp((t - T_LOOM) / (T_SWING - T_LOOM), 0, 1)) * .55; else a = .55 * (1 - clamp((t - 1150) / 350, 0, 1));
    if (a <= 0.01) return;
    var th = t < T_SWING ? arm.thC - 1.95 : theta(t), s = arm.s;
    var cx = arm.px + Math.cos(th) * arm.L * .62 + 40 * s, cy = arm.py + Math.sin(th) * arm.L * .62 + 70 * s;
    g.save(); g.translate(cx, cy); g.rotate(th);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, 330 * s); gr.addColorStop(0, "rgba(0,0,0," + a + ")"); gr.addColorStop(.6, "rgba(0,0,0," + a * .7 + ")"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.scale(1, .5); g.fillStyle = gr; g.fillRect(-340 * s, -340 * s, 680 * s, 680 * s); g.restore();
  }

  /* ---------- the frame ---------- */
  function strokePrefix(g, pts, f) {
    var total = plen(pts) * clamp(f, 0, 1), acc = 0;
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + seg >= total) { var u = (total - acc) / seg; g.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u); return; }
      g.lineTo(pts[i].x, pts[i].y); acc += seg;
    }
  }
  function polyPath(g, poly) { g.beginPath(); g.moveTo(poly[0].x, poly[0].y); for (var i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y); g.closePath(); }

  function draw(real) {
    var st = simTime(real), tau = st - T_IMPACT;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(P.deep, 1); ctx.fillRect(0, 0, W, H);
    // camera shake
    var amp = tau > 0 ? 15 * Math.exp(-tau / 150) * (W / 390) : (st > 300 && st < T_SWING ? 1.2 * ease((st - 300) / 340) : 0);
    ctx.save(); ctx.translate(Math.sin(st * .083) * amp, Math.cos(st * .107) * amp * .8);
    // light from below, rising through the cracks
    var g1 = clamp((st - T_IMPACT) / 700, 0, 1) * .5 + clamp((st - T_BREAK) / 650, 0, 1) * .5;
    if (g1 > 0) {
      var pulse = st > T_HOLD ? .06 * Math.sin(st * .004) : 0, R = Math.max(W, H) * .95;
      var gl = ctx.createRadialGradient(C.x, C.y, 0, C.x, C.y, R);
      gl.addColorStop(0, rgba(P.hot2, clamp((g1 + pulse) * .95, 0, 1))); gl.addColorStop(.22, rgba(P.hot, clamp((g1 + pulse) * .75, 0, 1))); gl.addColorStop(.7, rgba(P.hot, g1 * .12)); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.fillRect(-60, -60, W + 120, H + 120);
    }
    // floor, then shards
    if (st < T_BREAK) ctx.drawImage(floor, 0, 0, W, H);
    else {
      shards.forEach(function (sh) {
        var u = clamp((st - sh.t0) / 620, 0, 1), e = u * u, a = 1 - Math.pow(u, 1.7);
        if (a <= 0.005) return;
        ctx.save();
        ctx.translate(sh.cx + sh.dx * sh.dist * e, sh.cy + sh.dy * sh.dist * e + 300 * e * e);
        ctx.rotate(sh.rot * e * 5); ctx.scale(1 + .38 * e, 1 + .38 * e); ctx.translate(-sh.cx, -sh.cy);
        ctx.globalAlpha = a; polyPath(ctx, sh.poly); ctx.save(); ctx.clip(); ctx.drawImage(floor, 0, 0, W, H);
        ctx.fillStyle = "rgba(0,0,0," + (.5 * e) + ")"; ctx.fillRect(-W, -H, W * 3, H * 3); ctx.restore();
        polyPath(ctx, sh.poly); ctx.strokeStyle = rgba(P.hot2, .75 * (1 - e)); ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
      });
    }
    ctx.globalAlpha = 1;
    drawShadow(ctx, st);
    // fractures
    var cr = (st - T_IMPACT - 30) / 520;
    if (cr > 0) {
      var fade = st > T_BREAK + 500 ? clamp(1 - (st - T_BREAK - 500) / 500, .25, 1) : 1;
      var all = rays.map(function (r, i) { return { pts: r.pts, f: cr - i * .04 }; }).concat(branches.map(function (b) { return { pts: b.pts, f: (st - T_IMPACT - 160 - b.t) / 380 }; }));
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      all.forEach(function (c) { if (c.f <= 0) return; strokePrefix(ctx, c.pts, c.f); ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.lineWidth = 7; ctx.stroke(); });
      ctx.globalCompositeOperation = "lighter";
      all.forEach(function (c) { if (c.f <= 0) return; strokePrefix(ctx, c.pts, c.f); ctx.strokeStyle = rgba(P.hot, .3 * fade); ctx.lineWidth = 9; ctx.stroke(); strokePrefix(ctx, c.pts, c.f); ctx.strokeStyle = rgba(P.hot, .85 * fade); ctx.lineWidth = 2.6; ctx.stroke(); strokePrefix(ctx, c.pts, c.f); ctx.strokeStyle = rgba(P.hot2, .95 * fade); ctx.lineWidth = 1.1; ctx.stroke(); });
      ctx.globalCompositeOperation = "source-over";
    }
    // dust
    if (tau > 0) puffs.forEach(function (p) {
      var u = tau / p.life; if (u >= 1) return;
      var r = p.r * (.4 + .9 * Math.sqrt(u)), x = p.x + p.vx * tau, y = p.y + p.vy * tau, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(" + (P.stone[0] + 60) + "," + (P.stone[1] + 52) + "," + (P.stone[2] + 52) + "," + (.3 * (1 - u)) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    // god's gauntlet, with motion blur on the swing
    var aa = armAlpha(st);
    if (aa > 0) {
      if (st > T_SWING - 20 && st < T_IMPACT + 260) for (var k = 3; k >= 1; k--) drawArm(ctx, st - k * 22, aa * .26 * (1 - k / 4), true);
      drawArm(ctx, st, aa, false);
    }
    // the shuttle
    if (st >= T_CONTACT && st < T_IMPACT) {
      var s = (st - T_CONTACT) / (T_IMPACT - T_CONTACT), sp = Math.pow(s, 1.5), x = K.x + (C.x - K.x) * sp, y = K.y + (C.y - K.y) * sp, ang = Math.atan2(C.y - K.y, C.x - K.x);
      ctx.globalCompositeOperation = "lighter";
      var tr = ctx.createLinearGradient(K.x, K.y, x, y); tr.addColorStop(0, "rgba(255,255,255,0)"); tr.addColorStop(1, rgba(P.hot2, .95));
      ctx.strokeStyle = tr; ctx.lineWidth = 5 * arm.s; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(K.x, K.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang - Math.PI / 2); var z = arm.s * 1.5;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-5 * z, 2 * z); ctx.lineTo(-11 * z, -22 * z); ctx.quadraticCurveTo(0, -27 * z, 11 * z, -22 * z); ctx.lineTo(5 * z, 2 * z); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 4 * z, 5.4 * z, 0, 6.3); ctx.fillStyle = "#f4c04a"; ctx.fill(); ctx.restore();
    }
    // debris
    if (tau > 0) debris.forEach(function (d) {
      if (tau > d.life) return;
      var x = d.x + d.vx * tau, y = d.y + d.vy * tau + .0011 * tau * tau, u = tau / d.life, a = d.a0 + d.spin * tau;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = 1 - u * u;
      ctx.beginPath(); ctx.moveTo(d.tri[0] * d.s, d.tri[1] * d.s); ctx.lineTo(d.tri[2] * d.s, d.tri[3] * d.s); ctx.lineTo(d.tri[4] * d.s, d.tri[5] * d.s); ctx.closePath();
      ctx.fillStyle = "rgb(" + d.sh + "," + (d.sh - 6) + "," + (d.sh - 4) + ")"; ctx.fill();
      if (tau < 420) { ctx.strokeStyle = rgba(P.hot2, .9 * (1 - tau / 420)); ctx.lineWidth = 1.4; ctx.stroke(); }
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    // embers: always a little alive, many more once the floor is open
    ctx.globalCompositeOperation = "lighter";
    var open = clamp((st - T_IMPACT) / 900, 0, 1);
    embers.forEach(function (e) {
      if (e.late && open <= 0) return;
      var y = ((e.y - st * e.v * (1 + open * 2)) % (H * 1.2) + H * 1.2) % (H * 1.2) - H * .1, x = e.x + Math.sin(st * .0012 + e.ph) * e.sw;
      var fl = .55 + .45 * Math.sin(st * .006 + e.ph * 3), a = (e.late ? open : .35) * fl;
      ctx.fillStyle = rgba(P.hot2, a * .9); ctx.beginPath(); ctx.arc(x, y, e.s, 0, 6.3); ctx.fill();
      ctx.fillStyle = rgba(P.hot, a * .22); ctx.beginPath(); ctx.arc(x, y, e.s * 4, 0, 6.3); ctx.fill();
    });
    // impact: flash, shock ring with split colours
    if (tau > -10) {
      var fa = tau < 0 ? 0 : Math.exp(-tau / 95), R2 = Math.max(W, H) * .9;
      if (fa > .01) { var fg = ctx.createRadialGradient(C.x, C.y, 0, C.x, C.y, R2 * .55); fg.addColorStop(0, "rgba(255,255,255," + fa + ")"); fg.addColorStop(.18, rgba(P.hot2, fa * .8)); fg.addColorStop(1, rgba(P.hot, 0)); ctx.fillStyle = fg; ctx.fillRect(-60, -60, W + 120, H + 120); }
      if (tau > 0 && tau < 900) {
        var rad = 26 + tau * .5 * (W / 390), ra = Math.exp(-tau / 330), lw = 7 * (1 - tau / 900) + 1;
        [[-3, 0, "rgba(255,60,60,"], [0, 0, "rgba(255,255,255,"], [3, 0, "rgba(60,180,255,"]].forEach(function (o) { ctx.strokeStyle = o[2] + (.55 * ra) + ")"; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(C.x + o[0], C.y + o[1], rad, 0, 6.3); ctx.stroke(); });
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    ctx.drawImage(vign, 0, 0, W, H);
  }

  /* ---------- run ---------- */
  var raf = 0, t0 = 0, stopped = false;
  function frame(now) {
    if (stopped) return;
    if (!t0) t0 = now;
    draw((now - t0) * SPEED);
    if (splash.classList.contains("hide") && now - t0 > 400) { setTimeout(function () { stopped = true; }, 700); }
    raf = requestAnimationFrame(frame);
  }
  function init() {
    size(); floor = makeFloor(); vign = makeVignette(); build();
    if (reduce) { draw(T_HOLD + 400); return; }              // one still frame, nothing moves
    raf = requestAnimationFrame(frame);
  }
  window.spSeek = function (ms) { stopped = true; cancelAnimationFrame(raf); draw(ms); };
  window.spStop = function () { stopped = true; cancelAnimationFrame(raf); };
  window.addEventListener("resize", function () { if (stopped) return; size(); floor = makeFloor(); vign = makeVignette(); build(); });
  // the logo image must have its place before we measure it
  if (logo.complete || !logo.addEventListener) init(); else { var done = false; var go = function () { if (!done) { done = true; init(); } }; logo.addEventListener("load", go); logo.addEventListener("error", go); setTimeout(go, 400); }
})();
