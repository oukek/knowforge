export function afterLoginPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return "/";
  if (value.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase() === "/login")
    return "/";
  return value;
}

export function loginLocation(path) {
  return {
    name: "login",
    ...(path && path !== "/" ? { query: { redirect: path } } : {}),
    replace: true,
  };
}
