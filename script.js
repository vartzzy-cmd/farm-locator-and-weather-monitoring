
"use strict";

// =====================================
// 1. CITY LOCATIONS
// =====================================

const cities = [
    { name: "Manila", lat: 14.5995, lon: 120.9842 },
    { name: "Cebu City", lat: 10.3157, lon: 123.8854 },
    { name: "Davao City", lat: 7.1907, lon: 125.4553 },
    { name: "Cagayan de Oro", lat: 8.4542, lon: 124.6319 },
    { name: "Malaybalay", lat: 8.1575, lon: 125.1278 }
];

// =====================================
// 2. HTML ELEMENTS
// =====================================

const apiKeyInput = document.getElementById("apiKey");
const status = document.getElementById("status");
const weatherDetails = document.getElementById("weatherDetails");
const toggleKey = document.getElementById("toggleKey");

// =====================================
// 3. INITIALIZE MAP
// =====================================

const map = L.map("map").setView([11.2, 123], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// =====================================
// 4. WEATHER CACHE
// =====================================

const weatherCache = new Map();
const boundaryCache = new Map();

const CACHE_TIME = 10 * 60 * 1000;

let activeWeatherRequest = 0;
let activeBoundaryRequest = 0;

let highlightedArea = null;
let movingMarker = null;

// =====================================
// 5. STATUS
// =====================================

function setStatus(message) {
    status.textContent = message;
}

// =====================================
// 6. CREATE TEXT ELEMENT
// =====================================

function textElement(tag, content, className = "") {

    const element = document.createElement(tag);

    element.textContent = content;

    if (className) {
        element.className = className;
    }

    return element;
}

// =====================================
// 7. WEATHER SYMBOLS
// =====================================

function getWeatherIcon(data) {

    const id = data.weather?.[0]?.id;

    // Thunderstorm
    if (id >= 200 && id < 300) {
        return "⛈️";
    }

    // Drizzle / Ambon
    if (id >= 300 && id < 400) {
        return "🌦️";
    }

    // Rain
    if (id >= 500 && id < 600) {
        return "🌧️";
    }

    // Snow
    if (id >= 600 && id < 700) {
        return "❄️";
    }

    // Fog / Mist
    if (id >= 700 && id < 800) {
        return "🌫️";
    }

    // Sunny
    if (id === 800) {
        return "☀️";
    }

    // Cloudy
    if (id > 800 && id < 900) {
        return "☁️";
    }

    return "🌤️";
}

// =====================================
// 8. DISPLAY WEATHER
// =====================================

function weatherView(cityName, data) {

    const card = document.createElement("div");
    card.className = "weather-card";

    const symbol = textElement(
        "div",
        getWeatherIcon(data),
        "weather-symbol"
    );

    const info = document.createElement("div");

    info.append(
        textElement("strong", cityName)
    );

    info.append(
        textElement(
            "div",
            data.weather?.[0]?.description ?? "Not available",
            "weather-description"
        )
    );

    info.append(
        textElement(
            "h1",
            `${data.main.temp.toFixed(1)}°C`
        )
    );

    const details = document.createElement("div");
    details.className = "weather-info";

    function addDetail(label, value) {

        const item = document.createElement("div");

        item.append(
            textElement("span", label)
        );

        item.append(
            textElement("strong", value)
        );

        details.append(item);
    }

    addDetail(
        "🌡️ Feels Like",
        `${data.main.feels_like.toFixed(1)}°C`
    );

    addDetail(
        "💧 Humidity",
        `${data.main.humidity}%`
    );

    addDetail(
        "💨 Wind Speed",
        `${data.wind?.speed ?? "N/A"} m/s`
    );

    addDetail(
        "☁️ Cloudiness",
        `${data.clouds?.all ?? "N/A"}%`
    );

    info.append(details);
    card.append(symbol, info);

    return card;
}

// =====================================
// 9. GET WEATHER FROM OPENWEATHER
// =====================================

async function getCurrentWeather(city) {

    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        throw new Error("Please enter your OpenWeather API key.");
    }

    const cacheKey = `${city.lat},${city.lon}|${apiKey}`;

    const saved = weatherCache.get(cacheKey);

    if (saved && Date.now() - saved.time < CACHE_TIME) {
        return saved.data;
    }

    const url = new URL(
        "https://api.openweathermap.org/data/2.5/weather"
    );

    url.searchParams.set("lat", city.lat);
    url.searchParams.set("lon", city.lon);
    url.searchParams.set("units", "metric");
    url.searchParams.set("appid", apiKey);

    const response = await fetch(url);

    if (!response.ok) {

        if (response.status === 401) {
            throw new Error("Invalid API key.");
        }

        if (response.status === 429) {
            throw new Error("API request limit reached.");
        }

        throw new Error(
            `Weather request failed: HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (!data.main || typeof data.main.temp !== "number") {
        throw new Error("Weather information unavailable.");
    }

    weatherCache.set(cacheKey, {
        time: Date.now(),
        data
    });

    return data;
}

// =====================================
// 10. SHOW WEATHER
// =====================================

async function showWeather(city, marker) {

    const requestId = ++activeWeatherRequest;

    setStatus(`Loading weather for ${city.name}...`);

    weatherDetails.textContent = "Loading weather...";

    marker.bindPopup(
        `${city.name}: Loading weather...`
    ).openPopup();

    try {

        const data = await getCurrentWeather(city);

        if (requestId !== activeWeatherRequest) return;

        weatherDetails.replaceChildren(
            weatherView(city.name, data)
        );

        const popup = document.createElement("div");

        popup.append(
            textElement("strong", city.name)
        );

        popup.append(
            textElement(
                "p",
                `${getWeatherIcon(data)} ${data.main.temp.toFixed(1)}°C`
            )
        );

        popup.append(
            textElement(
                "p",
                data.weather?.[0]?.description ?? "Current weather"
            )
        );

        popup.append(
            textElement(
                "p",
                `Humidity: ${data.main.humidity}%`
            )
        );

        marker.bindPopup(popup).openPopup();

        setStatus(`Showing current weather for ${city.name}.`);

    } catch (error) {

        if (requestId !== activeWeatherRequest) return;

        weatherDetails.textContent = error.message;

        marker.bindPopup(
            `${city.name}: Weather unavailable.`
        ).openPopup();

        setStatus(error.message);
    }
}

// =====================================
// 11. NOMINATIM REQUEST RATE LIMIT
// =====================================

// Keep requests at least 1 second apart.

let nextGeoRequest = 0;

async function geoRequest(url) {

    const wait = Math.max(
        0,
        nextGeoRequest - Date.now()
    );

    if (wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait));
    }

    nextGeoRequest = Date.now() + 1100;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Location boundary service unavailable.");
    }

    return response.json();
}

// =====================================
// 12. FIND AND HIGHLIGHT CITY BOUNDARY
// =====================================

async function highlightPlace(cityName) {

    const requestId = ++activeBoundaryRequest;

    if (highlightedArea) {
        map.removeLayer(highlightedArea);
        highlightedArea = null;
    }

    setStatus(`Finding boundary of ${cityName}...`);

    try {

        let place = boundaryCache.get(cityName);

        if (!place) {

            const url = new URL(
                "https://nominatim.openstreetmap.org/search"
            );

            url.searchParams.set(
                "q",
                `${cityName}, Philippines`
            );

            url.searchParams.set("format", "jsonv2");
            url.searchParams.set("polygon_geojson", "1");
            url.searchParams.set("limit", "10");

            const results = await geoRequest(url);

            place = results.find(item => {

                const type = item.geojson?.type;

                const isPolygon =
                    type === "Polygon" ||
                    type === "MultiPolygon";

                const isAdministrative =
                    item.class === "boundary" ||
                    item.type === "administrative";

                return isPolygon && isAdministrative;
            });

            if (!place) {
                throw new Error(
                    `No administrative boundary found for ${cityName}.`
                );
            }

            boundaryCache.set(cityName, place);
        }

        if (requestId !== activeBoundaryRequest) return;

        // Draw actual boundary
        highlightedArea = L.geoJSON(place.geojson, {

            style: {
                color: "#ff8c00",
                weight: 4,
                opacity: 1,
                fillColor: "#ff8c00",
                fillOpacity: 0.30,
                className: "selected-area"
            }

        }).addTo(map);

        // Show whole highlighted area
        map.fitBounds(
            highlightedArea.getBounds(),
            {
                padding: [30, 30],
                maxZoom: 11
            }
        );

        setStatus(`${cityName} boundary highlighted!`);

    } catch (error) {

        if (requestId !== activeBoundaryRequest) return;

        setStatus(error.message);
    }
}

// =====================================
// 13. REVERSE GEOCODE CUSTOM LOCATION
// =====================================

async function findSelectedArea(lat, lon) {

    const requestId = activeBoundaryRequest;

    try {

        const url = new URL(
            "https://nominatim.openstreetmap.org/reverse"
        );

        url.searchParams.set("lat", lat);
        url.searchParams.set("lon", lon);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("zoom", "10");
        url.searchParams.set("addressdetails", "1");

        const result = await geoRequest(url);

        if (requestId !== activeBoundaryRequest) return;

        const address = result.address || {};

        const areaName =
            address.city ||
            address.municipality ||
            address.town ||
            address.county ||
            address.state_district;

        if (areaName) {
            await highlightPlace(areaName);
        } else {
            setStatus(
                "Location identified, but no city boundary was found."
            );
        }

    } catch (error) {

        if (requestId !== activeBoundaryRequest) return;

        setStatus(error.message);
    }
}

// =====================================
// 14. CITY MARKERS
// =====================================

const markers = {};

cities.forEach(city => {

    const marker = L.marker([
        city.lat,
        city.lon
    ]).addTo(map);

    marker.bindTooltip(city.name);

    marker.on("click", () => {

        // Highlight city boundary
        highlightPlace(city.name);

        // Show city weather
        showWeather(city, marker);

    });

    markers[city.name] = marker;

});

// =====================================
// 15. MOVABLE MARKER
// =====================================

movingMarker = L.marker(
    [11.2, 123.0]
).addTo(map);

movingMarker.bindTooltip("Selected Location");

// =====================================
// 16. CLICK ANYWHERE ON MAP
// =====================================

map.on("click", async function(e) {

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Move marker
    movingMarker.setLatLng(e.latlng);

    // Coordinates
    const selectedLocation = {
        name: "Selected Location",
        lat: lat,
        lon: lon
    };

    // Show clicked location
    movingMarker.bindPopup(
        `Selected Location<br>
        Latitude: ${lat.toFixed(4)}<br>
        Longitude: ${lon.toFixed(4)}`
    ).openPopup();

    // Load weather
    showWeather(selectedLocation, movingMarker);

    // Find and highlight actual administrative area
    await findSelectedArea(lat, lon);

});

// =====================================
// 17. SHOW / HIDE API KEY
// =====================================

toggleKey.addEventListener("click", function() {

    const hidden = apiKeyInput.type === "password";

    apiKeyInput.type = hidden ? "text" : "password";

    this.textContent = hidden ? "Hide" : "Show";

});

// =====================================
// 18. LOAD DEFAULT MANILA WEATHER
// =====================================

function autoLoadWeather() {

    const manila = cities.find(
        city => city.name === "Manila"
    );

    if (!manila) return;

    showWeather(manila, markers.Manila);

    highlightPlace("Manila");
}

// =====================================
// 19. API KEY EVENTS
// =====================================

apiKeyInput.addEventListener("change", () => {

    if (apiKeyInput.value.trim()) {
        autoLoadWeather();
    }

});

// =====================================
// 20. INITIAL STATUS
// =====================================

window.addEventListener("load", () => {

    if (apiKeyInput.value.trim()) {
        autoLoadWeather();
    } else {
        setStatus(
            "Enter your OpenWeather API key to begin."
        );
    }

});

/* =====================================
   LOCATION SEARCH FUNCTION
===================================== */

const placeSearch = document.getElementById("placeSearch");
const searchButton = document.getElementById("searchButton");
const searchResults = document.getElementById("searchResults");

// Search places
async function searchLocation() {

    const query = placeSearch.value.trim();

    if (!query) {
        searchResults.textContent = "Please enter a location.";
        return;
    }

    searchResults.replaceChildren();

    const loading = document.createElement("p");
    loading.className = "search-message";
    loading.textContent = "🔍 Searching location...";
    searchResults.append(loading);

    try {

        const url = new URL(
            "https://nominatim.openstreetmap.org/search"
        );

        url.searchParams.set("q", query);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("polygon_geojson", "1");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "5");

        const response = await geoRequest(url);

        searchResults.replaceChildren();

        if (!response.length) {

            searchResults.textContent = "No location found.";

            return;
        }

        // Display search results
        response.forEach(place => {

            const button = document.createElement("button");

            button.type = "button";
            button.className = "search-result";

            button.textContent = "📍 " + place.display_name;

            button.addEventListener("click", () => {
                selectSearchedLocation(place);
            });

            searchResults.append(button);

        });

    } catch (error) {

        searchResults.textContent = error.message;

    }
}

// =====================================
// SELECT SEARCHED LOCATION
// =====================================

async function selectSearchedLocation(place) {

    const lat = Number(place.lat);
    const lon = Number(place.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setStatus("Invalid location coordinates.");
        return;
    }

    // Invalidate previous boundary and weather requests
    activeBoundaryRequest++;
    const boundaryRequestId = activeBoundaryRequest;

    // Remove previous highlighted area
    if (highlightedArea) {
        map.removeLayer(highlightedArea);
        highlightedArea = null;
    }

    // Move marker
    movingMarker.setLatLng([lat, lon]);

    // Move map to searched place
    map.flyTo([lat, lon], 11, {
        duration: 1.5
    });

    // Display popup
    movingMarker.bindPopup(
        `<b>📍 ${place.display_name}</b>`
    ).openPopup();

    // Get weather
    const selectedLocation = {
        name: place.name || "Selected Location",
        lat: lat,
        lon: lon
    };

    showWeather(selectedLocation, movingMarker);

    // Highlight actual boundary when available
    const geometry = place.geojson;

    if (
        geometry &&
        (
            geometry.type === "Polygon" ||
            geometry.type === "MultiPolygon"
        )
    ) {

        highlightedArea = L.geoJSON(geometry, {

            style: {
                color: "#ff8c00",
                weight: 4,
                opacity: 1,
                fillColor: "#ff8c00",
                fillOpacity: 0.30,
                className: "selected-area"
            }

        }).addTo(map);

        if (boundaryRequestId === activeBoundaryRequest) {

            map.fitBounds(
                highlightedArea.getBounds(),
                {
                    padding: [30, 30],
                    maxZoom: 12
                }
            );

        }

        setStatus(
            "Highlighted: " + place.display_name
        );

    } else {

        setStatus(
            "Location found! No boundary polygon is available for this place."
        );

    }

    // Clear search results
    searchResults.replaceChildren();

    placeSearch.value = place.display_name;
}

// =====================================
// SEARCH BUTTON
// =====================================

searchButton.addEventListener(
    "click",
    searchLocation
);

// =====================================
// ENTER KEY SEARCH
// =====================================

placeSearch.addEventListener("keydown", event => {

    if (event.key === "Enter") {
        searchLocation();
    }

});
