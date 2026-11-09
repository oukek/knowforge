import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { fixture } from "./helpers/ai.mjs";
import { WechatConfiguration } from "../server/wechat-config.mjs";
const loginInput = (revision = "", patch = {}) => ({
  revision,
  loginEnabled: true,
  appId: "wx1234567890abcdef",
  appSecret: "fixtureAppSecret1234567890",
  frontendUrl: "https://learn.example.com",
  apiUrl: "https://api.example.com",
  ...patch,
});
function paymentInput(revision, patch = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    revision,
    payEnabled: true,
    merchantId: "1234567890",
    merchantSerial: "A".repeat(32),
    platformSerial: "PUB_KEY_ID_FIXTURE",
    privateKey,
    platformPublicKey: publicKey,
    apiV3Key: "v".repeat(32),
    ...patch,
  };
}
test("微信配置只允许管理员与有效 CSRF 修改；整个配置密文入库，密钥不回显、审计不含凭据", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await fetch(f.base + "/admin/wechat/configuration")).status,
    401,
  );
  assert.equal((await f.user.api("/admin/wechat/configuration")).status, 403);
  assert.equal(
    (await f.user.api("/admin/wechat/login", "PUT", loginInput())).status,
    403,
  );
  assert.equal(
    (
      await f.admin.api("/admin/wechat/login", "PUT", loginInput(), {
        "X-CSRF-Token": "0".repeat(64),
      })
    ).status,
    403,
  );
  const first = await f.admin.api("/admin/wechat/login", "PUT", loginInput());
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.hasAppSecret, true);
  assert(!("appSecret" in first.data));
  const input = paymentInput(first.data.revision),
    saved = await f.admin.api("/admin/wechat/payment", "PUT", input);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.hasPrivateKey, true);
  assert.equal(saved.data.hasPlatformPublicKey, true);
  for (const key of ["privateKey", "platformPublicKey", "apiV3Key"])
    assert(!(key in saved.data));
  const rows = await f.store.session(() =>
    f.store.all("SELECT * FROM wechat_configurations"),
  );
  assert.equal(rows.length, 2);
  const stored = JSON.stringify(rows);
  for (const value of [
    loginInput().appId,
    loginInput().appSecret,
    input.merchantId,
    input.apiV3Key,
    "BEGIN PRIVATE KEY",
    "learn.example.com",
  ])
    assert(!stored.includes(value), value);
  const audits = await f.store.session(() =>
    f.store.all(
      "SELECT data FROM admin_audit WHERE action=?",
      "wechat.configuration",
    ),
  );
  for (const value of [
    loginInput().appSecret,
    input.apiV3Key,
    "BEGIN PRIVATE KEY",
  ])
    assert(!JSON.stringify(audits).includes(value));
  const manager = new WechatConfiguration(f.ai.repo, "a".repeat(64));
  const loaded = await manager.runtime();
  assert.equal(loaded.privateKey, input.privateKey.trim());
  assert.equal(loaded.appSecret, loginInput().appSecret);
  const reloaded = new WechatConfiguration(f.ai.repo, "a".repeat(64));
  assert.equal((await reloaded.runtime()).apiV3Key, input.apiV3Key);
  const wrong = new WechatConfiguration(f.ai.repo, "b".repeat(64));
  await assert.rejects(() => wrong.runtime(), /无法解密/);
  await assert.rejects(
    () => wrong.save("login", loginInput(saved.data.revision), f.admin.user.id),
    /无法解密/,
  );
  assert.equal((await manager.runtime()).revision, saved.data.revision);
  const publicView = await fetch(f.base + "/auth/wechat/configuration").then(
    (r) => r.json(),
  );
  assert.deepEqual(publicView, { enabled: true });
  assert.equal((await f.user.api("/payments/capabilities")).data.enabled, true);
});

