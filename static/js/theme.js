(function () {
  const storageKey = "qt-theme";
  const root = document.documentElement;

  function getPreferredTheme() {
    const saved = localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    return "light";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(storageKey, theme);
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }

  function syncToggles(theme) {
    document.querySelectorAll("input[data-theme-toggle]").forEach((toggle) => {
      toggle.checked = theme === "dark";
      toggle.setAttribute("aria-checked", theme === "dark");
    });
  }

  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);
  syncToggles(initialTheme);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.matches("input[data-theme-toggle]")) return;
    const nextTheme = target.checked ? "dark" : "light";
    applyTheme(nextTheme);
    syncToggles(nextTheme);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    const nextTheme = event.newValue === "light" ? "light" : "dark";
    applyTheme(nextTheme);
    syncToggles(nextTheme);
  });
})();
