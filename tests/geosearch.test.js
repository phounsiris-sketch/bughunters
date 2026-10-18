/* Run: node tests/geosearch.test.js — geoSearch: nearest first, Photon then Nominatim fallback */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var calls = [];
var ctx = { console: console, t: function (k) { return k; }, escapeHtml: String, icon: function () { return ""; }, Promise: Promise,
  fetch: function (url) {
    calls.push(url);
    if (url.indexOf("photon") >= 0 && url.indexOf("bbox") >= 0) return Promise.resolve({ ok: true, json: function () { return { features: [
      { geometry: { coordinates: [102.70, 17.98] }, properties: { name: "Far Grill", city: "Vientiane" } },
      { geometry: { coordinates: [102.631, 17.976] }, properties: { name: "Near Grill", street: "Rue 1", city: "Vientiane" } },
      { geometry: { coordinates: [102.6, 17.9] }, properties: {} }] }; } });
    if (url.indexOf("photon") >= 0) return Promise.resolve({ ok: true, json: function () { return { features: [] }; } });
    return Promise.resolve({ json: function () { return [{ name: "Fallback Cafe", display_name: "Fallback Cafe, Vientiane, Laos", lat: "17.97", lon: "102.63" }]; } });
  } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/maps.js", "utf8"), ctx);
vm.runInContext("globalThis.geoSearch = geoSearch", ctx);
(async function () {
  var near = { lat: 17.975, lng: 102.63 };
  var r = await ctx.geoSearch("grill", near);
  assert.strictEqual(r.length, 2, "nameless result dropped");
  assert.strictEqual(r[0].name, "Near Grill", "nearest first");
  assert.ok(typeof r[0].km === "number" && r[0].km < r[1].km);
  assert.ok(calls[0].indexOf("bbox=") >= 0, "asked around me first");
  calls.length = 0;
  var f = await ctx.geoSearch("cafe", null);
  assert.strictEqual(f[0].name, "Fallback Cafe", "falls back to Nominatim when Photon is empty");
  console.log("geosearch OK");
})().catch(function (e) { console.error(e); process.exit(1); });
