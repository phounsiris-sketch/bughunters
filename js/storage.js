/* ============================================================
   storage.js — Image handling for QR codes and receipts.
   Images are resized in the browser and stored as data URLs in
   Firestore, so no Firebase Storage bucket (paid plan) is needed.
   ============================================================ */

/**
 * Resize an image file and return it as a JPEG/PNG data URL.
 * @param {File}     file     — image file from an <input type="file">
 * @param {number}   maxSize  — longest side in pixels
 * @param {function} callback — callback(error, dataUrl)
 */
function resizeImageToDataUrl(file, maxSize, callback) {
  if (!file || !/^image\//.test(file.type)) {
    callback(new Error("Please choose an image file"));
    return;
  }

  var reader = new FileReader();
  reader.onerror = function () { callback(new Error("Could not read the image")); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { callback(new Error("Could not open the image")); };
    img.onload = function () {
      var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // JPEG keeps photos small; Firestore documents are limited to 1 MB
      callback(null, canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/** QR codes need to stay sharp enough to scan */
function readQrImage(file, callback) {
  resizeImageToDataUrl(file, 600, callback);
}

/** Receipts only need to be readable */
function readReceiptImage(file, callback) {
  resizeImageToDataUrl(file, 1000, callback);
}

/** Profile photo: centre-cropped square, 256 px */
function readAvatarImage(file, callback) {
  if (!file || !/^image\//.test(file.type)) { callback(new Error("Please choose an image file")); return; }
  var reader = new FileReader();
  reader.onerror = function () { callback(new Error("Could not read the image")); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { callback(new Error("Could not open the image")); };
    img.onload = function () {
      var side = Math.min(img.width, img.height);
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      callback(null, canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- Big images live in their own documents (images/{id}) ----------
   A session keeps only a reference "img:<id>", so listing sessions never
   downloads every receipt. Old data URLs keep working. Images load when an
   <img data-img="<id>"> appears on screen (see the observer below). */
var IMG_BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
var _imgCache = {};

/* v218: images also live on this phone (IndexedDB), so a group logo or a photo shows at once on the next start and offline, without a
   Firestore read. An image id never changes its picture (a new upload is a new id), so the copy never goes stale. */
var IMG_KEEP_MAX = 200;
var _imgDbP = null;
function _imgIdb() {
  if (_imgDbP) return _imgDbP;
  _imgDbP = new Promise(function (resolve) {
    try {
      var rq = indexedDB.open("godsmash-img", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("i", { keyPath: "id" }); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
  return _imgDbP;
}
function _imgPersistGet(id) {
  return _imgIdb().then(function (db) {
    if (!db) return null;
    return new Promise(function (resolve) {
      try { var rq = db.transaction("i").objectStore("i").get(id); rq.onsuccess = function () { resolve(rq.result ? rq.result.data : null); }; rq.onerror = function () { resolve(null); }; }
      catch (e) { resolve(null); }
    });
  });
}
function _imgPersistPut(id, data) {
  if (typeof data !== "string" || data.length > 1100000) return;
  _imgIdb().then(function (db) {
    if (!db) return;
    try {
      var st = db.transaction("i", "readwrite").objectStore("i");
      st.put({ id: id, data: data, at: Date.now() });
      st.count().onsuccess = function (ev) {
        if (ev.target.result <= IMG_KEEP_MAX) return;
        var all = []; st.openCursor().onsuccess = function (e2) {
          var c = e2.target.result;
          if (c) { all.push({ id: c.key, at: c.value.at }); c.continue(); return; }
          all.sort(function (a, b) { return a.at - b.at; }).slice(0, all.length - IMG_KEEP_MAX).forEach(function (o) { st.delete(o.id); });
        };
      };
    } catch (e) {}
  });
}
/** Put these image ids (from IndexedDB) into the memory cache before the pages are drawn */
function imgWarm(ids) {
  return Promise.all((ids || []).map(function (id) {
    id = jsq(id);
    if (!id || _imgCache[id]) return null;
    return _imgPersistGet(id).then(function (d) { if (d) _imgCache[id] = d; });
  }));
}
/** Download an image reference ("img:<id>") now if this phone does not have it yet (group logos, my photo) */
function imgPrefetch(ref) {
  if (!isImgRef(ref)) return Promise.resolve();
  var id = jsq(ref.slice(4));
  if (!id || _imgCache[id]) return Promise.resolve();
  return _imgPersistGet(id).then(function (d) {
    if (d) { _imgCache[id] = d; return; }
    if (typeof fsdb === "undefined") return;
    return fsdb.collection("images").doc(id).get().then(function (doc) {
      if (doc.exists) { _imgCache[id] = doc.data().data; _imgPersistPut(id, _imgCache[id]); }
    });
  }).catch(function () {});
}
/** The images to keep warm for the next start: remembered here, read back at once when the app opens */
function imgKeep(refs) {
  var ids = (refs || []).filter(isImgRef).map(function (r) { return jsq(r.slice(4)); }).filter(Boolean).slice(0, 24);
  try { localStorage.setItem("imgKeep", JSON.stringify(ids)); } catch (e) {}
  return Promise.all(refs.map(imgPrefetch));
}
(function warmAtStart() {
  var ids = [];
  try { ids = JSON.parse(localStorage.getItem("imgKeep") || "[]"); } catch (e) {}
  if (Array.isArray(ids) && ids.length) imgWarm(ids.filter(function (x) { return typeof x === "string"; }));
})();

function isImgRef(v) { return typeof v === "string" && v.indexOf("img:") === 0; }

/** Save a data URL as images/{id}; resolves with the reference "img:<id>" */
function dbSaveImage(dataUrl, kind) {
  var ref = fsdb.collection("images").doc();
  return ref.set({ data: dataUrl, kind: kind || "image", createdBy: currentUser.uid, createdAt: Date.now() })
    .then(function () { _imgCache[ref.id] = dataUrl; _imgPersistPut(ref.id, dataUrl); return "img:" + ref.id; });
}

/** src="…" for a data URL, or a placeholder that loads the referenced image */
function imgSrcAttrs(v) {
  if (!v) return 'src="' + IMG_BLANK + '"';
  v = safeUrl(v);
  if (!v) return 'src="' + IMG_BLANK + '"';
  if (!isImgRef(v)) return 'src="' + escapeHtml(v) + '"';
  var id = jsq(v.slice(4));
  return _imgCache[id] ? 'src="' + _imgCache[id] + '" decoding="async"' : 'src="' + IMG_BLANK + '" decoding="async" data-img="' + id + '"';
}

function _loadImg(el) {
  var id = el.getAttribute("data-img");
  el.removeAttribute("data-img");
  if (_imgCache[id]) { el.src = _imgCache[id]; return; }
  el.classList.add("img-loading");
  // this phone first (fast, works offline), then Firestore
  _imgPersistGet(id).then(function (d) {
    if (d) { _imgCache[id] = d; el.src = d; return; }
    return fsdb.collection("images").doc(id).get().then(function (doc) {
      if (doc.exists) { _imgCache[id] = doc.data().data; el.src = _imgCache[id]; _imgPersistPut(id, _imgCache[id]); }
    });
  }).catch(function () {}).then(function () { el.classList.remove("img-loading"); });
}

(function watchImages() {
  if (typeof MutationObserver === "undefined") return;
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      for (var k = 0; k < m.addedNodes.length; k++) {
        var n = m.addedNodes[k];
        if (!n || n.nodeType !== 1) continue;
        if (n.matches && n.matches("img[data-img]")) _loadImg(n);
        var els = n.querySelectorAll ? n.querySelectorAll("img[data-img]") : [];
        for (var i = 0; i < els.length; i++) _loadImg(els[i]);
      }
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  // images already on the page before the observer started
  var first = document.querySelectorAll("img[data-img]");
  for (var j = 0; j < first.length; j++) _loadImg(first[j]);
})();
