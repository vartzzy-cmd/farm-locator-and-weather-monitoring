// ===== CONFIG =====
const DEFAULT_LAT = 8.541;
const DEFAULT_LON = 124.872;

// Mindanao island group, as rough outlines [lat, lon].
// Mainland + Camiguin, Dinagat, Siargao, Basilan, plus the Sulu archipelago.
// Visayan islands (Bohol, Negros, Siquijor, Leyte) are cut out on purpose.
const MINDANAO_AREAS = [
    [[8.95, 121.9], [8.95, 123.9], [9.45, 124.0], [9.45, 125.3], [10.75, 125.3],
     [10.75, 126.8], [5.2, 126.8], [5.2, 121.9]],
    [[6.5, 119.0], [6.5, 122.0], [4.3, 122.0], [4.3, 119.0]]
];

// Nominatim viewbox: left, top, right, bottom (lon, lat, lon, lat)
const MINDANAO_VIEWBOX = "119.0,10.8,126.8,4.3";

const FARM_STYLE = { color: "#1c7c45", fillColor: "#36a65c", fillOpacity: 0.3 };

// ===== HELPERS =====
const $ = id => document.getElementById(id);

function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

// Ray-casting point-in-polygon
function pointInPolygon(lat, lon, polygon) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lonI] = polygon[i];
        const [latJ, lonJ] = polygon[j];

        const crosses =
            (latI > lat) !== (latJ > lat) &&
            lon < (lonJ - lonI) * (lat - latI) / (latJ - latI) + lonI;

        if (crosses) inside = !inside;
    }

    return inside;
}

function isInMindanao(lat, lon) {
    return MINDANAO_AREAS.some(area => pointInPolygon(lat, lon, area));
}

let noticeTimer = null;

// Small message bar above the map (replaces alert popups)
function notify(message) {
    let el = $("locatorNotice");

    if (!el) {
        el = document.createElement("div");
        el.id = "locatorNotice";
        el.className = "notice";
        el.setAttribute("role", "status");
        $("map").insertAdjacentElement("beforebegin", el);
    }

    el.textContent = message;
    el.hidden = false;

    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

const MINDANAO_ONLY_MSG = "AgriSulbad only supports farms in Mindanao. Please choose a location inside Mindanao.";

// ===== MAP SETUP =====
const map = L.map("map", {
    maxBounds: [[4.0, 118.8], [11.0, 127.2]],
    maxBoundsViscosity: 1.0,
    minZoom: 6
}).setView([DEFAULT_LAT, DEFAULT_LON], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
    position: "topright",
    draw: {
        polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: FARM_STYLE
        },
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false
    },
    edit: {
        featureGroup: drawnItems,
        remove: true
    }
});

map.addControl(drawControl);

// ===== STATE =====
let weatherMarker = null;
let lastValidPosition = null;
let selectedLand = null;
let landCenter = null;
let drawingActive = false;
let drawingTimer = null;
let locationRequest = 0;
let lastNominatimCall = 0;
let landMarker = null;
let currentFarmName = "";

// While drawing/editing/deleting, map clicks must not drop the weather marker.
// The flag is released slightly late because the last click of a drawing
// can reach the map just after "drawstop" fires.
function startDrawing() {
    clearTimeout(drawingTimer);
    drawingActive = true;
}

function stopDrawing() {
    clearTimeout(drawingTimer);
    drawingTimer = setTimeout(() => { drawingActive = false; }, 300);
}

["draw:drawstart", "draw:editstart", "draw:deletestart"].forEach(name => map.on(name, startDrawing));
["draw:drawstop", "draw:editstop", "draw:deletestop"].forEach(name => map.on(name, stopDrawing));

// Nominatim allows about 1 request per second, so space calls out.
async function throttleNominatim() {
    const minGap = 1100;
    const wait = Math.max(0, minGap - (Date.now() - lastNominatimCall));
    lastNominatimCall = Date.now() + wait;

    if (wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait));
    }
}

