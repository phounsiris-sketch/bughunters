/* ============================================================
   courtsmap.js — Public page › Courts: a real map (Leaflet + OpenStreetMap)
   with a pin for every court, "you are here", nearest first, directions,
   and adding / pinning a court by tapping the map. Courts are added or
   pinned from this page; the form opens with the pin already set.
   ============================================================ */

var _cm = { kind: "court", map: null, markers: {}, me: null, draft: null, sel: null, mode: null, view: null, q: "", res: [], timer: null, abort: null };

function _cmPinIcon(sel) {
  var L = window.L;
  return L.divIcon({
    className: "cm-pin-wrap",
    html: '<div class="cm-pin' + (sel ? ' sel' : '') + (_cmRest() ? ' rest' : '') + '"><svg viewBox="0 0 24 30" width="' + (sel ? 38 : 30) + '" height="' + (sel ? 46 : 37) + '"><path d="M12 0C5.4 0 0 5.3 0 11.8 0 20.5 12 30 12 30s12-9.500 12-18.200C24 5.300 18.600 0 12 0z" fill="currentColor"/><circle cx="12" cy="11.800" r="4.500" fill="#fff"/></svg></div>',
    iconSize: sel ? [38, 46] : [30, 37], iconAnchor: sel ? [19, 46] : [15, 37]
  });
}

function _cmRest() { return _cm.kind === "rest"; }
function _cmAll() { return _cmRest() ? restaurantList() : (DB_CACHE.allCourts || []); }
function _cmCourts() { return _cmAll().filter(hasPin); }
function _cmFind(id) { return dbFindById(_cmAll(), id); }
/** Switching between the courts map and the restaurants map starts clean */
function _cmKind(k) {
  if (_cm.kind === k) return;
  _cm.kind = k; _cm.sel = null; _cm.mode = null; _cm.draft = null; _cm.view = null; _cm.q = ""; _cm.res = [];
}

