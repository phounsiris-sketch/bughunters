/* Run: node tests/market-sort.test.js — the gear market can be sorted by price and by name (v222) */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var src = fs.readFileSync("js/social.js", "utf8");
var a = src.indexOf("var marketFilter ="), b = src.indexOf("function _renderMarket()");
var ctx = { _market: [], publicCity: function () { return "all"; }, isBlockedPair: function () { return false; }, normCity: function (c) { return c; }, parseMoney: function (v) { return Number(String(v).replace(/\D/g, "")) || 0; }, currentLang: "en" };
vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);
var mk = function (name, price) { return { name: name, salePrice: price, saleScope: "public", sold: false, uid: "u", kind: "racket" }; };
ctx._market = [mk("Yonex", 900), mk("Apacs", 0), mk("Victor", 300), mk("Li-Ning", 1500), mk("Babolat", 0)];
var names = function () { return ctx._marketItems().map(function (g) { return g.name; }).join(","); };
assert.strictEqual(names(), "Yonex,Apacs,Victor,Li-Ning,Babolat", "default: as listed");
ctx.marketFilter.sort = "priceAsc"; assert.strictEqual(names(), "Victor,Yonex,Li-Ning,Apacs,Babolat", "low to high, no price last (then A-Z)");
ctx.marketFilter.sort = "priceDesc"; assert.strictEqual(names(), "Li-Ning,Yonex,Victor,Apacs,Babolat", "high to low, no price last");
ctx.marketFilter.sort = "az"; assert.strictEqual(names(), "Apacs,Babolat,Li-Ning,Victor,Yonex", "A-Z");
ctx.marketFilter.sort = "priceAsc"; ctx.marketFilter.min = "500"; assert.strictEqual(names(), "Yonex,Li-Ning", "filters and sort work together");
assert.ok(/clearMarketFilter\(\) \{ marketFilter = \{ q: "", kind: "", min: "", max: "", sort: "" \}/.test(src), "clear resets the sort");
var i18n = fs.readFileSync("js/i18n.js", "utf8");
["marketSort", "marketSortNew", "marketSortLow", "marketSortHigh", "marketSortAz"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN and LA"); });
console.log("market sort OK");
