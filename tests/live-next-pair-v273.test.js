/* Run: node tests/live-next-pair-v273.test.js — v273: (A) the Dashboard glyph is a tile grid, not a house, in every style and the active nav glyph is dark on the bubble;
   (B) Live score inner units are Game / ເກມ; (C) "Continue · new pair" (suggestion rules, only normal sessions, no native dialogs); (D) the serve shuttle is never themed.
   No version number is hard-coded here. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var src = function (f) { return fs.readFileSync("js/" + f + ".js", "utf8"); };

/* ---- A: icons ---- */
function loadIcons(theme, pack) {
  var ctx = { localStorage: { getItem: function (k) { return k === "iconTheme" ? theme : k === "dashPack" ? pack : null; }, setItem: function () {}, removeItem: function () {} } };
  vm.createContext(ctx);
  ["icons.js", "icons-sets.js", "icons-solar-bold.js"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f, "utf8"), ctx); });
  return ctx;
}
var ic = loadIcons("box", "clay");
var HOUSE = /M219\.31,108\.68|M224,120v96|M216,120v96|M2\.5192 7\.82274/;   // the three house paths (Phosphor line / fill / duo, Solar bold)
["SOLAR", "SOLAR_BOLD"].forEach(function (n) { assert.ok(!HOUSE.test(vm.runInContext(n, ic).dashboard), n + ".dashboard is not a house"); });
["line", "duo", "fill"].forEach(function (k) { var d = vm.runInContext("ICON_SETS", ic)[k].dashboard; assert.ok(!HOUSE.test(d) && (d.match(/<rect/g) || []).length >= 4, "Phosphor " + k + " dashboard is 4 tiles"); });
assert.ok((vm.runInContext("SOLAR_BOLD", ic).dashboard.match(/Z/gi) || []).length >= 4, "bold dashboard has 4 tile shapes");
["box", "neu", "glass", "classic", "tiles", "clay", "sticker", "3d"].forEach(function (th) {
  var out = ic.iconAs(th, "dashboard", 24);
  assert.ok(out && !HOUSE.test(out), th + ": dashboard is not the house");
});
assert.deepStrictEqual(Object.keys(vm.runInContext("MENU_NAME", ic)), [], "the nav no longer renames dashboard to chart");
["clay", "sticker"].forEach(function (p) { assert.ok(!HOUSE.test(loadIcons("box", p).menuIcon("dashboard", 24)), p + " bar dashboard is the grid"); });
var css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(/\.nav-item\.active \.nav-icon\.nav-rich \.ico-gl \.si \{[^}]*color: var\(--gd\) !important/.test(css), "glass glyph in the active bubble is the dark tone");
assert.ok(/\.nav-item\.active \.nav-icon\.nav-rich \.ico-neu \.si \{[^}]*var\(--nav-ico\)/.test(css), "neu glyph in the active bubble is --nav-ico");
// every --gd tone holds >= 4.5:1 on the near-white bubble (#f8fafc)
function lum(h) { var c = [1, 3, 5].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
var gds = css.match(/--gd: #[0-9a-f]{6}/g); assert.ok(gds.length >= 8);
gds.forEach(function (g) { var h = g.slice(6), r = (lum("#f8fafc") + 0.05) / (lum(h) + 0.05); assert.ok(r >= 4.5, h + " on the bubble: " + r.toFixed(2)); });

/* ---- B: Game wording in Live score ---- */
var ictx = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } }; ictx.window = ictx; vm.createContext(ictx);
vm.runInContext(src("i18n") + "\n;this.__tr = translations;", ictx);
var en = ictx.__tr.en, la = ictx.__tr.la;
assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(la).sort(), "EN and LA keys match");
var want = { lsGameN: ["Game {n}", "ເກມທີ {n}"], lsGamePoint: ["GAME POINT", "ແຕ້ມຕັດສິນເກມ"], lsGameShort: ["G{n}", "ເກມ {n}"], lsBestOf: ["Best of {n}", "ໃຜຊະນະໃນ {n} ເກມ"],
  lsTabBo3: ["Best of 3", "ໃຜຊະນະ 3 ເກມ"], lsSingleGame: ["Single game", "ເກມດຽວ"], lsSaveNext: ["Save and next game", "ບັນທຶກ ແລະ ເກມຕໍ່ໄປ"], lsGamesWon: ["Games won: {n}", "ຊະນະແລ້ວ: {n} ເກມ"] };
Object.keys(want).forEach(function (k) { assert.strictEqual(en[k], want[k][0], "EN " + k); assert.strictEqual(la[k], want[k][1], "LA " + k); });
["lsGameN", "lsGamePoint", "lsGameResult", "lsGamesWon", "lsSingleGame", "lsSaveNext", "lsCurrentGame", "lsNoMore", "lsWaitNext", "lsEnded"].forEach(function (k) {
  assert.ok(!/match/i.test(en[k]) && !/ແມັດ/.test(la[k]), k + " has no Match word");
});
["lsMatchScore", "lsMatchWins", "lsMatchDraw", "lsConfirmMatch"].forEach(function (k) { assert.ok(/match/i.test(en[k]) && /ແມັດ/.test(la[k]), k + " (the whole match) keeps Match"); });
assert.strictEqual(en.matches, "Matches"); assert.strictEqual(la.matches, "ແມັດ");   // other screens untouched

