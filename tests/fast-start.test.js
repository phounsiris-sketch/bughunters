/* Run: node tests/fast-start.test.js — the app opens from this phone: cache-first service worker, kept group logos (v218) */
var fs = require("fs"), assert = require("assert");
var sw = fs.readFileSync("sw.js", "utf8"), html = fs.readFileSync("index.html", "utf8"), st = fs.readFileSync("js/storage.js", "utf8"), gr = fs.readFileSync("js/groups.js", "utf8"), rt = fs.readFileSync("js/router.js", "utf8");
assert.ok(/cache\.add\(new Request\(u, \{ cache: 'reload' \}\)\)/.test(sw), "a new version installs fresh files, not the browser's 10 minute copy");
assert.ok(/caches\.match\(key, \{ ignoreSearch/.test(sw) && /if \(cached && own\) \{ e\.waitUntil\(net\.catch/.test(sw), "own files: cache first, updated in the background");
assert.ok(!/fetch\(own \? new Request\(e\.request, \{ cache: 'no-cache' \}\) : e\.request\)\.then\(function\(resp\)/.test(sw), "no more network-first for every file");
assert.ok(/n !== 'godsmash-tiles'/.test(sw), "the map tile cache survives a new version");
assert.ok(/resp\.ok && resp\.status === 200 && e\.request\.url\.indexOf\('oobCode'\) < 0/.test(sw), "only good answers are kept, never the sign-in link");
assert.ok(/rel="preconnect" href="https:\/\/www\.gstatic\.com"/.test(html) && /media="print" onload="this\.media='all'"/.test(html), "Firebase host is warmed up and the font stylesheet no longer blocks the first paint");
["_imgPersistGet", "_imgPersistPut", "imgWarm", "imgPrefetch", "imgKeep"].forEach(function (f) { assert.ok(new RegExp("function " + f + "\\(").test(st), f + " exists"); });
assert.ok(/_imgPersistGet\(id\)\.then\(function \(d\) \{\s*if \(d\) \{ _imgCache\[id\] = d; el\.src = d; return; \}/.test(st), "an image is read from this phone before Firestore");
assert.ok(/warmAtStart/.test(st) && /localStorage\.getItem\("imgKeep"\)/.test(st), "the kept images are read back when the app opens");
assert.ok(/function prefetchGroupLogos\(\)/.test(gr) && (gr.match(/prefetchGroupLogos\(\);/g) || []).length >= 2, "logos of my groups are downloaded after login and when the group changes");
assert.ok(/localStorage\.setItem\("lastGroup"/.test(gr) && /_cachedGroup\(\)/.test(gr) && /removeItem\("lastGroup"\)/.test(rt), "the last group shows in the header at once and is forgotten at sign-out");
console.log("fast start OK");
