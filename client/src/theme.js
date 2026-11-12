import { ref, computed } from "vue";
import {
  DEFAULT_THEME,
  themes,
  normalizeTheme,
  themeById,
  themeVariables,
} from "../../shared/themes.mjs";
export { themes };
const storageKey = "knowforge.theme";
export function storedTheme() {
  try {
    return normalizeTheme(localStorage.getItem(storageKey));
  } catch {
    return DEFAULT_THEME;
  }
}
export const themeId = ref(storedTheme());
export const currentTheme = computed(() => themeById(themeId.value));
export function applyTheme(id) {
  themeId.value = normalizeTheme(id);
  document.documentElement.dataset.theme = themeId.value;
  for (const [key, value] of Object.entries(themeVariables(themeId.value)))
    document.documentElement.style.setProperty(key, value);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", currentTheme.value.primary);
}
export function saveTheme(id) {
  const selected = normalizeTheme(id);
  localStorage.setItem(storageKey, selected);
  applyTheme(selected);
}
export function initializeTheme() {
  applyTheme(themeId.value);
  addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null)
      applyTheme(storedTheme());
  });
}
