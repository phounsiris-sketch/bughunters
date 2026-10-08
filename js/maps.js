/* ============================================================
   maps.js — Court locations: a free OpenStreetMap picker (Leaflet,
   loaded only when needed), "use my location", pasting a Google Maps
   link, and "Open in Google Maps" links. No API key, no cost.
   A court stores { lat, lng } next to its text `location`.
   ============================================================ */

var MAP_DEFAULT = { lat: 17.9757, lng: 102.6331 }; // Vientiane
var LEAFLET_BASE = "js/vendor/leaflet/"; // Leaflet 1.9.4, BSD-2 (see LICENSE there)
var _leafletLoading = null;
var _pickers = {};

/** Load Leaflet's CSS + JS once; resolves with window.L */
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (_leafletLoading) return _leafletLoading;
  _leafletLoading = new Promise(function (resolve, reject) {
    var base = LEAFLET_BASE;
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = base + "leaflet.css";
    document.head.appendChild(css);
    var js = document.createElement("script");
    js.src = base + "leaflet.js";
    js.onload = function () { window.L ? resolve(window.L) : reject(new Error("Leaflet")); };
    js.onerror = function () { _leafletLoading = null; reject(new Error(t("mapOffline"))); };
    document.head.appendChild(js);
  });
  return _leafletLoading;
}

function hasPin(c) {
  return !!(c && typeof c.lat === "number" && typeof c.lng === "number" && isFinite(c.lat) && isFinite(c.lng));
}

/** Google Maps directions/search link for a place */
function mapsUrl(lat, lng) {
  return "https://www.google.com/maps/search/?api=1&query=" + lat.toFixed(6) + "," + lng.toFixed(6);
}

/** Small "Map" link for a court (empty when it has no pin) */
function courtMapLink(court, label) {
  if (!hasPin(court)) return "";
  return '<a class="map-link" href="' + mapsUrl(court.lat, court.lng) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
    icon("pin", 13) + ' ' + (label || t("openMap")) + '</a>';
}

/**
 * Pull coordinates out of pasted text: a full Google Maps link
 * (…/@17.97,102.63,… or ?q=17.97,102.63 or !3d17.97!4d102.63) or plain "17.97, 102.63".
 * Returns { lat, lng } or null.
 */
function parseLatLng(text) {
  if (!text) return null;
  var s = String(text);
  try { s = decodeURIComponent(s); } catch (e) {}
  var pats = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/
  ];
  for (var i = 0; i < pats.length; i++) {
    var m = s.match(pats[i]);
    if (m) {
      var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat: lat, lng: lng };
    }
  }
  return null;
}

