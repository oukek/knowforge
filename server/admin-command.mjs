import { randomUUID } from "node:crypto";
import { ensureProfile } from "./account-profile.mjs";

export const adminUsage =
  "用法：node server/admin.mjs promote|demote --id 8位用户ID\n兼容：promote|demote --username 登录账号；--id 也支持内部 UUID";
export function parseAdminCommand(args) {
  const [command, ...rest] = args;
  if (!["promote", "demote"].includes(command)) throw Error(adminUsage);
  let type, value;
  if (rest.length === 2 && ["--id", "--username"].includes(rest[0])) {
    type = rest[0] === "--id" ? "id" : "username";
    value = rest[1];
  } else if (rest.length === 1) {
    value = rest[0];
    type = /^(?:\d{8}|[a-f\d]{8}-[a-f\d-]{27})$/i.test(value)
      ? "id"
      : "username";
  } else throw Error(adminUsage);
  const valid =
    type === "id"
      ? /^(?:[1-9]\d{7}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i
      : /^[a-z\d_-]{3,32}$/i;
  if (!valid.test(value || "")) throw Error(adminUsage);
  return { command, type, value: value.toLowerCase() };
}

export async function changeAdminRole(store, selector) {
  return store.session(async () => {
    const { command, type, value } = selector;
    let user;
    if (type === "username")
      user = await store.get(
        "SELECT id,username FROM auth_users WHERE username=?",
        value,
      );
    else if (/^\d{8}$/.test(value)) {
      const profile = await store.get(
        "SELECT userId FROM auth_profiles WHERE publicId=?",
        value,
      );
      if (profile)
        user = await store.get(
          "SELECT id,username FROM auth_users WHERE id=?",
          profile.userId,
        );
    } else
      user = await store.get(
        "SELECT id,username FROM auth_users WHERE id=?",
        value,
      );
    if (!user)
      throw Error(
        "未找到该" +
          (type === "id" ? "用户 ID" : "登录账号") +
          "。请从网站个人中心复制；同时确认当前目录 .env 的数据库与网站一致。",
      );
    await store.exec("BEGIN");
    try {
      user = await ensureProfile(store, user);
      const role = command === "promote" ? "admin" : "user";
      if (
        await store.get("SELECT role FROM auth_roles WHERE userId=?", user.id)
      )
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
        JSON.stringify({
          userId: user.id,
          publicId: user.publicId,
          username: user.username,
          role,
          selector: type,
        }),
        new Date().toISOString(),
      );
      await store.exec("COMMIT");
      return { ...user, role };
    } catch (error) {
      await store.exec("ROLLBACK");
      throw error;
    }
  });
}
