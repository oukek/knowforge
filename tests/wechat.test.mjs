import test from "node:test";
import assert from "node:assert/strict";
import {
  randomUUID,
  generateKeyPairSync,
  sign,
  createCipheriv,
  randomBytes,
} from "node:crypto";
import { createApp } from "../server/app.mjs";
import { WechatPay } from "../server/wechat-pay.mjs";
import { mysqlFixture } from "./helpers/mysql.mjs";
const config = {
  loginEnabled: true,
  payEnabled: true,
  appId: "wx_fixture",
  appSecret: "fixture-secret",
  frontendUrl: "https://learn.example.com",
  apiUrl: "https://api.example.com",
  merchantId: "1234567890",
};
async function fixture(t, patch = {}) {
  const mysql = process.env.TEST_MYSQL === "1" ? await mysqlFixture() : null;
  let openid = "openid_alice",
    payment = null,
    failCreate = false,
    calls = 0;
  const gateway = {
    async create(row, mode, payer) {
      calls++;
      if (failCreate) throw Error("fixture network failure");
      return mode === "jsapi"
        ? { type: "jsapi", parameters: { fixture: payer } }
        : { type: "qr", codeUrl: "weixin://wxpay/fixture" };
    },
    async query(id) {
      return (
        payment || {
          out_trade_no: id,
          appid: config.appId,
          mchid: config.merchantId,
          trade_state: "NOTPAY",
        }
      );
    },
    async request() {},
    notification(raw) {
      const data = JSON.parse(raw);
      if (data.invalid) throw Error("fixture invalid signature");
      return data;
    },
  };
  const built = await createApp({
    ...(mysql ? { store: mysql.store } : { dbPath: ":memory:" }),
    serveClient: false,
    wechatOptions: {
      config,
      gateway,
      fetcher: async (url) => ({
        ok: true,
        json: async () =>
          url.includes("access_token?")
            ? {
                openid,
                access_token: "server-only-oauth-token",
                scope: "snsapi_userinfo",
              }
            : { openid, nickname: "学习者" },
      }),
    },
    ...patch,
  });
  const server = built.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await built.ai.shutdown();
    await new Promise((r) => server.close(r));
    if (mysql) await mysql.cleanup();
    else await built.store.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (path, method = "GET", body, session) => {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(session
          ? {
              Cookie: session.cookie,
              "X-CSRF-Token": session.csrfToken,
              "X-KnowForge-User": session.user.id,
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  async function authorize(flow) {
    const response = await fetch(
      base + "/api/auth/wechat/callback?state=" + flow.id + "&code=fixture",
    );
    const html = await response.text();
    assert.equal(response.status, 200, html);
    assert(!html.includes("server-only-oauth-token"));
    const ticket = html.match(/name="ticket" value="([a-f0-9]+)"/)[1];
    return ticket;
  }
  async function confirm(flow, ticket) {
    const response = await fetch(base + "/api/auth/wechat/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id: flow.id, ticket }),
    });
    return response;
  }
  async function session(identity = "openid_alice") {
    openid = identity;
    const flow = (await api("/auth/wechat/start", "POST", {})).data;
    assert.equal((await confirm(flow, await authorize(flow))).status, 200);
    const result = await api("/auth/wechat/poll", "POST", {
      id: flow.id,
      secret: flow.secret,
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return { ...result.data, cookie: result.cookie };
  }
  async function publish() {
    const s = await session("openid_admin");
    await built.store.session(() =>
      built.store.run(
        "INSERT INTO auth_roles(userId,role) VALUES(?,?)",
        s.user.id,
        "admin",
      ),
    );
    const p = (
      await api(
        "/admin/ai/products",
        "POST",
        {
          code: "wx-fixture",
          name: "微信学习包",
          price: "9.90",
          credits: "100",
          bonus: "10",
          validDays: 30,
          note: "支付测试用商品",
        },
        s,
      )
    ).data;
    const result = await api(
      `/admin/ai/products/${p.id}/publish`,
      "POST",
      { revision: p.revision, publish: true },
      s,
    );
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const products = (await api("/ai/products", "GET", undefined, s)).data.rows;
    return products.find((row) => row.id === p.id);
  }
  return {
    ...built,
    api,
    authorize,
    confirm,
    session,
    publish,
    setIdentity(v) {
      openid = v;
    },
    setPayment(v) {
      payment = v;
    },
    setFailCreate(v) {
      failCreate = v;
    },
    get calls() {
      return calls;
    },
  };
}
const purchase = (p, patch = {}) => ({
  productVersionId: p.published.versionId,
  requestId: randomUUID(),
  ...patch,
});
const paid = (order, patch = {}) => ({
  out_trade_no: order.id,
  appid: config.appId,
  mchid: config.merchantId,
  amount: { total: 990, currency: "CNY" },
  trade_state: "SUCCESS",
  transaction_id: "wx_transaction_" + order.id,
  success_time: new Date().toISOString(),
  ...patch,
});

test("默认关闭注册；微信扫码需手机确认和原设备密钥，凭据一次性消费", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.api("/auth/register", "POST", {
        username: "tester",
        password: "password123",
      })
    ).status,
    410,
  );
  const flow = (await f.api("/auth/wechat/start", "POST", {})).data;
  const token = { id: flow.id, secret: flow.secret };
  assert.match(flow.qr, /^data:image\/png/);
  assert.equal(new URL(flow.url).searchParams.get("state"), flow.id);
  assert.equal(
    (
      await f.api("/auth/wechat/poll", "POST", {
        ...token,
        secret: "0".repeat(64),
      })
    ).status,
    400,
  );
  const ticket = await f.authorize(flow);
  assert.equal(
    (await f.api("/auth/wechat/poll", "POST", token)).data.status,
    "waiting",
  );
  assert.equal((await f.confirm(flow, ticket)).status, 200);
  assert.equal((await f.confirm(flow, ticket)).status, 400);
  const result = await f.api("/auth/wechat/poll", "POST", token);
  assert.equal(result.data.status, "complete");
  assert(result.cookie);
  assert.equal(result.data.user.displayName, "学习者");
  assert.equal(result.data.user.hasPassword, false);
  assert.equal((await f.api("/auth/wechat/poll", "POST", token)).status, 400);
  const bootstrap = await f.api("/bootstrap?catalog=none", "GET", undefined, {
    ...result.data,
    cookie: result.cookie,
  });
  assert(!("passwordHash" in bootstrap.data.user));
  const changed = await f.api(
    "/auth/profile",
    "PUT",
    { displayName: "我的新昵称", avatarId: "fox" },
    { ...result.data, cookie: result.cookie },
  );
  assert.equal(changed.status, 200);
  const again = await f.session();
  assert.equal(again.user.avatarId, "fox");
  assert.equal(again.user.displayName, "我的新昵称");
  assert.equal(again.user.id, result.data.user.id);
  assert.equal(
    (await f.api("/ai/status", "GET", undefined, again)).data.account.available,
    "0",
  );
});

test("支付订单固定售价，复用有效待付订单，金额与身份校验阻止越权入账", async (t) => {
  const f = await fixture(t),
    p = await f.publish(),
    a = await f.session(),
    b = await f.session("openid_bob"),
    input = purchase(p);
  const first = await f.api("/payments/orders", "POST", input, a);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.order.amount, "9.90");
  assert.equal(first.data.intent.type, "qr");
  assert.match(first.data.intent.qr, /^data:image\/png/);
  const retry = await f.api("/payments/orders", "POST", input, a);
  const secondClick = await f.api("/payments/orders", "POST", purchase(p), a);
  assert.equal(first.data.order.id, retry.data.order.id);
  assert.equal(secondClick.data.order.id, first.data.order.id);
  assert.equal(f.calls, 1);
  assert.equal(
    (
      await f.api(
        `/payments/orders/${first.data.order.id}`,
        "GET",
        undefined,
        b,
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.api(`/payments/orders/${first.data.order.id}/sync`, "POST", {}, b))
      .status,
    404,
  );
  assert.equal(
    (
      await f.api(
        "/payments/orders",
        "POST",
        { ...purchase(p), amountFen: 1 },
        a,
      )
    ).status,
    400,
  );
  for (const patch of [
    { amount: { total: 1, currency: "CNY" } },
    { amount: { total: 990, currency: "USD" } },
    { appid: "forged" },
    { mchid: "forged" },
  ]) {
    assert.equal(
      (
        await f.api(
          "/payments/wechat/notify",
          "POST",
          paid(first.data.order, patch),
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (await f.api("/payments/wechat/notify", "POST", { invalid: true })).status,
    400,
  );
  assert.equal(
    (await f.api("/ai/status", "GET", undefined, a)).data.account.available,
    "0",
  );
  const event = paid(first.data.order);
  const delivered = await Promise.all([
    f.api("/payments/wechat/notify", "POST", event),
    f.api("/payments/wechat/notify", "POST", event),
  ]);
  assert(
    delivered.every((r) => r.status === 204),
    JSON.stringify(delivered),
  );
  assert.equal(
    (await f.api("/ai/status", "GET", undefined, a)).data.account.available,
    "110",
  );
  const ledger = (await f.api("/ai/ledger", "GET", undefined, a)).data;
  assert.equal(ledger.lots.length, 2);
  assert.equal(ledger.rows.filter((r) => r.kind === "purchase").length, 1);
  assert.equal(
    (await f.api(`/payments/orders/${first.data.order.id}/sync`, "POST", {}, a))
      .data.order.status,
    "paid",
  );
});

test("JSAPI 使用服务端微信身份；通知缺失时查单可补入账，重复查单不重复发放", async (t) => {
  const f = await fixture(t),
    p = await f.publish(),
    s = await f.session();
  const created = await f.api(
    "/payments/orders",
    "POST",
    purchase(p, { mode: "jsapi" }),
    s,
  );
  assert.equal(created.data.intent.type, "jsapi");
  assert.equal(created.data.intent.parameters.fixture, "openid_alice");
  f.setPayment(paid(created.data.order));
  assert.equal(
    (
      await f.api(
        `/payments/orders/${created.data.order.id}/sync`,
        "POST",
        {},
        s,
      )
    ).data.order.status,
    "paid",
  );
  assert.equal(
    (
      await f.api(
        `/payments/orders/${created.data.order.id}/sync`,
        "POST",
        {},
        s,
      )
    ).data.order.status,
    "paid",
  );
  assert.equal(
    (await f.api("/ai/status", "GET", undefined, s)).data.account.available,
    "110",
  );
});

test("下单超时保留本地订单，可从历史订单恢复支付；未支付到期会关单", async (t) => {
  const f = await fixture(t),
    p = await f.publish(),
    s = await f.session(),
    input = purchase(p);
  f.setFailCreate(true);
  assert.equal((await f.api("/payments/orders", "POST", input, s)).status, 500);
  const list = (await f.api("/payments/orders", "GET", undefined, s)).data.rows;
  assert.equal(list.length, 1);
  f.setFailCreate(false);
  const restored = await f.api(
    `/payments/orders/${list[0].id}/checkout`,
    "POST",
    { mode: "native" },
    s,
  );
  assert.equal(restored.status, 200);
  assert.equal(restored.data.intent.type, "qr");
  await f.store.session(() =>
    f.store.run(
      "UPDATE payment_orders SET expiresAt=? WHERE id=?",
      new Date(Date.now() - 1000).toISOString(),
      list[0].id,
    ),
  );
  assert.equal(
    (await f.api(`/payments/orders/${list[0].id}/sync`, "POST", {}, s)).data
      .order.status,
    "closed",
  );
  assert.equal(
    (await f.api("/ai/status", "GET", undefined, s)).data.account.available,
    "0",
  );
});

test("微信支付网关验证真实 RSA 签名、拒绝篡改与过期报文，并解密 AES-GCM 通知", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const c = {
      platformSerial: "PUB_KEY_ID_FIXTURE",
      platformPublicKey: publicKey,
      apiV3Key: "k".repeat(32),
    },
    gateway = new WechatPay(c);
  const data = { trade_state: "SUCCESS", transaction_id: "tx-fixture" },
    nonce = randomBytes(6).toString("hex"),
    aad = "transaction";
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(c.apiV3Key),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const raw = Buffer.from(
    JSON.stringify({
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      resource: {
        algorithm: "AEAD_AES_256_GCM",
        nonce,
        associated_data: aad,
        ciphertext: encrypted.toString("base64"),
      },
    }),
  );
  const stamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "wechatpay-timestamp": stamp,
    "wechatpay-nonce": "nonce",
    "wechatpay-serial": c.platformSerial,
    "wechatpay-signature": sign(
      "RSA-SHA256",
      Buffer.concat([Buffer.from(`${stamp}\nnonce\n`), raw, Buffer.from("\n")]),
      privateKey,
    ).toString("base64"),
  };
  assert.deepEqual(gateway.notification(raw, headers), data);
  assert.throws(() =>
    gateway.notification(Buffer.concat([raw, Buffer.from(" ")]), headers),
  );
  assert.throws(() =>
    gateway.notification(raw, { ...headers, "wechatpay-serial": "forged" }),
  );
  assert.throws(() =>
    gateway.notification(raw, { ...headers, "wechatpay-timestamp": "1" }),
  );
  assert.throws(() =>
    new WechatPay({ ...c, apiV3Key: "x".repeat(32) }).notification(
      raw,
      headers,
    ),
  );
});