function cmInit() {
  var el = document.getElementById("cmMap");
  if (!el) return;
  loadLeaflet().then(function (L) {
    el = document.getElementById("cmMap");
    if (!el) return;
    if (_cm.map) { try { _cm.map.stop(); _cm.map.off(); _cm.map.remove(); } catch (e) {} }
    _cm.markers = {}; _cm.me = null; _cm.draft = null;
    el.innerHTML = "";
    var map = _cm.map = L.map(el, { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: "bottomright", zoomInTitle: t("zoomIn"), zoomOutTitle: t("zoomOut") }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
    var courts = _cmCourts();
    courts.forEach(function (c) {
      var m = L.marker([c.lat, c.lng], { icon: _cmPinIcon(_cm.sel === c.id), title: c.name }).addTo(map);
      m.on("click", function (e) { if (e.originalEvent) L.DomEvent.stopPropagation(e); cmSelect(c.id, false); });
      _cm.markers[c.id] = m;
    });
    _cmDrawMe();
    if (_cm.view) map.setView(_cm.view.c, _cm.view.z, { animate: false });
    else {
      var pts = [];
      if (_here) pts.push([_here.lat, _here.lng]);
      courts.slice().sort(function (a, b) { return _here ? distanceKm(_here, a) - distanceKm(_here, b) : 0; })
        .slice(0, _here ? 3 : 20).forEach(function (c) { pts.push([c.lat, c.lng]); });
      if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
      else if (pts.length) map.setView(pts[0], 14);
      else map.setView([MAP_DEFAULT.lat, MAP_DEFAULT.lng], 12);
    }
    map.on("moveend", function () { var c = map.getCenter(); _cm.view = { c: [c.lat, c.lng], z: map.getZoom() }; });
    map.on("click", function (e) { if (_cm.mode) _cmDrop(e.latlng.lat, e.latlng.lng); else if (_cm.sel) cmSelect(null); });
    setTimeout(function () { if (_cm.map === map) map.invalidateSize(); }, 250);
    cmBar();
  }).catch(function (e) {
    var b = document.getElementById("cmMap");
    if (b) b.innerHTML = '<div class="map-hint">' + escapeHtml(e.message || t("mapOffline")) + '</div>';
  });
}

function _cmDrawMe() {
  if (!_cm.map || !_here || !window.L) return;
  if (_cm.me) _cm.map.removeLayer(_cm.me);
  _cm.me = window.L.marker([_here.lat, _here.lng], { interactive: false, zIndexOffset: -100,
    icon: window.L.divIcon({ className: "cm-me-wrap", html: '<div class="cm-me"><i></i></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(_cm.map);
}

function cmLocate() {
  if (!navigator.geolocation) { showToast(t("noGps")); return; }
  showToast(t("findingYou"));
  navigator.geolocation.getCurrentPosition(function (pos) {
    _here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    _cmDrawMe();
    if (_cm.map) _cm.map.flyTo([_here.lat, _here.lng], Math.max(_cm.map.getZoom(), 14), { duration: .8 });
    var list = document.getElementById("cmList"); if (list) list.innerHTML = _cmListHtml();
  }, function () { showToast(t("noGps")); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

function cmSelect(id, pan) {
  _cm.sel = id;
  Object.keys(_cm.markers).forEach(function (k) { _cm.markers[k].setIcon(_cmPinIcon(k === id)); _cm.markers[k].setZIndexOffset(k === id ? 500 : 0); });
  if (id && pan !== false && _cm.markers[id] && _cm.map) _cm.map.flyTo(_cm.markers[id].getLatLng(), Math.max(_cm.map.getZoom(), 15), { duration: .6 });
  cmBar();
  if (pan !== false && id) { var w = document.getElementById("cmMap"); if (w && w.scrollIntoView) w.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

function cmStartAdd() { _cmClearDraft(); _cm.mode = { add: true }; _cm.sel = null; cmSelect(null); }
function cmStartPin(id) { _cmClearDraft(); _cm.mode = { pin: id }; cmSelect(null); var w = document.getElementById("cmMap"); if (w && w.scrollIntoView) w.scrollIntoView({ behavior: "smooth", block: "center" }); }
function cmCancel() { _cmClearDraft(); _cm.mode = null; _cm.res = []; _cmResDraw(); cmBar(); }

function _cmClearDraft() { if (_cm.draft && _cm.draft.marker && _cm.map) _cm.map.removeLayer(_cm.draft.marker); _cm.draft = null; }

function _cmDrop(lat, lng) {
  lat = Math.round(lat * 1e6) / 1e6; lng = Math.round(lng * 1e6) / 1e6;
  if (_cm.draft && _cm.draft.marker) { _cm.draft.marker.setLatLng([lat, lng]); _cm.draft.lat = lat; _cm.draft.lng = lng; }
  else {
    var mk = window.L.marker([lat, lng], { icon: _cmPinIcon(true), draggable: true }).addTo(_cm.map);
    mk.on("dragend", function () { var ll = mk.getLatLng(); _cm.draft.lat = Math.round(ll.lat * 1e6) / 1e6; _cm.draft.lng = Math.round(ll.lng * 1e6) / 1e6; });
    _cm.draft = { lat: lat, lng: lng, marker: mk };
  }
  cmBar();
}

function cmConfirm() {
  if (!_cm.draft) return;
  var pin = { lat: _cm.draft.lat, lng: _cm.draft.lng }, id = _cm.mode && _cm.mode.pin ? _cm.mode.pin : null;
  var fill = { name: _cm.draft.name || "", location: _cm.draft.addr || "" };
  _cmClearDraft(); _cm.mode = null; _cm.q = ""; _cm.res = [];
  var done = function () { if (currentPage === "public") renderPublic(); };
  if (_cmRest()) showRestaurantForm(fill.name, id, done, pin, fill.location);
  else showCourtModal(id, done, { directoryOnly: true, pin: pin, fill: fill });
  cmBar();
}

function cmBar() {
  var el = document.getElementById("cmBar");
  if (!el) return;
  var h = "";
  if (_cm.mode) {
    var c = _cm.mode.pin ? _cmFind(_cm.mode.pin) : null;
    h = '<div class="cm-card cm-mode"><div class="cm-t">' + icon("pin", 16) + ' <span>' + (c ? '<b>' + escapeHtml(c.name) + '</b> · ' : '') + t(_cm.draft ? "cmDropped" : "cmTapToDrop") + '</span></div>' +
      '<div class="cm-btns">' + (_cm.draft ? '<button class="btn-primary cm-go" onclick="cmConfirm()">' + icon("check", 15) + ' ' + t(c ? "cmPinHere" : "cmAddHere") + '</button>' : '') +
      '<button class="btn-secondary cm-go" onclick="cmCancel()">' + t("cancel") + '</button></div></div>';
  } else if (_cm.sel) {
    var s = _cmFind(_cm.sel);
    if (s && _cmRest()) {
      var dr = _here && hasPin(s) ? fmtKm(distanceKm(_here, s)) : "";
      h = '<div class="cm-card"><div class="cm-t"><b>' + escapeHtml(s.name) + '</b>' + (dr ? ' <span class="tag">' + dr + '</span>' : '') + ' ' + ratingHtml(s.id) + '</div>' +
        '<div class="cm-sub">' + escapeHtml(s.location || "") + '</div>' +
        '<div class="cm-btns"><a class="btn-primary cm-go" target="_blank" rel="noopener" href="' + mapsDirUrl(s.lat, s.lng) + '">' + icon("route", 16) + ' ' + t("directions") + '</a>' +
        (_restCanManage(s) ? '<button class="btn-secondary cm-go" onclick="showRestaurantForm(null,\'' + jsq(s.id) + '\',function(){renderPublic()})">' + icon("pen", 14) + ' ' + t("restEdit") + '</button>' : '') + '</div></div>';
    } else if (s) {
      var dist = _here && hasPin(s) ? fmtKm(distanceKm(_here, s)) : "";
      var up = (typeof _publicGames !== "undefined" ? _publicGames : []).filter(function (g) { return g.courtId === s.id && gameStartMs(g) > Date.now(); }).length;
      h = '<div class="cm-card"><div class="cm-t"><b>' + escapeHtml(s.name) + '</b>' + (dist ? ' <span class="tag">' + dist + '</span>' : '') + (up ? ' <span class="tag">' + t("upcomingGamesN").replace("{n}", up) + '</span>' : '') + '</div>' +
        '<div class="cm-sub">' + escapeHtml(s.location || "") + (s.hours ? ' · ' + escapeHtml(s.hours) : '') + (s.aircon ? ' · ' + t("aircon") : '') + '</div>' +
        '<div class="cm-btns"><a class="btn-primary cm-go" target="_blank" rel="noopener" href="' + mapsDirUrl(s.lat, s.lng) + '">' + icon("route", 16) + ' ' + t("directions") + '</a>' +
        '<button class="btn-secondary cm-go" onclick="showCourtModal(\'' + jsq(s.id) + '\',null,{directoryOnly:true})">' + t("cmDetails") + '</button></div></div>';
    }
  }
  el.innerHTML = h;
}

function _cmListHtml() {
  var list = _cmRest() ? restaurantList().slice().sort(function (a, b) {
    if (_here) return (hasPin(a) ? distanceKm(_here, a) : 1e9) - (hasPin(b) ? distanceKm(_here, b) : 1e9);
    return String(a.name).localeCompare(String(b.name));
  }) : (typeof _gameCourts === "function" ? _gameCourts() : []);
  var html = "";
  if (!list.length && _cmRest()) return '<div class="empty-state" style="padding:12px">' + t("restEmpty") + '</div>';
  list.forEach(function (c) {
    var pinned = hasPin(c), dist = _here && pinned ? fmtKm(distanceKm(_here, c)) : "";
    html += '<div class="cm-row" onclick="' + (pinned ? "cmSelect('" + c.id + "')" : (_cmRest() ? "cmStartPin('" + c.id + "')" : "showCourtModal('" + c.id + "',null,{directoryOnly:true})")) + '">' +
      '<span class="cm-ic' + (pinned ? '' : ' off') + '">' + icon("pin", 16) + '</span>' +
      '<span class="cm-name"><b>' + escapeHtml(c.name) + '</b><small>' + escapeHtml(c.location || "") + '</small></span>' +
      (dist ? '<span class="tag">' + dist + '</span>' : '') +
      (pinned ? '<a class="loc-ic" target="_blank" rel="noopener" href="' + mapsDirUrl(c.lat, c.lng) + '" onclick="event.stopPropagation()" aria-label="' + t("directions") + '" title="' + t("directions") + '">' + icon("route", 18) + '</a>'
              : '<button class="cm-pinbtn" onclick="event.stopPropagation();cmStartPin(\'' + jsq(c.id) + '\')">' + t("cmPinOnMap") + '</button>') + '</div>';
  });
  return html;
}

function cmHtml(kind) {
  _cmKind(kind === "rest" ? "rest" : "court");
  return '<div class="cm-wrap"><div id="cmMap" class="cm-map"><div class="map-hint">' + t("loading") + '</div></div>' +
    '<div class="cm-search"><span class="cm-sico">' + icon("search", 18) + '</span><input id="cmQ" class="cm-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="' + escapeHtml(t("cmSearchPh")) + '" value="' + escapeHtml(_cm.q) + '" oninput="cmSearchInput(this.value)">' +
      '<button type="button" class="cm-qx" id="cmQx" onclick="cmSearchClear()" aria-label="' + t("clear") + '"' + (_cm.q ? '' : ' style="display:none"') + '>' + icon("close", 14) + '</button></div><div class="cm-res" id="cmRes"></div>' +
    '<div class="cm-tools"><button class="cm-fab" onclick="cmLocate()" aria-label="' + t("cmFindMe") + '" title="' + t("cmFindMe") + '">' + icon("target", 20) + '</button>' +
    '<button class="cm-fab add" onclick="cmStartAdd()" aria-label="' + t(_cmRest() ? "restNew" : "addCourt") + '" title="' + t(_cmRest() ? "restNew" : "addCourt") + '">+</button></div></div>' +
    '<div id="cmBar" class="cm-bar"></div><div class="card cm-list" id="cmList">' + _cmListHtml() + '</div>';
}


/* ---------- Search (like Google): type a place or court name, pick it, the pin is placed ---------- */

function cmSearchInput(v) {
  _cm.q = v;
  clearTimeout(_cm.timer);
  var q = v.trim();
  var clr = document.getElementById("cmQx"); if (clr) clr.style.display = q ? "" : "none";
  if (q.length < 3) { _cm.res = []; _cmResDraw(); return; }
  _cm.timer = setTimeout(function () { _cmSearch(q); }, 450);
}

function cmSearchClear() {
  _cm.q = ""; _cm.res = []; clearTimeout(_cm.timer);
  var i = document.getElementById("cmQ"); if (i) { i.value = ""; i.focus(); }
  var clr = document.getElementById("cmQx"); if (clr) clr.style.display = "none";
  _cmResDraw();
}

function _cmSearch(q) {
  var ll = typeof parseLatLng === "function" ? parseLatLng(q) : null;      // pasted coordinates or Google Maps link
  if (ll) { _cm.res = [{ name: t("cmCoords"), addr: ll.lat.toFixed(5) + ", " + ll.lng.toFixed(5), lat: ll.lat, lng: ll.lng, raw: true }]; _cmResDraw(); return; }
  if (_cm.abort) { try { _cm.abort.abort(); } catch (e) {} }
  var ctl = _cm.abort = window.AbortController ? new AbortController() : null;
  _cm.busy = true; _cmResDraw();
  geoSearch(q, _here || null, ctl && ctl.signal).then(function (out) {
    if (q !== _cm.q.trim()) return;
    _cm.res = out; _cm.busy = false; _cm.none = !out.length; _cmResDraw();
  }).catch(function (e) {
    if (e && e.name === "AbortError") return;
    _cm.res = []; _cm.busy = false; _cm.err = true; _cmResDraw();
  });
}

function _cmResDraw() {
  var el = document.getElementById("cmRes");
  if (!el) return;
  if (_cm.busy) { el.innerHTML = '<div class="cm-res-msg">' + t("loading") + '</div>'; return; }
  if (_cm.err && !_cm.res.length) { _cm.err = false; el.innerHTML = '<div class="cm-res-msg">' + t("cmSearchErr") + '</div>'; return; }
  if (_cm.none && !_cm.res.length && _cm.q.trim().length >= 3) { _cm.none = false; el.innerHTML = '<div class="cm-res-msg">' + t("cmNoResult") + '</div>'; return; }
  el.innerHTML = _cm.res.map(function (r, i) {
    return '<button type="button" class="cm-res-row" onclick="cmPick(' + i + ')"><span class="cm-ic">' + icon("pin", 16) + '</span>' +
      '<span class="cm-name"><b>' + escapeHtml(r.name || "") + '</b><small>' + escapeHtml(r.addr || "") + '</small></span>' +
      (typeof r.km === "number" ? '<span class="tag">' + fmtKm(r.km) + '</span>' : '') + '</button>';
  }).join("");
}

function cmPick(i) {
  var r = _cm.res[i];
  if (!r || !_cm.map) return;
  if (!_cm.mode) _cm.mode = { add: true };
  _cm.sel = null;
  Object.keys(_cm.markers).forEach(function (k) { _cm.markers[k].setIcon(_cmPinIcon(false)); });
  _cmDrop(r.lat, r.lng);
  _cm.draft.name = r.raw ? "" : r.name; _cm.draft.addr = r.raw ? "" : r.addr;
  _cm.map.flyTo([r.lat, r.lng], 17, { duration: .8 });
  _cm.res = [];
  _cmResDraw();
  var inp = document.getElementById("cmQ"); if (inp) inp.blur();
}
