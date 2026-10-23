import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { createConfiguredStore } from "./database.mjs";
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const [command, rawName] = process.argv.slice(2);
if (
  !["promote", "demote"].includes(command) ||
  !/^[a-z0-9_-]{3,32}$/i.test(rawName || "")
) {
  console.error("用法：node server/admin-cli.mjs promote|demote 已注册账号");
  process.exitCode = 1;
} else {
  const store = await createConfiguredStore({
    driver: process.env.DB_DRIVER || "sqlite",
    dbPath: process.env.DB_PATH,
  });
  try {
    await store.session(async () => {
      const user = await store.get(
        "SELECT id,username FROM auth_users WHERE username=?",
        rawName.toLowerCase(),
      );
      if (!user) throw Error("该账号尚未注册");
      const role = command === "promote" ? "admin" : "user";
      await store.exec("BEGIN");
      try {
        const old = await store.get(
          "SELECT * FROM auth_roles WHERE userId=?",
          user.id,
        );
        if (old)
          await store.run(
            "UPDATE auth_roles SET role=? WHERE userId=?",
            role,
            user.id,
          );
        else
          await store.run(
            "INSERT INTO auth_roles(userId,role) VALUES(?,?)",
            user.id,
            role,
          );
        await store.run(
          "INSERT INTO admin_audit(id,userId,action,data,createdAt) VALUES(?,?,?,?,?)",
          randomUUID(),
          "server-cli",
          "role.change",
          JSON.stringify({ userId: user.id, username: user.username, role }),
          new Date().toISOString(),
        );
        await store.exec("COMMIT");
      } catch (error) {
        await store.exec("ROLLBACK");
        throw error;
      }
      console.log(
        "已设置账号 " + user.username + " 为 " + role + "，刷新页面生效",
      );
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}