// ===== FARM AREA =====
function calculateArea(latlngs) {
    const radius = 6378137;
    let area = 0;

    for (let i = 0; i < latlngs.length; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[(i + 1) % latlngs.length];

        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const lon1 = p1.lng * Math.PI / 180;
        const lon2 = p2.lng * Math.PI / 180;

        area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    return Math.abs(area * radius * radius / 2);
}

function layerInsideMindanao(layer) {
    const latlngs = layer.getLatLngs()[0] || [];
    return latlngs.every(p => isInMindanao(p.lat, p.lng));
}

function updateLandInformation(layer) {
    const latlngs = layer.getLatLngs()[0];

    if (!latlngs || latlngs.length < 3) {
        return;
    }

    const area = calculateArea(latlngs);

    setText("landArea", (area / 10000).toFixed(4) + " ha");
    setText("landMeters", Math.round(area).toLocaleString("en-US") + " m²");
    setText("landStatus", "Selected");

    selectedLand = layer;
    landCenter = polygonCenter(latlngs) || layer.getBounds().getCenter();
    refreshLandMarker();
}

function resetLandInformation() {
    setText("landArea", "0.00 ha");
    setText("landMeters", "0 m²");
    setText("landStatus", "No Land Selected");

    selectedLand = null;
    landCenter = null;
    currentFarmName = "";
    removeLandMarker();
}

map.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;

    // Farm boundaries must be fully inside Mindanao
    if (!layerInsideMindanao(layer)) {
        notify(MINDANAO_ONLY_MSG);
        return;
    }

    drawnItems.clearLayers(); // one farm boundary at a time
    drawnItems.addLayer(layer);
    currentFarmName = "";
    updateLandInformation(layer);
    notify("Boundary drawn. Tap the 🌾 marker to save this farm.");
});

map.on(L.Draw.Event.EDITED, function (event) {
    event.layers.eachLayer(function (layer) {
        if (!layerInsideMindanao(layer)) {
            drawnItems.removeLayer(layer);
            resetLandInformation();
            notify("That boundary moved outside Mindanao, so it was removed. " + MINDANAO_ONLY_MSG);
            return;
        }

        updateLandInformation(layer);
    });
});

map.on(L.Draw.Event.DELETED, resetLandInformation);

// ===== LOCATION MARKER =====
map.on("click", function (event) {
    if (drawingActive) return;
    setWeatherMarker(event.latlng.lat, event.latlng.lng);
});

// Returns true if the marker was placed
function setWeatherMarker(lat, lon) {
    if (!isInMindanao(lat, lon)) {
        notify(MINDANAO_ONLY_MSG);
        return false;
    }

    if (!weatherMarker) {
        weatherMarker = L.marker([lat, lon], {
            icon: pinIcon("location"),
            title: "Selected location",
            draggable: true,
            autoPan: true
        }).addTo(map);

        weatherMarker.bindPopup("Selected location");

        weatherMarker.on("dragend", function () {
            const position = weatherMarker.getLatLng();

            // Dragged outside Mindanao: snap back to the last valid spot
            if (!isInMindanao(position.lat, position.lng)) {
                weatherMarker.setLatLng(lastValidPosition);
                notify(MINDANAO_ONLY_MSG);
                return;
            }

            lastValidPosition = [position.lat, position.lng];
            updateSelectedLocation(position.lat, position.lng);
        });
    } else {
        weatherMarker.setLatLng([lat, lon]);
    }

    lastValidPosition = [lat, lon];
    weatherMarker.openPopup();
    updateSelectedLocation(lat, lon);

    return true;
}

// Same naming style as the weather page: barangay, municipality, province
function pickPlaceName(data) {
    const address = data.address || {};

    const barangay =
        address.village ||
        address.suburb ||
        address.hamlet ||
        address.neighbourhood ||
        address.quarter;

    const municipality =
        address.municipality ||
        address.town ||
        address.city ||
        address.county;

    const province = address.province || address.state;

    const parts = [barangay, municipality, province].filter(Boolean);

    return parts.length ? parts.join(", ") : data.name || "Selected Location";
}

