/* Run: node tests/restaurants.test.js — the Restaurants master tab renders, edit/delete only for who may */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { console: console, DB_CACHE: { restaurants: [{ id: "r1", name: "Grill House", location: "Sisattanak", lat: 17.9, lng: 102.6, createdBy: "me" }, { id: "r2", name: "Noodle Bar", location: "Chanthabury", createdBy: "other" }] },
  currentUser: { uid: "me" }, t: function (k) { return k; }, escapeHtml: function (x) { return String(x); }, icon: function () { return ""; },
  dbFindById: function (l, id) { return l.filter(function (x) { return x.id === id; })[0]; }, hasPin: function (c) { return typeof c.lat === "number"; },
  can: function () { return false; }, isSuperAdmin: function () { return false; }, imgSrcAttrs: function () { return ""; }, courtMapLink: function () { return ""; },
  distanceKm: function () { return 0; }, lastSessions: [{ dinner: { restaurantId: "r1" } }, { dinner: { restaurantId: "r1" } }] };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/restaurants.js", "utf8"), ctx);
var html = vm.runInContext("_renderRestaurantsTab()", ctx);
assert.ok(html.indexOf("Grill House") >= 0 && html.indexOf("Noodle Bar") >= 0, "both restaurants listed");
assert.ok(html.indexOf("restUsedN") >= 0, "usage count shown");
var rows = html.split('class="settings-item rest-master"').slice(1);
assert.ok(rows[0].indexOf("deleteRestaurant('r1')") >= 0 && rows[0].indexOf("showRestaurantForm(null,'r1'") >= 0, "creator can edit and delete");
assert.ok(rows[1].indexOf("deleteRestaurant") < 0 && rows[1].indexOf("showRestaurantForm(null,'r2'") < 0, "others cannot edit or delete (not creator, no admin)");
ctx.can = function () { return true; };
var html2 = vm.runInContext("_renderRestaurantsTab()", ctx), rows2 = html2.split('class="settings-item rest-master"').slice(1);
assert.ok(rows2[1].indexOf("showRestaurantForm(null,'r2'") >= 0 && rows2[1].indexOf("deleteRestaurant") < 0, "config admin can edit, but delete stays creator/super (rules)");
console.log("restaurants OK");
