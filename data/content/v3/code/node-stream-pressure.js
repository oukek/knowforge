const produced = 10,
  consumed = 2;
console.log([1, 2, 3].map((seconds) => (produced - consumed) * seconds));
function drain(buffer, incoming, capacity) {
  const accepted = Math.min(incoming, capacity - buffer);
  return { buffer: buffer + accepted, paused: incoming > accepted };
}
console.log(drain(6, 5, 8));
