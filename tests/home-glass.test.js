/* Run: node tests/home-glass.test.js — Home shortcuts and create are seven glass tiles with one short word each */
var fs = require("fs"), assert = require("assert");
var home = fs.readFileSync("js/home.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(home.indexOf('class="hg-tile"') > 0 && home.indexOf('class="hg-grid four"') > 0, "glass grid markup");
assert.strictEqual((home.match(/tile\("[a-z]+", \d, /g) || []).length, 7, "seven tiles: find court, friends, market, poll, game, score, live");
assert.ok(home.indexOf("_homeShortcut") < 0 && home.indexOf("_homeCreateTile") < 0, "the old card helpers are gone");
["homeShortCourt", "homeShortFriends", "homeShortScore", "homeShortLive"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
assert.ok(/\.hg-tile \{[^}]*backdrop-filter/.test(css) && /--glass-bg/.test(css), "glass tile style and tokens");
console.log("home-glass OK");
