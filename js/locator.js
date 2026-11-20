
const map = L.map("map").setView([8.541, 124.872], 13);

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
            shapeOptions: {
                color: "#1c7c45",
                fillColor: "#36a65c",
                fillOpacity: 0.3
            }
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

let weatherMarker = null;
let selectedLand = null;
let landCenter = null;
let drawingActive = false;
let locationRequest = 0;

map.on("draw:drawstart", function() {
    drawingActive = true;
});

map.on("draw:drawstop", function() {
    drawingActive = false;
});

map.on("draw:editstart", function() {
    drawingActive = true;
});

map.on("draw:editstop", function() {
    drawingActive = false;
});

map.on("draw:deletestart", function() {
    drawingActive = true;
});

map.on("draw:deletestop", function() {
    drawingActive = false;
});

/* FARM AREA */

function calculateArea(latlngs) {
    const radius = 6378137;
    let area = 0;

    for (let i = 0; i < latlngs.length; i++) {
        const point1 = latlngs[i];
        const point2 = latlngs[(i + 1) % latlngs.length];

        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const lon1 = point1.lng * Math.PI / 180;
        const lon2 = point2.lng * Math.PI / 180;

        area += (lon2 - lon1) *
            (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    return Math.abs(area * radius * radius / 2);
}

function updateLandInformation(layer) {
    const latlngs = layer.getLatLngs()[0];

    if (!latlngs || latlngs.length < 3) {
        return;
    }

    const area = calculateArea(latlngs);

    document.getElementById("landArea").textContent =
        (area / 10000).toFixed(4) + " ha";

    document.getElementById("landMeters").textContent =
        area.toFixed(2) + " m²";

    document.getElementById("landStatus").textContent = "Selected";

    selectedLand = layer;
    landCenter = layer.getBounds().getCenter();
}

function resetLandInformation() {
    document.getElementById("landArea").textContent = "0.00 ha";
    document.getElementById("landMeters").textContent = "0 m²";
    document.getElementById("landStatus").textContent = "No Land Selected";

    selectedLand = null;
    landCenter = null;
}

map.on(L.Draw.Event.CREATED, function(event) {
    drawnItems.clearLayers();

    selectedLand = null;
    landCenter = null;

    const layer = event.layer;
    drawnItems.addLayer(layer);

    updateLandInformation(layer);
});

map.on(L.Draw.Event.EDITED, function(event) {
    event.layers.eachLayer(function(layer) {
        updateLandInformation(layer);
    });
});

map.on(L.Draw.Event.DELETED, function() {
    resetLandInformation();
});

/* LOCATION MARKER */

map.on("click", function(event) {
    if (drawingActive) {
        return;
    }

    setWeatherMarker(event.latlng.lat, event.latlng.lng);
});

function setWeatherMarker(lat, lon) {
    if (weatherMarker) {
        weatherMarker.setLatLng([lat, lon]);
    } else {
        weatherMarker = L.marker([lat, lon], {
            draggable: true,
            autoPan: true
        }).addTo(map);
    }

    weatherMarker.bindPopup("Selected location").openPopup();

    updateSelectedLocation(lat, lon);

    weatherMarker.off("dragend");

    weatherMarker.on("dragend", function() {
        const position = weatherMarker.getLatLng();

        updateSelectedLocation(position.lat, position.lng);
    });
}

async function updateSelectedLocation(lat, lon) {
    const requestId = ++locationRequest;

    document.getElementById("selectedLocationName").textContent =
        "Loading location...";

    document.getElementById("selectedCoordinates").textContent =
        `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    document.getElementById("viewSelectedWeather").disabled = true;

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
        );

        const data = await response.json();

        if (requestId !== locationRequest) {
            return;
        }

        const address = data.address || {};

        const placeName =
            address.village ||
            address.town ||
            address.city ||
            address.municipality ||
            address.county ||
            address.suburb ||
            data.name ||
            "Selected Location";

        document.getElementById("selectedLocationName").textContent =
            "📍 " + placeName;

    } catch (error) {
        if (requestId !== locationRequest) {
            return;
        }

        document.getElementById("selectedLocationName").textContent =
            "📍 Selected Location";
    }

    if (requestId === locationRequest) {
        document.getElementById("viewSelectedWeather").disabled = false;
    }
}

/* LOCATION SEARCH */

document.getElementById("searchBtn").addEventListener("click", searchLocation);

document.getElementById("searchLocation").addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        searchLocation();
    }
});

async function searchLocation() {
    const query = document.getElementById("searchLocation").value.trim();

    if (!query) {
        alert("Please enter a location.");
        return;
    }

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`
        );

        const results = await response.json();

        if (!results.length) {
            alert("Location not found.");
            return;
        }

        const lat = Number(results[0].lat);
        const lon = Number(results[0].lon);

        map.setView([lat, lon], 16);
        setWeatherMarker(lat, lon);

    } catch (error) {
        alert("Unable to search for this location.");
    }
}

/* CURRENT LOCATION */

document.getElementById("myLocationBtn").addEventListener("click", function() {
    if (!navigator.geolocation) {
        alert("Your browser does not support location services.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            map.setView([lat, lon], 17);
            setWeatherMarker(lat, lon);
        },
        function() {
            alert("Unable to access your location. Please allow location permission.");
        }
    );
});

/* OPEN WEATHER PAGE */

function openWeatherPage(lat, lon) {
    window.location.href =
        `weather.html?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
}

document.getElementById("viewSelectedWeather").addEventListener("click", function() {
    if (!weatherMarker) {
        return;
    }

    const position = weatherMarker.getLatLng();

    openWeatherPage(position.lat, position.lng);
});

document.getElementById("weatherLandBtn").addEventListener("click", function() {
    if (!selectedLand || !landCenter) {
        alert("Please draw your farm boundary first.");
        return;
    }

    openWeatherPage(landCenter.lat, landCenter.lng);
});

/* CLEAR FARM */

document.getElementById("clearLandBtn").addEventListener("click", function() {
    drawnItems.clearLayers();
    resetLandInformation();
});
