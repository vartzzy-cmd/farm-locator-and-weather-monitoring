// ===== CONFIG =====
// Paste your NEW OpenWeatherMap key here (regenerate the old one).
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

// ===== ICONS (inline SVG, each with its own color class) =====
const svgIcon = (inner, color = "") =>
    `<svg class="icon ${color}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const CLOUD = `<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/>`;

const ICONS = {
    sun: svgIcon(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`, "ic-sun"),
    cloud: svgIcon(`<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`, "ic-cloud"),
    partly: svgIcon(`<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41"/><path d="M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>`, "ic-partly"),
    rain: svgIcon(`${CLOUD}<path d="M16 14v6M8 14v6M12 16v6"/>`, "ic-rain"),
    drizzle: svgIcon(`${CLOUD}<path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>`, "ic-rain"),
    thunder: svgIcon(`<path d="M6 16.3A5 5 0 0 1 7 6.5h.5A7 7 0 0 1 20 9.5a4.5 4.5 0 0 1-1 8.8"/><path d="m13 12-3 5h4l-3 5"/>`, "ic-thunder"),
    snow: svgIcon(`<path d="M2 12h20M12 2v20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"/>`, "ic-snow"),
    fog: svgIcon(`${CLOUD}<path d="M5 19h14M8 22h8"/>`, "ic-fog"),
    thermometer: svgIcon(`<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0Z"/>`, "ic-temp"),
    droplet: svgIcon(`<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z"/>`, "ic-humidity"),
    wind: svgIcon(`<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>`, "ic-wind"),
    umbrella: svgIcon(`<path d="M22 12a10 10 0 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/>`, "ic-rain"),
    calendar: svgIcon(`<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`, "ic-calendar"),
    flame: svgIcon(`<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>`, "ic-flame"),
    alert: svgIcon(`<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>`, "ic-alert"),
    key: svgIcon(`<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>`, "ic-key"),
    search: svgIcon(`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`, "ic-search"),
    pin: svgIcon(`<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`, "ic-pin")
};

