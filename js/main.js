const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
    const isDark = theme === "dark";

    // Keep <html> and <body> in sync (the <head> script sets the <html> one early)
    document.documentElement.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("dark-mode", isDark);

    if (themeToggle) {
        themeToggle.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
    }

    try {
        localStorage.setItem("agrisulbad-theme", theme);
    } catch (e) {}
}

let savedTheme = "light";
try {
    savedTheme = localStorage.getItem("agrisulbad-theme") || "light";
} catch (e) {}

applyTheme(savedTheme);

if (themeToggle) {
    themeToggle.addEventListener("click", function () {
        applyTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
    });
}

// Turn on the color transition only after the first paint,
// so the saved theme never fades in when a page loads.
requestAnimationFrame(function () {
    requestAnimationFrame(function () {
        document.documentElement.classList.add("theme-ready");
    });
});