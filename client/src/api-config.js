import { PRODUCTION_API_ORIGIN } from "../../shared/deployment.mjs";

export function resolveApiOrigin(production = false, override) {
  const value = (override ?? (production ? PRODUCTION_API_ORIGIN : "")).trim();
  if (!value) return "";
  const parsed = new URL(value);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  )
    throw new Error("VITE_API_ORIGIN must be an HTTP(S) origin without a path");
  return parsed.origin;
}
export const API_ORIGIN = resolveApiOrigin(
  import.meta.env?.PROD ?? false,
  import.meta.env?.VITE_API_ORIGIN,
);
export const apiUrl = (path) => API_ORIGIN + "/api" + path;
