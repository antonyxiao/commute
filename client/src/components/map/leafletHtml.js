/**
 * Keyless raster map for native platforms. Runs Leaflet inside a WebView and
 * talks to React Native over `window.ReactNativeWebView.postMessage`.
 *
 * Tiles are CARTO Positron (light) / Dark Matter (dark), both built from
 * OpenStreetMap data, include street names, and require no API key.
 */
export function buildLeafletHtml({ dark = false, colors, center = [48.4284, -123.3656], zoom = 13 }) {
  const config = JSON.stringify({ dark, colors, center, zoom }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <link rel="preconnect" href="https://unpkg.com" crossorigin />
  <link rel="preconnect" href="https://basemaps.cartocdn.com" crossorigin />
  <link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    :root {
      --accent: #2563EB;
      --on-accent: #FFFFFF;
      --surface: #FFFFFF;
      --text: #0F172A;
      --muted: #94A3B8;
      --border: #E2E8F0;
      --bg: #F4F6FA;
    }
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
    body { background: var(--bg); -webkit-tap-highlight-color: transparent; }
    .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); outline: none; }
    .leaflet-control-attribution { display: none !important; }
    .commute-cluster {
      display: flex; align-items: center; justify-content: center; box-sizing: border-box;
      border-radius: 999px; background: var(--accent); border: 2.5px solid var(--surface);
      color: var(--on-accent); font-weight: 800; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.25);
    }
    .commute-vehicle {
      display: flex; align-items: center; justify-content: center; box-sizing: border-box;
      border-radius: 9px; border: 2.5px solid #FFFFFF; font-weight: 800; font-size: 11px;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.28);
    }
    .leaflet-popup-content-wrapper { background: var(--surface); color: var(--text); border-radius: 14px; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.22); }
    .leaflet-popup-tip { background: var(--surface); }
    .leaflet-popup-content { margin: 12px 14px; line-height: 1.35; font-size: 13px; }
    .leaflet-popup-close-button { color: var(--muted) !important; }
    .commute-popup-title { color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
    .commute-popup-main { color: var(--text); font-size: 15px; font-weight: 800; margin-top: 2px; }
    .commute-popup-row { color: var(--text); opacity: 0.72; font-size: 12px; margin-top: 4px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
  (function () {
    var CONFIG = ${config};
    var state = {
      dark: !!CONFIG.dark,
      stops: [],
      vehicles: [],
      selected: null,
      user: null,
      bottomPadding: 0
    };
    var colors = CONFIG.colors;

    if (!window.L) {
      post({ type: 'error', message: 'Leaflet failed to load' });
      return;
    }
    var TILES = {
      light: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    };
    var TILE_OPTIONS = {
      minZoom: 10,
      maxZoom: 18,
      updateWhenIdle: true,
      keepBuffer: 1,
      detectRetina: false
    };
    var OCCUPANCY = ['Empty', 'Many seats available', 'Few seats available', 'Standing room only', 'Crushed standing room only', 'Full', 'Not accepting passengers'];
    var CONGESTION = [null, 'Running smoothly', 'Stop and go', 'Congested', 'Severe congestion'];
    var CELL_SIZE = 64;

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      minZoom: 10,
      maxZoom: 18,
      fadeAnimation: false
    });
    map.setView(CONFIG.center, CONFIG.zoom);

    var tiles = null;
    var tileTheme = null;
    var tileErrorSent = false;
    var stopLayer = L.layerGroup().addTo(map);
    var selectedLayer = L.layerGroup().addTo(map);
    var vehicleLayer = L.layerGroup().addTo(map);
    var userLayer = L.layerGroup().addTo(map);
    var vehicleMarkers = {};
    var moveTimer = null;

    function post(message) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    }

    window.onerror = function (message) {
      post({ type: 'error', message: String(message) });
    };

    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
      });
    }

    function normalizeHex(value, fallback) {
      if (!value || typeof value !== 'string') return fallback;
      var hex = value.replace(/^#/, '');
      return hex || fallback;
    }

    function emitViewport() {
      var bounds = map.getBounds();
      post({
        type: 'viewport',
        bounds: {
          north: bounds.getNorth(),
          east: bounds.getEast(),
          south: bounds.getSouth(),
          west: bounds.getWest()
        }
      });
    }

    function scheduleUpdate() {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(function () {
        moveTimer = null;
        renderStops();
        emitViewport();
      }, 120);
    }

    function renderSelected() {
      selectedLayer.clearLayers();
      var stop = state.selected;
      if (!stop) return;
      var lat = Number(stop.stop_lat);
      var lon = Number(stop.stop_lon);
      if (isNaN(lat) || isNaN(lon)) return;

      var hit = L.circleMarker([lat, lon], {
        radius: 22,
        stroke: false,
        fillColor: '#000000',
        fillOpacity: 0,
        interactive: true,
        bubblingMouseEvents: false
      });
      hit.on('click', function () {
        post({ type: 'stop', stop: stop });
      });
      hit.addTo(selectedLayer);

      L.circleMarker([lat, lon], {
        radius: 18,
        stroke: false,
        fillColor: colors.accent,
        fillOpacity: 0.18,
        interactive: false
      }).addTo(selectedLayer);

      L.circleMarker([lat, lon], {
        radius: 10,
        color: '#FFFFFF',
        weight: 3,
        fillColor: colors.accent,
        fillOpacity: 1,
        interactive: false
      }).addTo(selectedLayer);
    }

    function renderStops() {
      stopLayer.clearLayers();
      var stops = state.stops || [];
      var selectedId = state.selected ? String(state.selected.stop_id) : null;
      var groups = {};
      var viewBounds = map.getBounds();
      var i;
      var stop;
      var point;
      var key;
      var group;

      for (i = 0; i < stops.length; i += 1) {
        stop = stops[i];
        if (selectedId !== null && String(stop.stop_id) === selectedId) continue;
        if (!viewBounds.contains([Number(stop.stop_lat), Number(stop.stop_lon)])) continue;
        point = map.latLngToContainerPoint([Number(stop.stop_lat), Number(stop.stop_lon)]);
        if (isNaN(point.x) || isNaN(point.y)) continue;
        key = Math.floor(point.x / CELL_SIZE) + ':' + Math.floor(point.y / CELL_SIZE);
        group = groups[key];
        if (!group) {
          group = { count: 0, lat: 0, lon: 0, stop: stop };
          groups[key] = group;
        }
        group.count += 1;
        group.lat += Number(stop.stop_lat);
        group.lon += Number(stop.stop_lon);
        group.stop = stop;
      }

      Object.keys(groups).forEach(function (groupKey) {
        var item = groups[groupKey];

        if (item.count === 1) {
          var single = item.stop;
          var singleLat = Number(single.stop_lat);
          var singleLon = Number(single.stop_lon);

          // Invisible 32px touch target; the visible dot stays small.
          var hit = L.circleMarker([singleLat, singleLon], {
            radius: 16,
            stroke: false,
            fillColor: '#000000',
            fillOpacity: 0,
            interactive: true,
            bubblingMouseEvents: false
          });
          hit.on('click', function () {
            post({ type: 'stop', stop: single });
          });
          hit.addTo(stopLayer);

          L.circleMarker([singleLat, singleLon], {
            radius: 6,
            color: '#FFFFFF',
            weight: 2,
            fillColor: '#10B981',
            fillOpacity: 1,
            interactive: false
          }).addTo(stopLayer);
          return;
        }

        var size = Math.min(56, 34 + (Math.log(item.count) / Math.LN2) * 6);
        var icon = L.divIcon({
          className: '',
          html:
            '<div class="commute-cluster" style="width:' + size + 'px;height:' + size +
            'px;font-size:' + (size > 44 ? 14 : 12) + 'px;">' + item.count + '</div>',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        });
        var lat = item.lat / item.count;
        var lon = item.lon / item.count;
        var marker = L.marker([lat, lon], { icon: icon, keyboard: false });
        marker.on('click', function () {
          map.flyTo([lat, lon], Math.min(map.getZoom() + 2, 18), { duration: 0.35 });
        });
        marker.addTo(stopLayer);
      });

      renderSelected();
    }

    function vehiclePopup(vehicle) {
      var html = '<div class="commute-popup-title">' + esc(vehicle.route_long_name || 'Route') + '</div>';
      html += '<div class="commute-popup-main">' + esc(vehicle.trip_headsign || 'In service') + '</div>';

      if (vehicle.speed !== null && vehicle.speed !== undefined) {
        html += '<div class="commute-popup-row">Speed: ' + Math.round(Number(vehicle.speed) * 3.6) + ' km/h</div>';
      }
      var occupancy = OCCUPANCY[vehicle.occupancy_status];
      if (occupancy) {
        html += '<div class="commute-popup-row">Occupancy: ' + esc(occupancy) + '</div>';
      }
      var congestion = CONGESTION[vehicle.congestion_level];
      if (congestion) {
        html += '<div class="commute-popup-row">Traffic: ' + esc(congestion) + '</div>';
      }
      return html;
    }

    function renderVehicles() {
      var openVehicleId = null;
      Object.keys(vehicleMarkers).forEach(function (id) {
        if (vehicleMarkers[id] && vehicleMarkers[id].isPopupOpen()) {
          openVehicleId = id;
        }
      });

      vehicleLayer.clearLayers();
      vehicleMarkers = {};
      var list = state.vehicles || [];

      for (var i = 0; i < list.length; i += 1) {
        var vehicle = list[i];
        var lat = Number(vehicle.lat);
        var lon = Number(vehicle.lon);
        if (isNaN(lat) || isNaN(lon)) continue;

        var color = '#' + normalizeHex(vehicle.route_color, '2563EB');
        var text = '#' + normalizeHex(vehicle.route_text_color, 'FFFFFF');
        var icon = L.divIcon({
          className: '',
          html:
            '<div class="commute-vehicle" style="background:' + color + ';color:' + text + ';">' +
            esc(vehicle.route_short_name || '') + '</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        var marker = L.marker([lat, lon], { icon: icon, keyboard: false, zIndexOffset: 1000 });
        marker.bindPopup(vehiclePopup(vehicle), { closeButton: true, offset: [0, -10], minWidth: 170 });
        marker.addTo(vehicleLayer);
        vehicleMarkers[String(vehicle.id)] = marker;
      }

      if (openVehicleId && vehicleMarkers[openVehicleId]) {
        vehicleMarkers[openVehicleId].openPopup();
      }
    }

    function renderUser() {
      userLayer.clearLayers();
      var coords = state.user;
      if (!coords) return;
      var lat = Number(coords.latitude);
      var lon = Number(coords.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      L.circleMarker([lat, lon], {
        radius: 18,
        stroke: false,
        fillColor: '#3B82F6',
        fillOpacity: 0.18,
        bubblingMouseEvents: false
      }).addTo(userLayer);
      L.circleMarker([lat, lon], {
        radius: 7,
        color: '#FFFFFF',
        weight: 2,
        fillColor: '#3B82F6',
        fillOpacity: 1,
        bubblingMouseEvents: false
      }).addTo(userLayer);
    }

    function applyTheme(darkMode, nextColors) {
      var nextDark = !!darkMode;
      state.dark = nextDark;
      if (nextColors) colors = nextColors;

      var root = document.documentElement.style;
      root.setProperty('--accent', colors.accent);
      root.setProperty('--on-accent', colors.onAccent);
      root.setProperty('--surface', colors.surface);
      root.setProperty('--text', colors.text);
      root.setProperty('--muted', colors.muted);
      root.setProperty('--border', colors.border);
      root.setProperty('--bg', colors.background);
      document.body.style.backgroundColor = colors.background;

      if (!tiles || tileTheme !== nextDark) {
        if (tiles) map.removeLayer(tiles);
        tiles = L.tileLayer(TILES[nextDark ? 'dark' : 'light'], TILE_OPTIONS).addTo(map);
        tiles.on('tileerror', function () {
          if (!tileErrorSent) {
            tileErrorSent = true;
            post({ type: 'tileError' });
          }
        });
        tileTheme = nextDark;
      }

      renderStops();
      renderVehicles();
      renderUser();
    }

    function flyToStop(stop) {
      var lat = Number(stop.stop_lat);
      var lon = Number(stop.stop_lon);
      if (isNaN(lat) || isNaN(lon)) return;

      var targetZoom = Math.max(map.getZoom(), 16);
      var point = map.project([lat, lon], targetZoom);
      var target = map.unproject(point.add([0, (state.bottomPadding || 0) / 2]), targetZoom);
      map.flyTo(target, targetZoom, { duration: 0.55 });
    }

    function focusVehicle(id) {
      var marker = vehicleMarkers[String(id)];
      if (!marker) return;
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.5 });
      setTimeout(function () {
        marker.openPopup();
      }, 650);
    }

    map.on('moveend zoomend', scheduleUpdate);
    map.on('click', function () {
      post({ type: 'mapPress' });
    });

    window.addEventListener('resize', function () {
      map.invalidateSize();
      renderStops();
    });

    window.__commute = {
      handle: function (message) {
        if (!message || !message.type) return;

        switch (message.type) {
          case 'stops':
            state.stops = message.stops || [];
            renderStops();
            break;
          case 'vehicles':
            state.vehicles = message.vehicles || [];
            renderVehicles();
            break;
          case 'select':
            state.selected = message.stop || null;
            if (typeof message.bottomPadding === 'number') {
              state.bottomPadding = message.bottomPadding;
            }
            renderStops();
            if (state.selected && message.fly !== false) flyToStop(state.selected);
            break;
          case 'user':
            state.user = message.coords || null;
            renderUser();
            break;
          case 'theme':
            applyTheme(message.dark, message.colors);
            break;
          case 'bottomPadding':
            state.bottomPadding = message.value || 0;
            break;
          case 'flyTo':
            map.flyTo([message.latitude, message.longitude], message.zoom || 16, { duration: 0.5 });
            break;
          case 'focusVehicle':
            focusVehicle(message.id);
            break;
          default:
            break;
        }
      }
    };

    applyTheme(state.dark, colors);

    setTimeout(function () {
      map.invalidateSize();
      post({ type: 'ready' });
      emitViewport();
    }, 200);
  })();
  </script>
</body>
</html>`;
}