/* ---- C: continue with a new pair ---- */
var ls = src("livescore");
["lsNewPair", "lsNewPairTitle", "lsNewPairHint"].forEach(function (k) { assert.ok(en[k] && la[k], k + " in EN and LA"); });
assert.ok(/[^\x00-\x7F]/.test(la.lsNewPair) && en.lsNewPair.indexOf("new pair") > 0);
assert.ok(!/\b(window\.)?(confirm|alert|prompt)\(/.test(ls.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "").replace(/\b(ask|_ls|ls)[A-Za-z]*Confirm\(/g, "")), "no native dialog in livescore.js");
assert.ok(/function _lsNewPairBtn\(decided\) \{\s*if \(!live \|\| live\.test \|\| live\.tour\) return '';/.test(ls), "no button in practice or tournament");
assert.ok(/\(live\.bo \|\| 1\) > 1 && !decided\) return '';/.test(ls), "no button inside a running series");
assert.ok(/next === "pair" && !live\.tour/.test(ls), "tournament games keep the tourFromLive path (it returns before)");
assert.ok(ls.indexOf("tourFromLive(tour, a, b, la, lb, win)") < ls.indexOf('next === "pair"'), "tournament branch runs first");
var m = ls.match(/function lsSuggestPair[\s\S]*?\n\}\n/)[0], sv = {}; vm.createContext(sv); vm.runInContext(m, sv);
var P8 = ["a", "b", "c", "d", "e", "f", "g", "h"], g = function (A, B) { return { a: A, b: B }; };
var sug = function () { return JSON.parse(JSON.stringify(sv.lsSuggestPair.apply(null, arguments))); };   // plain arrays: vm arrays are another realm
var s1 = sug(P8, [g(["a", "b"], ["c", "d"])], "md");
assert.deepStrictEqual(s1.a.concat(s1.b).sort(), ["e", "f", "g", "h"], "players who sat out play next");
var s2 = sug(P8, [g(["a", "b"], ["c", "d"]), g(["e", "f"], ["g", "h"])], "md");
assert.deepStrictEqual(s2.a.concat(s2.b).sort(), ["a", "b", "c", "d"], "after everyone played once, the one who played longest ago goes first");
var P4 = ["a", "b", "c", "d"], h4 = [g(["a", "b"], ["c", "d"])], s3 = sug(P4, h4, "md");
assert.strictEqual(s3.a.concat(s3.b).length, 4);
var same = function (x, y) { return x.slice().sort().join() === y.slice().sort().join(); };
assert.ok(!(same(s3.a, ["a", "b"]) || same(s3.a, ["c", "d"])), "4 players: the same pairs are not repeated");
var h4b = h4.concat([g(["a", "c"], ["b", "d"])]), s4 = sug(P4, h4b, "md");
assert.ok(same(s4.a, ["a", "d"]) || same(s4.b, ["a", "d"]), "4 players: the remaining new split (a+d vs b+c) is chosen");
var s5 = sug(["a", "b", "c"], [g(["a"], ["b"])], "singles");
assert.ok(s5.a.length === 1 && s5.b.length === 1 && s5.a.concat(s5.b).indexOf("c") >= 0, "singles: the one who sat out plays");
assert.strictEqual(sv.lsSuggestPair(["a", "b", "c"], [], "md"), null, "too few players: no suggestion");
assert.deepStrictEqual(sug(P4, [], "md"), { a: ["a", "b"], b: ["c", "d"] }, "no history: list order");
assert.ok(/live\.np && live\.a\.length/.test(ls) && /delete live\.np/.test(ls), "setup hint shows for a suggestion, start clears it");

/* ---- D: the serve shuttle ---- */
var sg = vm.runInContext("SOLAR", ic).shuttle;
["box", "neu", "glass", "classic", "tiles", "clay", "sticker", "3d"].forEach(function (th) {
  ["clay", "sticker", "3d"].forEach(function (pk) {
    var c2 = loadIcons(th, pk), out = c2.serveShuttleHtml(64, "ls-serve-big");
    assert.ok(out.indexOf(sg) > 0 && /^<svg class="si ls-serve-big"/.test(out) && !/ico-|<span|#g3d|clay|ph/.test(out.replace(sg, "")), "serve shuttle plain in " + th + "/" + pk);
  });
});
assert.ok(!/icon\("shuttle"/.test(ls), "livescore.js draws the shuttle only through serveShuttleHtml");
assert.ok((ls.match(/serveShuttleHtml\(/g) || []).length >= 3, "head, big serve and rules use it");
console.log("live-next-pair-v273 ok");
