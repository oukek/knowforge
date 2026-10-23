function overlapSegments(segments, start, end) {
  if (!(start < end)) throw Error("invalid window");
  return segments
    .filter((s) => s.start < end && s.end > start)
    .sort((a, b) => a.start - b.start)
    .map((s) => s.id);
}
const segments = [
  { id: "s3", start: 20, end: 30 },
  { id: "s1", start: 0, end: 10 },
  { id: "s2", start: 10, end: 20 },
];
console.log(overlapSegments(segments, 10, 20));
console.log(overlapSegments(segments, 9, 21));
