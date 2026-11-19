
/* =========================================
   AGRILOCATE
   LAND FARM LOCATOR & WEATHER MONITORING
========================================= */


/* =========================================
   1. OPENWEATHER API KEY
========================================= */

const API_KEY = "YOUR_OPENWEATHER_API_KEY";


/* =========================================
   2. INITIALIZE OPENSTREETMAP
========================================= */

const map = L.map("map").setView([8.541, 124.872], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);


/* =========================================
   3. LAND DRAWING SETUP
========================================= */

const drawnItems = new L.FeatureGroup();

map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({

    draw: {
        polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
                color: "#16834b",
                fillColor: "#49b878",
                fillOpacity: 0.4
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


/* =========================================
   4. LAND VARIABLES
========================================= */

let selectedLand = null;
let landCenter = null;


/* =========================================
   5. CALCULATE LAND AREA
========================================= */

function calculateArea(latlngs) {

    const earthRadius = 6378137;

    let area = 0;

    for (let i = 0; i < latlngs.length; i++) {

        const current = latlngs[i];
        const next = latlngs[(i + 1) % latlngs.length];

        const lat1 = current.lat * Math.PI / 180;
        const lat2 = next.lat * Math.PI / 180;

        const lng1 = current.lng * Math.PI / 180;
        const lng2 = next.lng * Math.PI / 180;

        area += (lng2 - lng1) *
            (2 + Math.sin(lat1) + Math.sin(lat2));

    }

    return Math.abs(
        area * earthRadius * earthRadius / 2
    );

}


/* =========================================
   6. UPDATE LAND INFORMATION
========================================= */

function updateLandInformation(layer) {

    const coordinates = layer.getLatLngs()[0];

    const area = calculateArea(coordinates);

    const hectares = area / 10000;

    landCenter = layer.getBounds().getCenter();

    document.getElementById("landArea").textContent =
        hectares.toFixed(4) + " ha";

    document.getElementById("landMeters").textContent =
        area.toLocaleString("en-US", {
            maximumFractionDigits: 2
        }) + " m²";

    document.getElementById("landStatus").textContent =
        "Selected";

}


/* =========================================
   7. CREATE LAND BOUNDARY
========================================= */

map.on(L.Draw.Event.CREATED, function(event) {

    drawnItems.clearLayers();

    const layer = event.layer;

    drawnItems.addLayer(layer);

    selectedLand = layer;

    updateLandInformation(layer);

    layer.bindPopup("Your selected agricultural land.");

    layer.openPopup();

});


/* =========================================
   8. EDIT LAND BOUNDARY
========================================= */

map.on(L.Draw.Event.EDITED, function() {

    const layers = drawnItems.getLayers();

    if (layers.length > 0) {

        selectedLand = layers[0];

        updateLandInformation(selectedLand);

    }

});


/* =========================================
   9. DELETE LAND BOUNDARY
========================================= */

map.on(L.Draw.Event.DELETED, function() {

    selectedLand = null;
    landCenter = null;

    resetLandInformation();

});


/* =========================================
   10. RESET LAND INFORMATION
========================================= */

function resetLandInformation() {

    document.getElementById("landArea").textContent =
        "0.00 ha";

    document.getElementById("landMeters").textContent =
        "0 m²";

    document.getElementById("landStatus").textContent =
        "Not selected";

}


/* =========================================
   11. CLEAR LAND
========================================= */

document.getElementById("clearLandBtn")
.addEventListener("click", function() {

    drawnItems.clearLayers();

    selectedLand = null;
    landCenter = null;

    resetLandInformation();

    document.getElementById("weatherResult").innerHTML = `
        <div class="weather-icon">🌤️</div>
        <h3>Weather Information</h3>
        <p>Draw your land first, then check its weather.</p>
    `;

});


/* =========================================
   12. SEARCH LOCATION
========================================= */

async function searchLocation() {

    const location = document
        .getElementById("searchLocation")
        .value.trim();

    if (!location) {

        alert("Please enter a location.");

        return;

    }

    const searchBtn = document.getElementById("searchBtn");

    searchBtn.disabled = true;
    searchBtn.textContent = "Searching...";

    try {

        const url =
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Location search failed.");
        }

        const data = await response.json();

        if (data.length === 0) {

            alert("Location not found. Try another search.");

            return;

        }

        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);

        map.setView([lat, lng], 16);

        L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`<b>${escapeHTML(data[0].display_name)}</b>`)
            .openPopup();

    } catch (error) {

        alert(error.message);

    } finally {

        searchBtn.disabled = false;
        searchBtn.textContent = "Search";

    }

}


/* =========================================
   13. LOCATION SEARCH BUTTON
========================================= */

