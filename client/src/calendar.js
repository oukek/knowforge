export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return year >= 1000 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}
export function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function monthDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(first.getFullYear(), first.getMonth(), 1 - offset + index, 12),
  );
}
export function shiftMonth(date, amount) {
  const first = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  const last = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
    12,
  ).getDate();
  first.setDate(Math.min(date.getDate(), last));
  return first;
}
