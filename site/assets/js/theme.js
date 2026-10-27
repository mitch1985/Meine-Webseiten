const themeSelect = document.querySelector("#theme-select");
const availableThemes = new Set(["club", "halloween"]);
const savedTheme = window.localStorage.getItem("svh-theme");
const initialTheme = availableThemes.has(savedTheme) ? savedTheme : "club";
const menuToggle = document.querySelector(".menu-toggle");
const siteHeader = document.querySelector(".site-header");

document.documentElement.dataset.theme = initialTheme;
themeSelect.value = initialTheme;

themeSelect.addEventListener("change", () => {
  const selectedTheme = themeSelect.value;

  if (!availableThemes.has(selectedTheme)) {
    throw new RangeError(`Unbekanntes Design: ${selectedTheme}`);
  }

  document.documentElement.dataset.theme = selectedTheme;
  window.localStorage.setItem("svh-theme", selectedTheme);
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