document.getElementById("searchBtn")
.addEventListener("click", searchLocation);

document.getElementById("searchLocation")
.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        searchLocation();
    }

});


/* =========================================
   14. CURRENT LOCATION
========================================= */

function getMyLocation() {

    if (!navigator.geolocation) {

        alert("Geolocation is not supported by your browser.");

        return;

    }

    navigator.geolocation.getCurrentPosition(

        function(position) {

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            map.setView([lat, lng], 17);

            L.marker([lat, lng])
                .addTo(map)
                .bindPopup("Your Current Location")
                .openPopup();

        },

        function() {

            alert(
                "Unable to access your location. Please allow location permission."
            );

        }

    );

}

document.getElementById("myLocationBtn")
.addEventListener("click", getMyLocation);


/* =========================================
   15. WEATHER ICON
========================================= */

function getWeatherIcon(condition) {

    const icons = {

        Clear: "☀️",
        Clouds: "☁️",
        Rain: "🌧️",
        Drizzle: "🌦️",
        Thunderstorm: "⛈️",
        Snow: "❄️",
        Mist: "🌫️",
        Fog: "🌫️",
        Haze: "🌫️"

    };

    return icons[condition] || "🌤️";

}


/* =========================================
   16. DISPLAY WEATHER
========================================= */

function displayWeather(data) {

    const result = document.getElementById("weatherResult");

    const temperature = Math.round(data.main.temp);
    const humidity = data.main.humidity;
    const wind = data.wind.speed;
    const feelsLike = Math.round(data.main.feels_like);

    const description = data.weather[0].description;

    const icon = getWeatherIcon(data.weather[0].main);

    result.innerHTML = `

        <div class="weather-icon">${icon}</div>

        <h3>${escapeHTML(data.name || "Selected Land")}</h3>

        <div class="weather-temperature">
            ${temperature}°C
        </div>

        <p>${escapeHTML(description)}</p>

        <div class="weather-details">

            <div>
                <span>HUMIDITY</span>
                <strong>${humidity}%</strong>
            </div>

            <div>
                <span>WIND SPEED</span>
                <strong>${wind} m/s</strong>
            </div>

            <div>
                <span>FEELS LIKE</span>
                <strong>${feelsLike}°C</strong>
            </div>

        </div>

    `;

}


/* =========================================
   17. GET WEATHER USING COORDINATES
========================================= */

async function getWeatherByCoordinates(lat, lon) {

    if (!API_KEY || API_KEY === "YOUR_OPENWEATHER_API_KEY") {

        alert("Please add your OpenWeather API key in script.js.");

        return;

    }

    const result = document.getElementById("weatherResult");

    result.innerHTML = "<p>Loading weather information...</p>";

    try {

        const url =
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {

            throw new Error(data.message || "Weather request failed.");

        }

        displayWeather(data);

    } catch (error) {

        result.innerHTML = `
            <p>Unable to retrieve weather information.</p>
            <p>${escapeHTML(error.message)}</p>
        `;

    }

}


/* =========================================
   18. WEATHER SEARCH BY CITY
========================================= */

async function getWeather() {

    const city = document
        .getElementById("cityInput")
        .value.trim();

    if (!city) {

        alert("Please enter a city or municipality.");

        return;

    }

    if (!API_KEY || API_KEY === "YOUR_OPENWEATHER_API_KEY") {

        alert("Please add your OpenWeather API key in script.js.");

        return;

    }

    const result = document.getElementById("weatherResult");

    result.innerHTML = "<p>Searching weather information...</p>";

    try {

        const url =
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;

        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {

            throw new Error(data.message || "City not found.");

        }

        displayWeather(data);

    } catch (error) {

        result.innerHTML = `
            <p>Unable to retrieve weather information.</p>
            <p>${escapeHTML(error.message)}</p>
        `;

    }

}


/* =========================================
   19. WEATHER SEARCH BUTTON
========================================= */

document.getElementById("weatherSearchBtn")
.addEventListener("click", getWeather);

document.getElementById("cityInput")
.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        getWeather();
    }

});


/* =========================================
   20. WEATHER OF SELECTED LAND
========================================= */

document.getElementById("weatherLandBtn")
.addEventListener("click", function() {

    if (!selectedLand || !landCenter) {

        alert("Please draw your land on the map first.");

        return;

    }

    const lat = landCenter.lat;
    const lon = landCenter.lng;

    getWeatherByCoordinates(lat, lon);

    document.getElementById("weather-section")
        .scrollIntoView({ behavior: "smooth" });

});


/* =========================================
   21. ESCAPE HTML
========================================= */

function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, function(character) {

        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[character];

    });

}