/** Distance in km between two points (for "nearest court") */
function distanceKm(a, b) {
  var R = 6371, rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtKm(km) {
  return km < 1 ? Math.round(km * 1000) + " m" : (km < 10 ? km.toFixed(1) : Math.round(km)) + " km";
}

/* ---------- Picker (inside a modal or form) ---------- */

/** Markup for a location picker; call initMapPicker(id, lat, lng) after it is in the page */
function mapPickerHtml(id) {
  return '<div class="map-picker" id="' + id + '">' +
    '<div class="map-box" id="' + id + '-map"><div class="map-hint">' + t("loading") + '</div></div>' +
    '<div class="map-actions">' +
      '<button type="button" class="btn-secondary map-btn" onclick="mapUseMyLocation(\'' + id + '\')">' + icon("pin", 15) + ' ' + t("useMyLocation") + '</button>' +
      '<button type="button" class="btn-secondary map-btn" id="' + id + '-clear" onclick="mapClearPin(\'' + id + '\')">' + t("removePin") + '</button>' +
    '</div>' +
    '<input class="form-input map-paste" id="' + id + '-paste" placeholder="' + t("pasteMapLink") + '" oninput="mapPasted(\'' + id + '\', this.value)">' +
    '<div class="map-status" id="' + id + '-status"></div>' +
  '</div>';
}

function initMapPicker(id, lat, lng) {
  var p = _pickers[id] = { lat: typeof lat === "number" ? lat : null, lng: typeof lng === "number" ? lng : null, map: null, marker: null };
  _mapStatus(id);
  loadLeaflet().then(function (L) {
    var el = document.getElementById(id + "-map");
    if (!el || _pickers[id] !== p) return;
    el.innerHTML = "";
    var start = p.lat !== null ? [p.lat, p.lng] : [MAP_DEFAULT.lat, MAP_DEFAULT.lng];
    p.map = L.map(el, { zoomControl: false, attributionControl: true }).setView(start, p.lat !== null ? 16 : 12);
    L.control.zoom({ zoomInTitle: t("zoomIn"), zoomOutTitle: t("zoomOut") }).addTo(p.map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(p.map);
    p.map.on("click", function (e) { _mapSet(id, e.latlng.lat, e.latlng.lng, false); });
    if (p.lat !== null) _mapSet(id, p.lat, p.lng, false);
    setTimeout(function () { if (p.map) p.map.invalidateSize(); }, 200);
  }).catch(function (e) {
    var el = document.getElementById(id + "-map");
    if (el) el.innerHTML = '<div class="map-hint">' + escapeHtml(e.message || t("mapOffline")) + '</div>';
  });
}

function _mapSet(id, lat, lng, pan) {
  var p = _pickers[id];
  if (!p) return;
  p.lat = Math.round(lat * 1e6) / 1e6;
  p.lng = Math.round(lng * 1e6) / 1e6;
  if (p.map && window.L) {
    if (!p.marker) {
      p.marker = window.L.marker([p.lat, p.lng], { draggable: true }).addTo(p.map);
      p.marker.on("dragend", function () { var ll = p.marker.getLatLng(); _mapSet(id, ll.lat, ll.lng, false); });
    } else {
      p.marker.setLatLng([p.lat, p.lng]);
    }
    if (pan) p.map.setView([p.lat, p.lng], Math.max(p.map.getZoom(), 16));
  }
  _mapStatus(id);
}

function _mapStatus(id) {
  var p = _pickers[id], el = document.getElementById(id + "-status");
  var clr = document.getElementById(id + "-clear");
  if (clr) clr.style.display = p && p.lat !== null ? "" : "none";
  if (!el || !p) return;
  el.innerHTML = p.lat !== null
    ? icon("check", 13) + ' ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) +
      ' · <a href="' + mapsUrl(p.lat, p.lng) + '" target="_blank" rel="noopener">' + t("openMap") + '</a>'
    : t("tapMapToPin");
}

function mapUseMyLocation(id) {
  if (!navigator.geolocation) { showToast(t("noGps")); return; }
  showToast(t("findingYou"));
  navigator.geolocation.getCurrentPosition(function (pos) {
    _mapSet(id, pos.coords.latitude, pos.coords.longitude, true);
  }, function () { showToast(t("noGps")); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

function mapPasted(id, text) {
  if (!text) return;
  var ll = parseLatLng(text);
  if (ll) { _mapSet(id, ll.lat, ll.lng, true); return; }
  var st = document.getElementById(id + "-status");
  if (st && /goo\.gl|maps\.app/.test(text)) st.textContent = t("shortLinkHint");
}

function mapClearPin(id) {
  var p = _pickers[id];
  if (!p) return;
  p.lat = p.lng = null;
  if (p.marker && p.map) { p.map.removeLayer(p.marker); p.marker = null; }
  _mapStatus(id);
}

/** The chosen pin: { lat, lng } or { lat: null, lng: null } */
function getMapPick(id) {
  var p = _pickers[id];
  return p ? { lat: p.lat, lng: p.lng } : { lat: null, lng: null };
}

/** Was this picker opened (so its pin is the user's latest choice)? */
function mapPickerActive(id) { return !!_pickers[id]; }

function closeMapPicker(id) {
  var p = _pickers[id];
  if (p && p.map) { try { p.map.remove(); } catch (e) {} }
  delete _pickers[id];
}