async function updateSelectedLocation(lat, lon) {
    const requestId = ++locationRequest;
    const viewBtn = $("viewSelectedWeather");

    setText("selectedLocationName", "Loading location...");
    setText("selectedCoordinates", `${lat.toFixed(5)}, ${lon.toFixed(5)}`);

    // Weather only needs coordinates, so the button works right away.
    if (viewBtn) viewBtn.disabled = false;

    let placeName = "Selected Location";

    try {
        await throttleNominatim();

        // A newer click/drag happened while waiting: skip this request.
        if (requestId !== locationRequest) return;

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
            { headers: { "Accept-Language": "en" } }
        );

        if (!response.ok) {
            throw new Error("Unable to find location");
        }

        const data = await response.json();

        if (requestId !== locationRequest) return;

        placeName = pickPlaceName(data);

    } catch (error) {
        console.error("Location error:", error);

        if (requestId !== locationRequest) return;
    }

    setText("selectedLocationName", "📍 " + placeName);

    if (weatherMarker) {
        weatherMarker.setPopupContent(placeName);
    }
}

// ===== FARM / LOCATION SEARCH (Mindanao only) =====
const searchBtn = $("searchBtn");
const searchInput = $("searchLocation");

searchInput.placeholder = "Search a farm or place in Mindanao...";

// Dropdown for the results (created here, so no HTML change is needed)
const resultsList = document.createElement("ul");
resultsList.id = "searchResults";
resultsList.className = "search-results";
resultsList.hidden = true;
(searchInput.closest(".search-container") || searchInput.parentElement)
    .insertAdjacentElement("afterend", resultsList);

function hideResults() {
    resultsList.hidden = true;
    resultsList.innerHTML = "";
}

// OpenStreetMap tags that usually mean "a farm"
const FARM_LANDUSE = ["farmland", "farmyard", "orchard", "vineyard", "plantation",
    "greenhouse_horticulture", "meadow", "aquaculture"];

function isFarmResult(result) {
    const category = result.category || result.class;
    const type = result.type;

    return (
        (category === "landuse" && FARM_LANDUSE.includes(type)) ||
        (category === "place" && type === "farm") ||
        (category === "building" && ["farm", "farm_auxiliary"].includes(type)) ||
        (category === "shop" && type === "farm") ||
        /\b(farm|plantation|ranch|orchard)\b/i.test(result.name || "")
    );
}

// If OpenStreetMap has the farm's real outline, use it as the boundary
function farmPolygonFromResult(result) {
    const geo = result.geojson;
    if (!geo || !isFarmResult(result)) return null;

    let ring = null;
    if (geo.type === "Polygon") ring = geo.coordinates[0];
    if (geo.type === "MultiPolygon") ring = geo.coordinates[0][0];

    if (!ring || ring.length < 4) return null;

    const latlngs = ring.map(([lng, lat]) => [lat, lng]);

    if (!latlngs.every(([lat, lng]) => isInMindanao(lat, lng))) return null;

    return L.polygon(latlngs, FARM_STYLE);
}

function selectResult(result) {
    const lat = Number(result.lat);
    const lon = Number(result.lon);

    hideResults();

    if (!isInMindanao(lat, lon)) {
        notify(MINDANAO_ONLY_MSG);
        return;
    }

    const outline = farmPolygonFromResult(result);

    if (outline) {
        drawnItems.clearLayers();
        drawnItems.addLayer(outline);
        updateLandInformation(outline);
        currentFarmName = result.name || "";

        map.fitBounds(outline.getBounds(), { maxZoom: 18 });
        setWeatherMarker(landCenter.lat, landCenter.lng);
        notify("Farm boundary loaded from OpenStreetMap. Tap the 🌾 marker to save it, or use the draw tools to edit it.");
    } else {
        map.setView([lat, lon], 16);
        setWeatherMarker(lat, lon);
    }
}

function showResults(results) {
    resultsList.innerHTML = "";

    results.forEach(result => {
        const item = document.createElement("li");
        item.tabIndex = 0;
        item.setAttribute("role", "button");

        const title = document.createElement("strong");
        const name = result.name || (result.display_name || "").split(",")[0] || "Unnamed place";
        title.textContent = (isFarmResult(result) ? "🌾 " : "📍 ") + name;

        const detail = document.createElement("small");
        detail.textContent = result.display_name || "";

        item.append(title, detail);

        item.addEventListener("click", () => selectResult(result));
        item.addEventListener("keydown", event => {
            if (event.key === "Enter") selectResult(result);
        });

        resultsList.appendChild(item);
    });

    resultsList.hidden = false;
}

