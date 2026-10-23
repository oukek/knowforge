import { loadEnvFile } from "node:process";
import { createConfiguredStore } from "./database.mjs";
import { changeAdminRole } from "./admin-command.mjs";
import {
  parseAdminInvocation,
  readPm2Database,
  databaseContext,
  applyDatabaseEnvironment,
} from "./admin-environment.mjs";
let store;
try {
  const { selector, pm2 } = parseAdminInvocation(process.argv.slice(2));
  let context;
  if (pm2 !== undefined) {
    context = await readPm2Database(pm2);
    console.log(
      "已选择 PM2 进程 " +
        context.processName +
        "（pm_id " +
        context.pmId +
        "）的数据库配置",
    );
  } else {
    try {
      loadEnvFile();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    context = databaseContext(process.env, process.cwd());
  }
  applyDatabaseEnvironment(context.env);
  store = await createConfiguredStore({
    driver: context.driver,
    dbPath: context.dbPath,
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
