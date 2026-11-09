import { randomBytes, randomUUID, createHash } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { WechatConfiguration } from "./wechat-config.mjs";
import { WechatPay } from "./wechat-pay.mjs";
import { ensureProfile } from "./account-profile.mjs";
import { AiError } from "./ai/policy.mjs";
import { micro, points, MAX } from "./ai/amounts.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const secretSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    secret: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const expire = () => new AiError(400, "微信登录已过期或已使用，请重新发起");
export async function installWechat(app, store, auth, ai, options = {}) {
  const fetcher = options.fetcher || fetch,
    repo = ai.repo;
  const configuration = new WechatConfiguration(
    repo,
    options.encryptionKey ?? ai.rootKey,
  );
  const route = (
    method,
    path,
    handler,
    protectedRoute = false,
    admin = false,
  ) =>
    app[method](path, async (req, res, next) => {
      try {
        if (protectedRoute || admin) {
          const session = await store.session(() => auth.authenticate(req));
          if (!session) return res.status(401).json({ error: "请先登录" });
          if (
            req.headers["x-knowforge-user"] &&
            req.headers["x-knowforge-user"] !== session.user.id
          )
            return res
              .status(409)
              .json({ error: "账号已在其他页面切换", code: "SESSION_CHANGED" });
          if (admin && session.user.role !== "admin")
            return res.status(403).json({ error: "需要管理员权限" });
          if (method !== "get" && !auth.csrf(req, res, session)) return;
          req.user = session.user;
        }
        let c;
        if (!admin) {
          const flowId =
            req.query.state ||
            (path.startsWith("/api/auth/wechat/") ? req.body?.id : null);
          const binding = flowId
            ? "flow:" + flowId
            : req.params.id
              ? "order:" + req.params.id
              : null;
          c =
            options.config ||
            (binding
              ? await configuration.bound(binding)
              : await configuration.runtime());
        }
        const gateway =
          options.gateway || (!admin ? new WechatPay(c, fetcher) : null);
        const result = await handler(req, res, c, gateway);
        if (!res.headersSent) res.json(result);
      } catch (error) {
        if (error instanceof AiError)
          res.status(error.status).json({ error: error.message });
        else next(error);
      }
    });
  route(
    "get",
    "/api/admin/wechat/configuration",
    () => configuration.view(),
    true,
    true,
  );
  for (const section of ["login", "payment"])
    route(
      "put",
      `/api/admin/wechat/${section}`,
      (req) => configuration.save(section, req.body, req.user.id),
      true,
      true,
    );
  const needLogin = (c) => {
    if (!c.loginEnabled)
      throw new AiError(503, "微信登录尚未配置，请联系管理员");
  };
  const needPay = (c) => {
    if (!c.payEnabled) throw new AiError(503, "微信支付尚未配置，请联系管理员");
  };
  route("get", "/api/auth/wechat/configuration", (req, res, c) => ({
    enabled: c.loginEnabled,
  }));
  route("post", "/api/auth/wechat/start", async (req, res, c, gateway) => {
    needLogin(c);
    if (auth.limited(req, res, "wechat")) return;
    const id = randomBytes(16).toString("hex"),
      secret = randomBytes(32).toString("hex"),
      now = new Date().toISOString(),
      expiresAt = new Date(Date.now() + 300000).toISOString();
    await repo.transaction(async (db) => {
      await db.run(
        "DELETE FROM wechat_config_bindings WHERE id IN (SELECT " +
          (db.driver === "mysql" ? "CONCAT('flow:',id)" : "'flow:' || id") +
          " FROM wechat_flows WHERE expiresAt<=?)",
        now,
      );
      await db.run("DELETE FROM wechat_flows WHERE expiresAt<=?", now);
      await db.run(
        "INSERT INTO wechat_flows(id,secretHash,status,userId,expiresAt,createdAt) VALUES(?,?,?,?,?,?)",
        id,
        hash(secret),
        "pending",
        "",
        expiresAt,
        now,
      );
      await configuration.bind(db, "flow:" + id, c.revision);
    });
    const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
    url.search = new URLSearchParams({
      appid: c.appId,
      redirect_uri: c.apiUrl + "/api/auth/wechat/callback",
      response_type: "code",
      scope: "snsapi_userinfo",
      state: id,
    }).toString();
    url.hash = "wechat_redirect";
    return {
      id,
      secret,
      expiresAt,
      url: url.href,
      qr: await QRCode.toDataURL(url.href, { width: 280, margin: 2 }),
    };
  });
  route("get", "/api/auth/wechat/callback", async (req, res, c, gateway) => {
    needLogin(c);
    res.set({
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    const { state, code } = z
      .object({
        state: z.string().regex(/^[a-f0-9]{32}$/),
        code: z.string().min(1).max(256),
      })
      .parse(req.query);
    // Claim before exchanging the one-use OAuth code; concurrent callbacks cannot create duplicate accounts.
    await repo.transaction(async (db) => {
      const changed = await db.run(
        "UPDATE wechat_flows SET status=? WHERE id=? AND status=? AND expiresAt>?",
        "processing",
        state,
        "pending",
        new Date().toISOString(),
      );
      if (Number(changed.changes ?? changed.affectedRows) !== 1) throw expire();
    });
    const oauth = async (path, params) => {
      const response = await fetcher(
        "https://api.weixin.qq.com/" + path + "?" + new URLSearchParams(params),
        { signal: AbortSignal.timeout(15000) },
      );
      const result = await response.json();
      if (!response.ok || result.errcode)
        throw new AiError(502, "微信授权未完成，请返回原页面重新登录");
      return result;
    };
    const token = await oauth("sns/oauth2/access_token", {
      appid: c.appId,
      secret: c.appSecret,
      code,
      grant_type: "authorization_code",
    });
    if (
      typeof token.openid !== "string" ||
      !/^[\w-]{1,128}$/.test(token.openid) ||
      !token.access_token ||
      !String(token.scope).split(",").includes("snsapi_userinfo")
    )
      throw expire();
    const profile = await oauth("sns/userinfo", {
      access_token: token.access_token,
      openid: token.openid,
      lang: "zh_CN",
    });
    if (profile.openid !== token.openid) throw expire();
    const ticket = randomBytes(32).toString("hex");
    await repo.transaction(async (db) => {
      const identity = c.appId + ":" + token.openid;
      let linked = await db.get(
        "SELECT * FROM auth_wechat WHERE id=?",
        identity,
      );
      if (!linked) {
        const user = {
          id: randomUUID(),
          username: "wx_" + randomBytes(12).toString("hex"),
          createdAt: new Date().toISOString(),
        };
        await db.run(
          "INSERT INTO auth_users(id,username,passwordHash,createdAt) VALUES(?,?,?,?)",
          user.id,
          user.username,
          "!wechat",
          user.createdAt,
        );
        await ensureProfile(db, user);
        await db.run(
          "UPDATE auth_profiles SET displayName=? WHERE userId=?",
          String(profile.nickname || "微信用户")
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 40) || "微信用户",
          user.id,
        );
        await db.run(
          "INSERT INTO auth_wechat(id,userId,appId,openid) VALUES(?,?,?,?)",
          identity,
          user.id,
          c.appId,
          token.openid,
        );
        await db.forUser(user.id).upsert("settings", {
          key: "planOnboarding",
          value: JSON.stringify("pending"),
        });
        linked = { userId: user.id };
      }
      await db.run(
        "UPDATE wechat_flows SET userId=?,status=? WHERE id=?",
        linked.userId,
        "confirm:" + hash(ticket),
        state,
      );
    });
    res
      .type("html")
      .send(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>确认微信登录</title><body style="font-family:system-ui;padding:48px 24px;text-align:center"><h2>登录 KnowForge 知行实验室</h2><p>仅在你本人发起登录时确认。确认后，发起扫码的设备将登录你的账号。</p><form method="post" action="/api/auth/wechat/confirm"><input type="hidden" name="id" value="${state}"><input type="hidden" name="ticket" value="${ticket}"><button style="padding:14px 32px">确认登录</button></form></body></html>`,
      );
  });
  app.use(
    "/api/auth/wechat/confirm",
    (await import("express")).default.urlencoded({
      extended: false,
      limit: "2kb",
    }),
  );
  route("post", "/api/auth/wechat/confirm", async (req, res, c, gateway) => {
    const { id, ticket } = z
      .object({
        id: z.string().regex(/^[a-f0-9]{32}$/),
        ticket: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(req.body);
    await repo.transaction(async (db) => {
      const result = await db.run(
        "UPDATE wechat_flows SET status=? WHERE id=? AND status=? AND expiresAt>?",
        "ready",
        id,
        "confirm:" + hash(ticket),
        new Date().toISOString(),
      );
      if (Number(result.changes ?? result.affectedRows) !== 1) throw expire();
    });
    res
      .set({
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      })
      .type("html")
      .send(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录已确认</title><h2>登录已确认</h2><p>请返回发起登录的页面；在微信内登录请点击下方链接。</p><a href="${c.frontendUrl}/?wechatReturn=1">返回学习空间</a></html>`,
      );
  });
  route("post", "/api/auth/wechat/poll", async (req, res, c, gateway) => {
    needLogin(c);
    const { id, secret } = secretSchema.parse(req.body);
    return repo.transaction(async (db) => {
      const flow = await db.get(
        "SELECT * FROM wechat_flows WHERE id=?" +
          (db.driver === "mysql" ? " FOR UPDATE" : ""),
        id,
      );
      if (
        !flow ||
        flow.secretHash !== hash(secret) ||
        flow.expiresAt <= new Date().toISOString() ||
        flow.status === "used"
      )
        throw expire();
      if (flow.status !== "ready") return { status: "waiting" };
      let user = await db.get(
        "SELECT * FROM auth_users WHERE id=?",
        flow.userId,
      );
      if (!user) throw expire();
      user = await ensureProfile(db, user);
      user.role =
        (await db.get("SELECT role FROM auth_roles WHERE userId=?", user.id))
          ?.role || "user";
      const session = await auth.newSession(req, res, user);
      await db.run("UPDATE wechat_flows SET status=? WHERE id=?", "used", id);
      auth.setCookie(req, res, session.token);
      return { status: "complete", ...session.body };
    });
  });
  route(
    "get",
    "/api/payments/capabilities",
    (req, res, c) => ({ enabled: c.payEnabled }),
    true,
  );
  const publicOrder = (row) => ({
    id: row.id,
    versionId: row.versionId,
    status: row.status,
    amount: (Number(row.amountFen) / 100).toFixed(2),
    product: JSON.parse(row.product).name,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
  });
  const owned = (id, userId) =>
    repo.read(async (db) => {
      const row = await db.get(
        "SELECT * FROM payment_orders WHERE id=? AND userId=?",
        id,
        userId,
      );
      if (!row) throw new AiError(404, "订单不存在");
      return row;
    });
  const settle = async (payment) => {
    if (payment.trade_state !== "SUCCESS") return;
    await repo.transaction(async (db) => {
      const row = await db.get(
        "SELECT * FROM payment_orders WHERE id=?" +
          (db.driver === "mysql" ? " FOR UPDATE" : ""),
        payment.out_trade_no,
      );
      if (
        !row ||
        payment.appid !== row.appId ||
        payment.mchid !== row.merchantId ||
        payment.amount?.currency !== "CNY" ||
        payment.amount?.total !== Number(row.amountFen) ||
        !/^[\w-]{1,128}$/.test(payment.transaction_id || "") ||
        !Number.isFinite(Date.parse(payment.success_time))
      )
        throw new AiError(400, "支付通知与订单不匹配");
      if (row.status === "paid") {
        if (row.transactionId !== payment.transaction_id)
          throw new AiError(400, "支付流水不匹配");
        return;
      }
      const product = JSON.parse(row.product),
        account = await ai.billing.view(db, row.userId),
        total = micro(product.credits) + micro(product.bonus);
      if (micro(account.balance) + total > MAX)
        throw new AiError(409, "额度超过上限，请联系管理员核对订单");
      const expiresAt =
          product.validDays === null
            ? ""
            : new Date(
                Date.parse(payment.success_time) + product.validDays * 86400000,
              ).toISOString(),
        allocations = [];
      for (const [title, amount, source] of [
        [product.name, product.credits, "purchase"],
        [product.name + " · 附赠", product.bonus, "bonus"],
      ]) {
        if (micro(amount) <= 0n) continue;
        const lot = await ai.billing.createLot(db, {
          userId: row.userId,
          source,
          title,
          amount: micro(amount),
          expiresAt,
          data: {
            product,
            payment: "wechat",
            orderId: row.id,
            transactionId: payment.transaction_id,
          },
        });
        allocations.push({ lotId: lot.id, amount: points(micro(amount)) });
      }
      await ai.billing.event(
        db,
        row.id,
        row.userId,
        "",
        "purchase",
        total,
        "微信购买资源包",
        { orderId: row.id, allocations },
      );
      await db.run(
        "UPDATE payment_orders SET status=?,transactionId=?,paidAt=? WHERE id=?",
        "paid",
        payment.transaction_id,
        payment.success_time,
        row.id,
      );
      await ai.repo.audit(db, row.userId, "payment.paid", {
        orderId: row.id,
        amountFen: row.amountFen,
      });
    });
  };
  async function checkout(order, mode, c, gateway) {
    needPay(c);
    if (order.appId !== c.appId || order.merchantId !== c.merchantId)
      throw new AiError(409, "订单使用的商户配置已变化，请联系管理员核对");
    if (
      order.status !== "pending" ||
      order.expiresAt <= new Date().toISOString()
    )
      return { order: publicOrder(order) };
    let intent = JSON.parse(order.intent);
    if (!intent.type) {
      const identity = await repo.read((db) =>
        db.get(
          "SELECT openid FROM auth_wechat WHERE userId=? AND appId=?",
          order.userId,
          c.appId,
        ),
      );
      const paymentMode = mode === "jsapi" && identity ? "jsapi" : "native";
      intent = await gateway.create(order, paymentMode, identity?.openid);
      await repo.read((db) =>
        db.run(
          "UPDATE payment_orders SET intent=? WHERE id=?",
          JSON.stringify(intent),
          order.id,
        ),
      );
    }
    return {
      order: publicOrder(order),
      intent:
        intent.type === "qr"
          ? {
              ...intent,
              qr: await QRCode.toDataURL(intent.codeUrl, {
                width: 280,
                margin: 2,
              }),
            }
          : intent,
    };
  }
  route(
    "post",
    "/api/payments/orders",
    async (req, res, c, gateway) => {
      needPay(c);
      if (auth.limited(req, res, "payment")) return;
      const input = z
        .object({
          productVersionId: z.string().uuid(),
          requestId: z.string().uuid(),
          mode: z.enum(["native", "jsapi"]).default("native"),
        })
        .strict()
        .parse(req.body);
      const order = await repo.transaction(async (db) => {
        await ai.repo.account(db, req.user.id, true);
        const prior = await db.get(
          "SELECT * FROM payment_orders WHERE requestId=?",
          input.requestId,
        );
        if (prior) {
          if (
            prior.userId !== req.user.id ||
            prior.versionId !== input.productVersionId
          )
            throw new AiError(409, "订单标识已使用");
          return prior;
        }
        const pending = await db.get(
          "SELECT * FROM payment_orders WHERE userId=? AND versionId=? AND status=? AND expiresAt>? ORDER BY createdAt DESC LIMIT 1",
          req.user.id,
          input.productVersionId,
          "pending",
          new Date().toISOString(),
        );
        if (pending) return pending;
        const p = await db.get(
            "SELECT * FROM ai_products WHERE publishedId=? AND status=?",
            input.productVersionId,
            "published",
          ),
          version = await db.get(
            "SELECT * FROM ai_product_versions WHERE id=?",
            input.productVersionId,
          );
        if (!p || !version)
          throw new AiError(409, "资源包已更新或下架，请刷新后购买");
        const product = {
          ...JSON.parse(version.data),
          versionId: version.id,
          version: version.version,
        };
        delete product.note;
        const amountFen = Number(micro(product.price) / 10000n);
        if (!Number.isSafeInteger(amountFen) || amountFen < 1)
          throw new AiError(400, "此资源包不支持在线购买");
        const row = {
          id: randomBytes(16).toString("hex"),
          userId: req.user.id,
          requestId: input.requestId,
          versionId: version.id,
          amountFen,
          status: "pending",
          transactionId: null,
          product: JSON.stringify(product),
          intent: "{}",
          appId: c.appId,
          merchantId: c.merchantId,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          paidAt: "",
        };
        await db.run(
          "INSERT INTO payment_orders(id,userId,requestId,versionId,amountFen,status,transactionId,product,intent,appId,merchantId,createdAt,expiresAt,paidAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          ...Object.values(row),
        );
        await configuration.bind(db, "order:" + row.id, c.revision);
        return row;
      });
      const bound =
        options.config || (await configuration.bound("order:" + order.id));
      return checkout(
        order,
        input.mode,
        bound,
        options.gateway || new WechatPay(bound, fetcher),
      );
    },
    true,
  );
  route(
    "post",
    "/api/payments/orders/:id/checkout",
    async (req, res, c, gateway) => {
      const id = z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .parse(req.params.id);
      const { mode } = z
        .object({ mode: z.enum(["native", "jsapi"]).default("native") })
        .strict()
        .parse(req.body);
      return checkout(await owned(id, req.user.id), mode, c, gateway);
    },
    true,
  );
  route(
    "get",
    "/api/payments/orders/:id",
    async (req, res, c, gateway) => {
      const order = await owned(
        z
          .string()
          .regex(/^[a-f0-9]{32}$/)
          .parse(req.params.id),
        req.user.id,
      );
      const intent = JSON.parse(order.intent);
      return {
        order: publicOrder(order),
        intent:
          order.status === "pending" &&
          order.expiresAt > new Date().toISOString() &&
          intent.type
            ? intent.type === "qr"
              ? {
                  ...intent,
                  qr: await QRCode.toDataURL(intent.codeUrl, {
                    width: 280,
                    margin: 2,
                  }),
                }
              : intent
            : undefined,
      };
    },
    true,
  );
  route(
    "get",
    "/api/payments/orders",
    async (req) => ({
      rows: await repo.read(async (db) =>
        (
          await db.all(
            "SELECT * FROM payment_orders WHERE userId=? ORDER BY createdAt DESC LIMIT 50",
            req.user.id,
          )
        ).map(publicOrder),
      ),
    }),
    true,
  );
  const syncTimes = new Map();
  route(
    "post",
    "/api/payments/orders/:id/sync",
    async (req, res, c, gateway) => {
      needPay(c);
      const id = z
          .string()
          .regex(/^[a-f0-9]{32}$/)
          .parse(req.params.id),
        order = await owned(id, req.user.id);
      if (
        order.status !== "paid" &&
        order.status !== "closed" &&
        (syncTimes.get(id) || 0) < Date.now() - 3000
      ) {
        for (const [key, time] of syncTimes)
          if (time < Date.now() - 60000) syncTimes.delete(key);
        if (syncTimes.size >= 10000)
          throw new AiError(429, "查单繁忙，请稍后重试");
        syncTimes.set(id, Date.now());
        const payment = await gateway.query(id);
        if (
          payment.out_trade_no !== id ||
          payment.appid !== order.appId ||
          payment.mchid !== order.merchantId
        )
          throw new AiError(502, "微信查单结果不匹配");
        await settle(payment);
        if (["CLOSED", "REVOKED", "PAYERROR"].includes(payment.trade_state))
          await repo.read((db) =>
            db.run(
              "UPDATE payment_orders SET status=? WHERE id=? AND status=?",
              "closed",
              id,
              "pending",
            ),
          );
        if (
          payment.trade_state === "NOTPAY" &&
          order.expiresAt <= new Date().toISOString()
        ) {
          await gateway.request(
            "POST",
            `/v3/pay/transactions/out-trade-no/${id}/close`,
            { mchid: order.merchantId },
          );
          await repo.read((db) =>
            db.run(
              "UPDATE payment_orders SET status=? WHERE id=? AND status=?",
              "closed",
              id,
              "pending",
            ),
          );
        }
      }
      return { order: publicOrder(await owned(id, req.user.id)) };
    },
    true,
  );
  route("post", "/api/payments/wechat/notify", async (req, res, c, gateway) => {
    if (!req.rawBody || req.rawBody.length > 65536)
      throw new AiError(400, "无效支付通知");
    let payment;
    try {
      if (options.gateway)
        payment = await gateway.notification(req.rawBody, req.headers);
      else {
        const configs = await configuration.notificationConfigs();
        for (const candidate of configs) {
          if (candidate.platformSerial !== req.headers["wechatpay-serial"])
            continue;
          try {
            payment = new WechatPay(candidate, fetcher).notification(
              req.rawBody,
              req.headers,
            );
            break;
          } catch {
            continue;
          }
        }
        if (!payment) throw Error("Invalid notification");
      }
    } catch {
      throw new AiError(400, "支付通知验签或解密失败");
    }
    await settle(payment);
    res.status(204).end();
  });
}
