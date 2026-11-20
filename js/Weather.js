
const API_KEY = "465cfc1c39c3063f3f40345b771dbafe";

const DEFAULT_LAT = 8.541;
const DEFAULT_LON = 124.872;

const weatherMap = L.map("weatherMap").setView(
    [DEFAULT_LAT, DEFAULT_LON],
    13
);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(weatherMap);

let weatherMarker = null;
let currentRequest = 0;

const locationName = document.getElementById("weatherLocationName");
const coordinates = document.getElementById("weatherCoordinates");
const weatherResult = document.getElementById("weatherResult");

const cityInput = document.getElementById("cityInput");
const weatherSearchBtn = document.getElementById("weatherSearchBtn");
const currentWeatherBtn = document.getElementById("currentWeatherBtn");

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

async function getLocationName(lat, lon) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
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

        const province =
            address.province ||
            address.state;

        const parts = [
            barangay,
            municipality,
            province
        ].filter(Boolean);

        return parts.length
            ? parts.join(", ")
            : data.name || "Selected Location";

    } catch (error) {
        console.error("Location error:", error);
        return "Selected Location";
    }
}

async function setWeatherMarker(lat, lon) {
    const position = [lat, lon];

    if (!weatherMarker) {
        weatherMarker = L.marker(position, {
            draggable: true
        }).addTo(weatherMap);

        weatherMarker.on("dragend", function () {
            const newPosition = weatherMarker.getLatLng();

            updateWeatherLocation(
                newPosition.lat,
                newPosition.lng
            );
        });
    } else {
        weatherMarker.setLatLng(position);
    }

    weatherMap.setView(position, 14);

    await updateWeatherLocation(lat, lon);
}

async function updateWeatherLocation(lat, lon) {
    const requestId = ++currentRequest;

    coordinates.textContent =
        `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    locationName.textContent = "Finding location...";

    setMarkerLabel("Finding location...");

    const placeName = await getLocationName(lat, lon);

    if (requestId !== currentRequest) return;

    locationName.textContent = placeName;

    setMarkerLabel(placeName);

    loadWeather(lat, lon);
}

async function loadWeather(lat, lon) {
    const requestId = currentRequest;

    if (API_KEY === "YOUR_OPENWEATHER_API_KEY") {
        weatherResult.innerHTML = `
            <div class="weather-placeholder">
                <span>🔑</span>
                <h3>API Key Required</h3>
                <p>Please add your OpenWeatherMap API key inside weather.js.</p>
            </div>
        `;
        return;
    }

    weatherResult.innerHTML = `
        <div class="weather-placeholder">
            <span>🌤️</span>
            <h3>Loading Weather...</h3>
            <p>Getting weather information for your selected location.</p>
        </div>
    `;

    try {
        const currentURL =
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

        const forecastURL =
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;

        const [currentResponse, forecastResponse] = await Promise.all([
            fetch(currentURL),
            fetch(forecastURL)
        ]);

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

        weatherResult.innerHTML = `
            <div class="weather-placeholder">
                <span>⚠️</span>
                <h3>Weather Unavailable</h3>
                <p>Please check your API key or internet connection and try again.</p>
            </div>
        `;
    }
}

function displayWeather(current, forecast) {
    const temperature = Math.round(current.main.temp);
    const feelsLike = Math.round(current.main.feels_like);
    const humidity = current.main.humidity;
    const wind = current.wind.speed;
    const condition = current.weather[0].description;

    const icon = getWeatherIcon(current.weather[0].main);

    const forecastItems = forecast.list.slice(0, 8);

    const rainForecast = forecastItems.find(item =>
        item.pop >= 0.4 ||
        ["Rain", "Thunderstorm", "Drizzle"].includes(item.weather[0].main)
    );

    const rainChance = rainForecast
        ? Math.round(rainForecast.pop * 100)
        : Math.round(
            Math.max(...forecastItems.map(item => item.pop)) * 100
        );

    let rainMessage;

    if (rainChance >= 70) {
        rainMessage = "High chance of rain in the upcoming forecast periods. Prepare for possible rainfall.";
    } else if (rainChance >= 40) {
        rainMessage = "There may be a chance of rain. Monitor the weather before doing outdoor farm activities.";
    } else {
        rainMessage = "Low forecast probability of rain in the upcoming periods. Continue monitoring local conditions.";
    }

    weatherResult.innerHTML = `
        <div class="weather-card">

            <div class="weather-icon">${icon}</div>

            <div class="temperature">${temperature}°C</div>

            <p class="weather-description">
                ${condition}
            </p>

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
                    Weather forecast for the next available periods
                </p>

                <div class="forecast-grid">

                    ${forecastItems.map(item => {
                        const date = new Date(item.dt * 1000);

                        const time = date.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit"
                        });

                        const day = date.toLocaleDateString("en-US", {
                            weekday: "short"
                        });

                        const forecastIcon = getWeatherIcon(
                            item.weather[0].main
                        );

                        return `
                            <div class="forecast-item">
                                <span>${day} ${time}</span>
                                <strong>${forecastIcon}</strong>
                                <b>${Math.round(item.main.temp)}°C</b>
                                <small>${Math.round(item.pop * 100)}% rain</small>
                            </div>
                        `;
                    }).join("")}

                </div>

            </div>

        </div>
    `;
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

async function searchLocation() {
    const query = cityInput.value.trim();

    if (!query) {
        alert("Please enter a location.");
        return;
    }

    weatherSearchBtn.disabled = true;
    weatherSearchBtn.textContent = "Searching...";

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
        );

        const results = await response.json();

        if (!results.length) {
            alert("Location not found. Please try another search.");
            return;
        }

        const place = results[0];

        await setWeatherMarker(
            Number(place.lat),
            Number(place.lon)
        );

    } catch (error) {
        console.error("Search error:", error);
        alert("Unable to search location. Please try again.");
    } finally {
        weatherSearchBtn.disabled = false;
        weatherSearchBtn.textContent = "Search";
    }
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert("Your browser does not support location services.");
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
            alert("Unable to get your current location. Please allow location access.");

            currentWeatherBtn.disabled = false;
            currentWeatherBtn.textContent = "My Location";
        },
        {
            enableHighAccuracy: true,
            timeout: 10000
        }
    );
}

weatherMap.on("click", function (event) {
    setWeatherMarker(
        event.latlng.lat,
        event.latlng.lng
    );
});

weatherSearchBtn.addEventListener("click", searchLocation);

cityInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        searchLocation();
    }
});

currentWeatherBtn.addEventListener("click", getCurrentLocation);

const urlParams = new URLSearchParams(window.location.search);

const farmLat = parseFloat(urlParams.get("lat"));
const farmLon = parseFloat(urlParams.get("lon"));

if (Number.isFinite(farmLat) && Number.isFinite(farmLon)) {
    setWeatherMarker(farmLat, farmLon);
} else {
    setWeatherMarker(DEFAULT_LAT, DEFAULT_LON);
}