// ===== HELPERS =====
function showNotice(icon, title, message) {
    weatherResult.innerHTML = `
        <div class="weather-placeholder">
            <span class="notice-icon">${icon}</span>
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
        Clear: ICONS.sun,
        Clouds: ICONS.cloud,
        Rain: ICONS.rain,
        Drizzle: ICONS.drizzle,
        Thunderstorm: ICONS.thunder,
        Snow: ICONS.snow,
        Mist: ICONS.fog,
        Fog: ICONS.fog,
        Haze: ICONS.fog
    };

    return icons[condition] || ICONS.partly;
}

// ===== HEAT INDEX =====
// NWS Rothfusz regression (temperature + humidity), returned in °C
function calcHeatIndex(tempC, humidity) {
    const T = tempC * 9 / 5 + 32; // °F
    const RH = humidity;

    // Simple formula for milder conditions
    let hi = 0.5 * (T + 61 + ((T - 68) * 1.2) + (RH * 0.094));

    // Full regression when it is hot enough
    if ((hi + T) / 2 >= 80) {
        hi = -42.379
            + 2.04901523 * T
            + 10.14333127 * RH
            - 0.22475541 * T * RH
            - 0.00683783 * T * T
            - 0.05481717 * RH * RH
            + 0.00122874 * T * T * RH
            + 0.00085282 * T * RH * RH
            - 0.00000199 * T * T * RH * RH;

        if (RH < 13 && T >= 80 && T <= 112) {
            hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
        } else if (RH > 85 && T >= 80 && T <= 87) {
            hi += ((RH - 85) / 10) * ((87 - T) / 5);
        }
    }

    return (hi - 32) * 5 / 9; // back to °C
}

// PAGASA heat index categories (°C)
function getHeatIndexLevel(hiC) {
    if (hiC >= 52) return { label: "Extreme Danger",  cls: "heat-extreme",  advice: "Heat stroke is imminent. Avoid outdoor work." };
    if (hiC >= 42) return { label: "Danger",          cls: "heat-extreme",  advice: "Heat cramps and heat exhaustion are likely. Limit outdoor work." };
    if (hiC >= 33) return { label: "Extreme Caution", cls: "heat-very-hot", advice: "Heat cramps and exhaustion are possible. Rest often and drink water." };
    if (hiC >= 27) return { label: "Caution",         cls: "heat-hot",      advice: "Fatigue is possible with prolonged exposure. Stay hydrated." };
    return                { label: "Normal",          cls: "heat-normal",   advice: "No significant heat risk." };
}

// Temperature color class (°C)
function getTempClass(t) {
    if (t >= 38) return "temp-extreme";
    if (t >= 34) return "temp-very-hot";
    if (t >= 31) return "temp-hot";
    if (t >= 27) return "temp-normal";
    return "temp-cool";
}

// Use the location's own timezone so "today" is correct for the selected place
function localDateKey(unixSeconds, tzOffset) {
    return new Date((unixSeconds + tzOffset) * 1000).toISOString().slice(0, 10);
}

function localTimeLabel(unixSeconds, tzOffset) {
    return new Date((unixSeconds + tzOffset) * 1000).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC"
    });
}

function localDayLabel(unixSeconds, tzOffset) {
    return new Date((unixSeconds + tzOffset) * 1000).toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC"
    });
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
            ICONS.key,
            "API Key Required",
            "Please add your OpenWeatherMap API key inside weather.js."
        );
        return;
    }

    showNotice(
        ICONS.partly,
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
                ICONS.key,
                "Invalid API Key",
                "The key was rejected. Check it for typos. New keys can take up to a couple of hours to activate."
            );
        } else {
            showNotice(
                ICONS.alert,
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

    // Heat index (temperature + humidity)
    const heatIndex = calcHeatIndex(current.main.temp, humidity);
    const heatIndexRounded = Math.round(heatIndex);
    const heatIndexLevel = getHeatIndexLevel(heatIndex);

    // ===== TODAY'S FORECAST =====
    const tz = forecast.city?.timezone ?? current.timezone ?? 0;
    const todayKey = localDateKey(current.dt, tz);

    // Remaining 3-hour slots that still fall on today's date
    const todayItems = forecast.list.filter(
        item => localDateKey(item.dt, tz) === todayKey
    );

    const todayTemps = [current.main.temp, ...todayItems.map(i => i.main.temp)];
    const todayHigh = Math.round(Math.max(...todayTemps));
    const todayLow = Math.round(Math.min(...todayTemps));
    const todayRain = todayItems.length
        ? Math.round(Math.max(...todayItems.map(i => i.pop)) * 100)
        : 0;

    const todayPeakHI = Math.max(
        heatIndex,
        ...todayItems.map(i => calcHeatIndex(i.main.temp, i.main.humidity))
    );
    const todayHI = getHeatIndexLevel(todayPeakHI);

    const todaySlotsHTML = todayItems.length
        ? todayItems.map(item => {
            const hiItem = calcHeatIndex(item.main.temp, item.main.humidity);
            const h = getHeatIndexLevel(hiItem);
            return `
                <div class="forecast-item">
                    <span>${localTimeLabel(item.dt, tz)}</span>
                    <strong>${getWeatherIcon(item.weather[0].main)}</strong>
                    <b class="${getTempClass(item.main.temp)}">${Math.round(item.main.temp)}°C</b>
                    <small class="${h.cls}">HI ${Math.round(hiItem)}°C</small>
                    <small>${Math.round(item.pop * 100)}% rain</small>
                </div>
            `;
        }).join("")
        : `<p class="forecast-subtitle">No more forecast slots for today.</p>`;

    // ===== NEXT 24 HOURS =====
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
        const time = localTimeLabel(item.dt, tz);
        const day = localDayLabel(item.dt, tz);
        const forecastIcon = getWeatherIcon(item.weather[0].main);
        const hiItem = calcHeatIndex(item.main.temp, item.main.humidity);
        const h = getHeatIndexLevel(hiItem);

        return `
            <div class="forecast-item">
                <span>${day} ${time}</span>
                <strong>${forecastIcon}</strong>
                <b class="${getTempClass(item.main.temp)}">${Math.round(item.main.temp)}°C</b>
                <small class="${h.cls}">HI ${Math.round(hiItem)}°C</small>
                <small>${Math.round(item.pop * 100)}% rain</small>
            </div>
        `;
    }).join("");

    weatherResult.innerHTML = `
        <div class="weather-card">

            <div class="weather-icon">${icon}</div>

            <div class="temperature ${getTempClass(current.main.temp)}">${temperature}°C</div>

            <p class="heat-badge ${heatIndexLevel.cls}">${ICONS.thermometer} ${heatIndexLevel.label}</p>

            <p class="weather-description">${condition}</p>

            <div class="today-summary">
                <h3>${ICONS.calendar} Today's Forecast</h3>

                <div class="today-stats">
                    <div><span>High</span><b>${todayHigh}°C</b></div>
                    <div><span>Low</span><b>${todayLow}°C</b></div>
                    <div><span>Rain</span><b>${todayRain}%</b></div>
                    <div><span>Peak HI</span><b class="${todayHI.cls}">${Math.round(todayPeakHI)}°C</b></div>
                </div>

                <div class="forecast-grid">
                    ${todaySlotsHTML}
                </div>
            </div>

            <div class="weather-details">

                <div class="weather-detail">
                    <span>${ICONS.thermometer}</span>
                    <h4>Feels Like</h4>
                    <p>${feelsLike}°C</p>
                </div>

                <div class="weather-detail">
                    <span>${ICONS.flame}</span>
                    <h4>Heat Index</h4>
                    <p>${heatIndexRounded}°C <small class="${heatIndexLevel.cls}">${heatIndexLevel.label}</small></p>
                </div>

                <div class="weather-detail">
                    <span>${ICONS.droplet}</span>
                    <h4>Humidity</h4>
                    <p>${humidity}%</p>
                </div>

                <div class="weather-detail">
                    <span>${ICONS.wind}</span>
                    <h4>Wind Speed</h4>
                    <p>${wind} m/s</p>
                </div>

                <div class="weather-detail">
                    <span>${ICONS.umbrella}</span>
                    <h4>Rain Probability</h4>
                    <p>${rainChance}%</p>
                </div>

            </div>

            <div class="rain-prediction">
                <h3>${ICONS.umbrella} Rain Prediction</h3>
                <p>${rainMessage}</p>
                <p>Forecast probability is an estimate, not a guarantee.</p>
            </div>

            <div class="rain-prediction">
                <h3>${ICONS.flame} Heat Advisory</h3>
                <p>Heat Index: ${heatIndexRounded}°C (${heatIndexLevel.label})</p>
                <p>${heatIndexLevel.advice}</p>
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
        showNotice(ICONS.search, "Enter a Location", "Please type a place name to search.");
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
            showNotice(ICONS.pin, "Location Not Found", "Please try another search.");
            return;
        }

        const place = results[0];

        await setWeatherMarker(Number(place.lat), Number(place.lon));

    } catch (error) {
        console.error("Search error:", error);
        showNotice(ICONS.alert, "Search Failed", "Unable to search location. Please try again.");
    } finally {
        weatherSearchBtn.disabled = false;
        weatherSearchBtn.textContent = "Search";
    }
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        showNotice(ICONS.pin, "Not Supported", "Your browser does not support location services.");
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
                ICONS.pin,
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