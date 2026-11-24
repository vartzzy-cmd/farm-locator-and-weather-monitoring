// ===== CONFIG =====
// Paste your NEW OpenWeatherMap key here (regenerate the one you shared earlier).
const API_KEY = "465cfc1c39c3063f3f40345b771dbafe";

const DEFAULT_LAT = 8.541;
const DEFAULT_LON = 124.872;

// ===== MAP SETUP =====
const weatherMap = L.map("weatherMap").setView([DEFAULT_LAT, DEFAULT_LON], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(weatherMap);

let weatherMarker = null;
let currentRequest = 0;
let lastNominatimCall = 0;

// ===== ELEMENTS =====
const locationName = document.getElementById("weatherLocationName");
const coordinates = document.getElementById("weatherCoordinates");
const weatherResult = document.getElementById("weatherResult");

const cityInput = document.getElementById("cityInput");
const weatherSearchBtn = document.getElementById("weatherSearchBtn");
const currentWeatherBtn = document.getElementById("currentWeatherBtn");

// ===== HELPERS =====
function showNotice(icon, title, message) {
    weatherResult.innerHTML = `
        <div class="weather-placeholder">
            <span>${icon}</span>
            <h3>${title}</h3>
            <p>${message}</p>
        </div>
    `;
}

// Nominatim allows about 1 request per second, so space calls out.
async function throttleNominatim() {
    const minGap = 1100;
    const wait = Math.max(0, minGap - (Date.now() - lastNominatimCall));
    lastNominatimCall = Date.now() + wait;

    if (wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait));
    }
}

function setMarkerLabel(name) {
    if (!weatherMarker) return;

    weatherMarker.unbindTooltip();

    weatherMarker.bindTooltip(name, {
        permanent: true,
        direction: "top",
        offset: [0, -12],
        className: "location-marker-label"
    });

    weatherMarker.openTooltip();
}

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

// ===== LOCATION =====
async function getLocationName(lat, lon) {
    try {
        await throttleNominatim();

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
            { headers: { "Accept-Language": "en" } }
        );

        if (!response.ok) {
            throw new Error("Unable to find location");
        }

        const data = await response.json();
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

    } catch (error) {
        console.error("Location error:", error);
        return "Selected Location";
    }
}

async function setWeatherMarker(lat, lon) {
    const position = [lat, lon];

    if (!weatherMarker) {
        weatherMarker = L.marker(position, { draggable: true }).addTo(weatherMap);

        weatherMarker.on("dragend", function () {
            const newPosition = weatherMarker.getLatLng();
            updateWeatherLocation(newPosition.lat, newPosition.lng);
        });
    } else {
        weatherMarker.setLatLng(position);
    }

    weatherMap.setView(position, 14);

    await updateWeatherLocation(lat, lon);
}

async function updateWeatherLocation(lat, lon) {
    const requestId = ++currentRequest;

    coordinates.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    locationName.textContent = "Finding location...";
    setMarkerLabel("Finding location...");

    // Load weather right away; it only needs coordinates.
    loadWeather(lat, lon, requestId);

    const placeName = await getLocationName(lat, lon);

    if (requestId !== currentRequest) return;

    locationName.textContent = placeName;
    setMarkerLabel(placeName);
}

// ===== WEATHER =====
async function loadWeather(lat, lon, requestId) {
    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        showNotice(
            "🔑",
            "API Key Required",
            "Please add your OpenWeatherMap API key inside weather.js."
        );
        return;
    }

    showNotice(
        "🌤️",
        "Loading Weather...",
        "Getting weather information for your selected location."
    );

    try {
        const currentURL =
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

        const forecastURL =
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

        const [currentResponse, forecastResponse] = await Promise.all([
            fetch(currentURL),
            fetch(forecastURL)
        ]);

        if (currentResponse.status === 401 || forecastResponse.status === 401) {
            throw new Error("INVALID_KEY");
        }

        if (!currentResponse.ok || !forecastResponse.ok) {
            throw new Error("Weather data unavailable");
        }

        const currentData = await currentResponse.json();
        const forecastData = await forecastResponse.json();

        if (requestId !== currentRequest) return;

        displayWeather(currentData, forecastData);

    } catch (error) {
        console.error("Weather error:", error);

        if (requestId !== currentRequest) return;

        if (error.message === "INVALID_KEY") {
            showNotice(
                "🔑",
                "Invalid API Key",
                "The key was rejected. Check it for typos. New keys can take up to a couple of hours to activate."
            );
        } else {
            showNotice(
                "⚠️",
                "Weather Unavailable",
                "Please check your internet connection and try again."
            );
        }
    }
}

