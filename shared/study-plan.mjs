// Preserve old single-track plans; new plans store an explicit union of tracks.
export function selectedTracks(settings, tracks) {
  const ids = new Set(tracks.map((track) => track.id));
  const values = Array.isArray(settings.trackIds)
    ? settings.trackIds
    : settings.trackId === "all"
      ? [...ids]
      : settings.trackId
        ? [settings.trackId]
        : [];
  return [...new Set(values)].filter((id) => ids.has(id));
}
export function plannedModules(trackIds, tracks) {
  return [
    ...new Set(
      trackIds.flatMap(
        (id) => tracks.find((track) => track.id === id)?.moduleIds || [],
      ),
    ),
  ];
}
export function plannedLessons(lessons, trackIds, tracks) {
  const priority = plannedModules(trackIds, tracks);
  return lessons
    .filter((lesson) => priority.includes(lesson.moduleId))
    .sort(
      (a, b) =>
        priority.indexOf(a.moduleId) - priority.indexOf(b.moduleId) ||
        a.order - b.order,
    );
}
