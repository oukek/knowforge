// Keep ordinary scrolling, text selection and editor shortcuts available.
export function disablePageZoom() {
  const preventZoom = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  const options = { passive: false, capture: true };
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, preventZoom, options);
  }
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) preventZoom(event);
  }, options);
  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey) preventZoom(event);
  }, options);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) &&
        ["+", "=", "-", "_", "0"].includes(event.key)) {
      preventZoom(event);
    }
  }, options);
}