test("后台配置保存即时生效、留空保留密钥、乐观版本阻止覆盖；存量流程绑定旧身份", async (t) => {
  const f = await fixture(t);
  const initial = await f.admin.api("/admin/wechat/configuration");
  assert.equal(initial.data.loginEnabled, false);
  const first = (await f.admin.api("/admin/wechat/login", "PUT", loginInput()))
    .data;
  const flow = await fetch(f.base + "/auth/wechat/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  assert.equal(new URL(flow.url).searchParams.get("appid"), loginInput().appId);
  const manager = new WechatConfiguration(f.ai.repo, "a".repeat(64));
  const second = await f.admin.api(
    "/admin/wechat/login",
    "PUT",
    loginInput(first.revision, { loginEnabled: false, appSecret: "" }),
  );
  assert.equal(second.status, 200);
  assert.equal((await manager.runtime()).appSecret, loginInput().appSecret);
  assert.equal((await manager.bound("flow:" + flow.id)).loginEnabled, true);
  assert.equal(
    (await fetch(f.base + "/auth/wechat/configuration").then((r) => r.json()))
      .enabled,
    false,
  );
  assert.equal(
    (
      await f.admin.api(
        "/admin/wechat/login",
        "PUT",
        loginInput(first.revision),
      )
    ).status,
    409,
  );
  const third = await f.admin.api(
    "/admin/wechat/login",
    "PUT",
    loginInput(second.data.revision, {
      appId: "wxabcdef1234567890",
      appSecret: "newAppSecret1234567890",
    }),
  );
  assert.equal(third.status, 200);
  assert.equal(
    (await manager.bound("flow:" + flow.id)).appId,
    loginInput().appId,
  );
  assert.equal((await manager.runtime()).appId, "wxabcdef1234567890");
  const payment = paymentInput(third.data.revision);
  const paidConfig = (
    await f.admin.api("/admin/wechat/payment", "PUT", payment)
  ).data;
  await f.ai.repo.transaction((db) =>
    manager.bind(db, "order:fixture", paidConfig.revision),
  );
  const paused = await f.admin.api("/admin/wechat/payment", "PUT", {
    ...payment,
    revision: paidConfig.revision,
    payEnabled: false,
    privateKey: "",
    platformPublicKey: "",
    apiV3Key: "",
  });
  assert.equal(paused.status, 200);
  assert.equal((await manager.bound("order:fixture")).payEnabled, true);
  assert.equal((await manager.runtime()).payEnabled, false);
});

test("非法微信配置与缺失主密钥无法入库，错误请求保留原版本和密文", async (t) => {
  const f = await fixture(t),
    first = (await f.admin.api("/admin/wechat/login", "PUT", loginInput()))
      .data;
  for (const patch of [
    { apiUrl: "http://127.0.0.1" },
    { appId: "invalid" },
    { appSecret: "bad" },
    { role: "admin" },
  ])
    assert.equal(
      (
        await f.admin.api(
          "/admin/wechat/login",
          "PUT",
          loginInput(first.revision, patch),
        )
      ).status,
      400,
    );
  const payment = paymentInput(first.revision, { privateKey: "broken-pem" });
  assert.equal(
    (await f.admin.api("/admin/wechat/payment", "PUT", payment)).status,
    400,
  );
  const rows = await f.store.session(() =>
    f.store.all("SELECT * FROM wechat_configurations"),
  );
  assert.equal(rows.length, 1);
  const noKey = new WechatConfiguration(f.ai.repo, "");
  await assert.rejects(
    () => noKey.save("login", loginInput(first.revision), f.admin.user.id),
    /AI_ENCRYPTION_KEY/,
  );
  assert.equal(
    (await f.admin.api("/admin/wechat/configuration")).data.revision,
    first.revision,
  );
});

test("实际下单绑定加密配置版本，关闭新购买仍可查单补到账", async (t) => {
  let order;
  const gateway = {
    async create(row) {
      order = row;
      return { type: "qr", codeUrl: "weixin://wxpay/fixture" };
    },
    async query(id) {
      return {
        out_trade_no: id,
        appid: order.appId,
        mchid: order.merchantId,
        trade_state: "SUCCESS",
        amount: { total: Number(order.amountFen), currency: "CNY" },
        transaction_id: "fixture-tx-" + id,
        success_time: new Date().toISOString(),
      };
    },
  };
  const f = await fixture(t, {}, { wechatOptions: { gateway } });
  const first = (await f.admin.api("/admin/wechat/login", "PUT", loginInput()))
    .data;
  const payment = paymentInput(first.revision);
  const saved = (await f.admin.api("/admin/wechat/payment", "PUT", payment))
    .data;
  const product = (await f.user.api("/ai/products")).data.rows[0];
  const created = await f.user.api("/payments/orders", "POST", {
    productVersionId: product.published.versionId,
    requestId: crypto.randomUUID(),
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const binding = await f.store.session(() =>
    f.store.get(
      "SELECT configId FROM wechat_config_bindings WHERE id=?",
      "order:" + created.data.order.id,
    ),
  );
  assert.equal(binding.configId, saved.revision);
  const paused = await f.admin.api("/admin/wechat/payment", "PUT", {
    ...payment,
    revision: saved.revision,
    payEnabled: false,
    privateKey: "",
    platformPublicKey: "",
    apiV3Key: "",
  });
  assert.equal(paused.status, 200);
  assert.equal(
    (await f.user.api("/payments/capabilities")).data.enabled,
    false,
  );
  assert.equal(
    (
      await f.user.api("/payments/orders", "POST", {
        productVersionId: product.published.versionId,
        requestId: crypto.randomUUID(),
      })
    ).status,
    503,
  );
  const sync = await f.user.api(
    `/payments/orders/${created.data.order.id}/sync`,
    "POST",
    {},
  );
  assert.equal(sync.status, 200, JSON.stringify(sync.data));
  assert.equal(sync.data.order.status, "paid");
  assert.equal(
    Number((await f.user.api("/ai/status")).data.account.available),
    Number(product.published.credits) + Number(product.published.bonus),
  );
});
