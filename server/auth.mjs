import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const derive = promisify(scrypt);
const cookieName = "knowforge_session";
const lifetime = 7 * 24 * 60 * 60 * 1000;
const passwordOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const credentials = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "账号请使用字母、数字、下划线或短横线")
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8, "密码至少 8 位").max(128, "密码最多 128 位"),
  })
  .strict();
const digest = (token) => createHash("sha256").update(token).digest("hex");
function tokenFrom(req) {
  const value = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, passwordOptions);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
async function verifyPassword(password, encoded) {
  const [, salt, hash] = (encoded || "").split("$");
  const actual = await derive(
    password,
    salt || "knowforge-dummy-salt",
    64,
    passwordOptions,
  );
  const expected =
    hash && /^[a-f0-9]{128}$/.test(hash)
      ? Buffer.from(hash, "hex")
      : Buffer.alloc(64);
  return timingSafeEqual(actual, expected) && !!hash;
}
const publicUser = (user) => ({ id: user.id, username: user.username });

export function createAuth(app, store) {
  const limits = new Map();
  function allow(key, max, duration) {
    const now = Date.now();
    for (const [key, item] of limits) if (item.until <= now) limits.delete(key);
    if (!limits.has(key)) {
      if (limits.size >= 10000) return false;
      limits.set(key, { count: 0, until: now + duration });
    }
    const item = limits.get(key);
    return ++item.count <= max;
  }
  function limited(req, res, action) {
    const ok = allow(
      `${action}:ip:${req.ip}`,
      action === "register" ? 10 : 40,
      action === "register" ? 3600000 : 900000,
    );
    if (ok) return false;
    res
      .set("Retry-After", action === "register" ? "3600" : "900")
      .status(429)
      .json({ error: "尝试过于频繁，请稍后重试" });
    return true;
  }
  function setCookie(req, res, token) {
    res.cookie(cookieName, token || "", {
      httpOnly: true,
      secure: req.secure,
      sameSite: "lax",
      path: "/",
      maxAge: token ? lifetime : 0,
    });
  }
  async function authenticate(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    const session = await store.get(
      "SELECT * FROM auth_sessions WHERE id=?",
      digest(token),
    );
    if (!session || session.expiresAt <= new Date().toISOString()) return null;
    const user = await store.get(
      "SELECT id,username FROM auth_users WHERE id=?",
      session.userId,
    );
    return user ? { user, session } : null;
  }
  function csrf(req, res, auth) {
    const supplied = req.headers["x-csrf-token"];
    const expected = auth.session.csrfToken;
    if (
      typeof supplied !== "string" ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      res.status(403).json({ error: "登录校验已失效，请刷新页面后重试" });
      return false;
    }
    return true;
  }
  async function newSession(req, res, user) {
    const now = new Date().toISOString();
    await store.run("DELETE FROM auth_sessions WHERE expiresAt<=?", now);
    const old = tokenFrom(req);
    if (old)
      await store.run("DELETE FROM auth_sessions WHERE id=?", digest(old));
    const token = randomBytes(32).toString("hex");
    const csrfToken = randomBytes(32).toString("hex");
    await store.run(
      "INSERT INTO auth_sessions(id,userId,csrfToken,expiresAt,createdAt) VALUES(?,?,?,?,?)",
      digest(token),
      user.id,
      csrfToken,
      new Date(Date.now() + lifetime).toISOString(),
      now,
    );
    return { token, body: { user: publicUser(user), csrfToken } };
  }
  const route = (method, path, handler) =>
    app[method](path, (req, res, next) =>
      store.session(() => handler(req, res)).catch(next),
    );
  route("get", "/api/auth/me", async (req, res) => {
    const auth = await authenticate(req);
    res.json(
      auth
        ? { user: publicUser(auth.user), csrfToken: auth.session.csrfToken }
        : { user: null, csrfToken: "" },
    );
  });
  for (const action of ["register", "login"]) {
    route("post", `/api/auth/${action}`, async (req, res) => {
      if (limited(req, res, action)) return;
      const { username, password } = credentials.parse(req.body);
      if (action === "login" && !allow(`login:user:${username}`, 15, 900000))
        return res
          .set("Retry-After", "900")
          .status(429)
          .json({ error: "尝试过于频繁，请稍后重试" });
      let user = await store.get(
        "SELECT * FROM auth_users WHERE username=?",
        username,
      );
      if (action === "register") {
        if (user) return res.status(409).json({ error: "该账号已被注册" });
        user = {
          id: randomUUID(),
          username,
          passwordHash: await hashPassword(password),
          createdAt: new Date().toISOString(),
        };
      } else if (!(await verifyPassword(password, user?.passwordHash))) {
        return res.status(401).json({ error: "账号或密码错误" });
      }
      await store.exec("BEGIN");
      let issued;
      try {
        if (action === "register")
          await store.run(
            "INSERT INTO auth_users(id,username,passwordHash,createdAt) VALUES(?,?,?,?)",
            user.id,
            user.username,
            user.passwordHash,
            user.createdAt,
          );
        issued = await newSession(req, res, user);
        await store.exec("COMMIT");
      } catch (error) {
        await store.exec("ROLLBACK");
        if (
          error.code === "ER_DUP_ENTRY" ||
          error.code?.startsWith("ERR_SQLITE_CONSTRAINT")
        )
          return res.status(409).json({ error: "该账号已被注册" });
        throw error;
      }
      if (action === "login") limits.delete(`login:user:${username}`);
      setCookie(req, res, issued.token);
      res.status(action === "register" ? 201 : 200).json(issued.body);
    });
  }
  route("post", "/api/auth/logout", async (req, res) => {
    const auth = await authenticate(req);
    if (auth && !csrf(req, res, auth)) return;
    const token = tokenFrom(req);
    if (token)
      await store.run("DELETE FROM auth_sessions WHERE id=?", digest(token));
    setCookie(req, res, null);
    res.json({ ok: true });
  });
  return { authenticate, csrf };
}
