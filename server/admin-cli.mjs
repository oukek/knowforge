import { loadEnvFile } from "node:process";
import { createConfiguredStore } from "./database.mjs";
import { parseAdminCommand, changeAdminRole } from "./admin-command.mjs";
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let store;
try {
  const selector = parseAdminCommand(process.argv.slice(2));
  store = await createConfiguredStore({
    driver: process.env.DB_DRIVER || "sqlite",
    dbPath: process.env.DB_PATH,
  });
  const user = await changeAdminRole(store, selector);
  console.log(
    "已设置用户 ID " +
      user.publicId +
      "（登录账号 " +
      user.username +
      "）为 " +
      user.role +
      "，刷新页面生效",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await store?.close();
}
