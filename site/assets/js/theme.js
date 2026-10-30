const themeSelect = document.querySelector("#theme-select");
const themeColors = new Map([
  ["club", "#e7f2e9"],
  ["halloween", "#eee5f2"],
  ["autumn", "#f3e5d6"],
  ["floodlight", "#e5eef5"],
  ["fancy", "#10251e"]
]);
const savedTheme = window.localStorage.getItem("svh-theme");
const initialTheme = themeColors.has(savedTheme) ? savedTheme : "club";
const menuToggle = document.querySelector(".menu-toggle");
const siteHeader = document.querySelector(".site-header");
const navDropdowns = siteHeader.querySelectorAll(".nav-dropdown");
const themeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  if (!themeColors.has(theme)) {
    throw new RangeError(`Unbekanntes Design: ${theme}`);
  }

  document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
  themeColor.content = themeColors.get(theme);
  window.localStorage.setItem("svh-theme", theme);
}

applyTheme(initialTheme);

navDropdowns.forEach((dropdown) => {
  dropdown.addEventListener("toggle", () => {
    if (!dropdown.open) {
      return;
    }

    navDropdowns.forEach((otherDropdown) => {
      if (otherDropdown !== dropdown) {
        otherDropdown.open = false;
      }
    });
  });
});

themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value);
});

menuToggle.addEventListener("click", () => {
  const isOpen = siteHeader.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

siteHeader.querySelector(".primary-navigation").addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    siteHeader.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

siteHeader.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    siteHeader.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.focus();
  }
});

siteHeader.classList.add("menu-ready");
