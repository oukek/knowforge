import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { AiError } from "./ai/policy.mjs";
import { WechatPay } from "./wechat-pay.mjs";
import { WechatJsSdk } from "./wechat-js-sdk.mjs";
const digest = (s) => createHash("sha256").update(s).digest("hex");
const token = z.string().regex(/^[a-f0-9]{64}$/);
const credentials = z.object({ ticket: token, secret: token }).strict();
const invalid = () =>
  new AiError(400, "支付链接或微信授权已失效，请返回原设备重新打开订单");
export function installWechatHandoff({
  route,
  repo,
  auth,
  configuration,
  options,
  fetcher,
  publicOrder,
  syncOrder,
}) {
  const sdk = new WechatJsSdk(fetcher);
  const bound = async (orderId) =>
    options.config || configuration.bound("order:" + orderId);
  async function link(db, ticket) {
    const row = await db.get(
      "SELECT * FROM wechat_checkout_links WHERE id=?",
      digest(ticket),
    );
    if (!row || row.expiresAt <= new Date().toISOString()) throw invalid();
    const order = await db.get(
      "SELECT * FROM payment_orders WHERE id=?",
      row.orderId,
    );
    if (!order) throw invalid();
    return { row, order };
  }
  async function authorized(db, input) {
    const { row, order } = await link(db, input.ticket);
    const scan = await db.get(
      "SELECT * FROM wechat_checkout_scans WHERE id=? AND linkId=?",
      digest(input.secret),
      row.id,
    );
    if (!scan || scan.expiresAt <= new Date().toISOString())
      throw new AiError(401, "请先在当前微信中完成支付授权");
    return { row, order, scan };
  }
  async function preview(db, value) {
    const { row, order, scan } = value;
    const profile = await db.get(
      "SELECT displayName,publicId FROM auth_profiles WHERE userId=?",
      order.userId,
    );
    return {
      order: publicOrder(order),
      recipient: {
        displayName: profile?.displayName || "学习者",
        publicId: profile?.publicId || "",
      },
      sameAccount: scan.payerUserId === order.userId,
      payerUnavailable: !!row.payerOpenid && row.payerOpenid !== scan.openid,
    };
  }
  async function createLink(order, c) {
    if (!c.appSecret)
      throw new AiError(503, "JSAPI 支付需要先在微信登录配置中保存 AppSecret");
    const ticket = randomBytes(32).toString("hex"),
      expiresAt = order.expiresAt;
    await repo.transaction(async (db) => {
      const now = new Date().toISOString();
      await db.run("DELETE FROM wechat_checkout_oauth WHERE expiresAt<=?", now);
      await db.run("DELETE FROM wechat_checkout_scans WHERE expiresAt<=?", now);
      await db.run("DELETE FROM wechat_checkout_links WHERE expiresAt<=?", now);
      await db.run(
        "INSERT INTO wechat_checkout_links(id,userId,orderId,expiresAt,payerOpenid) VALUES(?,?,?,?,?)",
        digest(ticket),
        order.userId,
        order.id,
        expiresAt,
        "",
      );
    });
    return {
      type: "handoff",
      url: c.frontendUrl + "/pay/wechat#ticket=" + ticket,
      expiresAt,
    };
  }
  route("post", "/api/payments/handoff/start", async (req, res) => {
    if (auth.limited(req, res, "payment-oauth")) return;
    const input = credentials.parse(req.body),
      state = randomBytes(32).toString("hex");
    const { order, row } = await repo.read((db) => link(db, input.ticket));
    if (
      order.status !== "pending" ||
      order.expiresAt <= new Date().toISOString()
    )
      throw invalid();
    const c = await bound(order.id);
    if (!c.appSecret) throw new AiError(503, "公众号授权尚未配置");
    await repo.transaction((db) =>
      db.run(
        "INSERT INTO wechat_checkout_oauth(id,userId,linkId,scanHash,expiresAt,used) VALUES(?,?,?,?,?,?)",
        digest(state),
        order.userId,
        row.id,
        digest(input.secret),
        new Date(
          Math.min(Date.now() + 300000, Date.parse(order.expiresAt)),
        ).toISOString(),
        0,
      ),
    );
    const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
    url.search = new URLSearchParams({
      appid: c.appId,
      redirect_uri: c.apiUrl + "/api/payments/wechat/oauth/callback",
      response_type: "code",
      scope: "snsapi_base",
      state,
    }).toString();
    url.hash = "wechat_redirect";
    return { url: url.href };
  });
  route("get", "/api/payments/wechat/oauth/callback", async (req, res) => {
    res.set({
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    });
    const { state, code } = z
      .object({ state: token, code: z.string().regex(/^[\w-]{1,256}$/) })
      .parse(req.query);
    const flow = await repo.transaction(async (db) => {
      const row = await db.get(
        "SELECT * FROM wechat_checkout_oauth WHERE id=?",
        digest(state),
      );
      if (!row || row.used || row.expiresAt <= new Date().toISOString())
        throw invalid();
      const changed = await db.run(
        "UPDATE wechat_checkout_oauth SET used=? WHERE id=? AND used=?",
        1,
        row.id,
        0,
      );
      if (Number(changed.changes ?? changed.affectedRows) !== 1)
        throw invalid();
      return row;
    });
    const linked = await repo.read((db) =>
      db.get("SELECT * FROM wechat_checkout_links WHERE id=?", flow.linkId),
    );
    if (!linked || linked.expiresAt <= new Date().toISOString())
      throw invalid();
    const c = await bound(linked.orderId);
    let openid;
    try {
      const response = await fetcher(
        "https://api.weixin.qq.com/sns/oauth2/access_token?" +
          new URLSearchParams({
            appid: c.appId,
            secret: c.appSecret,
            code,
            grant_type: "authorization_code",
          }),
        { redirect: "error", signal: AbortSignal.timeout(10000) },
      );
      const result = await response.json();
      if (
        !response.ok ||
        result.errcode ||
        typeof result.openid !== "string" ||
        !/^[\w-]{1,128}$/.test(result.openid)
      )
        throw Error();
      openid = result.openid;
    } catch {
      throw new AiError(502, "微信支付授权失败，请返回支付页重试");
    }
    await repo.transaction(async (db) => {
      const identity = await db.get(
        "SELECT userId FROM auth_wechat WHERE appId=? AND openid=?",
        c.appId,
        openid,
      );
      const existing = await db.get(
        "SELECT * FROM wechat_checkout_scans WHERE id=?",
        flow.scanHash,
      );
      if (existing) {
        if (existing.linkId !== flow.linkId || existing.openid !== openid)
          throw invalid();
      } else
        await db.run(
          "INSERT INTO wechat_checkout_scans(id,userId,linkId,openid,payerUserId,expiresAt) VALUES(?,?,?,?,?,?)",
          flow.scanHash,
          linked.userId,
          flow.linkId,
          openid,
          identity?.userId || "",
          linked.expiresAt,
        );
    });
    res.redirect(303, c.frontendUrl + "/pay/wechat#resume");
  });
  route("post", "/api/payments/handoff/preview", async (req) => {
    const input = credentials.parse(req.body);
    return repo.read(async (db) => preview(db, await authorized(db, input)));
  });
  route("post", "/api/payments/handoff/intent", async (req) => {
    const input = credentials
      .extend({ confirmedRecipientId: z.string().max(8).optional() })
      .parse(req.body);
    const value = await repo.transaction(async (db) => {
      const value = await authorized(db, input);
      const order = await db.get(
        "SELECT * FROM payment_orders WHERE id=?" +
          (db.driver === "mysql" ? " FOR UPDATE" : ""),
        value.order.id,
      );
      if (
        order.status !== "pending" ||
        order.expiresAt <= new Date().toISOString()
      )
        throw invalid();
      const profile = await db.get(
        "SELECT publicId FROM auth_profiles WHERE userId=?",
        order.userId,
      );
      if (
        value.scan.payerUserId !== order.userId &&
        (!profile?.publicId || input.confirmedRecipientId !== profile.publicId)
      )
        throw new AiError(409, "账号不一致，请明确确认资源包接收账号");
      const payer = await db.get(
        "SELECT * FROM wechat_order_payers WHERE id=?" +
          (db.driver === "mysql" ? " FOR UPDATE" : ""),
        order.id,
      );
      if (payer && payer.openid !== value.scan.openid)
        throw new AiError(409, "该订单已由另一微信发起支付，请返回原设备核对");
      if (!payer && JSON.parse(order.intent).type === "jsapi") {
        const previous = await db.get(
          "SELECT openid FROM auth_wechat WHERE userId=? AND appId=?",
          order.userId,
          order.appId,
        );
        if (!previous || previous.openid !== value.scan.openid)
          throw new AiError(
            409,
            "此历史订单已由另一微信发起支付，请使用原微信核对",
          );
      }
      if (!payer)
        await db.run(
          "INSERT INTO wechat_order_payers(id,userId,openid) VALUES(?,?,?)",
          order.id,
          order.userId,
          value.scan.openid,
        );
      await db.run(
        "UPDATE wechat_checkout_links SET payerOpenid=? WHERE id=?",
        value.scan.openid,
        value.row.id,
      );
      return { ...value, order };
    });
    let intent = JSON.parse(value.order.intent);
    if (intent.type === "qr")
      throw new AiError(
        409,
        "此历史订单使用 Native 支付，请返回原设备完成原订单",
      );
    if (!intent.type) {
      const c = await bound(value.order.id),
        gateway = options.gateway || new WechatPay(c, fetcher, options.logger);
      intent = await gateway.create(value.order, "jsapi", value.scan.openid);
      await repo.read((db) =>
        db.run(
          "UPDATE payment_orders SET intent=? WHERE id=?",
          JSON.stringify(intent),
          value.order.id,
        ),
      );
    }
    return { order: publicOrder(value.order), intent };
  });
  route("post", "/api/payments/handoff/js-sdk", async (req) => {
    const input = credentials
      .extend({ url: z.string().max(4096) })
      .parse(req.body);
    const value = await repo.read((db) => authorized(db, input));
    if (value.row.payerOpenid !== value.scan.openid)
      throw new AiError(403, "请先确认付款账号");
    return sdk.configuration(await bound(value.order.id), input.url);
  });
  route("post", "/api/payments/handoff/sync", async (req) => {
    const input = credentials.parse(req.body),
      value = await repo.read((db) => authorized(db, input));
    const c = await bound(value.order.id);
    return syncOrder(
      value.order.id,
      value.order.userId,
      c,
      options.gateway || new WechatPay(c, fetcher, options.logger),
    );
  });
  return { createLink };
}
