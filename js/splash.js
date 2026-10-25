/* ============================================================
   splash.js: the opening scene (v210), a minimal one.
   Everything that moves is plain CSS (css/styles.css, "Splash screen"): a soft glow, the badminton court drawn as thin lines,
   the logo easing in with a line drawn round it, the name opening up. This file only picks the colours of the chosen theme.
   ============================================================ */
(function () {
  var splash = document.getElementById("splash");
  if (!splash) return;

  /* Colours of the theme the person picked. hot = the glow, hot2 = the lines, deep = the background (stone is unused now, kept for the shape).
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
    cny:      { hot: [220, 38, 38], hot2: [252, 211, 77], stone: [42, 6, 6], deep: [22, 3, 3] },
    orbs:     { hot: [251, 191, 36], hot2: [190, 242, 255], stone: [10, 59, 63], deep: [4, 28, 32] },
    pirate:   { hot: [220, 38, 38], hot2: [253, 224, 120], stone: [7, 22, 52], deep: [3, 10, 28] },
    reaper:   { hot: [251, 146, 60], hot2: [245, 245, 245], stone: [12, 12, 18], deep: [4, 4, 8] },
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
  splash.style.setProperty("--deep", P.deep.join(","));
  splash.style.setProperty("--hot", P.hot.join(","));
  splash.style.setProperty("--hot2", P.hot2.join(","));

  /* The scene plays fully (v214): it starts on the first painted frame, and the splash leaves only when every finite animation has ended,
     however fast the app is ready (js/router.js hideSplash waits for window.spDone). A tap still skips it. */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finished = false;
  function done() {
    if (finished) return; finished = true; window.spDone = true;
    try { if (typeof hideSplash === "function" && typeof _splashReady !== "undefined" && _splashReady) hideSplash(); } catch (e) {}
  }
  window.spDone = false;
  if (reduce || !splash.getAnimations) { splash.classList.add("go"); done(); return; }
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      splash.classList.add("go");
      var list = splash.getAnimations({ subtree: true }).filter(function (a) { var tm = a.effect && a.effect.getComputedTiming(); return tm && tm.iterations !== Infinity; });
      Promise.all(list.map(function (a) { return a.finished; })).then(function () { setTimeout(done, 120); }, done);
    });
  });
  setTimeout(done, 5000);   // never wait longer than this
})();
