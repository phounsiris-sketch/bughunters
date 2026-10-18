/* ============================================================
   courtsmap.js — Public page › Courts: a real map (Leaflet + OpenStreetMap)
   with a pin for every court, "you are here", nearest first, directions,
   and adding / pinning a court by tapping the map. Courts are added or
   pinned from this page; the form opens with the pin already set.
   ============================================================ */

var _cm = { map: null, markers: {}, me: null, draft: null, sel: null, mode: null, view: null };

function _cmPinIcon(sel) {
  var L = window.L;
  return L.divIcon({
    className: "cm-pin-wrap",
    html: '<div class="cm-pin' + (sel ? ' sel' : '') + '"><svg viewBox="0 0 24 30" width="' + (sel ? 38 : 30) + '" height="' + (sel ? 46 : 37) + '"><path d="M12 0C5.4 0 0 5.3 0 11.8 0 20.5 12 30 12 30s12-9.500 12-18.200C24 5.300 18.600 0 12 0z" fill="currentColor"/><circle cx="12" cy="11.800" r="4.500" fill="#fff"/></svg></div>',
    iconSize: sel ? [38, 46] : [30, 37], iconAnchor: sel ? [19, 46] : [15, 37]
  });
}

function _cmCourts() { return (DB_CACHE.allCourts || []).filter(hasPin); }

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
function cmCancel() { _cmClearDraft(); _cm.mode = null; cmBar(); }

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
  _cmClearDraft(); _cm.mode = null;
  showCourtModal(id, function () { if (currentPage === "public") renderPublic(); }, { directoryOnly: true, pin: pin });
  cmBar();
}

function cmBar() {
  var el = document.getElementById("cmBar");
  if (!el) return;
  var h = "";
  if (_cm.mode) {
    var c = _cm.mode.pin ? dbFindById(DB_CACHE.allCourts || [], _cm.mode.pin) : null;
    h = '<div class="cm-card cm-mode"><div class="cm-t">' + icon("pin", 16) + ' <span>' + (c ? '<b>' + escapeHtml(c.name) + '</b> · ' : '') + t(_cm.draft ? "cmDropped" : "cmTapToDrop") + '</span></div>' +
      '<div class="cm-btns">' + (_cm.draft ? '<button class="btn-primary cm-go" onclick="cmConfirm()">' + icon("check", 15) + ' ' + t(c ? "cmPinHere" : "cmAddHere") + '</button>' : '') +
      '<button class="btn-secondary cm-go" onclick="cmCancel()">' + t("cancel") + '</button></div></div>';
  } else if (_cm.sel) {
    var s = dbFindById(DB_CACHE.allCourts || [], _cm.sel);
    if (s) {
      var dist = _here && hasPin(s) ? fmtKm(distanceKm(_here, s)) : "";
      var up = (typeof _publicGames !== "undefined" ? _publicGames : []).filter(function (g) { return g.courtId === s.id && gameStartMs(g) > Date.now(); }).length;
      h = '<div class="cm-card"><div class="cm-t"><b>' + escapeHtml(s.name) + '</b>' + (dist ? ' <span class="tag">' + dist + '</span>' : '') + (up ? ' <span class="tag">' + t("upcomingGamesN").replace("{n}", up) + '</span>' : '') + '</div>' +
        '<div class="cm-sub">' + escapeHtml(s.location || "") + (s.hours ? ' · ' + escapeHtml(s.hours) : '') + (s.aircon ? ' · ' + t("aircon") : '') + '</div>' +
        '<div class="cm-btns"><a class="btn-primary cm-go" target="_blank" rel="noopener" href="' + mapsDirUrl(s.lat, s.lng) + '">' + icon("route", 16) + ' ' + t("directions") + '</a>' +
        '<button class="btn-secondary cm-go" onclick="showCourtModal(\'' + s.id + '\',null,{directoryOnly:true})">' + t("cmDetails") + '</button></div></div>';
    }
  }
  el.innerHTML = h;
}

function _cmListHtml() {
  var list = typeof _gameCourts === "function" ? _gameCourts() : [];
  var html = "";
  list.forEach(function (c) {
    var pinned = hasPin(c), dist = _here && pinned ? fmtKm(distanceKm(_here, c)) : "";
    html += '<div class="cm-row" onclick="' + (pinned ? "cmSelect('" + c.id + "')" : "showCourtModal('" + c.id + "',null,{directoryOnly:true})") + '">' +
      '<span class="cm-ic' + (pinned ? '' : ' off') + '">' + icon("pin", 16) + '</span>' +
      '<span class="cm-name"><b>' + escapeHtml(c.name) + '</b><small>' + escapeHtml(c.location || "") + '</small></span>' +
      (dist ? '<span class="tag">' + dist + '</span>' : '') +
      (pinned ? '<a class="loc-ic" target="_blank" rel="noopener" href="' + mapsDirUrl(c.lat, c.lng) + '" onclick="event.stopPropagation()" aria-label="' + t("directions") + '" title="' + t("directions") + '">' + icon("route", 18) + '</a>'
              : '<button class="cm-pinbtn" onclick="event.stopPropagation();cmStartPin(\'' + c.id + '\')">' + t("cmPinOnMap") + '</button>') + '</div>';
  });
  return html;
}

function cmHtml() {
  return '<div class="cm-wrap"><div id="cmMap" class="cm-map"><div class="map-hint">' + t("loading") + '</div></div>' +
    '<div class="cm-tools"><button class="cm-fab" onclick="cmLocate()" aria-label="' + t("cmFindMe") + '" title="' + t("cmFindMe") + '">' + icon("target", 20) + '</button>' +
    '<button class="cm-fab add" onclick="cmStartAdd()" aria-label="' + t("addCourt") + '" title="' + t("addCourt") + '">+</button></div></div>' +
    '<div id="cmBar" class="cm-bar"></div><div class="card cm-list" id="cmList">' + _cmListHtml() + '</div>';
}
