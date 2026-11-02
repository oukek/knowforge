import { computed, onScopeDispose, ref, watch } from "vue";
import { loadDetail, refreshCatalogIndex, store } from "../store.js";

export function useCatalogDetail(type, id) {
  const loading = ref(false),
    error = ref("");
  let versionChanged = false;
  let generation = 0;
  const item = computed(() => {
    const value = id.value;
    if (!value) return null;
    const summary = store.catalog?.[type]?.find((entry) => entry.id === value);
    if (!summary) return null;
    return store.catalog.summaryOnly
      ? store.details[type][value] || null
      : summary;
  });
  async function refresh() {
    const current = ++generation,
      value = id.value;
    error.value = "";
    if (!value) {
      loading.value = false;
      return;
    }
    loading.value = !item.value;
    try {
      if (versionChanged) {
        versionChanged = false;
        try {
          if (!(await refreshCatalogIndex()) || current !== generation) return;
        } catch (error) {
          versionChanged = true;
          throw error;
        }
      }
      await loadDetail(type, value);
    } catch (e) {
      if (current === generation) {
        versionChanged ||= e.code === "CATALOG_VERSION_CHANGED";
        error.value = e.message;
      }
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch([id, () => store.catalog?.contentVersion], refresh, {
    immediate: true,
  });
  onScopeDispose(() => {
    generation++;
  });
  return { item, loading, error, refresh };
}
