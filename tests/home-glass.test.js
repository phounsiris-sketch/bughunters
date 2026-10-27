/* Run: node tests/home-glass.test.js — Home shortcuts and create are seven glass tiles with one short word each */
var fs = require("fs"), assert = require("assert");
var home = fs.readFileSync("js/home.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(home.indexOf('class="hg-tile"') > 0 && home.indexOf('class="hg-grid four\' + g3') > 0, "glass grid markup");
assert.strictEqual((home.match(/tile\("[a-z]+", \d, /g) || []).length, 7, "seven tiles: find court, friends, market, poll, game, score, live");
assert.ok(home.indexOf("_homeShortcut") < 0 && home.indexOf("_homeCreateTile") < 0, "the old card helpers are gone");
["homeShortCourt", "homeShortFriends", "homeShortScore", "homeShortLive"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
assert.ok(/\.hg-tile \{[^}]*backdrop-filter/.test(css) && /--glass-bg/.test(css), "glass tile style and tokens");
console.log("home-glass OK");

// the swipe cards slide on by themselves, 3 s each
var vm = require("vm"), sctx = {}; vm.createContext(sctx);
vm.runInContext(home.match(/function _homeNextSlide\([\s\S]*?\n}\n/)[0], sctx);
var st = sctx._homeNextSlide([0, 266, 532]); assert.deepStrictEqual(JSON.stringify(st), JSON.stringify({ from: 0, to: 1, delta: 266 }), "card 1 is showing, go to card 2");
st = sctx._homeNextSlide([-270, 4, 270]); assert.strictEqual(st.from, 1); assert.strictEqual(st.to, 2); assert.strictEqual(st.delta, 270, "a card that is a few px off its snap point still counts as the showing one");
st = sctx._homeNextSlide([-532, -266, 0]); assert.strictEqual(st.to, 0, "after the last card it goes back to the first");
st = sctx._homeNextSlide([-800, -534, -268, -2, 264, 530], true); assert.strictEqual(st.to, 0, "scrolled to the very end: back to the first card, even if the last card never reaches the snap point");
assert.strictEqual(sctx._homeNextSlide([0]), null, "a single card does not slide");
assert.ok(/setInterval\(function \(\) \{[\s\S]*?\}, 3000\)/.test(home) && home.indexOf("_homeSlideStart();") > 0, "3 second timer started on every render");
assert.ok(home.indexOf("prefers-reduced-motion") > 0 && home.indexOf('"touchstart"') > 0, "reduced motion and touch pause are handled");
console.log("home-slide OK");