async function searchLocation() {
    const query = searchInput.value.trim();

    if (!query) {
        notify("Please enter a farm or place name.");
        return;
    }

    hideResults();

    const originalLabel = searchBtn.textContent;
    searchBtn.disabled = true;
    searchBtn.textContent = "Searching...";

    try {
        await throttleNominatim();

        const params = new URLSearchParams({
            format: "jsonv2",
            q: query,
            countrycodes: "ph",
            viewbox: MINDANAO_VIEWBOX,
            bounded: "1",
            addressdetails: "1",
            polygon_geojson: "1",
            limit: "15"
        });

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?${params}`,
            { headers: { "Accept-Language": "en" } }
        );

        if (!response.ok) {
            throw new Error("Search request failed");
        }

        const results = (await response.json())
            .filter(r => isInMindanao(Number(r.lat), Number(r.lon)))
            .sort((a, b) => Number(isFarmResult(b)) - Number(isFarmResult(a)))
            .slice(0, 6);

        if (!results.length) {
            notify("No farm or place found in Mindanao for that search. Try a barangay, town or province, then draw your farm.");
            return;
        }

        if (results.length === 1) {
            selectResult(results[0]);
        } else {
            showResults(results);
        }

    } catch (error) {
        console.error("Search error:", error);
        notify("Unable to search right now. Please try again.");
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = originalLabel;
    }
}

searchBtn.addEventListener("click", searchLocation);

searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        searchLocation();
    }

    if (event.key === "Escape") {
        hideResults();
    }
});

// Close the dropdown when clicking elsewhere
document.addEventListener("click", function (event) {
    if (!resultsList.contains(event.target) && event.target !== searchInput && event.target !== searchBtn) {
        hideResults();
    }
});

// ===== CURRENT LOCATION =====
const myLocationBtn = $("myLocationBtn");

myLocationBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
        notify("Your browser does not support location services.");
        return;
    }

    const originalLabel = myLocationBtn.textContent;
    myLocationBtn.disabled = true;
    myLocationBtn.textContent = "Getting Location...";

    const restoreButton = () => {
        myLocationBtn.disabled = false;
        myLocationBtn.textContent = originalLabel;
    };

    navigator.geolocation.getCurrentPosition(
        function (position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            if (setWeatherMarker(lat, lon)) {
                map.setView([lat, lon], 17);
            }

            restoreButton();
        },
        function () {
            notify("Unable to access your location. Please allow location permission.");
            restoreButton();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000
        }
    );
});

// ===== OPEN WEATHER PAGE =====
function openWeatherPage(lat, lon) {
    window.location.href =
        `weather.html?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
}

$("viewSelectedWeather").addEventListener("click", function () {
    if (!weatherMarker) return;

    const position = weatherMarker.getLatLng();
    openWeatherPage(position.lat, position.lng);
});

$("weatherLandBtn").addEventListener("click", function () {
    if (!selectedLand || !landCenter) {
        notify("Please draw your farm boundary first.");
        return;
    }

    openWeatherPage(landCenter.lat, landCenter.lng);
});

// ===== CLEAR FARM =====
$("clearLandBtn").addEventListener("click", function () {
    drawnItems.clearLayers();
    resetLandInformation();
});

// ===== FARM MARKERS & SAVED FARMS =====
const FARMS_KEY = "agrisulbad-farms";
const MAX_FARMS = 50;

const savedLayer = new L.FeatureGroup().addTo(map);
const farmMarkers = new Map();
let savedFarms = [];
let savedPanel = null;

// Pin-shaped map markers (inline SVG, colors come from CSS so dark mode works)
//   "location" = selected spot (red)   "draft" = farm not saved yet (amber)   "saved" = saved farm (green)
const PIN_GLYPHS = {
    farm: '<path class="pin-glyph" d="M16 15C16 12.2 17.8 10.8 20 10.8 20 13.4 18.4 15 16 15Z"/>' +
          '<path class="pin-glyph" d="M16 17C16 14.8 14.6 13.6 12.4 13.6 12.4 15.8 13.8 17 16 17Z"/>' +
          '<path class="pin-stem" d="M16 19.4V14.2"/>',
    location: '<circle class="pin-glyph" cx="16" cy="15.5" r="3"/>'
};

function pinIcon(kind) {
    const glyph = kind === "location" ? PIN_GLYPHS.location : PIN_GLYPHS.farm;

    const html =
        '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">' +
        '<path class="pin-body" d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z"/>' +
        '<circle class="pin-inner" cx="16" cy="15.5" r="7.5"/>' +
        glyph +
        '</svg>';

    return L.divIcon({
        className: "map-pin " + kind,
        html,
        iconSize: [32, 42],
        iconAnchor: [16, 41],
        popupAnchor: [0, -36]
    });
}

// Area-weighted centre of a polygon (stays closer to the land than the bounding box)
function polygonCenter(latlngs) {
    let a = 0, cx = 0, cy = 0;

    for (let i = 0; i < latlngs.length; i++) {
        const p = latlngs[i];
        const q = latlngs[(i + 1) % latlngs.length];
        const f = p.lng * q.lat - q.lng * p.lat;

        a += f;
        cx += (p.lng + q.lng) * f;
        cy += (p.lat + q.lat) * f;
    }

    if (Math.abs(a) < 1e-12) return null;

    a /= 2;
    return L.latLng(cy / (6 * a), cx / (6 * a));
}

function formatArea(areaM2) {
    return `${(areaM2 / 10000).toFixed(4)} ha · ${Math.round(areaM2).toLocaleString("en-US")} m²`;
}

// Popup content built with DOM nodes, so farm names can never inject HTML
function makeFarmPopup(title, areaM2, lat, lon, actions) {
    const box = document.createElement("div");
    box.className = "farm-popup";

    const heading = document.createElement("strong");
    heading.textContent = title;

    const info = document.createElement("p");
    info.textContent = formatArea(areaM2);

    const row = document.createElement("div");
    row.className = "farm-popup-actions";

    const weather = document.createElement("a");
    weather.className = "primary-btn";
    weather.textContent = "Weather";
    weather.href = `weather.html?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    row.appendChild(weather);

    actions.forEach(({ label, className, onClick }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.addEventListener("click", onClick);
        row.appendChild(button);
    });

    box.append(heading, info, row);
    return box;
}

// --- marker on the farm being drawn / loaded ---
function refreshLandMarker() {
    if (!landCenter) return;

    if (!landMarker) {
        landMarker = L.marker(landCenter, {
            icon: pinIcon("draft"),
            zIndexOffset: 300,
            title: "Your farm"
        }).addTo(map);

        landMarker.bindPopup(buildLandPopup);
    } else {
        landMarker.setLatLng(landCenter);
    }
}

function removeLandMarker() {
    if (landMarker) {
        map.removeLayer(landMarker);
        landMarker = null;
    }
}

function buildLandPopup() {
    const area = selectedLand ? calculateArea(selectedLand.getLatLngs()[0]) : 0;

    return makeFarmPopup(
        currentFarmName || "Your farm",
        area,
        landCenter.lat,
        landCenter.lng,
        [{ label: "Save Farm", className: "secondary-btn", onClick: saveCurrentFarm }]
    );
}

// --- saved farms (kept in this browser's localStorage) ---
function isValidFarm(farm) {
    return Boolean(farm) &&
        typeof farm.id === "string" &&
        typeof farm.name === "string" &&
        Array.isArray(farm.latlngs) &&
        farm.latlngs.length >= 3 &&
        farm.latlngs.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && isInMindanao(p[0], p[1])) &&
        Number.isFinite(farm.areaM2) &&
        Number.isFinite(farm.lat) &&
        Number.isFinite(farm.lon);
}

function readFarms() {
    try {
        const raw = JSON.parse(localStorage.getItem(FARMS_KEY) || "[]");
        return Array.isArray(raw) ? raw.filter(isValidFarm) : [];
    } catch (error) {
        return [];
    }
}

function writeFarms() {
    try {
        localStorage.setItem(FARMS_KEY, JSON.stringify(savedFarms));
        return true;
    } catch (error) {
        notify("Couldn't save in this browser. Check that storage is allowed for this site.");
        return false;
    }
}

function saveCurrentFarm() {
    if (!selectedLand || !landCenter) {
        notify("Please draw your farm boundary first.");
        return;
    }

    if (savedFarms.length >= MAX_FARMS) {
        notify(`You can save up to ${MAX_FARMS} farms. Delete one first.`);
        return;
    }

    const name = (prompt("Name this farm:", currentFarmName) || "").trim().slice(0, 60);
    if (!name) return;

    const ring = selectedLand.getLatLngs()[0];

    const farm = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        latlngs: ring.map(p => [p.lat, p.lng]),
        areaM2: calculateArea(ring),
        lat: landCenter.lat,
        lon: landCenter.lng
    };

    savedFarms.push(farm);

    if (!writeFarms()) {
        savedFarms.pop();
        return;
    }

    drawnItems.clearLayers();
    resetLandInformation();

    renderSavedFarms();
    focusFarm(farm.id);
    notify(`"${name}" saved. Its 🌾 marker stays on the map.`);
}

function deleteFarm(id) {
    const farm = savedFarms.find(f => f.id === id);
    if (!farm || !confirm(`Remove "${farm.name}" from your saved farms?`)) return;

    savedFarms = savedFarms.filter(f => f.id !== id);
    writeFarms();
    map.closePopup();
    renderSavedFarms();
}

function focusFarm(id) {
    const farm = savedFarms.find(f => f.id === id);
    if (!farm) return;

    map.fitBounds(L.latLngBounds(farm.latlngs), { maxZoom: 18 });

    const marker = farmMarkers.get(id);
    if (marker) marker.openPopup();
}

function renderSavedFarms() {
    savedLayer.clearLayers();
    farmMarkers.clear();

    savedFarms.forEach(farm => {
        // Outline is decorative only, so it never blocks drawing or clicks
        L.polygon(farm.latlngs, { ...FARM_STYLE, weight: 2, interactive: false }).addTo(savedLayer);

        const marker = L.marker([farm.lat, farm.lon], {
            icon: pinIcon("saved"),
            zIndexOffset: 300,
            title: farm.name
        }).addTo(savedLayer);

        marker.bindPopup(() => makeFarmPopup(
            farm.name,
            farm.areaM2,
            farm.lat,
            farm.lon,
            [{ label: "Remove", className: "danger-btn", onClick: () => deleteFarm(farm.id) }]
        ));

        farmMarkers.set(farm.id, marker);
    });

    renderPanel();
}

// --- "My Farms" list under the map (created here, no HTML change needed) ---
function buildPanel() {
    savedPanel = document.createElement("section");
    savedPanel.className = "saved-farms";

    const anchor = document.querySelector(".land-information") || $("map");
    anchor.insertAdjacentElement("afterend", savedPanel);
}

function renderPanel() {
    savedPanel.innerHTML = "";

    const heading = document.createElement("h2");
    heading.textContent = `My Farms (${savedFarms.length})`;
    savedPanel.appendChild(heading);

    if (!savedFarms.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No saved farms yet. Draw or search a farm, tap its 🌾 marker, then choose Save Farm.";
        savedPanel.appendChild(empty);
        return;
    }

    const list = document.createElement("ul");

    savedFarms.forEach(farm => {
        const item = document.createElement("li");

        const text = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = "🌾 " + farm.name;
        const area = document.createElement("small");
        area.textContent = formatArea(farm.areaM2);
        text.append(name, area);

        const actions = document.createElement("div");
        actions.className = "farm-actions";

        const locate = document.createElement("button");
        locate.type = "button";
        locate.className = "secondary-btn";
        locate.textContent = "Locate";
        locate.addEventListener("click", () => focusFarm(farm.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger-btn";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteFarm(farm.id));

        actions.append(locate, remove);
        item.append(text, actions);
        list.appendChild(item);
    });

    savedPanel.appendChild(list);
}

// "Save Farm" button next to the existing farm buttons
const buttonRow = document.querySelector(".button-row");

if (buttonRow) {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.id = "saveFarmBtn";
    saveBtn.className = "secondary-btn";
    saveBtn.textContent = "💾 Save Farm";
    saveBtn.addEventListener("click", saveCurrentFarm);
    buttonRow.appendChild(saveBtn);
}

// ===== INIT SAVED FARMS =====
savedFarms = readFarms();
buildPanel();
renderSavedFarms();