function displayWeather(current, forecast) {
    const temperature = Math.round(current.main.temp);
    const feelsLike = Math.round(current.main.feels_like);
    const humidity = current.main.humidity;
    const wind = current.wind.speed;
    const condition = current.weather[0].description;

    const icon = getWeatherIcon(current.weather[0].main);

    // 8 items x 3-hour steps = next 24 hours
    const forecastItems = forecast.list.slice(0, 8);

    const rainForecast = forecastItems.find(item =>
        item.pop >= 0.4 ||
        ["Rain", "Thunderstorm", "Drizzle"].includes(item.weather[0].main)
    );

    const rainChance = rainForecast
        ? Math.round(rainForecast.pop * 100)
        : Math.round(Math.max(...forecastItems.map(item => item.pop)) * 100);

    let rainMessage;

    if (rainChance >= 70) {
        rainMessage = "High chance of rain in the next 24 hours. Prepare for possible rainfall.";
    } else if (rainChance >= 40) {
        rainMessage = "There may be a chance of rain in the next 24 hours. Monitor the weather before doing outdoor farm activities.";
    } else {
        rainMessage = "Low forecast probability of rain in the next 24 hours. Continue monitoring local conditions.";
    }

    const forecastHTML = forecastItems.map(item => {
        const date = new Date(item.dt * 1000);

        const time = date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
        });

        const day = date.toLocaleDateString("en-US", { weekday: "short" });

        const forecastIcon = getWeatherIcon(item.weather[0].main);

        return `
            <div class="forecast-item">
                <span>${day} ${time}</span>
                <strong>${forecastIcon}</strong>
                <b>${Math.round(item.main.temp)}°C</b>
                <small>${Math.round(item.pop * 100)}% rain</small>
            </div>
        `;
    }).join("");

    weatherResult.innerHTML = `
        <div class="weather-card">

            <div class="weather-icon">${icon}</div>

            <div class="temperature">${temperature}°C</div>

            <p class="weather-description">${condition}</p>

            <div class="weather-details">

                <div class="weather-detail">
                    <span>🌡️</span>
                    <h4>Feels Like</h4>
                    <p>${feelsLike}°C</p>
                </div>

                <div class="weather-detail">
                    <span>💧</span>
                    <h4>Humidity</h4>
                    <p>${humidity}%</p>
                </div>

                <div class="weather-detail">
                    <span>💨</span>
                    <h4>Wind Speed</h4>
                    <p>${wind} m/s</p>
                </div>

                <div class="weather-detail">
                    <span>🌧️</span>
                    <h4>Rain Probability</h4>
                    <p>${rainChance}%</p>
                </div>

            </div>

            <div class="rain-prediction">
                <h3>🌦️ Rain Prediction</h3>
                <p>${rainMessage}</p>
                <p>Forecast probability is an estimate, not a guarantee.</p>
            </div>

            <div class="forecast-container">

                <h3>Upcoming Forecast</h3>

                <p class="forecast-subtitle">
                    Weather forecast for the next 24 hours (3-hour steps)
                </p>

                <div class="forecast-grid">
                    ${forecastHTML}
                </div>

            </div>

        </div>
    `;
}

// ===== SEARCH & GEOLOCATION =====
async function searchLocation() {
    const query = cityInput.value.trim();

    if (!query) {
        showNotice("🔍", "Enter a Location", "Please type a place name to search.");
        return;
    }

    weatherSearchBtn.disabled = true;
    weatherSearchBtn.textContent = "Searching...";

    try {
        await throttleNominatim();

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
            { headers: { "Accept-Language": "en" } }
        );

        if (!response.ok) {
            throw new Error("Search request failed");
        }

        const results = await response.json();

        if (!results.length) {
            showNotice("📍", "Location Not Found", "Please try another search.");
            return;
        }

        const place = results[0];

        await setWeatherMarker(Number(place.lat), Number(place.lon));

    } catch (error) {
        console.error("Search error:", error);
        showNotice("⚠️", "Search Failed", "Unable to search location. Please try again.");
    } finally {
        weatherSearchBtn.disabled = false;
        weatherSearchBtn.textContent = "Search";
    }
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        showNotice("📍", "Not Supported", "Your browser does not support location services.");
        return;
    }

    currentWeatherBtn.disabled = true;
    currentWeatherBtn.textContent = "Getting Location...";

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            await setWeatherMarker(
                position.coords.latitude,
                position.coords.longitude
            );

            currentWeatherBtn.disabled = false;
            currentWeatherBtn.textContent = "My Location";
        },
        function () {
            showNotice(
                "📍",
                "Location Unavailable",
                "Unable to get your current location. Please allow location access."
            );

            currentWeatherBtn.disabled = false;
            currentWeatherBtn.textContent = "My Location";
        },
        {
            enableHighAccuracy: true,
            timeout: 10000
        }
    );
}

// ===== EVENTS =====
weatherMap.on("click", function (event) {
    setWeatherMarker(event.latlng.lat, event.latlng.lng);
});

weatherSearchBtn.addEventListener("click", searchLocation);

cityInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        searchLocation();
    }
});

currentWeatherBtn.addEventListener("click", getCurrentLocation);

// ===== INIT =====
const urlParams = new URLSearchParams(window.location.search);

const farmLat = parseFloat(urlParams.get("lat"));
const farmLon = parseFloat(urlParams.get("lon"));

if (Number.isFinite(farmLat) && Number.isFinite(farmLon)) {
    setWeatherMarker(farmLat, farmLon);
} else {
    setWeatherMarker(DEFAULT_LAT, DEFAULT_LON);
}