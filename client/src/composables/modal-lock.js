// A nested selector must not restore scrolling while its parent dialog is open.
const owners = new Set();
let overflow, inert;
export function lockModal(owner) {
  if (owners.has(owner)) return;
  if (!owners.size) {
    overflow = document.body.style.overflow;
    inert = document.getElementById("app")?.inert ?? false;
    document.body.style.overflow = "hidden";
    const app = document.getElementById("app");
    if (app) app.inert = true;
  }
  owners.add(owner);
}
export function unlockModal(owner) {
  if (!owners.delete(owner) || owners.size) return;
  document.body.style.overflow = overflow;
  const app = document.getElementById("app");
  if (app) app.inert = inert;
}
