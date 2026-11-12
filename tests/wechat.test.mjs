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
        ? { type: "jsapi", parameters: { fixture: payer, appId: config.appId } }
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
          url.includes("stable_token")
            ? { access_token: "sdk-token" }
            : url.includes("getticket")
              ? { ticket: "server-only-jsapi-ticket", expires_in: 7200 }
              : url.includes("access_token?")
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
  async function scan(intent, identity = "openid_alice") {
    openid = identity;
    const ticket = new URLSearchParams(new URL(intent.url).hash.slice(1)).get(
        "ticket",
      ),
      secret = randomBytes(32).toString("hex");
    const credentials = { ticket, secret };
    const start = await api("/payments/handoff/start", "POST", credentials);
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const state = new URL(start.data.url).searchParams.get("state");
    const response = await fetch(
      base +
        "/api/payments/wechat/oauth/callback?" +
        new URLSearchParams({ state, code: "fixture" }),
      { redirect: "manual" },
    );
    assert.equal(response.status, 303, await response.text());
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(
      response.headers.get("location"),
      config.frontendUrl + "/pay/wechat#resume",
    );
    return { ...credentials, state };
  }
  return {
    ...built,
    api,
    base,
    scan,
    authorize,
    confirm,
    session,
    publish,
    gateway,
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
  assert.equal("qr" in flow, false);
  assert.match(flow.url, /^https:\/\/open\.weixin\.qq\.com\//);
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
  assert.equal(first.data.intent.type, "handoff");
  assert.match(
    first.data.intent.url,
    /^https:\/\/learn\.example\.com\/pay\/wechat#ticket=[a-f0-9]{64}$/,
  );
  assert.equal("qr" in first.data.intent, false);
  const retry = await f.api("/payments/orders", "POST", input, a);
  const secondClick = await f.api("/payments/orders", "POST", purchase(p), a);
  assert.equal(first.data.order.id, retry.data.order.id);
  assert.equal(secondClick.data.order.id, first.data.order.id);
  assert.equal(f.calls, 0);
  const details = await f.api(
    `/payments/orders/${first.data.order.id}`,
    "GET",
    undefined,
    a,
  );
  assert.equal(details.status, 200);
  assert.equal(details.data.intent, undefined);
  const restored = await f.api(
    `/payments/orders/${first.data.order.id}/checkout`,
    "POST",
    { mode: "jsapi" },
    a,
  );
  assert.equal(restored.status, 200);
  assert.equal(restored.data.intent.type, "handoff");
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
  assert.equal(created.data.intent.type, "handoff");
  const scanner = await f.scan(created.data.intent);
  const intent = await f.api("/payments/handoff/intent", "POST", {
    ticket: scanner.ticket,
    secret: scanner.secret,
  });
  assert.equal(intent.status, 200, JSON.stringify(intent.data));
  assert.equal(intent.data.intent.type, "jsapi");
  assert.equal(intent.data.intent.parameters.fixture, "openid_alice");
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
  const created = await f.api("/payments/orders", "POST", input, s);
  assert.equal(created.status, 200);
  const scanner = await f.scan(created.data.intent);
  const credentials = { ticket: scanner.ticket, secret: scanner.secret };
  f.setFailCreate(true);
  assert.equal(
    (await f.api("/payments/handoff/intent", "POST", credentials)).status,
    500,
  );
  const list = (await f.api("/payments/orders", "GET", undefined, s)).data.rows;
  assert.equal(list.length, 1);
  f.setFailCreate(false);
  const restored = await f.api("/payments/handoff/intent", "POST", credentials);
  assert.equal(restored.status, 200);
  assert.equal(restored.data.intent.type, "jsapi");
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

test("扫码只授权当前订单：同账号自动继续，跨账号必须明确确认，不能伪造 OpenID 或复用 OAuth state", async (t) => {
  const f = await fixture(t),
    p = await f.publish(),
    owner = await f.session();
  const other = await f.session("openid_bob");
  const created = await f.api(
    "/payments/orders",
    "POST",
    purchase(p, { mode: "jsapi" }),
    owner,
  );
  assert.equal(created.data.intent.type, "handoff");
  assert.equal(f.calls, 0); // A desktop request cannot select a payer before WeChat OAuth.
  const ticket = new URLSearchParams(
    new URL(created.data.intent.url).hash.slice(1),
  ).get("ticket");
  assert.equal(
    (
      await f.api("/payments/handoff/preview", "POST", {
        ticket,
        secret: "0".repeat(64),
      })
    ).status,
    401,
  );
  const scanner = await f.scan(created.data.intent, "openid_bob"),
    input = { ticket: scanner.ticket, secret: scanner.secret };
  const preview = await f.api("/payments/handoff/preview", "POST", input);
  assert.equal(preview.data.sameAccount, false);
  assert.equal(preview.data.recipient.publicId, owner.user.publicId);
  assert.equal(
    (await f.api("/payments/handoff/intent", "POST", input)).status,
    409,
  );
  assert.equal(
    (
      await f.api("/payments/handoff/intent", "POST", {
        ...input,
        confirmedRecipientId: other.user.publicId,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.api("/payments/handoff/intent", "POST", {
        ...input,
        openid: "openid_alice",
      })
    ).status,
    400,
  );
  const confirmed = await f.api("/payments/handoff/intent", "POST", {
    ...input,
    confirmedRecipientId: owner.user.publicId,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.intent.parameters.fixture, "openid_bob");
  assert.equal(f.calls, 1);
  const sdk = await f.api("/payments/handoff/js-sdk", "POST", {
    ...input,
    url: config.frontendUrl + "/pay/wechat",
  });
  assert.equal(sdk.status, 200, JSON.stringify(sdk.data));
  assert.equal(sdk.data.appId, config.appId);
  assert(!JSON.stringify(sdk.data).includes("server-only-jsapi-ticket"));
  assert.equal(
    (
      await f.api("/payments/handoff/js-sdk", "POST", {
        ...input,
        url: "https://evil.example.com/pay/wechat",
      })
    ).status,
    400,
  );
  const replay = await fetch(
    f.base +
      "/api/payments/wechat/oauth/callback?state=" +
      scanner.state +
      "&code=fixture",
    { redirect: "manual" },
  );
  assert.equal(replay.status, 400);
  const anotherScan = await f.scan(created.data.intent, "openid_alice");
  assert.equal(
    (
      await f.api("/payments/handoff/intent", "POST", {
        ticket: anotherScan.ticket,
        secret: anotherScan.secret,
      })
    ).status,
    409,
  );
  assert.equal((await f.api("/auth/me")).data.user, null); // No owner session was granted to the scanning browser.
  assert.equal(
    (
      await f.api(
        "/payments/orders",
        "POST",
        purchase(p, { mode: "native" }),
        owner,
      )
    ).status,
    400,
  );
});

test("微信 JSSDK 按支付页 URL 签名并合并 ticket 请求，不给外站和带凭据的 URL 签名", async () => {
  const { WechatJsSdk } = await import("../server/wechat-js-sdk.mjs");
  let calls = 0;
  const sdk = new WechatJsSdk(async (url) => {
    calls++;
    return {
      ok: true,
      json: async () =>
        url.includes("stable_token")
          ? { access_token: "sdk-only-token" }
          : { ticket: "private-jsapi-ticket", expires_in: 7200 },
    };
  });
  const page = config.frontendUrl + "/pay/wechat";
  const results = await Promise.all([
    sdk.configuration(config, page),
    sdk.configuration(config, page),
  ]);
  assert.equal(calls, 2);
  const { createHash } = await import("node:crypto");
  for (const result of results) {
    assert.equal(
      result.signature,
      createHash("sha1")
        .update(
          `jsapi_ticket=private-jsapi-ticket&noncestr=${result.nonceStr}&timestamp=${result.timestamp}&url=${page}`,
        )
        .digest("hex"),
    );
    assert(!JSON.stringify(result).includes("private-jsapi-ticket"));
  }
  for (const value of [
    "https://evil.example.com/pay/wechat",
    page + "#ticket=secret",
    page + "?ticket=secret",
    config.frontendUrl + "/ai",
    "http://learn.example.com/pay/wechat",
  ])
    await assert.rejects(
      () => sdk.configuration(config, value),
      /本站微信支付页面/,
    );
  assert.equal(calls, 2);
});

function responseFixture() {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const c = {
    ...config,
    privateKey: pair.privateKey,
    platformPublicKey: pair.publicKey,
    platformSerial: "PUB_KEY_ID_DIAGNOSTIC",
    apiV3Key: "s".repeat(32),
  };
  const logs = [];
  let status = 404,
    code = "ORDER_NOT_EXIST",
    tamper = false;
  const fetcher = async () => {
    const raw = JSON.stringify({
      code,
      message: "sensitive response must not be logged",
      detail: { field: "appid" },
    });
    const stamp = String(Math.floor(Date.now() / 1000)),
      nonce = "fixture-nonce";
    return new Response(raw, {
      status,
      headers: {
        "request-id": "wx-request-fixture",
        "wechatpay-timestamp": stamp,
        "wechatpay-nonce": nonce,
        "wechatpay-serial": c.platformSerial,
        "wechatpay-signature": sign(
          "RSA-SHA256",
          Buffer.from(`${stamp}\n${nonce}\n${tamper ? "tampered" : raw}\n`),
          pair.privateKey,
        ).toString("base64"),
      },
    });
  };
  return {
    c,
    logs,
    gateway: new WechatPay(c, fetcher, {
      error(tag, data) {
        logs.push({ tag, ...JSON.parse(data) });
      },
    }),
    set(statusValue, codeValue, tamperValue = false) {
      status = statusValue;
      code = codeValue;
      tamper = tamperValue;
    },
  };
}

test("仅验签通过的查单 404 ORDER_NOT_EXIST 视为尚未支付，创建失败和其他 404 不被吞掉", async () => {
  const f = responseFixture();
  assert.deepEqual(await f.gateway.query("order-fixture"), {
    out_trade_no: "order-fixture",
    appid: config.appId,
    mchid: config.merchantId,
    trade_state: "NOTPAY",
    orderExists: false,
  });
  assert.equal(f.logs.length, 0);
  await assert.rejects(
    f.gateway.request("POST", "/v3/pay/transactions/jsapi", {}),
    (error) => {
      assert.equal(error.upstreamCode, "ORDER_NOT_EXIST");
      assert.equal(error.errorId, f.logs.at(-1).errorId);
      return true;
    },
  );
  f.set(404, "MCH_NOT_EXISTS");
  await assert.rejects(f.gateway.query("order-fixture"));
  assert.equal(f.logs.at(-1).wechatCode, "MCH_NOT_EXISTS");
  f.set(404, "ORDER_NOT_EXIST", true);
  await assert.rejects(f.gateway.query("order-fixture"), /校验失败/);
  assert.equal(f.logs.at(-1).stage, "verify");
  assert.equal(f.logs.at(-1).responseVerified, false);
});

test("微信失败日志保留 HTTP 状态、微信错误码、字段和 Request-ID，不输出响应正文及凭据", async () => {
  const f = responseFixture();
  f.set(400, "PARAM_ERROR");
  await assert.rejects(
    f.gateway.request("POST", "/v3/pay/transactions/jsapi", {
      payer: { openid: "private-openid" },
    }),
  );
  assert.equal(f.logs[0].status, 400);
  assert.equal(f.logs[0].wechatCode, "PARAM_ERROR");
  assert.equal(f.logs[0].field, "appid");
  assert.equal(f.logs[0].requestId, "wx-request-fixture");
  assert.equal(f.logs[0].responseVerified, true);
  assert(
    !JSON.stringify(f.logs).match(
      /sensitive response|private-openid|Authorization|PRIVATE KEY/,
    ),
  );
  const gateway = new WechatPay(
    f.c,
    async () => {
      throw Object.assign(Error("secret network details"), {
        cause: { code: "ECONNRESET" },
      });
    },
    {
      error(tag, data) {
        f.logs.push(JSON.parse(data));
      },
    },
  );
  await assert.rejects(gateway.query("order-fixture"));
  assert.equal(f.logs.at(-1).stage, "network");
  assert.equal(f.logs.at(-1).networkCode, "ECONNRESET");
  assert(!JSON.stringify(f.logs).includes("secret network details"));
});

for (const expired of [false, true])
  test(`本地订单在微信尚未下单时查单${expired ? "可到期关闭且不请求微信关单" : "仍为待支付，网页支付链接不受影响"}`, async (t) => {
    const f = await fixture(t),
      upstream = responseFixture();
    const product = await f.publish(),
      session = await f.session();
    const created = await f.api(
      "/payments/orders",
      "POST",
      {
        productVersionId: product.published.versionId,
        requestId: randomUUID(),
        mode: "jsapi",
      },
      session,
    );
    assert.equal(created.status, 200);
    assert.match(created.data.intent.url, /\/pay\/wechat#ticket=[a-f0-9]{64}$/);
    f.gateway.query = (id) => upstream.gateway.query(id);
    f.gateway.request = () => {
      throw Error("不存在的微信订单不应发起关单");
    };
    if (expired)
      await f.store.session(() =>
        f.store.run(
          "UPDATE payment_orders SET expiresAt=? WHERE id=?",
          new Date(Date.now() - 1000).toISOString(),
          created.data.order.id,
        ),
      );
    const synced = await f.api(
      `/payments/orders/${created.data.order.id}/sync`,
      "POST",
      {},
      session,
    );
    assert.equal(synced.status, 200, JSON.stringify(synced.data));
    assert.equal(synced.data.order.status, expired ? "closed" : "pending");
    assert.equal(upstream.logs.length, 0);
  });

test("支付接口将故障编号返回给页面，与网关日志关联，不泄露微信响应正文", async (t) => {
  const f = await fixture(t),
    upstream = responseFixture();
  const product = await f.publish(),
    session = await f.session();
  const created = await f.api(
    "/payments/orders",
    "POST",
    {
      productVersionId: product.published.versionId,
      requestId: randomUUID(),
      mode: "jsapi",
    },
    session,
  );
  upstream.set(403, "NO_AUTH");
  f.gateway.query = (id) => upstream.gateway.query(id);
  const result = await f.api(
    `/payments/orders/${created.data.order.id}/sync`,
    "POST",
    {},
    session,
  );
  assert.equal(result.status, 502);
  assert.equal(result.data.errorId, upstream.logs[0].errorId);
  assert(result.data.error.includes(result.data.errorId));
  assert(!JSON.stringify(result.data).includes("sensitive response"));
});

test("微信内本人浏览器带原流程证明自动完成登录，返回后仍须原设备密钥领取会话", async (t) => {
  const f = await fixture(t);
  const start = await fetch(f.base + "/api/auth/wechat/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "browser" }),
  });
  const flow = await start.json(),
    cookie = start.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api\/auth\/wechat/);
  const callback =
    f.base +
    "/api/auth/wechat/callback?" +
    new URLSearchParams({ state: flow.id, code: "fixture" });
  const result = await fetch(callback, {
    headers: { Cookie: cookie.split(";")[0] },
    redirect: "manual",
  });
  assert.equal(result.status, 303);
  assert.equal(
    result.headers.get("location"),
    config.frontendUrl + "/login?wechatReturn=1",
  );
  assert(!result.headers.get("location").includes(flow.secret));
  assert.match(result.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  assert.equal(
    (
      await f.api("/auth/wechat/poll", "POST", {
        id: flow.id,
        secret: "0".repeat(64),
      })
    ).status,
    400,
  );
  const session = await f.api("/auth/wechat/poll", "POST", {
    id: flow.id,
    secret: flow.secret,
  });
  assert.equal(session.data.status, "complete");
  assert.equal(
    (
      await f.api("/auth/wechat/poll", "POST", {
        id: flow.id,
        secret: flow.secret,
      })
    ).status,
    400,
  );
  assert.equal((await fetch(callback)).status, 400);
});

for (const proof of ["missing", "wrong", "other-flow"])
  test(`微信内登录缺少本次浏览器证明不跳过手机确认：${proof}`, async (t) => {
    const f = await fixture(t),
      start = await f.api("/auth/wechat/start", "POST", { mode: "browser" }),
      flow = start.data;
    let cookie = "";
    if (proof === "wrong")
      cookie = "knowforge_wechat_direct=" + flow.id + "." + "0".repeat(64);
    if (proof === "other-flow")
      cookie = (await f.api("/auth/wechat/start", "POST", { mode: "browser" }))
        .cookie;
    const result = await fetch(
      f.base +
        "/api/auth/wechat/callback?" +
        new URLSearchParams({ state: flow.id, code: "fixture" }),
      { headers: { Cookie: cookie }, redirect: "manual" },
    );
    assert.equal(result.status, 200);
    assert((await result.text()).includes("确认登录"));
    assert.equal(
      (
        await f.api("/auth/wechat/poll", "POST", {
          id: flow.id,
          secret: flow.secret,
        })
      ).data.status,
      "waiting",
    );
  });

test("扫码确认表单保留来源，合法同源提交可完成登录，null 与外部来源仍被拒绝", async (t) => {
  const f = await fixture(t);
  const flow = (await f.api("/auth/wechat/start", "POST", {})).data;
  const callback = await fetch(
    f.base +
      "/api/auth/wechat/callback?" +
      new URLSearchParams({ state: flow.id, code: "fixture" }),
  );
  assert.equal(callback.status, 200);
  assert.equal(callback.headers.get("referrer-policy"), "strict-origin");
  const html = await callback.text();
  const ticket = html.match(/name="ticket" value="([a-f0-9]+)"/)[1];
  const confirm = (origin) =>
    fetch(f.base + "/api/auth/wechat/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: origin,
      },
      body: new URLSearchParams({ id: flow.id, ticket }),
    });
  assert.equal((await confirm("null")).status, 403);
  assert.equal((await confirm("https://untrusted.example")).status, 403);
  assert.equal(
    (
      await f.api("/auth/wechat/poll", "POST", {
        id: flow.id,
        secret: flow.secret,
      })
    ).data.status,
    "waiting",
  );
  const confirmed = await confirm(f.base);
  assert.equal(confirmed.status, 200);
  assert.match(confirmed.headers.get("content-type"), /^text\/html/);
  assert((await confirmed.text()).includes("登录已确认"));
  assert.equal(
    (
      await f.api("/auth/wechat/poll", "POST", {
        id: flow.id,
        secret: flow.secret,
      })
    ).data.status,
    "complete",
  );
  assert.equal((await confirm(f.base)).status, 400);
});

test("扫码登录主题随授权链接和确认表单传递，主题不能替代登录凭据", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.api("/auth/wechat/start", "POST", { theme: "invalid" })).status,
    400,
  );
  const flow = (
    await f.api("/auth/wechat/start", "POST", { mode: "qr", theme: "blue" })
  ).data;
  const redirect = new URL(new URL(flow.url).searchParams.get("redirect_uri"));
  assert.equal(redirect.searchParams.get("theme"), "blue");
  const callback = await fetch(
    f.base +
      redirect.pathname +
      redirect.search +
      "&" +
      new URLSearchParams({ state: flow.id, code: "fixture" }),
  );
  const html = await callback.text();
  assert.equal(callback.status, 200);
  assert(html.includes('data-theme="blue"'));
  const ticket = html.match(/name="ticket" value="([a-f0-9]+)"/)[1];
  const confirm = async (ticketValue) =>
    fetch(f.base + "/api/auth/wechat/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: f.base,
      },
      body: new URLSearchParams({
        id: flow.id,
        ticket: ticketValue,
        theme: "blue",
      }),
    });
  assert.equal((await confirm("0".repeat(64))).status, 400);
  const done = await confirm(ticket);
  assert.equal(done.status, 200);
  assert((await done.text()).includes('data-theme="blue"'));
  assert.equal(
    (
      await f.api("/auth/wechat/poll", "POST", {
        id: flow.id,
        secret: flow.secret,
      })
    ).data.status,
    "complete",
  );
});
