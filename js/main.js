
const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
    document.body.classList.toggle("dark-mode", theme === "dark");

    if (themeToggle) {
        themeToggle.textContent = theme === "dark"
            ? "☀️ Light Mode"
            : "🌙 Dark Mode";
    }

    localStorage.setItem("agrisulbad-theme", theme);
}

applyTheme(localStorage.getItem("agrisulbad-theme") || "light");

if (themeToggle) {
    themeToggle.addEventListener("click", function () {
        const newTheme = document.body.classList.contains("dark-mode")
            ? "light"
            : "dark";

        applyTheme(newTheme);
    });
}
