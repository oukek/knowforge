export async function createConfiguredStore({ driver, dbPath, mysql } = {}) {
  driver ??= dbPath ? "sqlite" : process.env.DB_DRIVER || "sqlite";
  if (driver === "mysql") {
    const { createMySQLStore } = await import("./mysql-store.mjs");
    return createMySQLStore(mysql);
  }
  if (driver === "sqlite") {
    const { createStore } = await import("./store.mjs");
    return createStore(dbPath);
  }
  throw new Error("DB_DRIVER must be mysql or sqlite");
}
